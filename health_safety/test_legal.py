from django.test import SimpleTestCase

from users import legal_content


class HealthSafetyPrivacyPolicyTests(SimpleTestCase):
    def test_health_data_disclosure_is_present_in_all_localized_privacy_pages(self):
        variants = (
            ("LEGAL_PAGES", "9. Données de santé — fiche Santé & Sécurité"),
            ("LEGAL_PAGES_RU", "9. Данные о здоровье — карточка «Здоровье и безопасность»"),
            ("LEGAL_PAGES_EN", "9. Health data — Health & Safety Card"),
        )
        for attribute, heading in variants:
            pages = getattr(legal_content, attribute)
            privacy = pages["privacy"]
            headings = [section["heading"] for section in privacy["sections"]]
            self.assertIn(heading, headings)
            collected_text = " ".join(privacy["sections"][1]["paragraphs"]).lower()
            self.assertTrue(
                "santé" in collected_text
                or "здоров" in collected_text
                or "health" in collected_text
            )
