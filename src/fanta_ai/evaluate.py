"""Accuratezza settimanale: previsioni archiviate confrontate con i voti veri.

Per ogni giornata già giocata di cui esiste data/predictions/{stagione}_gNN.csv:
  - errore medio sul fantavoto di chi ha giocato, modello contro fantamedia;
  - quanto hanno fatto davvero i 10 giocatori più consigliati;
  - quanti dei giocatori dati "sicuri" (p_gioca >= 0.8) hanno davvero preso voto.
Insieme al backtest sulle stagioni passate finisce in web/public/data/accuratezza.json.

Uso:
    uv run python -m fanta_ai.evaluate
"""

from __future__ import annotations

import glob
import json
import re
from pathlib import Path

import pandas as pd

from fanta_ai.dataset import DATA_DIR
from fanta_ai.predict import WEB_DATA

ROOT = Path(__file__).resolve().parents[2]


def evaluate_matchday(pred: pd.DataFrame, voti: pd.DataFrame) -> dict | None:
    if voti.loc[voti["v_fc"].notna(), "squadra"].nunique() < 20:
        return None  # giornata non ancora completa
    real = voti.set_index("id")
    pred = pred.assign(
        giocato=pred["id"].map(real["v_fc"].notna()).fillna(False).astype(bool),
        fv=pred["id"].map(real["fv_fc"]),
    )
    played = pred[pred["giocato"]]
    top = pred.sort_values("punteggio", ascending=False).head(10)
    sicuri = pred[pred["p_gioca"] >= 0.8]
    base = played["fantamedia"].notna()
    return {
        "giocatori_con_voto": int(len(played)),
        "mae_modello": round(float((played["fv_atteso"] - played["fv"]).abs().mean()), 3),
        "mae_fantamedia": round(float((played.loc[base, "fantamedia"] - played.loc[base, "fv"]).abs().mean()), 3),
        "top10_fv_medio": round(float(top["fv"].fillna(0).mean()), 2),
        "top10_hanno_giocato": int(top["giocato"].sum()),
        "fv_medio_tutti": round(float(played["fv"].mean()), 2),
        "sicuri": int(len(sicuri)),
        "sicuri_hanno_giocato": round(float(sicuri["giocato"].mean()), 3) if len(sicuri) else None,
    }


def main() -> None:
    track = []
    for path in sorted(glob.glob(str(DATA_DIR / "predictions" / "*_g*.csv"))):
        m = re.search(r"(\d{4}-\d{2})_g(\d+)\.csv$", path)
        stagione, giornata = m.group(1), int(m.group(2))
        voti_file = DATA_DIR / "raw" / f"voti_{stagione}.csv"
        if not voti_file.exists():
            continue
        voti = pd.read_csv(voti_file)
        voti = voti[voti["giornata"] == giornata]
        if voti.empty:
            continue
        result = evaluate_matchday(pd.read_csv(path), voti)
        if result:
            track.append({"stagione": stagione, "giornata": giornata, **result})

    backtest_file = ROOT / "reports" / "backtest.json"
    backtest = json.loads(backtest_file.read_text(encoding="utf-8")) if backtest_file.exists() else []
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "accuratezza.json").write_text(
        json.dumps({"backtest": backtest, "settimane": track}, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"Accuratezza: {len(backtest)} stagioni di backtest, {len(track)} giornate valutate.")
    for t in track:
        print(t)


if __name__ == "__main__":
    main()
