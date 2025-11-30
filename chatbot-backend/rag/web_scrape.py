# rag/web_scrape.py
import time
import re
import urllib.parse
import logging
from typing import List, Tuple, Optional

import requests
from bs4 import BeautifulSoup

log = logging.getLogger("scraper")

# ─────────────────────────────────────────────
# Hard limits (kept small to avoid hanging)
# ─────────────────────────────────────────────
TIME_BUDGET_SEC = 15          # total scrape budget
REQ_TIMEOUT_SEC = 5           # max time per HTTP request
MAX_HTML_BYTES = 700_000      # ~0.7 MB per page

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# files we never want to treat as HTML
BINARY_EXT = re.compile(
    r"""\.(?:zip|rar|7z|gz|tar|tgz|bz2|
          png|jpe?g|gif|webp|svg|ico|
          mp4|mpe?g|mov|avi|webm|
          mp3|wav|flac|ogg|
          pdf|docx?|pptx?|xlsx?)$""",
    re.IGNORECASE | re.VERBOSE,
)

ACCEPT_CT = (
    "text/html",
    "application/xhtml+xml",
    "text/plain",  # some CMS return this
)

TextDoc = Tuple[str, str]  # (url, text)


def _normalize_url(url: str) -> str:
    """Ensure we always have http/https."""
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        return "https://" + url
    return url


def _clean_visible_text(soup: BeautifulSoup) -> str:
    """
    Remove scripts/styles/nav/footer, collapse whitespace,
    and return plain visible text.
    """
    for tag in soup(["script", "style", "noscript", "footer", "header", "nav"]):
        tag.decompose()

    text = soup.get_text(separator=" ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _fetch_single_page(url: str) -> Optional[str]:
    """
    Fetch ONE page with tight timeouts & size limits.
    Returns visible text or None if it fails.
    """
    if BINARY_EXT.search(url):
        log.info("Skip binary-looking URL: %s", url)
        return None

    try:
        resp = requests.get(
            url,
            timeout=REQ_TIMEOUT_SEC,
            headers=HEADERS,
        )
        resp.raise_for_status()
    except Exception as e:
        log.warning("GET failed %s: %s", url, e)
        return None

    ct = (resp.headers.get("Content-Type") or "").lower()
    if not any(t in ct for t in ACCEPT_CT):
        log.info("Skip %s (ct=%s)", url, ct)
        return None

    # limit body size
    text_bytes = resp.content[:MAX_HTML_BYTES]
    try:
        html = text_bytes.decode(resp.encoding or "utf-8", errors="ignore")
    except Exception as e:
        log.warning("Decode failed %s: %s", url, e)
        return None

    soup = BeautifulSoup(html, "html.parser")
    text = _clean_visible_text(soup)
    if not text:
        log.info("No visible text for %s", url)
        return None

    return text


def crawl_site(start_url: str, max_pages: int = 10) -> List[TextDoc]:
    """
    Simplified scraper: fetch ONLY the start URL as one document.

    We ignore max_pages for crawling other links, because that
    was causing long processing on some hosts (e.g., shared VPS).

    This is enough to:
      - Take the page you pasted (e.g., a Wikipedia article),
      - Convert its visible text to chunks,
      - Ingest into Chroma, and
      - Build your chatbot dataset quickly.

    If the page can't be fetched or has no text, returns [].
    """
    start = time.time()
    url = _normalize_url(start_url)

    log.info("Starting single-page scrape: %s (max_pages=%d)", url, max_pages)

    if time.time() - start > TIME_BUDGET_SEC:
        log.warning("Time budget exceeded before request for %s", url)
        return []

    text = _fetch_single_page(url)
    if not text:
        log.warning("No text scraped from %s", url)
        return []

    log.info(
        "Scraped single page: %s (len=%d chars, elapsed=%.2fs)",
        url,
        len(text),
        time.time() - start,
    )
    return [(url, text)]
