"""Dati della pagina Pronostici: classifica, statistiche di stagione, forma, precedenti, quote
dei bookmaker e proiezione del campionato.

Fonti:
  - football-data.co.uk: risultati e statistiche delle partite (tiri, tiri in porta, corner,
    falli, cartellini) di ogni stagione dal 2021/22, e le quote della giornata in arrivo
    (fixtures.csv: bet365 e bwin, con licenza ADM in Italia, più media e massima di mercato),
    pubblicate di solito 2-3 giorni prima delle partite;
  - facoltativa, The Odds API (variabile d'ambiente ODDS_API_KEY, piano gratuito): quote
    dei bookmaker con licenza italiana che copre (Codere, Unibet);
  - fantacalcio.it: il calendario delle giornate da giocare (scraping.calendario).

La proiezione simula il resto della stagione 20.000 volte: per ogni partita i gol attesi
vengono dal modello moltiplicativo attacco × difesa (gli stessi rating delle previsioni),
i gol da una Poisson; ne escono punti attesi e probabilità di scudetto, Champions,
Europa e retrocessione (come le proiezioni del "supercomputer" di Opta).

Uso (dopo la pipeline):
    uv run python -m fanta_ai.pronostici
Produce web/data/pronostici.json.
"""

from __future__ import annotations

import io
import json
import os
from datetime import date

import httpx
import numpy as np
import pandas as pd

from fanta_ai.dataset import DATA_DIR
from fanta_ai.http import fetch_html
from fanta_ai.predict import CURRENT_SEASON, FIXTURES_URL, WEB_DATA
from fanta_ai.scraping.quote import URL_TEMPLATE, season_code
from fanta_ai.teams import canonical

STAGIONI_STORICHE = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
SIMULAZIONI = 20_000
# Posti in classifica: Champions 1-4, Europa League 5, Conference League 6, retrocessione 18-20
CHAMPIONS, EUROPA, CONFERENCE, SALVEZZA = 4, 5, 6, 17
ODDS_API = "https://api.the-odds-api.com/v4/sports/soccer_italy_serie_a/odds"
# Bookmaker di The Odds API con licenza italiana (ADM)
LIBRI_ITALIANI = {"codere_it": "Codere", "unibet_it": "Unibet"}


# ---------- Risultati e statistiche ----------

def partite_stagione(stagione: str, refresh: bool = False) -> pd.DataFrame:
    """Le partite giocate di una stagione, con statistiche e nomi di squadra uniformati."""
    testo = fetch_html(URL_TEMPLATE.format(code=season_code(stagione)), DATA_DIR / "cache" / "quote", refresh=refresh)
    df = pd.read_csv(io.StringIO(testo.lstrip("﻿")))
    df = df.dropna(subset=["HomeTeam", "AwayTeam", "FTHG", "FTAG"]).copy()
    df["data"] = pd.to_datetime(df["Date"], dayfirst=True).dt.date
    df["casa"] = df["HomeTeam"].map(canonical)
    df["trasferta"] = df["AwayTeam"].map(canonical)
    df["stagione"] = stagione
    return df.sort_values("data").reset_index(drop=True)


def classifica(partite: pd.DataFrame) -> list[dict]:
    righe: dict[str, dict] = {}
    for m in partite.itertuples():
        for squadra, fatti, subiti, in_casa in ((m.casa, m.FTHG, m.FTAG, True), (m.trasferta, m.FTAG, m.FTHG, False)):
            r = righe.setdefault(squadra, {"squadra": squadra, "g": 0, "v": 0, "n": 0, "p": 0, "gf": 0, "gs": 0, "pt": 0,
                                           "pt_casa": 0, "g_casa": 0, "pt_trasferta": 0, "g_trasferta": 0})
            punti = 3 if fatti > subiti else 1 if fatti == subiti else 0
            r["g"] += 1
            r["v" if punti == 3 else "n" if punti == 1 else "p"] += 1
            r["gf"] += int(fatti)
            r["gs"] += int(subiti)
            r["pt"] += punti
            lato = "casa" if in_casa else "trasferta"
            r[f"pt_{lato}"] += punti
            r[f"g_{lato}"] += 1
    ordinata = sorted(righe.values(), key=lambda r: (-r["pt"], -(r["gf"] - r["gs"]), -r["gf"], r["squadra"]))
    for i, r in enumerate(ordinata, 1):
        r["pos"] = i
    return ordinata


def _media(serie: pd.Series) -> float | None:
    serie = serie.dropna()
    return round(float(serie.mean()), 2) if len(serie) else None


def statistiche(partite: pd.DataFrame, squadra: str) -> dict:
    """Medie a partita e percentuali della stagione, in totale, in casa e in trasferta."""
    casa = partite[partite["casa"] == squadra]
    fuori = partite[partite["trasferta"] == squadra]
    # una riga per partita dal punto di vista della squadra
    colonne = {"fatti": ("FTHG", "FTAG"), "subiti": ("FTAG", "FTHG"), "tiri": ("HS", "AS"), "tiri_porta": ("HST", "AST"),
               "corner": ("HC", "AC"), "falli": ("HF", "AF"), "gialli": ("HY", "AY"), "rossi": ("HR", "AR"),
               "tiri_subiti": ("AS", "HS"), "corner_subiti": ("AC", "HC")}
    def vista(df: pd.DataFrame, in_casa: bool) -> pd.DataFrame:
        return pd.DataFrame({k: df[c if in_casa else f] if (c if in_casa else f) in df else np.nan for k, (c, f) in colonne.items()})
    tutte = pd.concat([vista(casa, True), vista(fuori, False)], ignore_index=True)
    def riassunto(df: pd.DataFrame) -> dict:
        if df.empty:
            return {"partite": 0}
        totale = df["fatti"] + df["subiti"]
        return {
            "partite": int(len(df)),
            **{k: _media(df[k]) for k in colonne},
            "porta_inviolata": round(float((df["subiti"] == 0).mean()), 3),
            "segna": round(float((df["fatti"] > 0).mean()), 3),
            "over25": round(float((totale > 2.5).mean()), 3),
            "gg": round(float(((df["fatti"] > 0) & (df["subiti"] > 0)).mean()), 3),
        }
    return {"totale": riassunto(tutte), "casa": riassunto(vista(casa, True)), "trasferta": riassunto(vista(fuori, False))}


def forma(partite: pd.DataFrame, squadra: str, n: int = 6) -> list[dict]:
    sue = partite[(partite["casa"] == squadra) | (partite["trasferta"] == squadra)].sort_values("data", ascending=False).head(n)
    out = []
    for m in sue.itertuples():
        in_casa = m.casa == squadra
        fatti, subiti = (m.FTHG, m.FTAG) if in_casa else (m.FTAG, m.FTHG)
        out.append({"data": str(m.data), "avversario": m.trasferta if in_casa else m.casa, "casa": in_casa,
                    "fatti": int(fatti), "subiti": int(subiti), "esito": "V" if fatti > subiti else "N" if fatti == subiti else "P"})
    return out


def precedenti(storico: pd.DataFrame, a: str, b: str, n: int = 6) -> list[dict]:
    tra = storico[((storico["casa"] == a) & (storico["trasferta"] == b)) | ((storico["casa"] == b) & (storico["trasferta"] == a))]
    return [{"data": str(m.data), "casa": m.casa, "trasferta": m.trasferta, "gol_casa": int(m.FTHG), "gol_trasferta": int(m.FTAG)}
            for m in tra.sort_values("data", ascending=False).head(n).itertuples()]


# ---------- Quote ----------

def _quota(riga: pd.Series, colonna: str) -> float | None:
    v = riga.get(colonna)
    return round(float(v), 2) if v is not None and pd.notna(v) and float(v) > 1 else None


def quote_football_data() -> dict[str, dict]:
    """Quote della giornata in arrivo (fixtures.csv): bet365, bwin, media e massima di mercato."""
    try:
        testo = fetch_html(FIXTURES_URL, DATA_DIR / "cache" / "fixtures", refresh=True).lstrip("﻿")
    except Exception as exc:
        print(f"Quote football-data non disponibili ({exc})")
        return {}
    df = pd.read_csv(io.StringIO(testo))
    df = df[df["Div"] == "I1"]
    out = {}
    for _, r in df.iterrows():
        chiave = f"{canonical(r['HomeTeam'])}-{canonical(r['AwayTeam'])}"
        libri = []
        for nome, pre, ou in (("bet365", "B365", "B365"), ("bwin", "BW", None), ("Media mercato", "Avg", "Avg"), ("Migliore", "Max", "Max")):
            voce = {"nome": nome, "1": _quota(r, f"{pre}H"), "X": _quota(r, f"{pre}D"), "2": _quota(r, f"{pre}A")}
            if ou:
                voce["over25"], voce["under25"] = _quota(r, f"{ou}>2.5"), _quota(r, f"{ou}<2.5")
            if any(v for k, v in voce.items() if k != "nome"):
                libri.append(voce)
        if libri:
            out[chiave] = {"fonte": "football-data.co.uk", "libri": libri}
    return out


def quote_odds_api() -> dict[str, dict]:
    """Quote dei bookmaker italiani da The Odds API, se è impostata la chiave ODDS_API_KEY."""
    chiave_api = os.environ.get("ODDS_API_KEY")
    if not chiave_api:
        return {}
    try:
        r = httpx.get(ODDS_API, params={"apiKey": chiave_api, "regions": "eu", "markets": "h2h,totals", "oddsFormat": "decimal"}, timeout=30)
        r.raise_for_status()
    except Exception as exc:
        print(f"The Odds API non disponibile ({exc})")
        return {}
    out: dict[str, dict] = {}
    for ev in r.json():
        casa, trasferta = canonical(ev["home_team"]), canonical(ev["away_team"])
        libri = []
        for b in ev.get("bookmakers", []):
            if b["key"] not in LIBRI_ITALIANI:
                continue
            voce: dict = {"nome": LIBRI_ITALIANI[b["key"]]}
            for m in b.get("markets", []):
                for o in m.get("outcomes", []):
                    if m["key"] == "h2h":
                        voce["1" if o["name"] == ev["home_team"] else "2" if o["name"] == ev["away_team"] else "X"] = o["price"]
                    elif m["key"] == "totals" and o.get("point") == 2.5:
                        voce["over25" if o["name"] == "Over" else "under25"] = o["price"]
            libri.append(voce)
        if libri:
            out[f"{casa}-{trasferta}"] = {"fonte": "The Odds API", "libri": libri}
    return out


def unisci_quote(*fonti: dict[str, dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for fonte in fonti:
        for chiave, q in fonte.items():
            if chiave in out:
                out[chiave]["libri"] = q["libri"] + out[chiave]["libri"]
                out[chiave]["fonte"] += f", {q['fonte']}"
            else:
                out[chiave] = {"fonte": q["fonte"], "libri": list(q["libri"])}
    return out


# ---------- Proiezione del campionato ----------

def rating_squadre(storico_quote: pd.DataFrame, ultime: int = 10) -> tuple[pd.DataFrame, float, float]:
    """Gol attesi fatti e subiti (dalle quote) nelle ultime partite: gli stessi rating delle previsioni."""
    righe = []
    for m in storico_quote.dropna(subset=["xg_casa", "xg_trasferta"]).itertuples():
        righe.append({"squadra": m.casa, "data": m.data, "att": m.xg_casa, "dif": m.xg_trasferta, "casa": True})
        righe.append({"squadra": m.trasferta, "data": m.data, "att": m.xg_trasferta, "dif": m.xg_casa, "casa": False})
    df = pd.DataFrame(righe).sort_values("data")
    media = float(df["att"].mean())
    vantaggio = float(df.loc[df["casa"], "att"].mean() / df.loc[~df["casa"], "att"].mean())
    rating = df.groupby("squadra").tail(ultime).groupby("squadra")[["att", "dif"]].mean()
    return rating, media, vantaggio


def proiezione(tabella: list[dict], da_giocare: list[dict], rating: pd.DataFrame, media: float, vantaggio: float,
               n: int = SIMULAZIONI, seme: int = 2026) -> list[dict]:
    squadre = sorted({r["squadra"] for r in tabella} | {m["casa"] for m in da_giocare} | {m["trasferta"] for m in da_giocare})
    indice = {s: i for i, s in enumerate(squadre)}
    base = {r["squadra"]: r for r in tabella}
    punti = np.array([base.get(s, {}).get("pt", 0) for s in squadre], dtype=float)
    diff = np.array([base.get(s, {}).get("gf", 0) - base.get(s, {}).get("gs", 0) for s in squadre], dtype=float)
    fatti = np.array([base.get(s, {}).get("gf", 0) for s in squadre], dtype=float)
    lc = np.array([rating.loc[m["casa"], "att"] * rating.loc[m["trasferta"], "dif"] / media * np.sqrt(vantaggio) for m in da_giocare])
    lt = np.array([rating.loc[m["trasferta"], "att"] * rating.loc[m["casa"], "dif"] / media / np.sqrt(vantaggio) for m in da_giocare])
    rng = np.random.default_rng(seme)
    gc = rng.poisson(lc, size=(n, len(da_giocare)))
    gt = rng.poisson(lt, size=(n, len(da_giocare)))
    pt_casa = np.where(gc > gt, 3, np.where(gc == gt, 1, 0))
    pt_trasf = np.where(gt > gc, 3, np.where(gc == gt, 1, 0))
    P = np.tile(punti, (n, 1))
    D = np.tile(diff, (n, 1))
    F = np.tile(fatti, (n, 1))
    for k, m in enumerate(da_giocare):
        i, j = indice[m["casa"]], indice[m["trasferta"]]
        P[:, i] += pt_casa[:, k]
        P[:, j] += pt_trasf[:, k]
        D[:, i] += gc[:, k] - gt[:, k]
        D[:, j] += gt[:, k] - gc[:, k]
        F[:, i] += gc[:, k]
        F[:, j] += gt[:, k]
    # classifica di ogni simulazione: punti, differenza reti, gol fatti, poi a caso
    chiave = P * 1e6 + D * 1e3 + F + rng.random(P.shape) * 0.5
    posizioni = (-chiave).argsort(axis=1).argsort(axis=1) + 1
    out = []
    for s, i in indice.items():
        pos = posizioni[:, i]
        out.append({
            "squadra": s,
            "punti": int(base.get(s, {}).get("pt", 0)),
            "punti_attesi": round(float(P[:, i].mean()), 1),
            "pos_media": round(float(pos.mean()), 1),
            "p_scudetto": round(float((pos == 1).mean()), 4),
            "p_champions": round(float((pos <= CHAMPIONS).mean()), 4),
            "p_europa": round(float(((pos > CHAMPIONS) & (pos <= EUROPA)).mean()), 4),
            "p_conference": round(float(((pos > EUROPA) & (pos <= CONFERENCE)).mean()), 4),
            "p_retrocessione": round(float((pos > SALVEZZA).mean()), 4),
            "attacco": round(float(rating.loc[s, "att"]), 2),
            "difesa": round(float(rating.loc[s, "dif"]), 2),
        })
    return sorted(out, key=lambda r: (-r["punti_attesi"], r["squadra"]))


# ---------- Esportazione ----------

def main() -> None:
    giornata = json.loads((WEB_DATA / "giornata.json").read_text(encoding="utf-8"))
    corrente = partite_stagione(CURRENT_SEASON)
    storico = pd.concat([partite_stagione(s) for s in STAGIONI_STORICHE] + [corrente], ignore_index=True)
    tabella = classifica(corrente)
    posizione = {r["squadra"]: r["pos"] for r in tabella}

    storico_quote = pd.concat([pd.read_csv(f) for f in sorted((DATA_DIR / "raw").glob("quote_*.csv"))], ignore_index=True)
    rating, media, vantaggio = rating_squadre(storico_quote)
    calendario = DATA_DIR / "raw" / "calendario_stagione.json"
    da_giocare = json.loads(calendario.read_text(encoding="utf-8")) if calendario.exists() else []
    proiettata = proiezione(tabella, da_giocare, rating, media, vantaggio) if da_giocare else []

    quote = unisci_quote(quote_football_data(), quote_odds_api())
    partite = {}
    for p in giornata["partite"]:
        chiave = f"{p['casa']}-{p['trasferta']}"
        partite[chiave] = {
            "statistiche": {"casa": statistiche(corrente, p["casa"]), "trasferta": statistiche(corrente, p["trasferta"])},
            "forma": {"casa": forma(storico, p["casa"]), "trasferta": forma(storico, p["trasferta"])},
            "precedenti": precedenti(storico, p["casa"], p["trasferta"]),
            "posizione": {"casa": posizione.get(p["casa"]), "trasferta": posizione.get(p["trasferta"])},
            "quote": quote.get(chiave),
        }
    out = {
        "aggiornato": date.today().isoformat(),
        "giornata": giornata["giornata"],
        "classifica": tabella,
        "proiezione": proiettata,
        "simulazioni": SIMULAZIONI if proiettata else 0,
        "partite": partite,
    }
    (WEB_DATA / "pronostici.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    con_quote = sum(1 for v in partite.values() if v["quote"])
    print(f"Pronostici: {len(partite)} partite ({con_quote} con quote), classifica di {len(tabella)} squadre, "
          f"proiezione su {len(da_giocare)} partite da giocare")


if __name__ == "__main__":
    main()
