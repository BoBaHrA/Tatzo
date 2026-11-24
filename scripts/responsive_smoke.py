"""Read-only responsive browser smoke test.

Install: pip install playwright; python -m playwright install chromium
Run: TATZO_BASE_URL=http://127.0.0.1:8000 python scripts/responsive_smoke.py
Optional: TATZO_STORAGE_STATE=/path/to/local-test-session.json
Optional: TATZO_ROLE=client|artist|staff and TATZO_EXTRA_ROUTES=/path/,/path/
Use a local or staging fixture account. Never commit storage-state files.
No form submissions or destructive actions are performed.
"""
import os
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TATZO_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
ROLE = os.environ.get("TATZO_ROLE", "guest")
STATE = os.environ.get("TATZO_STORAGE_STATE")
OUT = Path(os.environ.get("TATZO_SCREENSHOTS", "/tmp/tatzo-responsive"))
SIZES = [(320, 568), (390, 844), (768, 1024), (820, 1180),
         (900, 600), (901, 600), (1024, 600), (1280, 720),
         (1366, 768), (1440, 900), (1920, 1080),
         (2560, 1440), (3440, 1440), (3840, 2160)]
PUBLIC = [("/", ".home-layout"), ("/search/", ".search-page"),
          ("/maps/", ".maps-shell"), ("/style-match/", ".sm-shell"),
          ("/legal/", ".legal-page-shell"), ("/terms/", ".legal-page-shell"),
          ("/privacy/", ".legal-page-shell"), ("/cookies/", ".legal-page-shell")]
GUEST = [("/login/", ".login-container"), ("/signup/", ".login-container"),
         ("/password-reset/", ".reset-container")]
CLIENT = [("/profile/", ".profile-page"), ("/profile/edit/", ".edit-profile-page"),
          ("/chats/", ".chat-page"), ("/calendar/", ".tatzo-calendar-page"),
          ("/posts/bookmarks/", ".bookmarks-page"), ("/appointments/", ".appointment-page"),
          ("/healing/", ".healing-shell"), ("/health-safety/", ".health-page"),
          ("/report-problem/", ".report-page")]
ARTIST = [("/appointments/settings/", ".artist-dashboard-page"),
          ("/artist/dashboard/calendar/", ".artist-dashboard-page"),
          ("/maps/my-studios/", ".my-studios-page"), ("/verification/", ".verification-page")]
STAFF = [("/moderation/", ".moderation-page")]

def main():
    if ROLE not in {"guest", "client", "artist", "staff"}:
        raise SystemExit("Invalid TATZO_ROLE")
    if ROLE != "guest" and not STATE:
        raise SystemExit("Authenticated test roles require TATZO_STORAGE_STATE")
    routes = PUBLIC + (GUEST if ROLE == "guest" else CLIENT)
    if ROLE == "artist":
        routes += ARTIST
    if ROLE == "staff":
        routes += STAFF
    routes += [(p.strip(), "body") for p in os.environ.get("TATZO_EXTRA_ROUTES", "").split(",") if p.strip().startswith("/") and not p.strip().startswith("//")]
    OUT.mkdir(parents=True, exist_ok=True)
    failures = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        context = browser.new_context(**({"storage_state": STATE} if STATE else {}))
        page = context.new_page()
        for width, height in SIZES:
            page.set_viewport_size({"width": width, "height": height})
            for path, selector in routes:
                name = f"{ROLE}-{width}x{height}-" + (re.sub(r"[^a-zA-Z0-9_-]", "-", path).strip("-") or "home")
                try:
                    response = page.goto(BASE + path, wait_until="domcontentloaded", timeout=30000)
                    if not response or response.status >= 400:
                        raise AssertionError(f"HTTP {response.status if response else 'no response'}")
                    if path != "/login/" and urlparse(page.url).path == "/login/":
                        raise AssertionError("Unexpected authentication redirect")
                    page.locator(selector).first.wait_for(state="visible", timeout=8000)
                    page.evaluate("document.fonts.ready")
                    stats = page.evaluate("""() => {
                        const root = document.documentElement;
                        const visible = e => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
                        const sidebar = document.querySelector('body > .content > .sidebar');
                        const target = document.querySelector('.home-layout > .main-content, body > .content > .profile-page, body > .content > .chat-page, body > .content > .search-page, body > .content > .maps-shell, body > .content > .tatzo-calendar-page, body > .content > .healing-shell, body > .content > .health-page, body > .content > .bookmarks-page, body > .content > .report-page');
                        const nav = sidebar?.querySelector('.sidebar-main-menu');
                        const more = sidebar?.querySelector('.more');
                        const map = document.querySelector('#tatzo-map');
                        const hero = document.querySelector('.seo-brand-hero__inner');
                        const suggestions = document.querySelector('.home-layout > .suggestions');
                        const r = e => e.getBoundingClientRect();
                        const overlap = (a,b) => visible(a) && visible(b) && r(a).left < r(b).right-1 && r(a).right > r(b).left+1 && r(a).top < r(b).bottom-1 && r(a).bottom > r(b).top+1;
                        return {overflow: Math.max(root.scrollWidth, document.body.scrollWidth)-root.clientWidth,
                            sidebarOverlap: !!overlap(sidebar,target), heroOverlap: !!overlap(hero,suggestions),
                            navClipped: !!(visible(sidebar) && nav && more && Array.from(nav.children).some(e => visible(e) && r(e).bottom > r(more).top + 1)),
                            navScroll: !!(visible(sidebar) && nav && ['auto','scroll'].includes(getComputedStyle(nav).overflowY)),
                            recommendationScroll: !!(visible(suggestions) && innerWidth > 900 && ['auto','scroll'].includes(getComputedStyle(suggestions).overflowY)),
                            mapOffscreen: !!(map && (!visible(map) || r(map).width < 150 || r(map).height < 150 || r(map).top >= innerHeight || Math.min(r(map).bottom,innerHeight)-Math.max(r(map).top,0) < 100))};
                    }""")
                    if stats["overflow"] > 2 or any(value for key, value in stats.items() if key != "overflow"):
                        raise AssertionError(str(stats))
                    print(f"PASS {name}", flush=True)
                except Exception as exc:
                    failures.append((name, str(exc)))
                    page.screenshot(path=str(OUT / (name + ".png")))
                    print(f"FAIL {name}: {exc}", flush=True)
        browser.close()
    if failures:
        raise SystemExit(f"{len(failures)} layout/route checks failed; screenshots: {OUT}")
    print("Responsive smoke checks passed. Manual interaction and visual review still required.")

if __name__ == "__main__":
    main()
