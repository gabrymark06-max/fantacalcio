import numpy as np
import pandas as pd
import pytest

from fanta_ai.dataset import add_player_features
from fanta_ai.lineup import best_lineup, realized_points
from fanta_ai.names import find
from fanta_ai.scraping.quote import expected_goals, outcome_probabilities
from fanta_ai.teams import canonical


def test_find_matches_initials_alias_and_typos():
    roster = [
        {"id": 1, "nome": "Martinez L."},
        {"id": 2, "nome": "Martinez Jo."},
        {"id": 3, "nome": "Chalobah T."},
        {"id": 4, "nome": "Kvaratskhelia"},
    ]
    assert find(roster, "Lautaro")["id"] == 1
    assert find(roster, "Martinez L.")["id"] == 1
    assert find(roster, "Martinez Jo.")["id"] == 2
    assert find(roster, "Chalobah")["id"] == 3
    assert find(roster, "Kvaratskhelja")["id"] == 4  # una lettera di differenza
    assert find(roster, "Martinez") is None  # ambiguo: meglio nessun collegamento che quello sbagliato


def test_team_names_are_canonical():
    assert canonical("hellas-verona") == "Verona"
    assert canonical("Inter Milan") == "Inter"
    assert canonical("atalanta") == "Atalanta"


def test_outcome_probabilities_and_inverse():
    p1, px, p2 = outcome_probabilities(1.8, 0.9)
    assert p1 + px + p2 == pytest.approx(1.0, abs=1e-4)  # troncato a 10 gol per squadra
    assert p1 > p2
    # dalle probabilità si ritrovano (quasi) gli stessi gol attesi
    goals = np.arange(11)
    fact = np.cumprod(np.r_[1, goals[1:]])
    pmf = lambda lam: np.exp(-lam) * lam**goals / fact
    joint = np.outer(pmf(1.8), pmf(0.9))
    over = joint[np.add.outer(goals, goals) > 2].sum()
    lh, la = expected_goals(p1, p2, over)
    assert lh == pytest.approx(1.8, abs=0.05) and la == pytest.approx(0.9, abs=0.05)


def _rosa():
    ruoli = ["P"] * 3 + ["D"] * 8 + ["C"] * 8 + ["A"] * 6
    rosa = pd.DataFrame({"ruolo": ruoli})
    rosa["punteggio"] = 6.0
    rosa["giocato"] = True
    rosa["fv"] = 6.0
    return rosa


def test_best_lineup_picks_module_with_highest_expected_score():
    rosa = _rosa()
    attaccanti = rosa.index[rosa["ruolo"] == "A"]
    rosa.loc[attaccanti[:3], "punteggio"] = 9.0  # tre attaccanti fortissimi
    lineup = best_lineup(rosa)
    assert lineup.modulo in {"3-4-3", "4-3-3"}
    assert set(attaccanti[:3]) <= set(lineup.titolari)
    assert len(lineup.titolari) == 11


def test_realized_points_uses_same_role_bench_substitute():
    rosa = _rosa()
    lineup = best_lineup(rosa)
    assente = [i for i in lineup.titolari if rosa.at[i, "ruolo"] == "D"][0]
    rosa.at[assente, "giocato"] = False
    rosa.at[assente, "fv"] = np.nan
    riserva = [i for i in lineup.panchina if rosa.at[i, "ruolo"] == "D"][0]
    rosa.at[riserva, "fv"] = 7.0
    assert realized_points(lineup, rosa) == pytest.approx(10 * 6.0 + 7.0)


def test_player_features_use_only_past_matches():
    n = 6
    df = pd.DataFrame(
        {
            "id": 1,
            "stagione": "2025-26",
            "anno": 2025,
            "squadra": "Atalanta",
            "giornata": range(1, n + 1),
            "giocato": True,
            "fv": [6.0, 10.0, 6.0, 6.0, 6.0, 20.0],  # l'ultimo valore enorme non deve mai comparire
            "v_fc": 6.0,
            "titolare": True,
            "subentrato_con_voto": False,
            "gol": 0,
            "rigori_segnati": 0,
            "rigori_sbagliati": 0,
            "assist": 0,
            "ammonito": False,
            "ruolo": "A",
            "in_casa": True,
        }
    )
    out = add_player_features(df).set_index("giornata")
    assert np.isnan(out.at[1, "stag_fantamedia"])
    assert out.at[3, "stag_fantamedia"] == pytest.approx(8.0)
    assert out.at[6, "stag_fantamedia"] == pytest.approx(34 / 5)
    assert out.at[6, "carr_fantamedia"] == pytest.approx(34 / 5)
    assert out["ult5_fv"].max() < 20
