import json
import re
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q
from users.location_services import location_fingerprint
from users.models import LocationSuppression

from users.models import Location


OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "Tatzo Maps importer (manual admin command; no scraping)"


def normalize_text(value):
    return re.sub(r"\s+", " ", (value or "").strip().lower())


class Command(BaseCommand):
    help = (
        "Import tattoo studio POIs from the official OpenStreetMap Overpass API "
        "as unclaimed/imported Location records. This command is manual-only: "
        "do not run it from page rendering. Production may later use official "
        "Google Places API, Apple Maps API, Geoapify/OSM, Foursquare, or another "
        "approved provider. Never scrape public map websites."
    )

    def add_arguments(self, parser):
        area_group = parser.add_mutually_exclusive_group(required=True)
        area_group.add_argument("--bbox", help="Bounding box: south,west,north,east")
        area_group.add_argument("--city", help="City name for an Overpass area query")
        parser.add_argument("--country", help="Country name, required with --city")
        parser.add_argument("--timeout", type=int, default=25, help="Overpass timeout in seconds")
        parser.add_argument("--dry-run", action="store_true", help="Fetch and parse without saving")

    def handle(self, *args, **options):
        if options["city"] and not options["country"]:
            raise CommandError("--country is required when using --city")

        query = self.build_query(options)
        data = self.fetch_overpass(query, options["timeout"])
        elements = data.get("elements", [])

        created = 0
        updated = 0
        skipped = 0

        for element in elements:
            parsed = self.parse_element(element, options.get("city"), options.get("country"))
            if not parsed:
                skipped += 1
                continue

            if options["dry_run"]:
                self.stdout.write(f"DRY RUN: {parsed['name']} — {parsed['source_place_id']}")
                continue

            obj, was_created = self.save_location(parsed)
            if obj is None:
                skipped += 1
                continue
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Import complete: created={created}, updated={updated}, skipped={skipped}, fetched={len(elements)}"
            )
        )

    def build_query(self, options):
        timeout = int(options["timeout"])
        selectors = """
          node["shop"="tattoo"]{scope};
          way["shop"="tattoo"]{scope};
          relation["shop"="tattoo"]{scope};
          node["craft"="tattoo"]{scope};
          way["craft"="tattoo"]{scope};
          relation["craft"="tattoo"]{scope};
          node["name"~"tattoo",i]{scope};
          way["name"~"tattoo",i]{scope};
          relation["name"~"tattoo",i]{scope};
        """

        if options["bbox"]:
            bbox = self.parse_bbox(options["bbox"])
            scope = f"({bbox})"
            body = selectors.format(scope=scope)
            return f"[out:json][timeout:{timeout}];({body});out center tags;"

        city = options["city"].replace('"', '\\"')
        country = options["country"].replace('"', '\\"')
        body = selectors.format(scope="(area.searchArea)")
        return f'''
[out:json][timeout:{timeout}];
area["name"="{country}"]["boundary"="administrative"]->.countryArea;
area["name"="{city}"]["boundary"="administrative"](area.countryArea)->.searchArea;
(
{body}
);
out center tags;
'''

    def parse_bbox(self, value):
        parts = [part.strip() for part in value.split(",")]
        if len(parts) != 4:
            raise CommandError("--bbox must be formatted as south,west,north,east")
        try:
            south, west, north, east = [float(part) for part in parts]
        except ValueError as exc:
            raise CommandError("--bbox values must be numbers") from exc
        if not (-90 <= south <= 90 and -90 <= north <= 90 and -180 <= west <= 180 and -180 <= east <= 180):
            raise CommandError("--bbox values are outside valid latitude/longitude ranges")
        if south >= north or west >= east:
            raise CommandError("--bbox must be south,west,north,east")
        return f"{south},{west},{north},{east}"

    def fetch_overpass(self, query, timeout):
        payload = urlencode({"data": query}).encode()
        request = Request(
            OVERPASS_URL,
            data=payload,
            headers={"User-Agent": USER_AGENT},
            method="POST",
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            raise CommandError(f"Overpass request failed: {exc}") from exc

    def parse_element(self, element, fallback_city="", fallback_country=""):
        tags = element.get("tags") or {}
        lat = element.get("lat") or (element.get("center") or {}).get("lat")
        lon = element.get("lon") or (element.get("center") or {}).get("lon")
        if lat is None or lon is None:
            return None

        name = tags.get("name") or tags.get("operator") or "Tattoo studio"
        source_place_id = f"{element.get('type')}/{element.get('id')}"
        city = tags.get("addr:city") or fallback_city or ""
        country = tags.get("addr:country") or fallback_country or ""
        address_parts = [
            tags.get("addr:housenumber"),
            tags.get("addr:street"),
            tags.get("addr:postcode"),
            city,
            country,
        ]
        formatted_address = ", ".join(part for part in address_parts if part)

        return {
            "name": name[:160],
            "address": ", ".join(part for part in address_parts[:3] if part)[:255],
            "formatted_address": formatted_address[:255],
            "city": city[:120],
            "country": country[:120],
            "latitude": lat,
            "longitude": lon,
            "phone": (tags.get("phone") or tags.get("contact:phone") or "")[:60],
            "website": (tags.get("website") or tags.get("contact:website") or "")[:500],
            "source": "osm",
            "source_place_id": source_place_id,
            "status": "imported",
        }

    @transaction.atomic
    def save_location(self, data):
        """Never resurrect suppressed places or overwrite a manually reviewed POI."""
        source_place_id = data.get("source_place_id", "")
        fingerprint = location_fingerprint(
            data["name"], data.get("city", ""),
            data.get("formatted_address") or data.get("address", ""),
            data.get("country", ""),
        )
        tombstones = LocationSuppression.objects.filter(source="osm")
        conditions = Q()
        if source_place_id:
            conditions |= Q(source_place_id=source_place_id)
        if fingerprint:
            conditions |= Q(fingerprint=fingerprint)
        if conditions and tombstones.filter(conditions).exists():
            return None, False

        existing = None
        if source_place_id:
            existing = (Location.objects.select_for_update()
                        .filter(source="osm", source_place_id=source_place_id)
                        .order_by("pk").first())

        # Overpass occasionally changes node/way IDs. Match only exact known
        # names + addresses + city + country; do not merge vague geographic pins.
        if existing is None and fingerprint:
            for candidate in Location.objects.select_for_update().filter(
                source="osm", name__iexact=data["name"],
                city__iexact=data.get("city", ""),
                country__iexact=data.get("country", ""),
            )[:200]:
                if location_fingerprint(
                    candidate.name, candidate.city, candidate.display_address,
                    candidate.country,
                ) == fingerprint:
                    existing = candidate
                    break

        if existing:
            if (existing.is_suppressed or existing.studio_owner_id
                    or existing.linked_user_id
                    or existing.status not in {"imported", "unclaimed"}):
                return existing, False
            for field in ("name", "address", "formatted_address", "city",
                          "country", "latitude", "longitude", "phone", "website"):
                setattr(existing, field, data[field])
            # Keep a stable source ID; a stale old ID must never be re-imported
            # as a second active listing after a reviewed correction.
            if not existing.source_place_id:
                existing.source_place_id = source_place_id
            existing.save()
            return existing, False

        return Location.objects.create(**data), True
