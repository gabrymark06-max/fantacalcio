"""Download di pagine HTML con cache su disco e pausa tra le richieste.

Ogni pagina viene salvata in data/cache/ la prima volta: le esecuzioni successive
la rileggono da disco, così il parser si può rifare quante volte serve senza
colpire di nuovo il sito.
"""

from __future__ import annotations

import hashlib
import time
from pathlib import Path

import httpx

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
REQUEST_DELAY_SECONDS = 2.0

_last_request_at = 0.0


def cache_path(url: str, cache_dir: Path) -> Path:
    return cache_dir / (hashlib.sha1(url.encode()).hexdigest() + ".html")


def fetch_html(url: str, cache_dir: Path, *, refresh: bool = False) -> str:
    """Restituisce l'HTML di `url`, dalla cache se presente (salvo `refresh`)."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_path(url, cache_dir)
    if cache_file.exists() and not refresh:
        return cache_file.read_text(encoding="utf-8")

    global _last_request_at
    wait = REQUEST_DELAY_SECONDS - (time.monotonic() - _last_request_at)
    if wait > 0:
        time.sleep(wait)

    response = httpx.get(
        url, headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=30
    )
    _last_request_at = time.monotonic()
    response.raise_for_status()

    cache_file.write_text(response.text, encoding="utf-8")
    return response.text
