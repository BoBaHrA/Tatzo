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

The canonical style and trait keys live in `style_match/styles.py`. Sessions
start with 30 cards by default. At the end of the base deck the server measures
evidence, the gap between the leading styles, result strength and recent
stability. If the profile is still ambiguous, it appends six unseen cards that
separate the three leading style candidates. This can happen twice, with a
default hard limit of 42 cards. The discovery API still exposes only card IDs,
delivery URLs and neutral alt text; style metadata stays server-side.

Deploy-specific Django settings may override `STYLE_MATCH_CARD_COUNT`,
`STYLE_MATCH_CLARIFICATION_BATCH_SIZE`, `STYLE_MATCH_MAX_CARD_COUNT` and
`STYLE_MATCH_CONFIDENCE_THRESHOLD`. Sessions use all available approved cards
when the library is smaller than the requested base. A balanced round-robin
prevents one style from dominating the base deck.
