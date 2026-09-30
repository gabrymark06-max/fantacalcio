from pathlib import Path

from fanta_ai.scraping.voti import parse_voti

FIXTURE = Path(__file__).parent / "fixtures" / "voti_atalanta_2025-26_g1.html"


def rows_by_name() -> dict[str, dict]:
    rows = parse_voti(FIXTURE.read_text(encoding="utf-8"))
    return {r["nome"]: r for r in rows}


def test_parses_only_players_not_coach():
    rows = rows_by_name()
    assert len(rows) == 16
    assert "Juric" not in rows
    assert {r["ruolo"] for r in rows.values()} == {"P", "D", "C", "A"}


def test_goalkeeper_grades_and_conceded_goals():
    carnesecchi = rows_by_name()["Carnesecchi"]
    assert carnesecchi["id"] == 4431
    assert (carnesecchi["v_fc"], carnesecchi["fv_fc"]) == (6.5, 5.5)
    assert carnesecchi["gol_subiti"] == 1


def test_scorer_bonus():
    scamacca = rows_by_name()["Scamacca"]
    assert scamacca["gol"] == 1
    assert (scamacca["v_fc"], scamacca["fv_fc"]) == (7.0, 10.0)
    assert scamacca["sostituito"] is True


def test_own_goal_malus():
    hien = rows_by_name()["Hien"]
    assert hien["autoreti"] == 1
    assert (hien["v_fc"], hien["fv_fc"]) == (5.0, 3.0)


def test_senza_voto_is_empty_not_55():
    kossounou = rows_by_name()["Kossounou"]
    assert kossounou["v_fc"] is None and kossounou["fv_fc"] is None
    assert kossounou["subentrato"] is True


def test_current_season_links_have_no_season_suffix():
    html = FIXTURE.read_text(encoding="utf-8").replace("/4431/2025-26", "/4431")
    rows = {r["nome"]: r for r in parse_voti(html)}
    assert rows["Carnesecchi"]["id"] == 4431


def test_yellow_card_and_match_context():
    maldini = rows_by_name()["Maldini"]
    assert maldini["ammonito"] is True and maldini["espulso"] is False
    assert maldini["squadra"] == "Atalanta"
    assert maldini["avversario"] == "Pisa"
    assert maldini["in_casa"] is True
    assert (maldini["gol_casa"], maldini["gol_trasferta"]) == (1, 1)
