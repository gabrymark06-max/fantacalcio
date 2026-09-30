"""Foto dei giocatori da Transfermarkt, per tutti: sul proprio PC sostituiscono quelle di Commons.

ATTENZIONE: le foto di Transfermarkt sono protette da diritto d'autore. Vanno solo in
web/data/foto-personali.json, che è escluso da git: il sito sul proprio PC le mostra, quello
pubblicato no (senza il file il sito usa solo le foto di Commons).

Passi:
  1. le rose delle squadre di Serie A su transfermarkt.it (una pagina per squadra, in cache),
     con nome, data di nascita e foto di ogni giocatore;
  2. abbinamento con il listone: stessa data di nascita e nome simile (anagrafica.py); se
     manca la data, cognome + iniziale + squadra, solo se univoco;
  3. posizione del viso (YuNet, come per le foto di Commons); senza viso restano le iniziali.

Uso (dopo anagrafica e foto):
    uv run python -m fanta_ai.scraping.foto_tm
"""

from __future__ import annotations

import html
import json
import re
import time
from datetime import date
from pathlib import Path
from urllib.parse import quote_plus

import httpx
import numpy as np
import pandas as pd

from fanta_ai.http import USER_AGENT, fetch_html
from fanta_ai.scraping.foto import (
    CACHE,
    Client,
    _risultato,
    _viso_piu_grande,
    cognome_corrisponde,
    cognome_e_iniziali,
    norm,
    rilevatore_visi,
    somiglianza,
)

ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "data"
OUT = ROOT / "web" / "data" / "foto-personali.json"
FOTO_COMMONS = ROOT / "web" / "data" / "foto.json"
CACHE_PAGINE = DATA_DIR / "cache" / "transfermarkt"
SITO = "https://www.transfermarkt.it"
STAGIONE = 2026  # 2026/27
# Inquadratura più larga che per Commons: testa intera e un po' di spalle nel cerchio
MARGINE = 3.2

SQUADRE = {
    "ac-florenz": "Fiorentina", "ac-mailand": "Milan", "ac-monza": "Monza", "as-rom": "Roma",
    "atalanta-bergamo": "Atalanta", "cagliari-calcio": "Cagliari", "como-1907": "Como", "fc-bologna": "Bologna",
    "fc-turin": "Torino", "frosinone-calcio": "Frosinone", "genua-cfc": "Genoa", "inter-mailand": "Inter",
    "juventus-turin": "Juventus", "lazio-rom": "Lazio", "parma-calcio-1913": "Parma", "ssc-neapel": "Napoli",
    "udinese-calcio": "Udinese", "us-lecce": "Lecce", "us-sassuolo": "Sassuolo", "venezia-fc": "Venezia",
}

RIGA_RE = re.compile(
    r'data-src="(?P<img>https://img\.a\.transfermarkt\.technology/portrait/[^"]+)"[^>]*>.*?'
    r'<a href="(?P<link>/[^"]+/profil/spieler/(?P<id>\d+))">\s*(?P<nome>[^<]+?)\s*<.*?'
    r'<td class="zentriert">(?P<d>\d{2})/(?P<m>\d{2})/(?P<y>\d{4})',
    re.S,
)


def parse_rosa(pagina: str, squadra: str) -> list[dict]:
    """Giocatori della pagina "rosa dettagliata" di una squadra."""
    out = []
    for m in RIGA_RE.finditer(pagina):
        img = m["img"]
        out.append({
            "tm": m["id"],
            "nome": html.unescape(m["nome"]),
            "n": norm(html.unescape(m["nome"])),
            "nascita": f"{m['y']}-{m['m']}-{m['d']}",
            "squadra": squadra,
            "img": None if "default" in img else img.replace("/medium/", "/big/").replace("/small/", "/big/"),
            "pagina": SITO + m["link"],
        })
    return out


def rose_serie_a() -> list[dict]:
    giocatori = []
    for slug, cid in _club():
        squadra = SQUADRE.get(slug)
        if not squadra:
            continue
        url = f"{SITO}/{slug}/kader/verein/{cid}/saison_id/{STAGIONE}/plus/1"
        giocatori += parse_rosa(fetch_html(url, CACHE_PAGINE), squadra)
    return giocatori


def _club() -> list[tuple[str, str]]:
    pagina = fetch_html(f"{SITO}/serie-a/startseite/wettbewerb/IT1/saison_id/{STAGIONE}", CACHE_PAGINE)
    return sorted(set(re.findall(rf'href="/([^/"]+)/startseite/verein/(\d+)/saison_id/{STAGIONE}"', pagina)))


def abbina_tm(nome: str, squadra: str, nome_completo: str | None, nascita: str | None, rose: list[dict]) -> dict | None:
    """Stessa data di nascita e nome simile; altrimenti cognome + iniziale + squadra, se univoco."""
    cognome, iniziali = cognome_e_iniziali(nome)
    if nascita and nome_completo:
        stessi = [(somiglianza(nome_completo, cognome, g["n"]), g) for g in rose if g["nascita"] == nascita]
        stessi = [(p, g) for p, g in stessi if p > 0 or cognome_corrisponde(cognome, g["n"])]
        if len(stessi) == 1:
            return stessi[0][1]
    candidati = [g for g in rose if g["squadra"] == squadra and cognome_corrisponde(cognome, g["n"])]
    if iniziali:
        candidati = [g for g in candidati if g["n"].startswith(iniziali[0])]
    return candidati[0] if len(candidati) == 1 else None


RICERCA_RE = re.compile(
    r'<img src="(?P<img>https://img\.a\.transfermarkt\.technology/portrait/[^"]+)"[^>]*/></a></td>'
    r'<td class="hauptlink"><a title="[^"]*" href="(?P<link>/[^"]+/profil/spieler/(?P<id>\d+))">(?P<nome>[^<]+)</a>'
    r'.*?<td class="zentriert">(?P<eta>\d+)</td>',
    re.S,
)


def cerca_tm(nome_completo: str, nascita: str, oggi: date | None = None) -> dict | None:
    """Chi non è più in una rosa di Serie A (ceduto dopo il listone): ricerca per nome completo,
    accettata solo se c'è un unico risultato con lo stesso nome e l'età giusta."""
    oggi = oggi or date.today()
    nato = date.fromisoformat(nascita)
    eta = oggi.year - nato.year - ((oggi.month, oggi.day) < (nato.month, nato.day))
    pagina = fetch_html(f"{SITO}/schnellsuche/ergebnis/schnellsuche?query={quote_plus(nome_completo)}", CACHE_PAGINE)
    tabella = pagina.split('id="player-grid"', 1)[-1] if 'id="player-grid"' in pagina else ""
    trovati = [m for m in RICERCA_RE.finditer(tabella)
               if norm(html.unescape(m["nome"])) == norm(nome_completo) and abs(int(m["eta"]) - eta) <= 1]
    if len(trovati) != 1:
        return None
    m = trovati[0]
    return {"tm": m["id"], "nome": html.unescape(m["nome"]), "pagina": SITO + m["link"],
            "img": None if "default" in m["img"] else re.sub(r"/portrait/\w+/", "/portrait/big/", m["img"])}


def main() -> None:
    import cv2

    listone = pd.read_csv(DATA_DIR / "raw" / "listone.csv")
    anagrafica = pd.read_csv(DATA_DIR / "raw" / "anagrafica.csv").set_index("id")
    commons = json.loads(FOTO_COMMONS.read_text(encoding="utf-8")) if FOTO_COMMONS.exists() else {}
    rose = rose_serie_a()
    print(f"Transfermarkt: {len(rose)} giocatori nelle rose di Serie A")

    rilevatore = rilevatore_visi(Client())
    http = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True)
    foto, non_trovati, senza_foto = {}, [], []
    for r in listone.itertuples():
        a = anagrafica.loc[r.id] if r.id in anagrafica.index else None
        nome_completo = None if a is None or pd.isna(a["nome_completo"]) else a["nome_completo"]
        nascita = None if a is None or pd.isna(a["nascita"]) else a["nascita"]
        g = abbina_tm(r.nome, r.squadra, nome_completo, nascita, rose)
        if g is None and nome_completo and nascita:
            g = cerca_tm(nome_completo, nascita)
        if g is None:
            non_trovati.append(r.nome)
            continue
        if not g["img"]:
            senza_foto.append(r.nome)
            continue
        file = CACHE / f"tm_{g['tm']}.jpg"
        if not file.exists():
            risposta = http.get(g["img"])
            risposta.raise_for_status()
            file.write_bytes(risposta.content)
            time.sleep(0.5)
        img = cv2.imdecode(np.frombuffer(file.read_bytes(), np.uint8), cv2.IMREAD_COLOR)
        pos = _risultato(img, _viso_piu_grande(rilevatore, img), g["img"], MARGINE) if img is not None else None
        if pos is None:
            senza_foto.append(r.nome)
            continue
        foto[str(r.id)] = {**pos, "autore": "Transfermarkt", "licenza": "© Transfermarkt, solo uso personale",
                           "pagina": g["pagina"], "fonte": "transfermarkt", "tm": g["nome"]}

    OUT.write_text(json.dumps(foto, ensure_ascii=False, indent=0), encoding="utf-8")
    solo_commons = len(set(commons) - set(foto))
    print(f"Foto da Transfermarkt: {len(foto)}/{len(listone)} (+{solo_commons} solo su Commons)")
    print(f"Non trovati su Transfermarkt ({len(non_trovati)}): {', '.join(non_trovati[:40])}")
    print(f"Trovati ma senza foto o viso ({len(senza_foto)}): {', '.join(senza_foto[:40])}")


if __name__ == "__main__":
    main()
