"""Foto vere dei giocatori da Wikimedia Commons, tramite Wikidata.

Le foto di Commons hanno licenze libere (CC BY, CC BY-SA, pubblico dominio): si possono
pubblicare citando autore e licenza, che vengono salvati insieme a ogni foto.

Passi:
  1. Wikidata (SPARQL): tutti i calciatori nati dal 1983 che hanno giocato in un club di
     Serie A, con la loro foto (proprietà P18) e i club attuali/passati;
  2. per chi non ha la data di nascita: cognome (in fondo al nome), iniziale e squadra;
     se è ambiguo il giocatore resta senza foto: meglio le iniziali che la faccia sbagliata;
  3. il metodo principale: nome completo e data di nascita (da fantacalcio.it, vedi
     anagrafica.py) confrontati con i calciatori di Wikidata nati lo stesso giorno. Le squadre
     su Wikidata sono spesso incomplete (a Svilar manca la Roma), la data di nascita no;
  4. da Commons: miniatura, autore, licenza;
  4b. per chi è riconosciuto ma non ha una foto utilizzabile sulla scheda: le immagini della
     sua categoria Commons (P373), solo se nella foto c'è un unico viso dominante;
  5. posizione del viso nella foto (rilevatore YuNet di OpenCV), per ritagliarla in un cerchio;
     se il viso non si trova o è troppo piccolo, niente foto: il sito mostra le iniziali.

Uso:
    uv run python -m fanta_ai.scraping.foto
Produce web/data/foto.json: {id: {url, cx, cy, scala, ar, viso, autore, licenza, pagina}}.
"""

from __future__ import annotations

import json
import re
import time
import unicodedata
from pathlib import Path
from urllib.parse import unquote

import httpx
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "data"
OUT = ROOT / "web" / "data" / "foto.json"
CACHE = DATA_DIR / "cache" / "foto"

# Wikimedia chiede un User-Agent con un contatto: prima di pubblicare il sito, sostituire
# l'indirizzo con quello del progetto (pagina GitHub o email dedicata).
USER_AGENT = "ChiSchiero/0.1 (uso personale, poche richieste; https://github.com)"
SPARQL = "https://query.wikidata.org/sparql"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
LARGHEZZA = 640
MODELLO_VISI = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
SERIE_A = "Q15804"
CALCIATORE = "Q937857"

CLUB = {
    "AC Milan": "Milan", "AC Monza": "Monza", "ACF Fiorentina": "Fiorentina", "AS Roma": "Roma",
    "Atalanta Bergamasca Calcio": "Atalanta", "Bologna FC 1909": "Bologna", "Cagliari Calcio": "Cagliari",
    "Como 1907": "Como", "FC Inter": "Inter", "Frosinone Calcio": "Frosinone", "Genoa CFC": "Genoa",
    "Juventus FC": "Juventus", "Parma Calcio 1913": "Parma", "SS Lazio": "Lazio", "SSC Napoli": "Napoli",
    "Torino FC": "Torino", "US Lecce": "Lecce", "Udinese Calcio": "Udinese",
    "Unione Sportiva Sassuolo Calcio": "Sassuolo", "Venezia FC": "Venezia", "Hellas Verona FC": "Verona",
    "Empoli FC": "Empoli", "Pisa SC": "Pisa", "US Cremonese": "Cremonese", "Cagliari": "Cagliari",
}

SPECIALI = str.maketrans({"ø": "o", "Ø": "o", "ı": "i", "ł": "l", "Ł": "l", "æ": "ae", "Æ": "ae", "ß": "ss",
                          "đ": "d", "Đ": "d", "ð": "d", "þ": "th", "œ": "oe"})


def norm(testo: str) -> str:
    """Minuscolo, senza accenti né lettere speciali (Højlund → hojlund, Yıldız → yildiz)."""
    t = unicodedata.normalize("NFKD", testo.translate(SPECIALI))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return " ".join(re.sub(r"[^a-z ]", " ", t).split())


def cognome_e_iniziali(nome_listone: str) -> tuple[str, list[str]]:
    """"Martinez L." → ("martinez", ["l"]); "Esposito F.P." → ("esposito", ["f", "p"])."""
    m = re.match(r"^(.*?)\s+((?:[A-Z][a-z]{0,3}\.\s*)+)$", nome_listone.strip())
    if m:
        return norm(m.group(1)), [norm(x)[0] for x in re.findall(r"[A-Z][a-z]{0,3}\.", m.group(2))]
    return norm(nome_listone), []


def cognome_corrisponde(cognome: str, nome_completo: str) -> bool:
    """Il cognome deve stare dopo il nome di battesimo, mai all'inizio: "Pellegrino M." non è
    "Pellegrino Albanese". Vale anche il nome unico ("Wesley") e il doppio cognome in mezzo
    ("Paz" in "Nico Paz Martinez")."""
    parole, cerca = nome_completo.split(), cognome.split()
    if parole == cerca:
        return True
    dopo_il_nome = parole[1:]
    return any(dopo_il_nome[k : k + len(cerca)] == cerca for k in range(len(dopo_il_nome) - len(cerca) + 1))


class Client:
    def __init__(self) -> None:
        self.http = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=120, follow_redirects=True)
        CACHE.mkdir(parents=True, exist_ok=True)

    def _cached(self, nome: str, fn):
        f = CACHE / nome
        if f.exists():
            return json.loads(f.read_text(encoding="utf-8"))
        dati = fn()
        f.write_text(json.dumps(dati, ensure_ascii=False), encoding="utf-8")
        time.sleep(1)  # poche richieste, distanziate
        return dati

    def sparql(self, query: str, nome_cache: str) -> list[dict]:
        def run():
            r = self.http.post(SPARQL, data={"query": query}, headers={"Accept": "application/sparql-results+json"})
            r.raise_for_status()
            return r.json()["results"]["bindings"]
        return self._cached(nome_cache, run)

    def api(self, url: str, params: dict, nome_cache: str) -> dict:
        def run():
            r = self.http.get(url, params={**params, "format": "json"})
            r.raise_for_status()
            return r.json()
        return self._cached(nome_cache, run)


def calciatori_serie_a(c: Client) -> tuple[dict, dict]:
    """(giocatori per QID, QID dei club per squadra)."""
    righe = c.sparql(
        f"""SELECT DISTINCT ?player ?playerLabel ?club ?clubLabel ?img ?fine WHERE {{
          ?club wdt:P118 wd:{SERIE_A} .
          ?player p:P54 ?st . ?st ps:P54 ?club .
          OPTIONAL {{ ?st pq:P582 ?fine }}
          ?player wdt:P106 wd:{CALCIATORE} .
          ?player wdt:P569 ?nascita . FILTER(YEAR(?nascita) >= 1983)
          OPTIONAL {{ ?player wdt:P18 ?img }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "it,en". }}
        }}""",
        "sparql_seriea.json",
    )
    giocatori: dict[str, dict] = {}
    club_qid: dict[str, str] = {}
    for b in righe:
        qid = b["player"]["value"].rsplit("/", 1)[1]
        squadra = CLUB.get(b["clubLabel"]["value"])
        if squadra:
            club_qid.setdefault(squadra, b["club"]["value"].rsplit("/", 1)[1])
        g = giocatori.setdefault(qid, {"qid": qid, "nome": b["playerLabel"]["value"], "img": None, "attuali": set(), "tutti": set()})
        if "img" in b:
            g["img"] = b["img"]["value"]
        if squadra:
            g["tutti"].add(squadra)
            if "fine" not in b:
                g["attuali"].add(squadra)
    for g in giocatori.values():
        g["n"] = norm(g["nome"])
    return giocatori, club_qid


def abbina(nome: str, squadra: str, giocatori: dict) -> dict | None:
    cognome, iniziali = cognome_e_iniziali(nome)
    base = [g for g in giocatori.values() if cognome_corrisponde(cognome, g["n"])]
    for filtro in (lambda g: squadra in g["attuali"], lambda g: squadra in g["tutti"]):
        candidati = [g for g in base if filtro(g)]
        if iniziali:  # anche con un solo candidato: "Esposito F.P." non è Sebastiano Esposito
            candidati = [g for g in candidati if g["n"].startswith(iniziali[0])]
        if len(candidati) == 1:
            return candidati[0]
        if len(candidati) > 1:
            return None  # ambiguo
    return None


def info_commons(c: Client, files: list[str]) -> dict[str, dict]:
    """Miniatura, autore e licenza di ogni file Commons."""
    out = {}
    for i in range(0, len(files), 40):
        blocco = files[i : i + 40]
        dati = c.api(COMMONS_API, {"action": "query", "titles": "|".join(blocco), "prop": "imageinfo",
                                   "iiprop": "url|size|extmetadata", "iiurlwidth": LARGHEZZA},
                     f"commons{LARGHEZZA}_{norm(blocco[0])[:40].replace(' ', '_')}_{len(blocco)}.json")
        normalizzati = {n["to"]: n["from"] for n in dati.get("query", {}).get("normalized", [])}
        for pagina in dati.get("query", {}).get("pages", {}).values():
            ii = (pagina.get("imageinfo") or [None])[0]
            if not ii:
                continue
            meta = ii.get("extmetadata", {})
            testo = lambda k: re.sub(r"<[^>]+>", "", meta.get(k, {}).get("value", "")).strip()
            titolo = normalizzati.get(pagina["title"], pagina["title"])
            out[titolo] = {
                "url": ii.get("thumburl") or ii.get("url"),
                "larghezza_originale": ii.get("width"),
                "pagina": ii.get("descriptionurl"),
                "autore": testo("Artist")[:120] or "sconosciuto",
                "licenza": testo("LicenseShortName") or "vedi pagina",
            }
    return out


def rilevatore_visi(c: Client):
    """YuNet (OpenCV): trova visi anche piccoli o di tre quarti, molto meglio dei vecchi Haar."""
    import cv2

    modello = CACHE / "face_detection_yunet_2023mar.onnx"
    if not modello.exists():
        r = c.http.get(MODELLO_VISI)
        r.raise_for_status()
        modello.write_bytes(r.content)
    return cv2.FaceDetectorYN.create(str(modello), "", (320, 320), score_threshold=0.75)


def _scarica(c: Client, url: str, file: Path) -> bytes:
    if not file.exists():
        r = c.http.get(url)
        r.raise_for_status()
        file.write_bytes(r.content)
        time.sleep(0.5)
    return file.read_bytes()


def _viso_piu_grande(rilevatore, img, unico: bool = False) -> tuple[float, float, float, float] | None:
    """Il viso più grande. Con `unico`, solo se è l'unico o nettamente il più grande (almeno
    2,5 volte l'area del secondo): in una foto di gruppo potrebbe essere un compagno."""
    h, w = img.shape[:2]
    rilevatore.setInputSize((w, h))
    _, visi = rilevatore.detect(img)
    if visi is None or len(visi) == 0:
        return None
    ordinati = sorted(visi, key=lambda v: -v[2] * v[3])
    if unico and len(ordinati) > 1 and ordinati[0][2] * ordinati[0][3] < 2.5 * ordinati[1][2] * ordinati[1][3]:
        return None
    x, y, fw, fh = ordinati[0][:4]
    return float(x), float(y), float(fw), float(fh)


# Sotto questa larghezza (in pixel) il viso ingrandito nel cerchio verrebbe sgranato
VISO_MINIMO = 56


def posizione_viso(c: Client, rilevatore, url: str, larghezza_originale: int | None, chiave: str, unico: bool = False) -> dict | None:
    """Dove sta il viso, per ritagliare la foto in un cerchio; None se non si trova un viso
    abbastanza grande (il sito mostra allora le iniziali invece di un ritaglio sbagliato).
      - url: la miniatura da usare (più grande se il viso è piccolo);
      - cx, cy: centro del viso in % della larghezza e dell'altezza della foto;
      - scala: larghezza della foto in "cerchi" (il viso occupa circa metà del cerchio);
      - ar: altezza / larghezza della foto."""
    import cv2

    img = cv2.imdecode(np.frombuffer(_scarica(c, url, CACHE / f"img_{chiave}_{LARGHEZZA}.jpg"), np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None
    viso = _viso_piu_grande(rilevatore, img, unico)
    miniatura = re.search(r"/(\d+)px-", url)
    if viso and viso[2] < VISO_MINIMO and larghezza_originale and larghezza_originale > img.shape[1] and miniatura:
        # viso piccolo: stessa foto a risoluzione più alta (Commons usa larghezze standard, es. 960)
        # Commons accetta solo larghezze standard (mediawiki.org/wiki/Common_thumbnail_sizes)
        possibili = [w for w in (1280, 1920) if int(miniatura.group(1)) < w <= larghezza_originale]
        if not possibili:
            return _risultato(img, viso, url)
        nuova = possibili[-1]
        url = url.replace(f"/{miniatura.group(1)}px-", f"/{nuova}px-")
        grande = cv2.imdecode(np.frombuffer(_scarica(c, url, CACHE / f"img_{chiave}_{nuova}.jpg"), np.uint8), cv2.IMREAD_COLOR)
        if grande is not None:
            img, viso = grande, _viso_piu_grande(rilevatore, grande, unico)
    return _risultato(img, viso, url)


def _risultato(img, viso, url: str) -> dict | None:
    if not viso or viso[2] < VISO_MINIMO * 0.8:
        return None
    x, y, fw, fh = viso
    h, w = img.shape[:2]
    ar = h / w
    scala = max(1.0, 1 / ar, min(10.0, w / (fw * 2.1)))
    return {
        "url": url,
        "cx": round((x + fw / 2) / w * 100, 1),
        "cy": round((y + fh / 2) / h * 100, 1),
        "scala": round(scala, 3),
        "ar": round(ar, 3),
        "viso": True,
    }


def nati_il(c: Client, date: list[str]) -> dict[str, list[dict]]:
    """Calciatori su Wikidata nati in queste date (a gruppi di 100): data → [{qid, nome, n, file}]."""
    out: dict[str, list[dict]] = {}
    for k in range(0, len(date), 100):
        blocco = date[k : k + 100]
        valori = " ".join(f'"{d}T00:00:00Z"^^xsd:dateTime' for d in blocco)
        righe = c.sparql(
            f"""SELECT ?p ?pLabel ?d ?img WHERE {{
              VALUES ?d {{ {valori} }}
              ?p wdt:P569 ?d ; wdt:P106 wd:{CALCIATORE} .
              OPTIONAL {{ ?p wdt:P18 ?img }}
              SERVICE wikibase:label {{ bd:serviceParam wikibase:language "it,en". }}
            }}""",
            f"nati_{blocco[0]}_{len(blocco)}.json",
        )
        for b in righe:
            d = b["d"]["value"][:10]
            qid = b["p"]["value"].rsplit("/", 1)[1]
            lista = out.setdefault(d, [])
            if any(x["qid"] == qid for x in lista):
                continue
            file = None
            if "img" in b:
                file = "File:" + unquote(b["img"]["value"].rsplit("/", 1)[1]).replace("_", " ")
            nome = b["pLabel"]["value"]
            lista.append({"qid": qid, "nome": nome, "n": norm(nome), "file": file})
    return out


def somiglianza(nome_completo: str, cognome_listone: str, etichetta: str) -> int:
    """Parole in comune tra il nome completo (fantacalcio.it) e il nome su Wikidata; 0 se il
    cognome del listone non compare affatto."""
    parole = set(etichetta.split())
    if not set(cognome_listone.split()) & parole:
        return 0
    return len({p for p in norm(nome_completo).split() if len(p) >= 3} & parole)


ESTENSIONI = (".jpg", ".jpeg", ".png")


def categorie_commons(c: Client, qids: list[str]) -> dict[str, str]:
    """Categoria Commons (P373) di ogni giocatore: QID → nome della categoria."""
    out = {}
    for k in range(0, len(qids), 150):
        blocco = qids[k : k + 150]
        righe = c.sparql(
            f"""SELECT ?p ?cat WHERE {{ VALUES ?p {{ {" ".join("wd:" + q for q in blocco)} }} ?p wdt:P373 ?cat }}""",
            f"categorie_{blocco[0]}_{len(blocco)}.json",
        )
        for b in righe:
            out[b["p"]["value"].rsplit("/", 1)[1]] = b["cat"]["value"]
    return out


def _membri(c: Client, categoria: str) -> list[dict]:
    dati = c.api(COMMONS_API, {"action": "query", "list": "categorymembers", "cmtitle": f"Category:{categoria}",
                               "cmtype": "file|subcat", "cmlimit": 50},
                 f"categoria2_{norm(categoria).replace(' ', '_')[:60]}.json")
    return dati.get("query", {}).get("categorymembers", [])


def file_della_categoria(c: Client, categoria: str, cognome: str) -> list[str]:
    """Immagini della categoria del giocatore e delle sue prime sottocategorie (spesso le foto
    stanno in "Nome Cognome in 2024" e simili), prima quelle col cognome nel nome del file."""
    membri = _membri(c, categoria)
    titoli = [m["title"] for m in membri if m["title"].lower().endswith(ESTENSIONI)]
    for sotto in [m["title"].split(":", 1)[1] for m in membri if m["title"].startswith("Category:")][:3]:
        titoli += [m["title"] for m in _membri(c, sotto) if m["title"].lower().endswith(ESTENSIONI)]
    return sorted(dict.fromkeys(titoli), key=lambda t: cognome not in norm(t))


# Quante immagini della categoria provare al massimo per ogni giocatore
TENTATIVI_CATEGORIA = 4


def main() -> None:
    c = Client()
    listone = pd.read_csv(DATA_DIR / "raw" / "listone.csv")
    anagrafica = pd.read_csv(DATA_DIR / "raw" / "anagrafica.csv").set_index("id")

    # 1. il metodo sicuro: stessa data di nascita e stesso nome
    date_nascita = sorted(anagrafica["nascita"].dropna().unique())
    per_data = nati_il(c, date_nascita)
    scelti: dict[int, dict] = {}
    for r in listone.itertuples():
        a = anagrafica.loc[r.id] if r.id in anagrafica.index else None
        if a is None or pd.isna(a["nascita"]) or pd.isna(a["nome_completo"]):
            continue
        cognome = cognome_e_iniziali(r.nome)[0]
        punteggi = sorted(((somiglianza(a["nome_completo"], cognome, x["n"]), x) for x in per_data.get(a["nascita"], [])),
                          key=lambda t: -t[0])
        if not punteggi or punteggi[0][0] == 0:
            continue
        migliori = [x for p, x in punteggi if p == punteggi[0][0]]
        if len({x["n"] for x in migliori}) == 1:
            # un solo nome: è la stessa persona, a volte con due schede doppie su Wikidata
            scelti[int(r.id)] = next((x for x in migliori if x["file"]), migliori[0])
    print(f"Riconosciuti per nome e data di nascita: {len(scelti)}/{len(listone)}")

    # 2. chi non ha la data di nascita: nome e squadra (solo se univoco)
    giocatori, _ = calciatori_serie_a(c)
    for r in listone.itertuples():
        if int(r.id) in scelti:
            continue
        g = abbina(r.nome, r.squadra, giocatori)
        if g and g["img"]:
            file = "File:" + unquote(g["img"].rsplit("/", 1)[1]).replace("_", " ")
            scelti[int(r.id)] = {"qid": g["qid"], "nome": g["nome"], "file": file}
    con_file = {pid: v for pid, v in scelti.items() if v["file"]}
    print(f"Riconosciuti in tutto: {len(scelti)}/{len(listone)}, con una foto su Wikidata: {len(con_file)}")

    commons = info_commons(c, sorted({v["file"] for v in con_file.values()}))
    rilevatore = rilevatore_visi(c)
    foto, senza_viso = {}, []
    for pid, v in con_file.items():
        ci = commons.get(v["file"])
        if not ci or not ci["url"]:
            continue
        pos = posizione_viso(c, rilevatore, ci["url"], ci.get("larghezza_originale"), v["qid"])
        if pos is None:
            senza_viso.append(v["nome"])
            continue
        foto[str(pid)] = {**pos, "autore": ci["autore"], "licenza": ci["licenza"], "pagina": ci["pagina"],
                          "wikidata": v["nome"], "qid": v["qid"]}
    print(f"Foto dalla scheda Wikidata: {len(foto)}/{len(listone)}")

    # 3. riconosciuti ma senza foto utilizzabile: la loro categoria su Commons, con un solo viso
    nomi_listone = listone.set_index("id")["nome"]
    mancanti = {pid: v for pid, v in scelti.items() if str(pid) not in foto}
    categorie = categorie_commons(c, sorted({v["qid"] for v in mancanti.values()}))
    candidati: dict[int, list[str]] = {}
    for pid, v in mancanti.items():
        if v["qid"] in categorie:
            cognome = cognome_e_iniziali(nomi_listone[pid])[0]
            candidati[pid] = file_della_categoria(c, categorie[v["qid"]], cognome)[:TENTATIVI_CATEGORIA]
    info = info_commons(c, sorted({f for lista in candidati.values() for f in lista}))
    aggiunte = 0
    for pid, lista in candidati.items():
        v = mancanti[pid]
        for k, file in enumerate(lista):
            ci = info.get(file)
            if not ci or not ci["url"]:
                continue
            pos = posizione_viso(c, rilevatore, ci["url"], ci.get("larghezza_originale"), f"{v['qid']}_cat{k}", unico=True)
            if pos:
                foto[str(pid)] = {**pos, "autore": ci["autore"], "licenza": ci["licenza"], "pagina": ci["pagina"],
                                  "wikidata": v["nome"], "qid": v["qid"], "da_categoria": True}
                aggiunte += 1
                break
    print(f"Foto dalla categoria Commons: +{aggiunte} (categorie trovate per {len(candidati)} giocatori)")

    OUT.write_text(json.dumps(foto, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"Foto: {len(foto)}/{len(listone)} giocatori. Salvate in {OUT}")


if __name__ == "__main__":
    main()
