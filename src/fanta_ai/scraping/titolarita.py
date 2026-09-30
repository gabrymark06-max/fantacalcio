"""Probabilità di titolarità per la prossima giornata da SOS Fanta.

Fonte: https://www.sosfanta.com/lista-formazioni/probabili-formazioni-serie-a/
Per ogni partita la pagina elenca titolari, ballottaggi e panchina con una percentuale
0-100 di partire titolare. I giocatori di una squadra che non compaiono affatto
(infortunati, squalificati, fuori lista) vengono trattati a parte in fase di previsione.

Espressioni regolari adattate da FantaDraft (github.com/lucianomurr/FantaDraft, MIT),
scripts/fetch_sosfanta_percentuali.py.

Uso:
    uv run python -m fanta_ai.scraping.titolarita
"""

from __future__ import annotations

import html as html_lib
import json
import re
from pathlib import Path

from fanta_ai.http import fetch_html
from fanta_ai.teams import canonical

URL = "https://www.sosfanta.com/lista-formazioni/probabili-formazioni-serie-a/"
DATA_DIR = Path(__file__).resolve().parents[3] / "data"

FLAT_RE = re.compile(
    r'<span[^>]*>\s*(\d{1,3})%\s*</span>\s*<span[^>]*text-\[#333\][^>]*>\s*([^<]+?)\s*</span>',
    re.S,
)
BALL_RE = re.compile(
    r'<span[^>]*>\s*(\d{1,3})%\s*</span>\s*<span aria-hidden="true">-</span>\s*<span[^>]*>\s*(\d{1,3})%\s*</span>.*?'
    r'<span class="max-w-full[^"]*"[^>]*>\s*([^<]+?)\s*</span>',
    re.S,
)
TEAM_RE = re.compile(r"<h2[^>]*>\s*([^<]+?)\s*</h2>")


def _section(block: str, start: str, ends: list[str]) -> str:
    i = block.find(start)
    if i == -1:
        return ""
    i += len(start)
    end = min([j for j in (block.find(e, i) for e in ends) if j != -1] or [len(block)])
    return block[i:end]


def parse_titolarita(page: str) -> list[dict]:
    blocks = re.split(r'data-match-id="[a-z0-9-]+"\s*>', page)[1:]
    matches = []
    for block in blocks:
        teams = TEAM_RE.findall(block)
        if len(teams) < 2:
            continue
        players: dict[str, int] = {}
        for pct, name in FLAT_RE.findall(_section(block, ">Titolari<", ["Ballottaggi<", "Panchina<"])):
            players[html_lib.unescape(name.strip())] = int(pct)
        for pct_a, pct_b, names in BALL_RE.findall(_section(block, ">Ballottaggi<", ["Panchina<"])):
            names = html_lib.unescape(names)
            if " - " in names:
                a, b = (n.strip() for n in names.split(" - ", 1))
                players.setdefault(a, int(pct_a))
                players.setdefault(b, int(pct_b))
        for pct, name in FLAT_RE.findall(_section(block, ">Panchina<", [])):
            players.setdefault(html_lib.unescape(name.strip()), int(pct))
        matches.append(
            {
                "casa": canonical(teams[0]),
                "trasferta": canonical(teams[1]),
                "giocatori": [{"nome": n, "pct": p} for n, p in players.items()],
            }
        )
    return matches


PCT_RE = re.compile(r"(\d{1,3})\s*%")
BALLOTTAGGIO_RE = re.compile(r"(\d{1,3})\s*%\s*-\s*(\d{1,3})\s*%\s*(.+?)\s+-\s+(.+)$", re.S)


def _colonne(sezione) -> list:
    """Le due colonne di una sezione: prima la squadra di casa, poi quella in trasferta."""
    griglia = sezione.select_one("div.grid.grid-cols-2")
    return griglia.find_all("ul", recursive=False) if griglia else []


def _nome(li) -> str:
    span = li.select_one("span.truncate")
    return span.get_text(" ", strip=True) if span else ""


def parse_probabili(page: str) -> list[dict]:
    """Probabili formazioni complete, per la pagina della giornata: moduli, titolari in ordine
    di reparto (portiere, difesa, ... attacco), ballottaggi, panchina e indisponibili, per lato."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(page, "lxml")
    partite = []
    for art in soup.select("article[id^=match-]"):
        testata = art.find("header")
        squadre = [h.get_text(strip=True) for h in testata.find_all("h2")] if testata else []
        if len(squadre) < 2:
            continue
        moduli = [s.get_text(strip=True) for s in testata.select("span.text-primary")]
        lati: list[dict] = [{"titolari": [], "ballottaggi": [], "panchina": [], "indisponibili": []} for _ in range(2)]
        for sezione in art.find_all("section"):
            titolo = sezione.find("h3")
            chiave = titolo.get_text(strip=True).lower() if titolo else ""
            for lato, ul in zip(lati, _colonne(sezione)):
                for li in ul.find_all("li", recursive=False):
                    testo = li.get_text(" ", strip=True)
                    if chiave in ("titolari", "panchina"):
                        pct = PCT_RE.search(testo)
                        lato[chiave].append({"nome": _nome(li), "pct": int(pct.group(1)) if pct else None})
                    elif chiave == "ballottaggi":
                        m = BALLOTTAGGIO_RE.search(testo)
                        if m:
                            lato[chiave].append({"a": m.group(3).strip(), "pa": int(m.group(1)),
                                                 "b": m.group(4).strip(), "pb": int(m.group(2))})
                    elif chiave == "indisponibili":
                        stato = li.select_one("span[title]")
                        nota = li.select_one("span.leading-5")
                        lato[chiave].append({
                            "nome": _nome(li),
                            "stato": stato["title"] if stato else None,
                            "nota": nota.get_text(" ", strip=True) if nota else None,
                        })
        partite.append({
            "casa": canonical(squadre[0]),
            "trasferta": canonical(squadre[1]),
            "moduli": {"casa": moduli[0] if moduli else None, "trasferta": moduli[1] if len(moduli) > 1 else None},
            "lati": {"casa": lati[0], "trasferta": lati[1]},
        })
    return partite


def main() -> None:
    page = fetch_html(URL, DATA_DIR / "cache" / "titolarita", refresh=True)
    matches = parse_titolarita(page)
    total = sum(len(m["giocatori"]) for m in matches)
    if len(matches) != 10 or total < 300:
        raise RuntimeError(f"{len(matches)} partite e {total} giocatori: formato pagina cambiato?")
    out = DATA_DIR / "raw" / "titolarita.json"
    out.write_text(json.dumps(matches, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Titolarità: {len(matches)} partite, {total} giocatori salvati in {out}")

    # le formazioni complete sono un di più: se il formato cambia, la titolarità resta valida
    try:
        probabili = parse_probabili(page)
        (DATA_DIR / "raw" / "probabili.json").write_text(json.dumps(probabili, ensure_ascii=False, indent=1), encoding="utf-8")
        titolari = sum(len(p["lati"][l]["titolari"]) for p in probabili for l in ("casa", "trasferta"))
        print(f"Probabili formazioni: {len(probabili)} partite, {titolari} titolari")
    except Exception as exc:
        print(f"Probabili formazioni non lette ({exc})")


if __name__ == "__main__":
    main()
