"""Listone ufficiale (quotazioni) da fantacalcio.it.

Fonte: https://www.fantacalcio.it/quotazioni-fantacalcio — la pagina contiene tutta la
tabella dei giocatori (<tr class="player-row">), senza login. Per ogni giocatore:
id ufficiale, nome, ruolo Classic, squadra attuale, quotazione iniziale/attuale, FVM.
Chi ha lasciato la Serie A resta nella tabella con un asterisco (<span class="out-of-game">):
colonna `fuori_gioco`, esclusi da previsioni e sito.

Uso:
    uv run python -m fanta_ai.scraping.listone
"""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd
from bs4 import BeautifulSoup

from fanta_ai.http import fetch_html
from fanta_ai.teams import canonical

URL = "https://www.fantacalcio.it/quotazioni-fantacalcio"
DATA_DIR = Path(__file__).resolve().parents[3] / "data"
ROLES = {"p": "P", "d": "D", "c": "C", "a": "A"}
HREF_RE = re.compile(r"/serie-a/squadre/([^/]+)/[^/]+/(\d+)")


def _int(text: str | None) -> int | None:
    text = (text or "").strip()
    return int(text) if text.lstrip("-").isdigit() else None


def parse_listone(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    rows = []
    for tr in soup.select("tr.player-row"):
        link = tr.select_one("a.player-name")
        match = HREF_RE.search(link["href"]) if link else None
        role = ROLES.get(tr.get("data-filter-role-classic", ""))
        if match is None or role is None:
            continue
        cells = {td.get("data-col-key"): td.get_text(strip=True) for td in tr.select("td[data-col-key]")}
        rows.append(
            {
                "id": int(match.group(2)),
                "nome": link.get_text(strip=True),
                "ruolo": role,
                "squadra": canonical(match.group(1)),
                "qi": _int(cells.get("c_qi")),
                "qa": _int(cells.get("c_qa")),
                "fvm": _int(cells.get("c_fvm")),
                "fuori_gioco": tr.select_one(".out-of-game") is not None,
            }
        )
    return rows


def main() -> None:
    html = fetch_html(URL, DATA_DIR / "cache" / "listone", refresh=True)
    rows = parse_listone(html)
    if not rows:
        raise RuntimeError("Listone vuoto: probabile cambio di formato della pagina.")
    out = DATA_DIR / "raw" / "listone.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(out, index=False)
    fuori = sum(r["fuori_gioco"] for r in rows)
    print(f"Listone: {len(rows)} giocatori ({fuori} non più in Serie A) salvati in {out}")


if __name__ == "__main__":
    main()
