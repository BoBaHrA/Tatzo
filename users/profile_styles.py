"""Present artist booking style selections on the public profile.

The dashboard's ArtistBookingSettings.active_styles is the single source of
truth; the profile never copies or separately stores these selections.
"""
from appointments.models import APPOINTMENT_VALUE_LABELS


def public_artist_styles(artist):
    """Return localized style names, safely handling legacy/missing settings."""
    profile = getattr(artist, "profile", None)
    if profile is None or profile.account_type != "tattoo_artist":
        return []

    settings = getattr(artist, "booking_settings", None)
    selected = getattr(settings, "active_styles", None)
    if not isinstance(selected, list):
        return []

    result = []
    seen = set()
    for raw in selected[:30]:
        if not isinstance(raw, str):
            continue
        style = raw.strip()[:80]
        if not style or style.casefold() in seen:
            continue
        seen.add(style.casefold())
        result.append(str(APPOINTMENT_VALUE_LABELS.get(style, style)))
    return result
