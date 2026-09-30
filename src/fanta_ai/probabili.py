"""Probabili formazioni per la pagina della giornata, con i nomi collegati al listone.

Legge data/raw/probabili.json (scraping.titolarita) e scrive web/data/probabili.json:
    {"Como-Roma": {"moduli": {...}, "lati": {"casa": {titolari, ballottaggi, panchina,
     indisponibili}, "trasferta": {...}}}}
dove ogni giocatore è {"id": id del listone o null, "nome": ...}.

Le formazioni, i ballottaggi e le note sugli indisponibili sono contenuti di SOS Fanta: il
file resta solo sul proprio PC (escluso da git). Senza, il sito ricava le formazioni dal
modello (probabilità di giocare di ogni giocatore).

Uso (dopo scraping.titolarita):
    uv run python -m fanta_ai.probabili
"""

from __future__ import annotations

import json

import pandas as pd

from fanta_ai.dataset import DATA_DIR
from fanta_ai.names import find
from fanta_ai.predict import WEB_DATA, in_serie_a


def _collega(roster: list[dict], altri: list[dict], nome: str) -> int | None:
    p = find(roster, nome) or find(altri, nome)
    return int(p["id"]) if p else None


def collega_partita(p: dict, listone: pd.DataFrame) -> dict:
    lati = {}
    for lato, avversario in (("casa", "trasferta"), ("trasferta", "casa")):
        roster = listone[listone["squadra"] == p[lato]][["id", "nome"]].to_dict("records")
        altri = listone[listone["squadra"] == p[avversario]][["id", "nome"]].to_dict("records")
        d = p["lati"][lato]
        g = lambda nome: _collega(roster, altri, nome)  # noqa: E731
        lati[lato] = {
            "titolari": [{"id": g(x["nome"]), "nome": x["nome"], "pct": x["pct"]} for x in d["titolari"]],
            "panchina": [{"id": g(x["nome"]), "nome": x["nome"], "pct": x["pct"]} for x in d["panchina"]],
            "ballottaggi": [
                {"a": {"id": g(b["a"]), "nome": b["a"]}, "pa": b["pa"], "b": {"id": g(b["b"]), "nome": b["b"]}, "pb": b["pb"]}
                for b in d["ballottaggi"]
            ],
            "indisponibili": [{"id": g(x["nome"]), "nome": x["nome"], "stato": x["stato"], "nota": x["nota"]} for x in d["indisponibili"]],
        }
    return {"moduli": p["moduli"], "loghi": p.get("loghi", {}), "lati": lati}


def main() -> None:
    sorgente = DATA_DIR / "raw" / "probabili.json"
    if not sorgente.exists():
        print("Probabili formazioni non disponibili: il sito le ricava dal modello.")
        return
    listone = in_serie_a(pd.read_csv(DATA_DIR / "raw" / "listone.csv"))
    partite = json.loads(sorgente.read_text(encoding="utf-8"))
    out = {f"{p['casa']}-{p['trasferta']}": collega_partita(p, listone) for p in partite}
    titolari = [t for p in out.values() for l in p["lati"].values() for t in l["titolari"]]
    (WEB_DATA / "probabili.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    # i loghi a parte: vanno anche sul sito pubblicato, le formazioni no
    loghi = {p[lato]: p["loghi"][lato] for p in partite for lato in ("casa", "trasferta") if p.get("loghi", {}).get(lato)}
    (WEB_DATA / "loghi.json").write_text(json.dumps(loghi, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"Probabili formazioni: {len(out)} partite, titolari collegati {sum(t['id'] is not None for t in titolari)}/{len(titolari)}")


if __name__ == "__main__":
    main()
