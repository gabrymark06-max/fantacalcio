"""Risultati e quote dei bookmaker da football-data.co.uk.

Fonte: https://www.football-data.co.uk/mmz4281/{codice}/I1.csv (un CSV gratuito per
stagione, codice "2526" = 2025/26). Si usano le quote medie di mercato 1X2 (AvgH/D/A)
e Over/Under 2.5 (Avg>2.5 / Avg<2.5), da cui si ricavano:
  - le probabilità implicite senza margine del bookmaker;
  - i gol attesi di casa e trasferta (Poisson indipendenti che meglio riproducono
    le tre probabilità 1, 2 e Over 2.5).

Uso:
    uv run python -m fanta_ai.scraping.quote --season 2025-26
"""

from __future__ import annotations

import argparse
import io
from pathlib import Path

import numpy as np
import pandas as pd

from fanta_ai.http import fetch_html
from fanta_ai.teams import canonical

URL_TEMPLATE = "https://www.football-data.co.uk/mmz4281/{code}/I1.csv"
DATA_DIR = Path(__file__).resolve().parents[3] / "data"

# Griglia di gol attesi per squadra: la ricerca è vettoriale, bastano pochi ms a partita
_LAMBDAS = np.arange(0.2, 4.01, 0.02)
_MAX_GOALS = 10


def _poisson_table() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per ogni coppia (lambda_casa, lambda_trasferta): P(1), P(2), P(Over 2.5)."""
    goals = np.arange(_MAX_GOALS + 1)
    log_fact = np.cumsum(np.log(np.maximum(goals, 1)))
    pmf = np.exp(goals[None, :] * np.log(_LAMBDAS[:, None]) - _LAMBDAS[:, None] - log_fact[None, :])
    joint = pmf[:, None, :, None] * pmf[None, :, None, :]  # [lh, la, gh, ga]
    gh, ga = np.meshgrid(goals, goals, indexing="ij")
    p_home = (joint * (gh > ga)).sum(axis=(2, 3))
    p_away = (joint * (gh < ga)).sum(axis=(2, 3))
    p_over = (joint * (gh + ga > 2)).sum(axis=(2, 3))
    return p_home, p_away, p_over


_P_HOME, _P_AWAY, _P_OVER = _poisson_table()


def expected_goals(p_home: float, p_away: float, p_over: float) -> tuple[float, float]:
    err = (_P_HOME - p_home) ** 2 + (_P_AWAY - p_away) ** 2 + (_P_OVER - p_over) ** 2
    i, j = np.unravel_index(np.argmin(err), err.shape)
    return float(_LAMBDAS[i]), float(_LAMBDAS[j])


def outcome_probabilities(xg_home: float, xg_away: float) -> tuple[float, float, float]:
    """P(1), P(X), P(2) con gol di casa e trasferta Poisson indipendenti."""
    goals = np.arange(_MAX_GOALS + 1)
    log_fact = np.cumsum(np.log(np.maximum(goals, 1)))
    ph = np.exp(goals * np.log(xg_home) - xg_home - log_fact)
    pa = np.exp(goals * np.log(xg_away) - xg_away - log_fact)
    joint = np.outer(ph, pa)
    return float(np.tril(joint, -1).sum()), float(np.trace(joint)), float(np.triu(joint, 1).sum())


def season_code(season: str) -> str:
    """"2025-26" -> "2526"."""
    start, end = season.split("-")
    return start[2:] + end


def parse_quote(csv_text: str, season: str) -> pd.DataFrame:
    raw = pd.read_csv(io.StringIO(csv_text.lstrip("﻿")))
    raw = raw.dropna(subset=["HomeTeam", "AwayTeam"])
    cols = {"AvgH": "q1", "AvgD": "qx", "AvgA": "q2", "Avg>2.5": "q_over", "Avg<2.5": "q_under"}
    out = pd.DataFrame(
        {
            "stagione": season,
            "data": pd.to_datetime(raw["Date"], dayfirst=True).dt.date,
            "casa": raw["HomeTeam"].map(canonical),
            "trasferta": raw["AwayTeam"].map(canonical),
            "gol_casa": raw["FTHG"],
            "gol_trasferta": raw["FTAG"],
            **{new: raw[old] for old, new in cols.items()},
        }
    )
    inv = 1 / out[["q1", "qx", "q2"]]
    margin = inv.sum(axis=1)
    out["p1"], out["px"], out["p2"] = (inv["q1"] / margin, inv["qx"] / margin, inv["q2"] / margin)
    ou = 1 / out["q_over"] + 1 / out["q_under"]
    out["p_over"] = (1 / out["q_over"]) / ou

    lambdas = [
        expected_goals(r.p1, r.p2, r.p_over) if pd.notna(r.p_over) else (np.nan, np.nan)
        for r in out.itertuples()
    ]
    out["xg_casa"] = [lh for lh, _ in lambdas]
    out["xg_trasferta"] = [la for _, la in lambdas]
    return out


def scrape_season(season: str, *, refresh: bool = False) -> pd.DataFrame:
    url = URL_TEMPLATE.format(code=season_code(season))
    text = fetch_html(url, DATA_DIR / "cache" / "quote", refresh=refresh)
    return parse_quote(text, season)


def main() -> None:
    parser = argparse.ArgumentParser(description="Scarica risultati e quote da football-data.co.uk.")
    parser.add_argument("--season", required=True, help="es. 2025-26")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    df = scrape_season(args.season, refresh=args.refresh)
    out = DATA_DIR / "raw" / f"quote_{args.season}.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"{args.season}: {len(df)} partite salvate in {out}")


if __name__ == "__main__":
    main()
