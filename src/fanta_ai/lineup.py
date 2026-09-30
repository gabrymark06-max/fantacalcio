"""Formazione migliore per una rosa Classic e punteggio realizzato con le sostituzioni.

Il punteggio atteso di un giocatore schierato è
    p_gioca × fv_atteso + (1 − p_gioca) × VALORE_PANCHINA
perché se non gioca entra un compagno di reparto dalla panchina. Tra i moduli ammessi
si sceglie quello col punteggio atteso totale più alto (per ogni modulo basta prendere,
reparto per reparto, i giocatori con il punteggio più alto).
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

MODULI = {
    "3-4-3": (3, 4, 3),
    "3-5-2": (3, 5, 2),
    "4-3-3": (4, 3, 3),
    "4-4-2": (4, 4, 2),
    "4-5-1": (4, 5, 1),
    "5-3-2": (5, 3, 2),
    "5-4-1": (5, 4, 1),
}
VALORE_PANCHINA = 5.5
MAX_SOSTITUZIONI = 3


def expected_score(p_gioca: pd.Series, fv_atteso: pd.Series) -> pd.Series:
    return p_gioca * fv_atteso + (1 - p_gioca) * VALORE_PANCHINA


@dataclass
class Lineup:
    modulo: str
    titolari: list  # indici della rosa, portiere per primo
    panchina: list  # resto della rosa, per reparto in ordine di punteggio
    atteso: float


def best_lineup(rosa: pd.DataFrame, score_col: str = "punteggio") -> Lineup:
    """`rosa` ha le colonne `ruolo` e `score_col`; l'indice identifica il giocatore."""
    ordered = {r: rosa[rosa["ruolo"] == r].sort_values(score_col, ascending=False) for r in "PDCA"}
    best = None
    for modulo, (d, c, a) in MODULI.items():
        need = {"P": 1, "D": d, "C": c, "A": a}
        if any(len(ordered[r]) < n for r, n in need.items()):
            continue
        titolari = [i for r in "PDCA" for i in ordered[r].index[: need[r]]]
        atteso = float(rosa.loc[titolari, score_col].sum())
        if best is None or atteso > best.atteso:
            panchina = [i for r in "PDCA" for i in ordered[r].index[need[r]:]]
            best = Lineup(modulo, titolari, panchina, atteso)
    if best is None:
        raise ValueError("Rosa incompleta: servono almeno 1 P, 3 D, 3 C, 1 A.")
    return best


def realized_points(lineup: Lineup, rosa: pd.DataFrame) -> float:
    """Punti veri: fantavoto dei titolari che hanno giocato, sostituzioni di reparto dalla panchina.

    `rosa` ha le colonne `ruolo`, `giocato`, `fv`.
    """
    total = 0.0
    assenti = []
    for i in lineup.titolari:
        if rosa.at[i, "giocato"]:
            total += rosa.at[i, "fv"]
        else:
            assenti.append(rosa.at[i, "ruolo"])
    usati = set()
    sostituzioni = 0
    for ruolo in assenti:
        if sostituzioni >= MAX_SOSTITUZIONI:
            break
        for j in lineup.panchina:
            if j not in usati and rosa.at[j, "ruolo"] == ruolo and rosa.at[j, "giocato"]:
                total += rosa.at[j, "fv"]
                usati.add(j)
                sostituzioni += 1
                break
    return total
