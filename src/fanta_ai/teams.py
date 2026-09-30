"""Nomi squadra uniformati tra le fonti.

Il nome canonico è quello di fantacalcio.it (es. "Atalanta", "Inter"). Le altre fonti
usano varianti o slug (es. "hellas-verona", "Inter Milan"): qui si traducono tutte nel
nome canonico.
"""

from __future__ import annotations

import unicodedata

# Varianti note -> nome canonico fantacalcio.it (confronto su chiave normalizzata)
ALIASES = {
    "hellas verona": "Verona",
    "inter milan": "Inter",
    "internazionale": "Inter",
    "ac milan": "Milan",
    "as roma": "Roma",
    "ss lazio": "Lazio",
    "ssc napoli": "Napoli",
    "juventus fc": "Juventus",
    "spal": "Spal",
}


def key(name: str) -> str:
    text = unicodedata.normalize("NFKD", name)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return " ".join(text.lower().replace("-", " ").replace(".", " ").split())


def canonical(name: str) -> str:
    """Nome canonico: alias noto, altrimenti il nome con l'iniziale maiuscola."""
    k = key(name)
    if k in ALIASES:
        return ALIASES[k]
    return " ".join(part.capitalize() for part in k.split())
