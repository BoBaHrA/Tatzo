# Tatzo Style Match

Style Match is a self-contained Django app that turns visual reactions into a
ranked tattoo-style profile and verified artist recommendations. Card style
metadata is intentionally never returned by the discovery API before the
result reveal.

## Card library workflow

1. Generate and curate a vertical 2:3 tattoo image.
2. Upload it to Cloudinary under `style_match/cards/<CARD_ID>`.
3. Add the approved image and its annotation to a JSON manifest.
4. Validate the manifest without writing:

   ```bash
   python manage.py import_style_match_cards cards.json --dry-run
   ```

5. Import it:

   ```bash
   python manage.py import_style_match_cards cards.json
   ```

The manifest accepts a list of cards or an object with a `cards` list. Each
style and visual-trait weight is a number from `0` to `1`:

```json
{
  "cards": [
    {
      "card_id": "SM002",
      "image_url": "https://res.cloudinary.com/.../SM002.png",
      "cloudinary_public_id": "style_match/cards/SM002",
      "primary_style": "fine_line",
      "style_weights": {
        "fine_line": 0.9,
        "botanical": 0.8,
        "minimalism": 0.7,
        "blackwork": 0.1
      },
      "visual_traits": {
        "color": 0.0,
        "line_weight": 0.15,
        "density": 0.3,
        "contrast": 0.25,
        "realism": 0.2,
        "organic": 0.85,
        "geometric": 0.1,
        "symmetry": 0.2
      },
      "motifs": ["flowers", "nature"],
      "body_area": "forearm",
      "skin_tone": "medium",
      "quality_score": 0.95,
      "is_active": true,
      "is_approved": true
    }
  ]
}
```

The canonical style and trait keys live in `style_match/styles.py`. The target
session size defaults to 30 and can be changed with `STYLE_MATCH_CARD_COUNT`.
Sessions automatically use all available approved cards until the library is
large enough. A balanced round-robin prevents one style from dominating a
session.
