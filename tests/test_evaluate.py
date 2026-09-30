import pandas as pd
import pytest

from fanta_ai.evaluate import evaluate_matchday

SQUADRE = [f"S{i}" for i in range(20)]


def _voti(fv_by_id: dict[int, float | None]) -> pd.DataFrame:
    rows = [{"id": i, "squadra": SQUADRE[i % 20], "v_fc": None if fv is None else 6.0, "fv_fc": fv}
            for i, fv in fv_by_id.items()]
    # almeno un voto per ognuna delle 20 squadre: giornata completa
    rows += [{"id": 1000 + k, "squadra": s, "v_fc": 6.0, "fv_fc": 6.0} for k, s in enumerate(SQUADRE)]
    return pd.DataFrame(rows)


def test_matchday_metrics():
    pred = pd.DataFrame(
        {
            "id": [1, 2, 3],
            "punteggio": [8.0, 7.0, 6.0],
            "p_gioca": [0.9, 0.85, 0.2],
            "fv_atteso": [7.0, 6.0, 6.0],
            "fantamedia": [6.0, 6.5, None],
        }
    )
    result = evaluate_matchday(pred, _voti({1: 10.0, 2: 6.0}))  # il 3 non ha giocato
    assert result["giocatori_con_voto"] == 2
    assert result["mae_modello"] == pytest.approx((3.0 + 0.0) / 2)
    assert result["mae_fantamedia"] == pytest.approx((4.0 + 0.5) / 2)
    assert result["sicuri"] == 2 and result["sicuri_hanno_giocato"] == 1.0
    assert result["top10_hanno_giocato"] == 2


def test_incomplete_matchday_is_skipped():
    pred = pd.DataFrame({"id": [1], "punteggio": [7.0], "p_gioca": [0.9], "fv_atteso": [6.0], "fantamedia": [6.0]})
    voti = pd.DataFrame([{"id": 1, "squadra": "S0", "v_fc": 6.0, "fv_fc": 6.0}])
    assert evaluate_matchday(pred, voti) is None
