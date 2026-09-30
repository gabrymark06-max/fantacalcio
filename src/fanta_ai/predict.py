"""Previsioni per la prossima giornata ed esportazione per il sito.

Passi:
  1. storico (voti + quote) e giocatori attuali dal listone;
  2. contesto di ogni partita: dalle quote di football-data se già pubblicate,
     altrimenti stimato dalla forza delle squadre (gol attesi medi nelle ultime 10);
  3. modello allenato su tutto lo storico → p_gioca, fv_atteso, p_bonus;
  4. probabilità di giocare corretta con le percentuali di titolarità di SOS Fanta;
  5. probabilità di giocare e fantavoto "da qui a fine stagione" (contesto neutro) per scambi;
  6. JSON per il sito in web/data/ e copia delle previsioni in
     data/predictions/ per misurare l'accuratezza a giornata giocata.

Uso:
    uv run python -m fanta_ai.predict
"""

from __future__ import annotations

import io
import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from fanta_ai.dataset import COMPONENTI_CONTEGGIO, DATA_DIR, add_match_context, add_player_features, build_base
from fanta_ai.http import fetch_html
from fanta_ai.lineup import expected_score
from fanta_ai.model import p_bonus, predict_components, train
from fanta_ai.names import find
from fanta_ai.scraping.quote import outcome_probabilities, parse_quote
from fanta_ai.teams import canonical

ROOT = Path(__file__).resolve().parents[2]
WEB_DATA = ROOT / "web" / "data"
FIXTURES_URL = "https://www.football-data.co.uk/fixtures.csv"
CURRENT_SEASON = "2026-27"

# Chi non è nella lista SOS Fanta della sua squadra è quasi sempre indisponibile
P_GIOCA_FUORI_LISTA = 0.03
# Peso delle percentuali SOS Fanta rispetto al modello storico sulla probabilità di giocare
PESO_SOS = 0.75
# Probabilità di entrare dalla panchina e prendere voto, se lo storico non la dice
SUBENTRO_DEFAULT = {"P": 0.02, "D": 0.2, "C": 0.3, "A": 0.3}
# Deviazione standard del voto puro attorno al previsto, per ruolo: misurata sulla stagione
# 2025/26 con il modello allenato sulle precedenti. Serve al modificatore difesa nel sito.
SD_VOTO = {"P": 0.55, "D": 0.57, "C": 0.56, "A": 0.68}
COMPONENTI_ESPORTATE = [
    "fv_std", "voto", "gol", "rigori_segnati", "rigori_sbagliati", "assist", "ammonito",
    "espulso", "autoreti", "gol_subiti", "rigori_parati", "p_imbattuto", "potm",
]


def in_serie_a(listone: pd.DataFrame) -> pd.DataFrame:
    """Solo chi gioca ancora in Serie A: chi è andato via resta nel listone con un asterisco."""
    if "fuori_gioco" not in listone:
        return listone
    return listone[~listone["fuori_gioco"].astype(bool)].reset_index(drop=True)


def team_ratings(base: pd.DataFrame, last_n: int = 10) -> pd.DataFrame:
    """Gol attesi fatti/subiti medi (dalle quote) nelle ultime `last_n` partite di ogni squadra."""
    tm = (
        base.dropna(subset=["xg_squadra"])
        .drop_duplicates(["stagione", "squadra", "giornata"])
        .sort_values(["anno", "giornata"])
    )
    recent = tm.groupby("squadra").tail(last_n)
    return recent.groupby("squadra").agg(att=("xg_squadra", "mean"), dif=("xg_avversario", "mean"))


def upcoming_odds() -> pd.DataFrame:
    """Quote della prossima giornata da football-data (vuoto se non ancora pubblicate)."""
    text = fetch_html(FIXTURES_URL, DATA_DIR / "cache" / "fixtures", refresh=True).lstrip("﻿")
    raw = pd.read_csv(io.StringIO(text))
    raw = raw[raw["Div"] == "I1"]
    if raw.empty:
        return pd.DataFrame()
    raw = raw.assign(FTHG=np.nan, FTAG=np.nan)
    return parse_quote(raw.to_csv(index=False), CURRENT_SEASON)


def home_advantage(base: pd.DataFrame) -> float:
    """Rapporto tra gol attesi in casa e in trasferta nelle quote storiche (~1.22 nel 2021-2026)."""
    tm = base.dropna(subset=["xg_squadra"]).drop_duplicates(["stagione", "squadra", "giornata"])
    home = tm["in_casa"].astype(bool)
    return float(tm.loc[home, "xg_squadra"].mean() / tm.loc[~home, "xg_squadra"].mean())


def league_average(base: pd.DataFrame) -> float:
    tm = base.dropna(subset=["xg_squadra"]).drop_duplicates(["stagione", "squadra", "giornata"])
    return float(tm["xg_squadra"].mean())


def match_context(
    partite: list[dict], ratings: pd.DataFrame, odds: pd.DataFrame, home_adv: float, league_avg: float
) -> pd.DataFrame:
    """Una riga per squadra: avversario, casa/trasferta, gol attesi e probabilità di vittoria.

    Senza quote i gol attesi si stimano col modello moltiplicativo attacco × difesa avversaria
    / media campionato (Maher, Dixon-Coles): sulle stagioni 2023-2026 riproduce i gol attesi
    delle quote con errore medio 0,11, contro 0,19 della media aritmetica.
    """
    rows = []
    for m in partite:
        casa, trasferta = m["casa"], m["trasferta"]
        quoted = odds[(odds["casa"] == casa) & (odds["trasferta"] == trasferta)] if not odds.empty else odds
        if not quoted.empty and pd.notna(quoted.iloc[0]["xg_casa"]):
            q = quoted.iloc[0]
            xg_c, xg_t, p1, px, p2, fonte = q.xg_casa, q.xg_trasferta, q.p1, q.px, q.p2, "quote"
        else:
            rc, rt = ratings.loc[casa], ratings.loc[trasferta]
            xg_c = rc.att * rt.dif / league_avg * np.sqrt(home_adv)
            xg_t = rt.att * rc.dif / league_avg / np.sqrt(home_adv)
            p1, px, p2 = outcome_probabilities(xg_c, xg_t)
            fonte = "stima"
        common = {"giornata": m["giornata"], "casa": casa, "trasferta": trasferta, "p1": p1, "px": px, "p2": p2,
                  "xg_casa": xg_c, "xg_trasferta": xg_t, "fonte_contesto": fonte, "data": m.get("data"), "ora": m.get("ora")}
        rows.append({**common, "squadra": casa, "avversario": trasferta, "in_casa": True})
        rows.append({**common, "squadra": trasferta, "avversario": casa, "in_casa": False})
    return add_match_context(pd.DataFrame(rows))


def neutral_context(ratings: pd.DataFrame) -> pd.DataFrame:
    """Contesto medio per il valore stagionale: le medie delle ultime partite della squadra sono
    già contro avversari medi, metà in casa e metà fuori, quindi si usano così come sono."""
    rows = []
    for squadra, r in ratings.iterrows():
        xg_s, xg_a = r.att, r.dif
        p_win, p_draw, _ = outcome_probabilities(xg_s, xg_a)
        rows.append({"squadra": squadra, "xg_squadra": xg_s, "xg_avversario": xg_a,
                     "p_vittoria": p_win, "p_pareggio": p_draw, "in_casa": 0.5})
    return pd.DataFrame(rows)


def future_rows(listone: pd.DataFrame, context: pd.DataFrame, giornata: int) -> pd.DataFrame:
    rows = listone[listone["squadra"].isin(context["squadra"])].copy()
    rows = rows.merge(context.drop(columns=["giornata"], errors="ignore"), on="squadra", how="left")
    rows["stagione"], rows["anno"], rows["giornata"] = CURRENT_SEASON, int(CURRENT_SEASON[:4]), giornata
    rows["giocato"], rows["titolare"], rows["subentrato_con_voto"] = False, False, False
    rows["ammonito"], rows["espulso"], rows["bonus"] = False, False, False
    rows["potm"] = 0
    for col in ["fv", "v_fc", "fv_fc"]:
        rows[col] = np.nan
    for col in COMPONENTI_CONTEGGIO:
        rows[col] = 0
    rows["_futura"] = True
    return rows


def features_for(base: pd.DataFrame, rows: pd.DataFrame) -> pd.DataFrame:
    """Caratteristiche storiche per le righe future (ultime nel tempo di ogni giocatore)."""
    hist = base.assign(_futura=False)
    full = add_player_features(pd.concat([hist, rows], ignore_index=True))
    return full[full["_futura"].astype(bool)].copy()


def forma_recente(n: int = 5) -> dict[str, list[dict]]:
    """Ultime `n` partite giocate da ogni squadra (anche della stagione prima), dalla più recente:
    esito V/N/P, gol fatti e subiti, avversario, casa o trasferta."""
    righe = []
    for f in sorted((DATA_DIR / "raw").glob("quote_*.csv")):
        righe.append(pd.read_csv(f, usecols=["data", "casa", "trasferta", "gol_casa", "gol_trasferta"]))
    if not righe:
        return {}
    partite = pd.concat(righe).dropna(subset=["gol_casa", "gol_trasferta"]).sort_values("data", ascending=False)
    forma: dict[str, list[dict]] = {}
    for m in partite.itertuples():
        for squadra, avversario, fatti, subiti, casa in (
            (m.casa, m.trasferta, m.gol_casa, m.gol_trasferta, True),
            (m.trasferta, m.casa, m.gol_trasferta, m.gol_casa, False),
        ):
            lista = forma.setdefault(squadra, [])
            if len(lista) < n:
                esito = "V" if fatti > subiti else "N" if fatti == subiti else "P"
                lista.append({"esito": esito, "fatti": int(fatti), "subiti": int(subiti), "avversario": avversario,
                              "casa": casa, "data": str(m.data)})
    return forma


def prossime_components(base, models, listone: pd.DataFrame, ratings: pd.DataFrame, home_adv: float, league_avg: float) -> dict:
    """Voci attese del fantavoto in media sulle prossime giornate, contro gli avversari veri
    (data/raw/calendario_prossime.json). Servono solo agli scambi: chi ha un calendario facile
    vale un po' di più nel breve periodo. Vuoto se il calendario non è disponibile."""
    path = DATA_DIR / "raw" / "calendario_prossime.json"
    if not path.exists():
        return {}
    partite = json.loads(path.read_text(encoding="utf-8"))
    per_giornata = []
    for g in sorted({m["giornata"] for m in partite}):
        context = match_context([m for m in partite if m["giornata"] == g], ratings, pd.DataFrame(), home_adv, league_avg)
        rows = features_for(base, future_rows(listone, context, g))
        comp = predict_components(models, rows)
        comp.index = rows["id"].to_numpy()
        per_giornata.append(comp[COMPONENTI_ESPORTATE])
    media = pd.concat(per_giornata).groupby(level=0).mean().round(4)
    return dict(zip(media.index, media.to_dict("records")))


def sos_start_probabilities(titolarita: list[dict], listone: pd.DataFrame) -> tuple[dict[int, int], set[str], int]:
    """id -> % titolarità SOS Fanta; squadre coperte; nomi non collegati."""
    pct: dict[int, int] = {}
    squadre = set()
    non_trovati = 0
    for m in titolarita:
        teams = [m["casa"], m["trasferta"]]
        squadre.update(teams)
        roster = listone[listone["squadra"].isin(teams)][["id", "nome"]].to_dict("records")
        for g in m["giocatori"]:
            p = find(roster, g["nome"])
            if p is None:
                non_trovati += 1
                continue
            pct[p["id"]] = max(pct.get(p["id"], 0), g["pct"])
    return pct, squadre, non_trovati


def combine_play_probability(df: pd.DataFrame, pct: dict[int, int], squadre_sos: set[str]) -> pd.Series:
    """Probabilità di prendere voto: titolare secondo SOS, oppure subentrato; mediata col modello."""
    sub = df["carr_subentri_quota"].fillna(df["ruolo"].map(SUBENTRO_DEFAULT)).clip(0, 0.6)
    p_start = df["id"].map(pct).astype(float) / 100
    from_sos = p_start + (1 - p_start) * sub
    combined = PESO_SOS * from_sos + (1 - PESO_SOS) * df["p_gioca_modello"]
    in_sos_team = df["squadra"].isin(squadre_sos)
    out = np.where(p_start.notna(), combined, df["p_gioca_modello"])
    out = np.where(in_sos_team & p_start.isna(), np.minimum(df["p_gioca_modello"], P_GIOCA_FUORI_LISTA), out)
    return pd.Series(out, index=df.index).clip(0, 1)


def main() -> None:
    listone = in_serie_a(pd.read_csv(DATA_DIR / "raw" / "listone.csv"))
    partite = json.loads((DATA_DIR / "raw" / "prossima_giornata.json").read_text(encoding="utf-8"))
    titolarita_path = DATA_DIR / "raw" / "titolarita.json"
    titolarita = json.loads(titolarita_path.read_text(encoding="utf-8")) if titolarita_path.exists() else []
    giornata = partite[0]["giornata"]

    base = build_base()
    history = add_player_features(base)
    models = train(history)

    ratings = team_ratings(base)
    try:
        odds = upcoming_odds()
    except Exception as exc:  # le quote sono un di più: senza, si usa la stima
        print(f"Quote non disponibili ({exc}), uso la stima dalla forza delle squadre.")
        odds = pd.DataFrame()
    home_adv, league_avg = home_advantage(base), league_average(base)
    context = match_context(partite, ratings, odds, home_adv, league_avg)
    rows = features_for(base, future_rows(listone, context, giornata))
    comp = predict_components(models, rows)
    rows["p_gioca_modello"] = comp["p_gioca"]
    rows["fv_atteso"] = comp["fv_std"]
    rows["p_bonus"] = p_bonus(comp)
    rows["comp_giornata"] = comp[COMPONENTI_ESPORTATE].round(4).to_dict("records")

    pct, squadre_sos, non_trovati = sos_start_probabilities(titolarita, listone)
    rows["p_titolare_sos"] = rows["id"].map(pct)
    rows["p_gioca"] = combine_play_probability(rows, pct, squadre_sos)
    rows["punteggio"] = expected_score(rows["p_gioca"], rows["fv_atteso"])

    neutral = neutral_context(ratings)
    season_rows = future_rows(listone, neutral.assign(avversario=None), giornata)
    season_rows = features_for(base, season_rows)
    season_comp = predict_components(models, season_rows).set_index(season_rows["id"])
    rows["p_gioca_stagione"] = rows["id"].map(season_comp["p_gioca"])
    season_records = dict(zip(season_comp.index, season_comp[COMPONENTI_ESPORTATE].round(4).to_dict("records")))
    rows["comp_stagione"] = rows["id"].map(season_records)
    rows["comp_prossime"] = rows["id"].map(prossime_components(base, models, listone, ratings, home_adv, league_avg))
    current = base[(base["stagione"] == CURRENT_SEASON) & base["giocato"]]
    rows["presenze"] = rows["id"].map(current.groupby("id").size()).fillna(0).astype(int)

    export(rows, context, giornata, len(pct), non_trovati)


def _round(x, nd=3):
    return None if pd.isna(x) else round(float(x), nd)


def export(rows: pd.DataFrame, context: pd.DataFrame, giornata: int, n_sos: int, non_trovati: int) -> None:
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    rows = rows.sort_values("punteggio", ascending=False)
    giocatori = [
        {
            "id": int(r.id), "nome": r.nome, "ruolo": r.ruolo, "squadra": r.squadra,
            "avversario": r.avversario, "casa": bool(r.in_casa),
            "qa": None if pd.isna(r.qa) else int(r.qa), "fvm": None if pd.isna(r.fvm) else int(r.fvm),
            "p_gioca": _round(r.p_gioca), "p_titolare_sos": None if pd.isna(r.p_titolare_sos) else int(r.p_titolare_sos),
            "fv_atteso": _round(r.fv_atteso, 2), "p_bonus": _round(r.p_bonus),
            "punteggio": _round(r.punteggio, 2),
            "p_gioca_stagione": _round(r.p_gioca_stagione),
            "fantamedia": _round(r.stag_fantamedia, 2), "media_voto": _round(r.stag_media_voto, 2),
            "presenze": int(r.presenze),
            "giornata": r.comp_giornata, "stagione": r.comp_stagione,
            "prossime": r.comp_prossime if isinstance(r.comp_prossime, dict) else None,
        }
        for r in rows.itertuples()
    ]
    partite = (
        context[context["in_casa"].astype(bool)]
        .sort_values(["data", "ora"])
        [["casa", "trasferta", "data", "ora", "p1", "px", "p2", "xg_casa", "xg_trasferta", "fonte_contesto"]]
    )
    forma = forma_recente()
    meta = {
        "stagione": CURRENT_SEASON,
        "giornata": giornata,
        "aggiornato": date.today().isoformat(),
        "giocatori_con_titolarita": n_sos,
        "nomi_titolarita_non_collegati": non_trovati,
        "sd_voto": SD_VOTO,
        "partite": [
            {**{k: (_round(v) if isinstance(v, float) else v) for k, v in p.items()},
             "forma_casa": forma.get(p["casa"], []), "forma_trasferta": forma.get(p["trasferta"], [])}
            for p in partite.to_dict("records")
        ],
    }
    (WEB_DATA / "giocatori.json").write_text(json.dumps(giocatori, ensure_ascii=False), encoding="utf-8")
    (WEB_DATA / "giornata.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    archive = DATA_DIR / "predictions" / f"{CURRENT_SEASON}_g{giornata:02d}.csv"
    archive.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(giocatori).drop(columns=["giornata", "stagione", "prossime"]).to_csv(archive, index=False)
    print(f"Giornata {giornata}: {len(giocatori)} giocatori, {n_sos} con titolarità SOS "
          f"({non_trovati} nomi non collegati). Esportato in {WEB_DATA}")


if __name__ == "__main__":
    main()
