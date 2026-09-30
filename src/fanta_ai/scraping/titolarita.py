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


def main() -> None:
    page = fetch_html(URL, DATA_DIR / "cache" / "titolarita", refresh=True)
    matches = parse_titolarita(page)
    total = sum(len(m["giocatori"]) for m in matches)
    if len(matches) != 10 or total < 300:
        raise RuntimeError(f"{len(matches)} partite e {total} giocatori: formato pagina cambiato?")
    out = DATA_DIR / "raw" / "titolarita.json"
    out.write_text(json.dumps(matches, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Titolarità: {len(matches)} partite, {total} giocatori salvati in {out}")


if __name__ == "__main__":
    main()
