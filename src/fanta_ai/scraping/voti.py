"""Voti e fantavoti partita per partita da fantacalcio.it.

Fonte: https://www.fantacalcio.it/voti-fantacalcio-serie-a/{stagione}/{giornata}
La pagina è renderizzata lato server e contiene tutte le 10 partite della giornata:
un blocco <li class="team-table"> per squadra, con una riga per giocatore.

Per ogni giocatore la pagina dà:
  - tre coppie voto/fantavoto (Redazione Fantacalcio, Voto Statistico, Voto Italia);
    il valore "55" indica "senza voto" (s.v.) e viene salvato come vuoto;
  - otto bonus/malus (gol, gol subiti, autoreti, rigori segnati/sbagliati/parati,
    assist, player of the match); `gol` sono i soli gol su azione: gol + rigori
    segnati + autoreti di tutti i giocatori coincide con i gol dei risultati
    (verificato 2021/22–2026/27);
  - ammonizione/espulsione come classe CSS sullo span del voto;
  - le icone "Subentrato" / "Sostituito".
Le righe degli allenatori (ruolo "all") vengono scartate.

Uso:
    uv run python -m fanta_ai.scraping.voti --season 2025-26
    uv run python -m fanta_ai.scraping.voti --season 2025-26 --giornate 1 2 3
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import pandas as pd
from bs4 import BeautifulSoup, Tag

from fanta_ai.http import cache_path, fetch_html

URL_TEMPLATE = "https://www.fantacalcio.it/voti-fantacalcio-serie-a/{season}/{giornata}"
DATA_DIR = Path(__file__).resolve().parents[3] / "data"

VOTE_SOURCES = ("fc", "stat", "ita")  # Redazione Fantacalcio, Voto Statistico, Voto Italia
BONUS_KEYS = (
    "gol",
    "gol_subiti",
    "autoreti",
    "rigori_segnati",
    "rigori_sbagliati",
    "rigori_parati",
    "assist",
    "potm",
)
NO_VOTE = "55"
ROLES = {"p": "P", "d": "D", "c": "C", "a": "A"}
# Stagioni passate: .../carnesecchi/4431/2025-26 — stagione in corso: .../carnesecchi/4431
PLAYER_ID_RE = re.compile(r"/(\d+)(?:/\d{4}-\d{2})?/?$")


def _grade(value: str | None) -> float | None:
    if value is None or value == "" or value == NO_VOTE:
        return None
    return float(value.replace(",", "."))


def _match_info(team_table: Tag) -> dict:
    spans = [s.get_text(strip=True) for s in team_table.select("header .match-score span")]
    date = team_table.select_one("header .match-date")
    home, home_goals, _, away_goals, away = (spans + [""] * 5)[:5]
    return {
        "casa": home,
        "trasferta": away,
        "gol_casa": int(home_goals) if home_goals.isdigit() else None,
        "gol_trasferta": int(away_goals) if away_goals.isdigit() else None,
        "data": date.get_text(strip=True) if date else None,
    }


def _team_name(team_table: Tag) -> str:
    meta = team_table.select_one("thead .team-name meta[itemprop=name]")
    return meta["content"] if meta else ""


def _parse_row(row: Tag) -> dict | None:
    role_tag = row.select_one(".player-item .role")
    role = ROLES.get(role_tag.get("data-value", "") if role_tag else "")
    if role is None:  # allenatore o riga non riconosciuta
        return None

    link = row.select_one("a.player-name")
    id_match = PLAYER_ID_RE.search(link["href"]) if link else None
    if id_match is None:
        return None

    icons = {img.get("title") for img in row.select(".player-item img.player-icon")}
    record: dict = {
        "id": int(id_match.group(1)),
        "nome": link.get_text(strip=True),
        "ruolo": role,
        "subentrato": "Subentrato" in icons,
        "sostituito": "Sostituito" in icons,
    }

    pills = row.select(".pill")
    for source, pill in zip(VOTE_SOURCES, pills):
        grade = pill.select_one(".player-grade")
        fanta = pill.select_one(".player-fanta-grade")
        record[f"v_{source}"] = _grade(grade.get("data-value") if grade else None)
        record[f"fv_{source}"] = _grade(fanta.get("data-value") if fanta else None)

    first_grade = pills[0].select_one(".player-grade") if pills else None
    classes = first_grade.get("class", []) if first_grade else []
    record["ammonito"] = "yellow-card" in classes
    record["espulso"] = "red-card" in classes

    bonus_values = [b.get("data-value", "0") for b in row.select(".player-bonus")]
    for key, value in zip(BONUS_KEYS, bonus_values):
        record[key] = int(value) if value.lstrip("-").isdigit() else 0

    return record


def parse_voti(html: str) -> list[dict]:
    """Estrae una riga per giocatore da una pagina voti di una giornata."""
    soup = BeautifulSoup(html, "lxml")
    records = []
    for team_table in soup.select("li.team-table"):
        match = _match_info(team_table)
        team = _team_name(team_table)
        for row in team_table.select("table.grades-table tbody tr"):
            record = _parse_row(row)
            if record is None:
                continue
            record["squadra"] = team
            record["in_casa"] = team == match["casa"]
            record["avversario"] = match["trasferta"] if record["in_casa"] else match["casa"]
            record.update(match)
            records.append(record)
    return records


def scrape_season(season: str, giornate: list[int] | None = None, *, refresh: bool = False) -> pd.DataFrame:
    """Scarica le giornate richieste (default 1-38) e si ferma alla prima senza voti."""
    cache_dir = DATA_DIR / "cache" / "voti" / season
    rows = []
    for giornata in giornate or range(1, 39):
        url = URL_TEMPLATE.format(season=season, giornata=giornata)
        html = fetch_html(url, cache_dir, refresh=refresh)
        records = parse_voti(html)
        if not records and "grades-table" in html:
            raise RuntimeError(
                f"{season} giornata {giornata}: la pagina ha le tabelle voti ma il parser "
                "non ha estratto nessun giocatore — probabile cambio di formato del sito."
            )
        with_vote = sum(r["v_fc"] is not None for r in records)
        print(f"{season} giornata {giornata}: {len(records)} giocatori, {with_vote} con voto")
        if with_vote == 0:
            # giornata non ancora giocata: non tenerla in cache, andrà riscaricata
            cache_path(url, cache_dir).unlink(missing_ok=True)
            if giornate is None:
                print("Nessun voto: giornata non ancora giocata, mi fermo.")
                break
            continue
        for r in records:
            r["stagione"] = season
            r["giornata"] = giornata
        rows.extend(records)
    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Scarica i voti fantacalcio.it per stagione.")
    parser.add_argument("--season", required=True, help="es. 2025-26")
    parser.add_argument("--giornate", type=int, nargs="*", help="default: tutte fino all'ultima giocata")
    parser.add_argument("--refresh", action="store_true", help="ignora la cache e riscarica")
    args = parser.parse_args()

    df = scrape_season(args.season, args.giornate, refresh=args.refresh)
    out_dir = DATA_DIR / "raw"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"voti_{args.season}.csv"
    df.to_csv(out_file, index=False)
    print(f"Salvate {len(df)} righe in {out_file}")


if __name__ == "__main__":
    main()
