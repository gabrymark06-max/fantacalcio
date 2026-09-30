"""Collegamento dei nomi giocatore tra fonti diverse.

Le fonti scrivono i nomi in modi diversi ("Martinez L.", "Lautaro", "Chalobah T."):
si cerca sempre dentro la rosa delle due squadre della partita, per cognome
normalizzato, poi per iniziale, poi con una lettera di differenza.

Logica adattata da FantaDraft (github.com/lucianomurr/FantaDraft, MIT),
scripts/merge_startpct.py.
"""

from __future__ import annotations

import re
import unicodedata

ALIAS = {"lautaro": "Martinez L."}


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text.lower().replace("-", " ").replace("'", " ").strip()


def split_name(name: str) -> tuple[str, list[str]]:
    """"Martinez L." -> ("martinez", ["l"])."""
    name = name.strip()
    m = re.search(r"\s+((?:[A-Z][a-z]{0,3}\.\s*)+)$", name)
    initials: list[str] = []
    if m:
        initials = [norm(x) for x in re.findall(r"[A-Z][a-z]{0,3}(?=\.)", m.group(1))]
        name = name[: m.start()]
    return norm(name), initials


def _one_edit(a: str, b: str) -> bool:
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    if len(a) > len(b):
        a, b = b, a
    i = j = diff = 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            i += 1
        else:
            diff += 1
            if diff > 1:
                return False
        j += 1
    return True


def find(roster: list[dict], raw: str) -> dict | None:
    """Restituisce il giocatore di `roster` (dict con chiave "nome") che corrisponde a `raw`."""
    alias = ALIAS.get(norm(raw))
    if alias:
        hits = [p for p in roster if p["nome"] == alias]
        if len(hits) == 1:
            return hits[0]
    surname, initials = split_name(raw)
    exact, fuzzy = [], []
    for p in roster:
        p_surname, p_initials = split_name(p["nome"])
        if p_surname == surname or p_surname.endswith(" " + surname) or surname.endswith(" " + p_surname):
            exact.append((p, p_initials))
        elif _one_edit(p_surname, surname):
            fuzzy.append((p, p_initials))
    candidates = exact or fuzzy
    if len(candidates) > 1 and initials:
        candidates = [
            (p, pi) for p, pi in candidates if not pi or pi[0].startswith(initials[0]) or initials[0].startswith(pi[0])
        ]
    return candidates[0][0] if len(candidates) == 1 else None
