from django.db import migrations


SM001 = {
    "image_url": "https://res.cloudinary.com/dz0wuti9s/image/upload/v1785755969/style_match/cards/SM001.png",
    "cloudinary_public_id": "style_match/cards/SM001",
    "primary_style": "illustrative",
    "style_weights": {
        "illustrative": 0.95,
        "japanese": 0.82,
        "neo_traditional": 0.74,
    },
    "visual_traits": {
        "color": 0.86,
        "line_weight": 0.68,
        "density": 0.72,
        "contrast": 0.78,
        "realism": 0.22,
        "organic": 0.7,
        "geometric": 0.18,
        "symmetry": 0.28,
    },
    "motifs": ["japanese", "decorative"],
    "body_area": "arm",
    "skin_tone": "medium",
    "quality_score": 0.95,
    "is_active": True,
    "is_approved": True,
}


def seed_sm001(apps, schema_editor):
    TattooCard = apps.get_model("style_match", "TattooCard")
    TattooCard.objects.update_or_create(card_id="SM001", defaults=SM001)


def remove_sm001(apps, schema_editor):
    TattooCard = apps.get_model("style_match", "TattooCard")
    TattooCard.objects.filter(card_id="SM001").delete()


class Migration(migrations.Migration):
    dependencies = [("style_match", "0001_initial")]

    operations = [migrations.RunPython(seed_sm001, remove_sm001)]
