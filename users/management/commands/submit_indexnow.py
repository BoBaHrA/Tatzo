from django.conf import settings
from django.core.management.base import BaseCommand

from mytattooapp.indexnow import submit_urls
from mytattooapp.sitemaps import ArtistSitemap, StaticSitemap


class Command(BaseCommand):
    help = "Submit Tatzo's public sitemap URLs to IndexNow-compatible search engines."

    def handle(self, *args, **options):
        urls = []
        public_site_url = settings.PUBLIC_SITE_URL.rstrip("/")

        for sitemap_class in (StaticSitemap, ArtistSitemap):
            sitemap_instance = sitemap_class()
            for item in sitemap_instance.items():
                location = sitemap_instance.location(item)
                urls.append(f"{public_site_url}{location}")

        count, status = submit_urls(urls)

        if status is None:
            self.stdout.write(self.style.WARNING("No public URLs were submitted."))
            return

        if 200 <= status < 300:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Submitted {count} public URL(s) to IndexNow (HTTP {status})."
                )
            )
            return

        self.stderr.write(
            self.style.ERROR(
                f"IndexNow received {count} URL(s) but returned HTTP {status}."
            )
        )
