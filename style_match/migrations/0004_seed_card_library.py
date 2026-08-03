from django.db import migrations

CARDS = {
    "SM003": {
        "image_url": "https://res.cloudinary.com/dz0wuti9s/image/upload/v1785762218/style_match/cards/SM003.jpg",
        "cloudinary_public_id": "style_match/cards/SM003",
        "primary_style": "blackwork",
        "style_weights": {
            "blackwork": 0.98,
            "illustrative": 0.68,
            "neo_traditional": 0.42,
            "ornamental": 0.28,
            "engraving": 0.18,
            "japanese": 0.16,
            "fine_line": 0.05,
        },
        "visual_traits": {
            "color": 0.0,
            "line_weight": 0.92,
            "density": 0.8,
            "contrast": 0.95,
            "realism": 0.28,
            "organic": 0.76,
            "geometric": 0.2,
            "symmetry": 0.25,
        },
        "motifs": ["wyvern", "dragon", "mythological", "river", "wings"],
        "body_area": "shoulder blade and upper back",
        "skin_tone": "medium",
        "quality_score": 0.93,
        "is_active": True,
        "is_approved": True,
    },
}


def seed_card_library(apps, schema_editor):
    TattooCard = apps.get_model("style_match", "TattooCard")
    for card_id, defaults in CARDS.items():
        TattooCard.objects.update_or_create(card_id=card_id, defaults=defaults)


def remove_card_library(apps, schema_editor):
    TattooCard = apps.get_model("style_match", "TattooCard")
    TattooCard.objects.filter(card_id__in=CARDS).delete()


class Migration(migrations.Migration):
    dependencies = [("style_match", "0003_seed_sm002")]

    operations = [migrations.RunPython(seed_card_library, remove_card_library)]
