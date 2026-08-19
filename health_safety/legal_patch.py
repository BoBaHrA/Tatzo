def apply_health_privacy_policy_patch():
    """Keep the existing localized privacy page truthful when health cards are enabled."""
    from users import legal_content

    variants = [
        (
            "LEGAL_PAGES",
            "19 août 2026",
            "Tatzo peut traiter des données sensibles uniquement lorsque l’utilisateur choisit volontairement d’utiliser une fonctionnalité qui les nécessite, notamment la fiche privée Santé & Sécurité. Ces données ne sont pas publiques par défaut.",
            "9. Données de santé — fiche Santé & Sécurité",
            [
                "La fiche Santé & Sécurité est facultative et permet au client d’indiquer des informations de santé qu’il estime pertinentes pour la sécurité d’un rendez-vous de tatouage, notamment concernant le saignement, la peau, les allergies ou la cicatrisation.",
                "Avant l’enregistrement, Tatzo demande une confirmation explicite concernant le stockage de ces informations. La fiche reste privée tant que le client ne choisit pas de la partager avec un tatoueur pour un rendez-vous précis.",
                "Le client peut retirer l’accès accordé à un tatoueur ou supprimer sa fiche. Tatzo n’utilise pas ces informations pour poser un diagnostic médical et ne les copie pas dans les messages ou publications.",
            ],
        ),
        (
            "LEGAL_PAGES_RU",
            "19 августа 2026",
            "Tatzo может обрабатывать чувствительные данные только когда пользователь добровольно выбирает функцию, для которой они необходимы, в частности приватную карточку «Здоровье и безопасность». По умолчанию эти данные не являются публичными.",
            "9. Данные о здоровье — карточка «Здоровье и безопасность»",
            [
                "Карточка «Здоровье и безопасность» необязательна и позволяет клиенту указать сведения о здоровье, которые он считает важными для безопасности тату-сеанса, включая информацию о кровотечении, коже, аллергиях или заживлении.",
                "Перед сохранением Tatzo запрашивает явное подтверждение хранения этих сведений. Карточка остаётся приватной, пока клиент сам не откроет её конкретному тату-мастеру для конкретной записи.",
                "Клиент может отозвать доступ мастера или удалить карточку. Tatzo не использует эти сведения для постановки медицинских диагнозов и не копирует их в сообщения или публикации.",
            ],
        ),
        (
            "LEGAL_PAGES_EN",
            "19 August 2026",
            "Tatzo may process sensitive data only when a user voluntarily chooses a feature that requires it, including the private Health & Safety Card. These data are not public by default.",
            "9. Health data — Health & Safety Card",
            [
                "The Health & Safety Card is optional and lets a client provide health information they consider relevant to tattoo-session safety, including information related to bleeding, skin, allergies or healing.",
                "Before saving, Tatzo asks for an explicit confirmation concerning storage of this information. The card remains private unless the client chooses to share it with a specific tattoo artist for a specific appointment.",
                "The client can revoke an artist’s access or delete the card. Tatzo does not use this information to make medical diagnoses and does not copy it into messages or posts.",
            ],
        ),
    ]

    for attribute, updated, collected_text, heading, paragraphs in variants:
        pages = getattr(legal_content, attribute, None)
        if not pages or "privacy" not in pages:
            continue

        privacy = pages["privacy"]
        privacy["updated"] = updated
        sections = privacy.get("sections", [])
        if len(sections) > 1:
            collected = sections[1].setdefault("paragraphs", [])
            if len(collected) > 1:
                collected[1] = collected_text
            else:
                collected.append(collected_text)

        if not any(section.get("heading") == heading for section in sections):
            sections.append({"heading": heading, "paragraphs": paragraphs})
