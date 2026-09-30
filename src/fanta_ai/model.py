"""Modelli: probabilità di giocare e, se gioca, ogni voce del fantavoto.

Il fantavoto si scompone in voto + bonus/malus (formula in dataset.COMPONENTI_CONTEGGIO):
prevedendo ogni voce separatamente il sito può ricomporlo con le regole di qualsiasi lega
(bonus diversi per ruolo, imbattibilità del portiere, modificatore difesa sui voti puri).

Modelli (scikit-learn HistGradientBoosting, gestisce da sé i valori mancanti):
  - `p_gioca`: classificatore su tutte le righe (ha preso voto sì/no);
  - `fv_std`: fantavoto con le regole standard, previsto direttamente (è il più preciso:
    nel backtest ordina i giocatori meglio della somma delle singole voci);
  - sulle righe in cui ha giocato: voto (regressione), gol/rigori/assist (Poisson),
    ammonizione (classificatore), e per i portieri gol subiti (Poisson);
  - player of the match (bonus di alcune leghe, non nel fantavoto standard): classificatore
    allenato dal 2024/25, la prima stagione in cui fantacalcio.it lo registra;
  - porta inviolata: e^(-gol attesi dell'avversario dalle quote). Sulla stagione 2025/26 è
    meglio calibrata di un classificatore dedicato (Brier 0,203 contro 0,233);
  - voci rare (espulsioni, autoreti, rigori sbagliati/parati): frequenze storiche per
    ruolo, o in proporzione ai rigori calciati.

Con regole diverse: FV = fv_std + somma su ogni voce di (bonus lega - bonus standard) × voce
attesa, più l'eventuale bonus imbattibilità × p_imbattuto. È esatto nel valore atteso.

La baseline con cui confrontarli è quella che userebbe un fantallenatore:
fantamedia della stagione (o della precedente) e quota di presenze recenti.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

from fanta_ai.dataset import FEATURES

ROLE_MEAN_FV = {"P": 5.4, "D": 5.9, "C": 6.1, "A": 6.4}

# Tabella bonus di fantacalcio.it (verificata sui dati, vedi dataset.py)
BONUS_STANDARD = {
    "gol": 3.0,
    "rigori_segnati": 3.0,
    "assist": 1.0,
    "gol_subiti": -1.0,
    "autoreti": -2.0,
    "rigori_sbagliati": -3.0,
    "rigori_parati": 3.0,
    "ammonito": -0.5,
    "espulso": -1.0,
}


@dataclass
class Models:
    p_gioca: HistGradientBoostingClassifier
    fv_std: HistGradientBoostingRegressor
    voto: HistGradientBoostingRegressor
    gol: HistGradientBoostingRegressor
    rigori: HistGradientBoostingRegressor
    assist: HistGradientBoostingRegressor
    ammonito: HistGradientBoostingClassifier
    gol_subiti: HistGradientBoostingRegressor  # solo portieri
    potm: HistGradientBoostingClassifier  # player of the match, registrato dal 2024/25
    rare: dict = field(default_factory=dict)  # frequenze per ruolo delle voci rare
    quota_rigori_sbagliati: float = 0.0  # rigori sbagliati / rigori segnati


def _classifier() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=40, random_state=0
    )


# Vincoli di monotonia: più gol attesi di squadra, più fantamedia o gol storici non possono
# mai abbassare la previsione. Rendono il modello più stabile sui giocatori con pochi dati
# simili (i campioni), dove gli alberi senza vincoli tendono a scalini irregolari.
MONOTONIA = {
    "xg_squadra": 1,
    "xg_avversario": -1,
    "p_vittoria": 1,
    "stag_fantamedia": 1,
    "stag_media_voto": 1,
    "ult5_fv": 1,
    "ult5_voto": 1,
    "carr_fantamedia": 1,
    "carr_media_voto": 1,
    "prec_fantamedia": 1,
    "carr_gol_pg": 1,
    "carr_assist_pg": 1,
    "carr_rigori_pg": 1,
}


def _regressor(loss: str, monotono: bool = True) -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(
        loss=loss,
        max_iter=300,
        learning_rate=0.05,
        max_leaf_nodes=31,
        min_samples_leaf=60,
        random_state=0,
        monotonic_cst=[MONOTONIA.get(f, 0) for f in FEATURES] if monotono else None,
    )


def train(df: pd.DataFrame) -> Models:
    played = df[df["giocato"]]
    keepers = played[played["ruolo"] == "P"]
    x, xk = played[FEATURES], keepers[FEATURES]
    rare = {
        col: played.groupby("ruolo")[col].mean().to_dict()
        for col in ["espulso", "autoreti", "rigori_parati"]
    }
    return Models(
        p_gioca=_classifier().fit(df[FEATURES], df["giocato"]),
        fv_std=_regressor("squared_error").fit(x, played["fv"]),
        voto=_regressor("squared_error").fit(x, played["v_fc"]),
        gol=_regressor("poisson").fit(x, played["gol"]),
        rigori=_regressor("poisson").fit(x, played["rigori_segnati"]),
        assist=_regressor("poisson").fit(x, played["assist"]),
        ammonito=_classifier().fit(x, played["ammonito"]),
        # per i portieri i gol subiti crescono con i gol attesi dell'avversario: vincoli diversi
        gol_subiti=_regressor("poisson", monotono=False).fit(xk, keepers["gol_subiti"]),
        # il premio esiste solo dal 2024/25: prima uno 0 vuol dire "non registrato", non "no"
        potm=_classifier().fit(played.loc[played["anno"] >= 2024, FEATURES], played.loc[played["anno"] >= 2024, "potm"] > 0),
        rare={k: {r: float(v) for r, v in d.items()} for k, d in rare.items()},
        quota_rigori_sbagliati=float(played["rigori_sbagliati"].sum() / max(played["rigori_segnati"].sum(), 1)),
    )


def predict_components(models: Models, df: pd.DataFrame) -> pd.DataFrame:
    """Voci attese del fantavoto se il giocatore gioca, più la probabilità che giochi."""
    x = df[FEATURES]
    keeper = (df["ruolo"] == "P").to_numpy()
    out = pd.DataFrame(index=df.index)
    out["p_gioca"] = models.p_gioca.predict_proba(x)[:, 1]
    out["fv_std"] = models.fv_std.predict(x)
    out["voto"] = models.voto.predict(x)
    out["gol"] = np.where(keeper, 0.0, models.gol.predict(x))
    out["rigori_segnati"] = np.where(keeper, 0.0, models.rigori.predict(x))
    out["rigori_sbagliati"] = out["rigori_segnati"] * models.quota_rigori_sbagliati
    out["assist"] = np.where(keeper, 0.0, models.assist.predict(x))
    out["ammonito"] = models.ammonito.predict_proba(x)[:, 1]
    out["gol_subiti"] = np.where(keeper, models.gol_subiti.predict(x), 0.0)
    out["potm"] = models.potm.predict_proba(x)[:, 1]
    out["p_imbattuto"] = np.where(keeper, np.exp(-df["xg_avversario"].to_numpy(dtype=float)), 0.0)
    for col, per_role in models.rare.items():
        out[col] = df["ruolo"].map(per_role).fillna(0.0).to_numpy()
    out.loc[~keeper, "rigori_parati"] = 0.0
    return out


def fantavoto(components: pd.DataFrame, bonus: dict = BONUS_STANDARD, imbattibilita: float = 0.0) -> pd.Series:
    """Fantavoto atteso se gioca con una tabella bonus/malus (e bonus porta inviolata)."""
    delta = sum(components[k] * (v - BONUS_STANDARD[k]) for k, v in bonus.items())
    return components["fv_std"] + delta + imbattibilita * components["p_imbattuto"]


def p_bonus(components: pd.DataFrame) -> pd.Series:
    """Probabilità di almeno un gol o assist (Poisson sulla somma dei valori attesi)."""
    return 1 - np.exp(-(components["gol"] + components["rigori_segnati"] + components["assist"]))


def predict(models: Models, df: pd.DataFrame) -> pd.DataFrame:
    comp = predict_components(models, df)
    return pd.DataFrame(
        {"p_gioca": comp["p_gioca"], "fv_atteso": fantavoto(comp), "p_bonus": p_bonus(comp)},
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
