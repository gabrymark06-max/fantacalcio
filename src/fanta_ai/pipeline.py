"""Aggiornamento completo: dati freschi, previsioni, accuratezza.

Da lanciare più volte a settimana (le probabili formazioni cambiano fino al giorno della
partita). Ogni passo che fallisce viene segnalato; se falliscono i dati essenziali
(voti, listone, calendario) le previsioni non vengono rigenerate.

Uso:
    uv run python -m fanta_ai.pipeline
"""

from __future__ import annotations

import sys
import traceback

import pandas as pd

from fanta_ai import evaluate, predict, probabili
from fanta_ai.dataset import DATA_DIR
from fanta_ai.predict import CURRENT_SEASON
from fanta_ai.scraping import calendario, listone, quote, titolarita, voti


def step(name: str, fn, essential: bool) -> bool:
    """Esegue un passo; False solo se un passo essenziale fallisce."""
    print(f"--- {name}")
    try:
        fn()
        return True
    except Exception:
        traceback.print_exc()
        print(f"ERRORE in '{name}'" + (" (essenziale)" if essential else " (proseguo)"))
        return not essential


def update_voti() -> None:
    out = DATA_DIR / "raw" / f"voti_{CURRENT_SEASON}.csv"
    df = voti.scrape_season(CURRENT_SEASON)
    if out.exists() and len(df) < len(pd.read_csv(out)):
        raise RuntimeError("Il nuovo file voti ha meno righe del precedente: non lo sovrascrivo.")
    df.to_csv(out, index=False)


def update_quote() -> None:
    df = quote.scrape_season(CURRENT_SEASON, refresh=True)
    df.to_csv(DATA_DIR / "raw" / f"quote_{CURRENT_SEASON}.csv", index=False)


def main() -> None:
    results = [
        step("voti", update_voti, essential=True),
        step("listone", listone.main, essential=True),
        step("calendario", calendario.main, essential=True),
        step("quote", update_quote, essential=False),
        step("titolarità", titolarita.main, essential=False),
    ]
    if not all(results):
        print("Dati essenziali mancanti: previsioni NON aggiornate.")
        sys.exit(1)
    if not step("previsioni", predict.main, essential=True):
        sys.exit(1)
    step("probabili formazioni", probabili.main, essential=False)
    step("accuratezza", evaluate.main, essential=False)


if __name__ == "__main__":
    main()
