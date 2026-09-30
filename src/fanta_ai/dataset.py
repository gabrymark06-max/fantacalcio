"""Dataset giocatore × giornata con le caratteristiche usate dal modello.

Ogni riga è un giocatore in rosa a una squadra in una giornata, che abbia giocato o no.
La rosa storica si ricostruisce dai voti: un giocatore fa parte della squadra tra la
prima e l'ultima giornata in cui compare nella pagina voti con quella maglia.

Obiettivi:
  - `giocato`: ha preso un voto (chi entra senza voto conta come non giocato);
  - `fv`: fantavoto (Redazione Fantacalcio), solo se ha giocato;
  - `bonus`: ha segnato (anche su rigore) o fatto assist.

Tutte le caratteristiche usano solo partite precedenti a quella della riga: nessuna
informazione dal futuro entra nel modello.
"""

from __future__ import annotations

import glob
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

FEATURES = [
    "ruolo_p",
    "ruolo_d",
    "ruolo_c",
    "ruolo_a",
    "in_casa",
    "xg_squadra",
    "xg_avversario",
    "p_vittoria",
    "p_pareggio",
    "giornata",
    "stag_presenze_quota",
    "stag_fantamedia",
    "stag_media_voto",
    "stag_partite",
    "ult3_giocato",
    "ult5_giocato",
    "ult5_titolare",
    "ult5_fv",
    "ult5_voto",
    "carr_fantamedia",
    "carr_media_voto",
    "carr_partite_giocate",
    "carr_gol_pg",
    "carr_assist_pg",
    "carr_rigori_pg",
    "carr_amm_pg",
    "carr_subentri_quota",
    "prec_fantamedia",
    "prec_presenze",
]


# Voci del fantavoto (conteggi per partita). Formula fantacalcio.it verificata sui dati
# 2021/22-2026/27 con residuo zero su 55.224 voti:
#   FV = voto + 3 gol + 3 rigori segnati + 1 assist - 1 gol subito - 2 autoreti
#        - 3 rigori sbagliati + 3 rigori parati - 0.5 ammonizione - 1 espulsione
COMPONENTI_CONTEGGIO = [
    "gol",
    "rigori_segnati",
    "rigori_sbagliati",
    "assist",
    "gol_subiti",
    "autoreti",
    "rigori_parati",
]


def season_start(stagione: str) -> int:
    return int(stagione[:4])


def load_voti() -> pd.DataFrame:
    files = sorted(glob.glob(str(DATA_DIR / "raw" / "voti_*.csv")))
    v = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
    return v


def load_quote() -> pd.DataFrame:
    files = sorted(glob.glob(str(DATA_DIR / "raw" / "quote_*.csv")))
    return pd.concat([pd.read_csv(f) for f in files], ignore_index=True)


def team_matches(voti: pd.DataFrame, quote: pd.DataFrame) -> pd.DataFrame:
    """Una riga per squadra e giornata: avversario, casa/trasferta, contesto dalle quote."""
    tm = voti.drop_duplicates(["stagione", "squadra", "giornata"])[
        ["stagione", "squadra", "giornata", "avversario", "in_casa", "casa", "trasferta"]
    ]
    q = quote.drop_duplicates(["stagione", "casa", "trasferta"])
    tm = tm.merge(
        q[["stagione", "casa", "trasferta", "p1", "px", "p2", "xg_casa", "xg_trasferta"]],
        on=["stagione", "casa", "trasferta"],
        how="left",
    )
    return add_match_context(tm)


def add_match_context(tm: pd.DataFrame) -> pd.DataFrame:
    home = tm["in_casa"].astype(bool)
    tm["xg_squadra"] = np.where(home, tm["xg_casa"], tm["xg_trasferta"])
    tm["xg_avversario"] = np.where(home, tm["xg_trasferta"], tm["xg_casa"])
    tm["p_vittoria"] = np.where(home, tm["p1"], tm["p2"])
    tm["p_pareggio"] = tm["px"]
    return tm


def roster_rows(voti: pd.DataFrame) -> pd.DataFrame:
    """Espande ogni giocatore su tutte le giornate tra la prima e l'ultima presenza in squadra."""
    spans = voti.groupby(["stagione", "squadra", "id"]).giornata.agg(["min", "max"]).reset_index()
    spans = spans.loc[spans.index.repeat(spans["max"] - spans["min"] + 1)]
    spans["giornata"] = spans["min"] + spans.groupby(level=0).cumcount()
    return spans[["stagione", "squadra", "id", "giornata"]].reset_index(drop=True)


def _rolling_played_mean(values: pd.Series, played: pd.Series, groups: pd.Series, window: int) -> pd.Series:
    """Media delle ultime `window` partite giocate prima della riga (per giocatore)."""
    frame = pd.DataFrame({"x": values.where(played), "g": groups})
    out = pd.Series(np.nan, index=values.index)
    for _, idx in frame.groupby("g").groups.items():
        s = frame.loc[idx, "x"]
        prior = s.shift(1)
        rolled = prior.dropna().rolling(window, min_periods=1).mean()
        out.loc[idx] = rolled.reindex(s.index).ffill().to_numpy()
    return out


def build_dataset() -> pd.DataFrame:
    return add_player_features(build_base())


def build_base() -> pd.DataFrame:
    """Righe giocatore × giornata con esiti e contesto partita, senza le caratteristiche storiche."""
    voti = load_voti()
    quote = load_quote()

    roles = voti.groupby("id").ruolo.agg(lambda r: r.mode().iat[0])
    rows = roster_rows(voti)
    rows = rows.merge(team_matches(voti, quote), on=["stagione", "squadra", "giornata"], how="inner")

    stats = voti[
        [
            "stagione",
            "squadra",
            "giornata",
            "id",
            "nome",
            "v_fc",
            "fv_fc",
            "subentrato",
            "gol",
            "rigori_segnati",
            "rigori_sbagliati",
            "assist",
            "ammonito",
            "espulso",
            "gol_subiti",
            "autoreti",
            "rigori_parati",
            "potm",
        ]
    ]
    df = rows.merge(stats, on=["stagione", "squadra", "giornata", "id"], how="left")
    df["ruolo"] = df["id"].map(roles)
    df["giocato"] = df["v_fc"].notna()
    df["fv"] = df["fv_fc"]
    df["titolare"] = df["giocato"] & ~df["subentrato"].fillna(False).astype(bool)
    df["subentrato_con_voto"] = df["giocato"] & df["subentrato"].fillna(False).astype(bool)
    for col in COMPONENTI_CONTEGGIO + ["potm"]:
        df[col] = df[col].fillna(0)
    for col in ["ammonito", "espulso"]:
        df[col] = df[col].fillna(False).astype(bool)
    df["bonus"] = (df["gol"] + df["rigori_segnati"] + df["assist"]) > 0

    df["anno"] = df["stagione"].map(season_start)
    return df


def add_player_features(df: pd.DataFrame) -> pd.DataFrame:
    """Caratteristiche storiche del giocatore, calcolate solo sulle righe precedenti.

    Le righe da prevedere (giornata futura) vanno passate con giocato=False: essendo
    le ultime di ogni giocatore, i loro valori non entrano nelle loro caratteristiche.
    """
    df = df.sort_values(["id", "anno", "giornata", "squadra"]).reset_index(drop=True)
    played = df["giocato"].astype(bool)
    fv_played = df["fv"].where(played)
    v_played = df["v_fc"].where(played)
    by_player = df.groupby("id")
    by_season = df.groupby(["id", "stagione"])

    def prior_sum(series: pd.Series, groups) -> pd.Series:
        return series.groupby(groups).cumsum() - series

    season_keys = [df["id"], df["stagione"]]
    df["stag_partite"] = by_season.cumcount()
    stag_giocate = prior_sum(played.astype(float), season_keys)
    df["stag_presenze_quota"] = stag_giocate / df["stag_partite"].replace(0, np.nan)
    df["stag_fantamedia"] = prior_sum(fv_played.fillna(0), season_keys) / stag_giocate.replace(0, np.nan)
    df["stag_media_voto"] = prior_sum(v_played.fillna(0), season_keys) / stag_giocate.replace(0, np.nan)

    for k in (3, 5):
        df[f"ult{k}_giocato"] = by_player["giocato"].transform(
            lambda s, k=k: s.astype(float).shift(1).rolling(k, min_periods=1).mean()
        )
    df["ult5_titolare"] = by_player["titolare"].transform(
        lambda s: s.astype(float).shift(1).rolling(5, min_periods=1).mean()
    )
    df["ult5_fv"] = _rolling_played_mean(df["fv"], played, df["id"], 5)
    df["ult5_voto"] = _rolling_played_mean(df["v_fc"], played, df["id"], 5)

    carr_giocate = prior_sum(played.astype(float), df["id"])
    denom = carr_giocate.replace(0, np.nan)
    df["carr_partite_giocate"] = carr_giocate
    df["carr_fantamedia"] = prior_sum(fv_played.fillna(0), df["id"]) / denom
    df["carr_media_voto"] = prior_sum(v_played.fillna(0), df["id"]) / denom
    df["carr_gol_pg"] = prior_sum((df["gol"] + df["rigori_segnati"]).where(played, 0), df["id"]) / denom
    df["carr_assist_pg"] = prior_sum(df["assist"].where(played, 0), df["id"]) / denom
    df["carr_rigori_pg"] = (
        prior_sum((df["rigori_segnati"] + df["rigori_sbagliati"]).where(played, 0), df["id"]) / denom
    )
    df["carr_amm_pg"] = prior_sum(df["ammonito"].astype(float).where(played, 0), df["id"]) / denom
    non_titolare = prior_sum((~df["titolare"]).astype(float), df["id"]).replace(0, np.nan)
    df["carr_subentri_quota"] = prior_sum(df["subentrato_con_voto"].astype(float), df["id"]) / non_titolare

    season_stats = (
        df[played].groupby(["id", "anno"]).agg(prec_fantamedia=("fv", "mean"), prec_presenze=("fv", "size"))
    ).reset_index()
    season_stats["anno"] += 1
    df = df.drop(columns=["prec_fantamedia", "prec_presenze"], errors="ignore").merge(
        season_stats, on=["id", "anno"], how="left"
    )

    for role in "PDCA":
        df[f"ruolo_{role.lower()}"] = (df["ruolo"] == role).astype(int)
    df["in_casa"] = df["in_casa"].astype(float)
    del by_player, by_season
    return df


def main() -> None:
    df = build_dataset()
    out = DATA_DIR / "processed" / "dataset.parquet"
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out, index=False)
    print(f"{len(df)} righe, {df['giocato'].sum()} con voto, salvate in {out}")
    print(df.groupby("stagione")[["giocato", "fv"]].agg(["count", "mean"]))


if __name__ == "__main__":
    main()
