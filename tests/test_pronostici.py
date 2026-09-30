import pandas as pd

from fanta_ai.pronostici import classifica, precedenti, proiezione, statistiche


def _partite():
    righe = [
        ("2026-08-22", "Inter", "Monza", 4, 1, 20, 5),
        ("2026-08-23", "Roma", "Inter", 1, 1, 12, 14),
        ("2026-08-30", "Monza", "Roma", 0, 2, 8, 15),
    ]
    return pd.DataFrame(
        [{"data": pd.Timestamp(d).date(), "casa": c, "trasferta": t, "FTHG": gc, "FTAG": gt, "HS": sc, "AS": st} for d, c, t, gc, gt, sc, st in righe]
    )


def test_classifica_punti_e_ordine():
    t = classifica(_partite())
    assert [(r["squadra"], r["pt"]) for r in t] == [("Inter", 4), ("Roma", 4), ("Monza", 0)]
    assert t[0]["gf"] == 5 and t[0]["gs"] == 2 and t[0]["pos"] == 1
    assert t[1]["pt_casa"] == 1 and t[1]["pt_trasferta"] == 3


def test_statistiche_dal_punto_di_vista_della_squadra():
    s = statistiche(_partite(), "Inter")
    assert s["totale"]["partite"] == 2
    assert s["totale"]["fatti"] == 2.5 and s["totale"]["tiri"] == 17.0
    assert s["casa"]["tiri"] == 20 and s["trasferta"]["tiri"] == 14
    assert s["totale"]["gg"] == 1.0 and s["totale"]["porta_inviolata"] == 0.0


def test_precedenti_nei_due_sensi():
    p = precedenti(_partite(), "Roma", "Inter")
    assert len(p) == 1 and p[0]["casa"] == "Roma"


def test_proiezione_probabilita_coerenti():
    t = classifica(_partite())
    rating = pd.DataFrame({"att": [2.0, 1.2, 0.8], "dif": [0.8, 1.1, 1.8]}, index=["Inter", "Roma", "Monza"])
    da_giocare = [{"casa": "Inter", "trasferta": "Roma"}, {"casa": "Monza", "trasferta": "Inter"}, {"casa": "Roma", "trasferta": "Monza"}]
    p = {r["squadra"]: r for r in proiezione(t, da_giocare, rating, 1.3, 1.2, n=2000)}
    assert abs(sum(r["p_scudetto"] for r in p.values()) - 1) < 1e-9
    assert p["Inter"]["p_scudetto"] > p["Roma"]["p_scudetto"] > p["Monza"]["p_scudetto"]
    assert p["Inter"]["punti_attesi"] > p["Inter"]["punti"]
