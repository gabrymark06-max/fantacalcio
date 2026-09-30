"""Verifica sulle stagioni passate: il modello batte la baseline?

Per ogni stagione di test si allena il modello solo sulle stagioni precedenti e si
confronta con la baseline (fantamedia + presenze recenti) su:
  1. errore sul fantavoto di chi ha giocato (MAE) e capacità di ordinare i giocatori
     di una giornata (correlazione di Spearman per giornata e ruolo);
  2. accuratezza della probabilità di giocare (Brier score, più basso è meglio);
  3. la prova che conta: rose di fantacalcio simulate, formazione scelta ogni
     giornata con il modello o con la baseline, punti realmente fatti.

Uso:
    uv run python -m fanta_ai.backtest
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from fanta_ai.dataset import DATA_DIR
from fanta_ai.lineup import best_lineup, expected_score, realized_points
from fanta_ai.model import baseline, predict, train

TEST_SEASONS = ["2023-24", "2024-25", "2025-26"]
ROSE_PER_STAGIONE = 300
COMPOSIZIONE = {"P": 3, "D": 8, "C": 8, "A": 6}
REPORT = Path(__file__).resolve().parents[2] / "reports" / "backtest.json"


def spearman_by_group(df: pd.DataFrame, pred_col: str) -> float:
    corrs = []
    for _, g in df.groupby(["giornata", "ruolo"]):
        if len(g) >= 10:
            corrs.append(g[pred_col].rank().corr(g["fv"].rank()))
    return float(np.nanmean(corrs))


def simulate_rosters(test: pd.DataFrame, rng: np.random.Generator) -> list[list[int]]:
    """Rose casuali 3/8/8/6 tra i giocatori con almeno 10 voti in stagione (quelli che si comprano)."""
    presenze = test[test["giocato"]].groupby("id").size()
    regolari = set(presenze[presenze >= 10].index)
    ruoli = test.drop_duplicates("id").set_index("id")["ruolo"]
    pool = {r: [i for i in ruoli[ruoli == r].index if i in regolari] for r in "PDCA"}
    return [
        [int(i) for r, n in COMPOSIZIONE.items() for i in rng.choice(pool[r], size=n, replace=False)]
        for _ in range(ROSE_PER_STAGIONE)
    ]


def lineup_points(test: pd.DataFrame, rose: list[list[int]], score_col: str) -> float:
    """Media dei punti realizzati a giornata scegliendo la formazione con `score_col`."""
    totals = []
    for _, giornata in test.groupby("giornata"):
        per_id = giornata.drop_duplicates("id").set_index("id")
        for rosa_ids in rose:
            presenti = [i for i in rosa_ids if i in per_id.index]
            rosa = per_id.loc[presenti, ["ruolo", "giocato", "fv", score_col]]
            try:
                lineup = best_lineup(rosa, score_col)
            except ValueError:
                continue
            totals.append(realized_points(lineup, rosa))
    return float(np.mean(totals))


def evaluate_season(df: pd.DataFrame, season: str, rng: np.random.Generator) -> dict:
    anno = int(season[:4])
    train_df = df[df["anno"] < anno]
    test = df[df["stagione"] == season].copy()

    models = train(train_df)
    m = predict(models, test)
    b = baseline(test)
    test["score_modello"] = expected_score(m["p_gioca"], m["fv_atteso"])
    test["score_baseline"] = expected_score(b["p_gioca"], b["fv_atteso"])
    test["fv_modello"], test["fv_baseline"] = m["fv_atteso"], b["fv_atteso"]

    played = test[test["giocato"]]
    y = test["giocato"].astype(float)
    rose = simulate_rosters(test, rng)
    punti_modello = lineup_points(test, rose, "score_modello")
    punti_baseline = lineup_points(test, rose, "score_baseline")

    return {
        "stagione": season,
        "righe_test": int(len(test)),
        "fv_mae_modello": float((played["fv_modello"] - played["fv"]).abs().mean()),
        "fv_mae_baseline": float((played["fv_baseline"] - played["fv"]).abs().mean()),
        "fv_spearman_modello": spearman_by_group(played, "fv_modello"),
        "fv_spearman_baseline": spearman_by_group(played, "fv_baseline"),
        "gioca_brier_modello": float(((m["p_gioca"] - y) ** 2).mean()),
        "gioca_brier_baseline": float(((b["p_gioca"] - y) ** 2).mean()),
        "bonus_brier_modello": float(((m.loc[played.index, "p_bonus"] - played["bonus"]) ** 2).mean()),
        "bonus_frequenza": float(played["bonus"].mean()),
        "rose_simulate": len(rose),
        "punti_giornata_modello": punti_modello,
        "punti_giornata_baseline": punti_baseline,
        "punti_giornata_differenza": punti_modello - punti_baseline,
    }


def main() -> None:
    df = pd.read_parquet(DATA_DIR / "processed" / "dataset.parquet")
    rng = np.random.default_rng(2026)
    results = [evaluate_season(df, s, rng) for s in TEST_SEASONS]
    for r in results:
        print(
            f"{r['stagione']}: fantavoto MAE {r['fv_mae_modello']:.3f} vs {r['fv_mae_baseline']:.3f} | "
            f"Spearman {r['fv_spearman_modello']:.3f} vs {r['fv_spearman_baseline']:.3f} | "
            f"gioca Brier {r['gioca_brier_modello']:.4f} vs {r['gioca_brier_baseline']:.4f} | "
            f"punti/giornata {r['punti_giornata_modello']:.2f} vs {r['punti_giornata_baseline']:.2f} "
            f"({r['punti_giornata_differenza']:+.2f})"
        )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(results, indent=1), encoding="utf-8")
    print(f"Report salvato in {REPORT}")


if __name__ == "__main__":
    main()
