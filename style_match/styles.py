import re

from django.utils.translation import gettext_lazy as _

STYLE_LABELS = {
    "fine_line": _("Fine Line"),
    "minimalism": _("Minimalism"),
    "botanical": _("Botanical"),
    "ornamental": _("Ornamental"),
    "geometric": _("Geometric"),
    "dotwork": _("Dotwork"),
    "blackwork": _("Blackwork"),
    "engraving": _("Engraving"),
    "illustrative": _("Illustrative"),
    "micro_realism": _("Micro Realism"),
    "black_grey_realism": _("Black & Grey Realism"),
    "color_realism": _("Color Realism"),
    "american_traditional": _("American Traditional"),
    "neo_traditional": _("Neo-Traditional"),
    "japanese": _("Japanese"),
    "watercolor": _("Watercolor"),
    "abstract": _("Abstract"),
    "cybersigilism": _("Cybersigilism"),
}

STYLE_CHOICES = tuple((slug, label) for slug, label in STYLE_LABELS.items())

TRAIT_LABELS = {
    "color": _("Color"),
    "line_weight": _("Bold lines"),
    "density": _("Dense compositions"),
    "contrast": _("High contrast"),
    "realism": _("Realistic detail"),
    "organic": _("Organic shapes"),
    "geometric": _("Geometric structure"),
    "symmetry": _("Symmetry"),
}

STYLE_ALIASES = {
    "fineline": "fine_line",
    "fine line": "fine_line",
    "minimalist": "minimalism",
    "minimalism": "minimalism",
    "floral": "botanical",
    "botanical": "botanical",
    "ornamental": "ornamental",
    "geometric": "geometric",
    "dotwork": "dotwork",
    "blackwork": "blackwork",
    "engraving": "engraving",
    "illustrative": "illustrative",
    "micro realism": "micro_realism",
    "microrealism": "micro_realism",
    "realism": "black_grey_realism",
    "black and grey realism": "black_grey_realism",
    "black grey realism": "black_grey_realism",
    "color realism": "color_realism",
    "colour realism": "color_realism",
    "traditional": "american_traditional",
    "american traditional": "american_traditional",
    "neo traditional": "neo_traditional",
    "neotraditional": "neo_traditional",
    "japanese": "japanese",
    "watercolor": "watercolor",
    "watercolour": "watercolor",
    "abstract": "abstract",
    "cybersigilism": "cybersigilism",
}


def normalize_style(value):
    """Map existing free-form artist style values to Style Match slugs."""
    normalized = re.sub(r"[_\-]+", " ", str(value or "").strip().lower())
    normalized = re.sub(r"\s+", " ", normalized)
    if normalized in STYLE_ALIASES:
        return STYLE_ALIASES[normalized]

    underscored = normalized.replace(" ", "_")
    return underscored if underscored in STYLE_LABELS else None


def style_label(slug):
    return str(STYLE_LABELS.get(slug, slug.replace("_", " ").title()))
