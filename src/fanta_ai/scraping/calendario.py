"""Partite della prossima giornata da fantacalcio.it.

Fonte: https://www.fantacalcio.it/serie-a/calendario — la pagina mostra la giornata in
corso/prossima: per ogni partita squadra di casa, trasferta, data e numero di giornata.

Uso:
    uv run python -m fanta_ai.scraping.calendario
"""

from __future__ import annotations

import json
from pathlib import Path

from bs4 import BeautifulSoup

from fanta_ai.http import fetch_html
from fanta_ai.teams import canonical

URL = "https://www.fantacalcio.it/serie-a/calendario"
DATA_DIR = Path(__file__).resolve().parents[3] / "data"


def parse_calendario(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    matches = []
    seen = set()  # la pagina ripete le stesse partite in due viste
    for pill in soup.select("li.match .match-pill"):
        home = pill.select_one("[itemprop=homeTeam] meta[itemprop=name]")
        away = pill.select_one("[itemprop=awayTeam] meta[itemprop=name]")
        week = pill.select_one(".matchweek")
        date = pill.select_one("meta[itemprop=startDate]")
        hours = pill.select_one(".match-date .hours")
        if not (home and away and week):
            continue
        match_key = (week.get_text(strip=True), home["content"], away["content"])
        if match_key in seen:
            continue
        seen.add(match_key)
        matches.append(
            {
                "giornata": int(week.get_text(strip=True)),
                "da_giocare": pill.get("data-match-status") == "0",
                "casa": canonical(home["content"]),
                "trasferta": canonical(away["content"]),
                "data": date["content"] if date else None,
                "ora": hours.get_text(strip=True) if hours else None,
            }
        )
    return matches


def next_matchday(matches: list[dict]) -> list[dict]:
    """La pagina mostra anche la giornata appena giocata: tiene la prima con partite da giocare."""
    pending = [m["giornata"] for m in matches if m["da_giocare"]]
    if not pending:
        return []
    return [m for m in matches if m["giornata"] == min(pending)]


def main() -> None:
    html = fetch_html(URL, DATA_DIR / "cache" / "calendario", refresh=True)
    matches = next_matchday(parse_calendario(html))
    if len(matches) != 10:
        raise RuntimeError(f"Attese 10 partite, trovate {len(matches)}: controlla il formato della pagina.")
    out = DATA_DIR / "raw" / "prossima_giornata.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(matches, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Giornata {matches[0]['giornata']}: {len(matches)} partite salvate in {out}")

    # le giornate successive servono agli scambi (calendario più o meno difficile, le prime 5)
    # e alla proiezione del campionato (tutte): un di più, se non si leggono resta valida la
    # giornata corrente
    try:
        stagione = prossime_giornate(matches[0]["giornata"], 38)
        prossime = [m for m in stagione if m["giornata"] < matches[0]["giornata"] + GIORNATE_CALENDARIO]
        (DATA_DIR / "raw" / "calendario_prossime.json").write_text(json.dumps(prossime, ensure_ascii=False, indent=1), encoding="utf-8")
        (DATA_DIR / "raw" / "calendario_stagione.json").write_text(json.dumps(stagione, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Calendario: {len({m['giornata'] for m in stagione})} giornate da giocare, {len(stagione)} partite")
    except Exception as exc:
        print(f"Prossime giornate non lette ({exc})")


# Quante giornate contano per il calendario degli scambi (compresa la prossima)
GIORNATE_CALENDARIO = 5


def prossime_giornate(da: int, quante: int = GIORNATE_CALENDARIO) -> list[dict]:
    """Partite delle giornate da `da` a `da + quante - 1`, al massimo fino alla 38ª
    (pagina /serie-a/calendario/N)."""
    partite = []
    for g in range(da, min(38, da + quante - 1) + 1):
        html = fetch_html(f"{URL}/{g}", DATA_DIR / "cache" / "calendario", refresh=True)
        della = [m for m in parse_calendario(html) if m["giornata"] == g]
        if len(della) != 10:
            raise RuntimeError(f"Giornata {g}: attese 10 partite, trovate {len(della)}")
        partite += della
    return partite


if __name__ == "__main__":
    main()
