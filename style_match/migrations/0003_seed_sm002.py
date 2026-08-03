from django.db import migrations

SM002 = {
    "image_url": "https://res.cloudinary.com/dz0wuti9s/image/upload/v1785761829/style_match/cards/SM002.jpg",
    "cloudinary_public_id": "style_match/cards/SM002",
    "primary_style": "fine_line",
    "style_weights": {
        "fine_line": 0.98,
        "botanical": 0.72,
        "geometric": 0.62,
        "illustrative": 0.48,
        "minimalism": 0.35,
        "ornamental": 0.2,
        "blackwork": 0.08,
    },
    "visual_traits": {
        "color": 0.0,
        "line_weight": 0.08,
        "density": 0.58,
        "contrast": 0.28,
        "realism": 0.42,
        "organic": 0.65,
        "geometric": 0.78,
        "symmetry": 0.72,
    },
    "motifs": ["glasshouse", "architecture", "climbing vines", "botanical"],
    "body_area": "inner forearm",
    "skin_tone": "light",
    "quality_score": 0.96,
    "is_active": True,
    "is_approved": True,
}


def seed_sm002(apps, schema_editor):
    TattooCard = apps.get_model("style_match", "TattooCard")
    TattooCard.objects.update_or_create(card_id="SM002", defaults=SM002)


def remove_sm002(apps, schema_editor):
    TattooCard = apps.get_model("style_match", "TattooCard")
    TattooCard.objects.filter(card_id="SM002").delete()


class Migration(migrations.Migration):
    dependencies = [("style_match", "0002_seed_sm001")]

    operations = [migrations.RunPython(seed_sm002, remove_sm002)]
