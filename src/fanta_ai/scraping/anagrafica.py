"""Nome completo e data di nascita dei giocatori, dalle loro pagine su fantacalcio.it.

Servono per riconoscere con certezza il giocatore su Wikidata (nome + data di nascita), per
esempio per trovarne la foto. Una pagina per giocatore, in cache: si scaricano solo i nuovi.

Fonte: https://www.fantacalcio.it/serie-a/squadre/{squadra}/{slug}/{id}
  - <title>Mile Svilar - Profilo calciatore 2026/27 | Fantacalcio</title>
  - "Nato il 27 ago 1999"

Uso:
    uv run python -m fanta_ai.scraping.anagrafica
"""

from __future__ import annotations

import html
import re
from datetime import date
from pathlib import Path

import pandas as pd

from fanta_ai.http import fetch_html

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
URL = "https://www.fantacalcio.it/serie-a/squadre/{squadra}/{slug}/{id}"
MESI = {"gen": 1, "feb": 2, "mar": 3, "apr": 4, "mag": 5, "giu": 6, "lug": 7, "ago": 8, "set": 9, "ott": 10, "nov": 11, "dic": 12}
TITOLO_RE = re.compile(r"<title>\s*(.*?)\s+-\s+Profilo calciatore", re.S)
NASCITA_RE = re.compile(r"Nat[oa] il\s*(\d{1,2})\s+([a-z]{3})\w*\s+(\d{4})", re.I)


def parse_anagrafica(pagina: str) -> tuple[str | None, str | None]:
    """(nome completo, data di nascita ISO) dalla pagina del giocatore."""
    testo = re.sub(r"<[^>]+>", " ", pagina)
    titolo = TITOLO_RE.search(pagina)
    nascita = NASCITA_RE.search(testo)
    nome = html.unescape(titolo.group(1)).strip() if titolo else None
    data = None
    if nascita and nascita.group(2).lower() in MESI:
        data = date(int(nascita.group(3)), MESI[nascita.group(2).lower()], int(nascita.group(1))).isoformat()
    return nome, data


def slug(testo: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", testo.lower()).strip("-")


def main() -> None:
    listone = pd.read_csv(DATA_DIR / "raw" / "listone.csv")
    cache = DATA_DIR / "cache" / "anagrafica"
    righe = []
    for r in listone.itertuples():
        url = URL.format(squadra=slug(r.squadra), slug=slug(r.nome), id=r.id)
        try:
            nome, nascita = parse_anagrafica(fetch_html(url, cache))
        except Exception as exc:  # una pagina mancante non ferma le altre
            print(f"{r.nome} ({r.squadra}): {exc}")
            nome, nascita = None, None
        righe.append({"id": r.id, "nome": r.nome, "squadra": r.squadra, "nome_completo": nome, "nascita": nascita})
    df = pd.DataFrame(righe)
    df.to_csv(DATA_DIR / "raw" / "anagrafica.csv", index=False)
    print(f"Anagrafica: {df.nome_completo.notna().sum()} nomi e {df.nascita.notna().sum()} date di nascita su {len(df)}")


if __name__ == "__main__":
    main()
