"""Modelli: probabilità di giocare, fantavoto atteso se gioca, probabilità di bonus.

Tre modelli a gradient boosting (scikit-learn HistGradientBoosting, che gestisce da sé
i valori mancanti):
  - `p_gioca`: classificatore su tutte le righe (ha preso voto sì/no);
  - `fv_atteso`: regressione del fantavoto sulle sole righe in cui ha giocato;
  - `p_bonus`: classificatore gol/assist sulle righe in cui ha giocato.

La baseline con cui confrontarli è quella che userebbe un fantallenatore:
fantamedia della stagione (o della precedente) e quota di presenze recenti.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

from fanta_ai.dataset import FEATURES

ROLE_MEAN_FV = {"P": 5.4, "D": 5.9, "C": 6.1, "A": 6.4}


@dataclass
class Models:
    p_gioca: HistGradientBoostingClassifier
    fv_atteso: HistGradientBoostingRegressor
    p_bonus: HistGradientBoostingClassifier


def _classifier() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=40, random_state=0
    )


def train(df: pd.DataFrame) -> Models:
    played = df[df["giocato"]]
    p_gioca = _classifier().fit(df[FEATURES], df["giocato"])
    fv_atteso = HistGradientBoostingRegressor(
        loss="squared_error",
        max_iter=400,
        learning_rate=0.05,
        max_leaf_nodes=31,
        min_samples_leaf=60,
        random_state=0,
    ).fit(played[FEATURES], played["fv"])
    p_bonus = _classifier().fit(played[FEATURES], played["bonus"])
    return Models(p_gioca, fv_atteso, p_bonus)


def predict(models: Models, df: pd.DataFrame) -> pd.DataFrame:
    x = df[FEATURES]
    return pd.DataFrame(
        {
            "p_gioca": models.p_gioca.predict_proba(x)[:, 1],
            "fv_atteso": models.fv_atteso.predict(x),
            "p_bonus": models.p_bonus.predict_proba(x)[:, 1],
        },
        index=df.index,
    )


def baseline(df: pd.DataFrame) -> pd.DataFrame:
    """Quello che guarderebbe un fantallenatore: fantamedia e presenze recenti."""
    fv = (
        df["stag_fantamedia"]
        .fillna(df["prec_fantamedia"])
        .fillna(df["carr_fantamedia"])
        .fillna(df["ruolo"].map(ROLE_MEAN_FV))
    )
    p = df["ult5_giocato"].fillna(df["stag_presenze_quota"]).fillna(0.5)
    return pd.DataFrame({"p_gioca": p, "fv_atteso": fv, "p_bonus": np.nan}, index=df.index)
