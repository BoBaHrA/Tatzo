from django.test import Client, RequestFactory, SimpleTestCase, override_settings
from django.urls import resolve

from mytattooapp.indexnow import INDEXNOW_KEY
from mytattooapp.seo import seo_context


@override_settings(PUBLIC_SITE_URL="https://tatzo.eu")
class SeoFoundationTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.client = Client()

    def _context_for(self, path):
        request = self.factory.get(path)
        request.resolver_match = resolve(path)
        return seo_context(request)

    def test_home_is_indexable_and_canonical(self):
        context = self._context_for("/")
        self.assertEqual(context["seo_robots"], "index,follow")
        self.assertEqual(context["canonical_url"], "https://tatzo.eu/")

    def test_style_match_landing_page_is_indexable(self):
        context = self._context_for("/style-match/")
        self.assertEqual(context["seo_robots"], "index,follow")

    def test_private_application_page_stays_noindex(self):
        context = self._context_for("/login/")
        self.assertEqual(context["seo_robots"], "noindex,nofollow")

    def test_indexnow_key_is_publicly_verifiable(self):
        response = self.client.get(f"/{INDEXNOW_KEY}.txt")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content.decode("utf-8"), INDEXNOW_KEY)

    def test_sitemap_contains_style_match(self):
        response = self.client.get("/sitemap.txt")
        self.assertEqual(response.status_code, 200)
        self.assertIn("https://tatzo.eu/style-match/", response.content.decode("utf-8"))
