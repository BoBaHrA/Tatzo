import random
from collections import defaultdict

from django.contrib.auth.models import User
from django.db.models import Prefetch
from django.urls import reverse
from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy

from users.models import PortfolioWork

from .models import StyleMatchResponse, StyleMatchSession, TattooCard
from .styles import STYLE_LABELS, TRAIT_LABELS, normalize_style, style_label

REACTION_VALUES = {
    StyleMatchResponse.REACTION_REJECT: -1.0,
    StyleMatchResponse.REACTION_LIKE: 0.65,
    StyleMatchResponse.REACTION_FAVORITE: 1.0,
}
SAVE_BONUS = 0.15

PERSONALITIES = {
    "storyteller": {
        "label": gettext_lazy("The Storyteller"),
        "description": gettext_lazy(
            "You are drawn to tattoos with emotion, organic movement and details that feel personal."
        ),
        "styles": {"fine_line", "minimalism", "botanical", "watercolor"},
    },
    "architect": {
        "label": gettext_lazy("The Architect"),
        "description": gettext_lazy(
            "You notice balance, rhythm and structure. Precision is part of the meaning for you."
        ),
        "styles": {"ornamental", "geometric", "dotwork"},
    },
    "visionary": {
        "label": gettext_lazy("The Visionary"),
        "description": gettext_lazy(
            "You prefer bold visual ideas, unusual silhouettes and work that refuses to blend in."
        ),
        "styles": {"blackwork", "abstract", "cybersigilism"},
    },
    "observer": {
        "label": gettext_lazy("The Observer"),
        "description": gettext_lazy(
            "You value technique, texture and images that reward a closer look."
        ),
        "styles": {
            "engraving",
            "illustrative",
            "micro_realism",
            "black_grey_realism",
            "color_realism",
        },
    },
    "collector": {
        "label": gettext_lazy("The Collector"),
        "description": gettext_lazy(
            "You gravitate toward expressive traditions, confident composition and lasting visual language."
        ),
        "styles": {"american_traditional", "neo_traditional", "japanese"},
    },
}


def select_balanced_card_ids(limit=30):
    """Round-robin cards by primary style so a session is not style-heavy."""
    cards = list(
        TattooCard.objects.filter(is_active=True, is_approved=True)
        .only("id", "primary_style")
        .order_by("card_id")
    )
    if not cards:
        return []

    rng = random.SystemRandom()
    grouped = defaultdict(list)
    for card in cards:
        grouped[card.primary_style].append(card.id)

    style_order = list(grouped)
    rng.shuffle(style_order)
    for card_ids in grouped.values():
        rng.shuffle(card_ids)

    selected = []
    while len(selected) < min(limit, len(cards)):
        added = False
        for style in style_order:
            if grouped[style] and len(selected) < limit:
                selected.append(grouped[style].pop())
                added = True
        if not added:
            break
        rng.shuffle(style_order)
    return selected


def serialize_card(card):
    return {
        "id": card.pk,
        "card_id": card.card_id,
        "image_url": card.delivery_url,
        "alt": _("Tattoo inspiration card"),
    }


def cards_for_session(session):
    cards_by_id = TattooCard.objects.in_bulk(session.card_order)
    return [
        serialize_card(cards_by_id[card_id])
        for card_id in session.card_order
        if card_id in cards_by_id
    ]


def _normalise_weighted_scores(numerators, denominators):
    scores = {}
    for key, denominator in denominators.items():
        if not denominator:
            continue
        ratio = max(-1.0, min(1.0, numerators[key] / denominator))
        scores[key] = round(max(0, min(100, 50 + (50 * ratio))))
    return scores


def calculate_session_scores(session):
    style_numerators = defaultdict(float)
    style_denominators = defaultdict(float)
    trait_numerators = defaultdict(float)
    trait_denominators = defaultdict(float)
    motif_numerators = defaultdict(float)
    motif_denominators = defaultdict(float)

    responses = session.responses.select_related("card").exclude(reaction="")
    for response in responses:
        reaction_value = REACTION_VALUES.get(response.reaction, 0)
        signal = min(1.0, reaction_value + (SAVE_BONUS if response.saved else 0))

        for style, weight in response.card.style_weights.items():
            weight = float(weight)
            style_numerators[style] += signal * weight
            style_denominators[style] += weight

        for trait, weight in response.card.visual_traits.items():
            weight = float(weight)
            trait_numerators[trait] += signal * weight
            trait_denominators[trait] += weight

        for motif in response.card.motifs:
            motif = str(motif).strip().lower()
            if motif:
                motif_numerators[motif] += signal
                motif_denominators[motif] += 1

    return {
        "styles": _normalise_weighted_scores(style_numerators, style_denominators),
        "traits": _normalise_weighted_scores(trait_numerators, trait_denominators),
        "motifs": _normalise_weighted_scores(motif_numerators, motif_denominators),
    }


def choose_personality(style_scores):
    if not style_scores:
        return "storyteller"

    personality_scores = {}
    for slug, personality in PERSONALITIES.items():
        represented = [style_scores.get(style, 0) for style in personality["styles"]]
        personality_scores[slug] = sum(represented) / max(1, len(represented))
    return max(personality_scores, key=personality_scores.get)


def complete_session(session):
    scores = calculate_session_scores(session)
    personality_slug = choose_personality(scores["styles"])
    session.mark_completed(
        style_scores=scores["styles"],
        trait_scores=scores["traits"],
        personality_slug=personality_slug,
    )
    session.save(
        update_fields=(
            "status",
            "current_index",
            "style_scores",
            "trait_scores",
            "personality_slug",
            "completed_at",
            "updated_at",
        )
    )
    return scores


def _profile_image_url(artist):
    image = getattr(artist.profile, "profile_image", None)
    if not image:
        return ""
    try:
        return image.url
    except (ValueError, OSError):
        return ""


def recommend_artists(style_scores, limit=3):
    if not style_scores:
        return []

    portfolio_prefetch = Prefetch(
        "portfolio_works",
        queryset=PortfolioWork.objects.only("user_id", "style"),
    )
    artists = (
        User.objects.filter(
            is_active=True,
            profile__account_type="tattoo_artist",
            profile__verification_status="approved",
            profile__is_email_verified=True,
        )
        .select_related("profile", "booking_settings", "manualverificationrequest")
        .prefetch_related(portfolio_prefetch)
    )

    matches = []
    for artist in artists:
        artist_styles = set()
        booking_settings = getattr(artist, "booking_settings", None)
        if booking_settings:
            for value in booking_settings.active_styles or []:
                normalized = normalize_style(value)
                if normalized:
                    artist_styles.add(normalized)
        for work in artist.portfolio_works.all():
            normalized = normalize_style(work.style)
            if normalized:
                artist_styles.add(normalized)

        matched = sorted(
            ((style, style_scores.get(style, 0)) for style in artist_styles),
            key=lambda item: item[1],
            reverse=True,
        )
        matched = [item for item in matched if item[1] > 0]
        if not matched:
            continue

        strongest = matched[:3]
        average = sum(score for _, score in strongest) / len(strongest)
        match_score = round(max(45, min(99, 15 + (average * 0.85))))
        manual_request = getattr(artist, "manualverificationrequest", None)
        location = (manual_request.city_country or "").strip() if manual_request else ""

        matches.append(
            {
                "username": artist.username,
                "profile_url": reverse("profile", kwargs={"username": artist.username}),
                "image_url": _profile_image_url(artist),
                "location": location,
                "top_style": style_label(strongest[0][0]),
                "score": match_score,
            }
        )

    return sorted(matches, key=lambda item: item["score"], reverse=True)[:limit]


def _ranked_labels(scores, label_map, *, descending=True, limit=4, threshold=None):
    items = sorted(scores.items(), key=lambda item: item[1], reverse=descending)
    if threshold is not None:
        if descending:
            items = [item for item in items if item[1] >= threshold]
        else:
            items = [item for item in items if item[1] <= threshold]
    return [
        str(label_map.get(key, key.replace("_", " ").title()))
        for key, _ in items[:limit]
    ]


def result_payload(session):
    if not session.is_complete:
        return None

    personality = PERSONALITIES.get(
        session.personality_slug, PERSONALITIES["storyteller"]
    )
    styles = sorted(
        session.style_scores.items(), key=lambda item: item[1], reverse=True
    )
    style_rows = [
        {"slug": slug, "label": style_label(slug), "score": score}
        for slug, score in styles[:5]
    ]
    top_style = (
        style_rows[0]
        if style_rows
        else {"slug": "", "label": _("Discovering"), "score": 0}
    )

    drawn_to = _ranked_labels(
        session.style_scores,
        STYLE_LABELS,
        descending=True,
        limit=3,
        threshold=60,
    )
    drawn_to.extend(
        label
        for label in _ranked_labels(
            session.trait_scores,
            TRAIT_LABELS,
            descending=True,
            limit=3,
            threshold=65,
        )
        if label not in drawn_to
    )
    tend_to_skip = _ranked_labels(
        session.style_scores,
        STYLE_LABELS,
        descending=False,
        limit=3,
        threshold=35,
    )
    if not drawn_to:
        drawn_to = [row["label"] for row in style_rows[:3]]
    if not tend_to_skip:
        tend_to_skip = [_("More choices will sharpen this result")]

    completed_count = session.responses.exclude(reaction="").count()
    saved_count = session.responses.filter(saved=True).count()
    community_count = StyleMatchSession.objects.filter(
        status=StyleMatchSession.STATUS_COMPLETED,
        personality_slug=session.personality_slug,
    ).count()

    return {
        "session_id": str(session.pk),
        "top_style": top_style,
        "styles": style_rows,
        "personality": {
            "slug": session.personality_slug,
            "label": str(personality["label"]),
            "description": str(personality["description"]),
        },
        "drawn_to": drawn_to[:5],
        "tend_to_skip": tend_to_skip,
        "artists": recommend_artists(session.style_scores),
        "community_count": community_count,
        "completed_count": completed_count,
        "saved_count": saved_count,
        "match_confidence": round(
            min(100, 35 + (65 * completed_count / max(1, session.target_count)))
        ),
    }
