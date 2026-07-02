from django.utils.translation import get_language

LEGAL_PAGES = {
    "terms": {
        "title": "Conditions d’utilisation",
        "updated": "2 juillet 2026",
        "sections": [
            {
                "heading": "1. Objet",
                "paragraphs": [
                    "Tatzo est une plateforme sociale destinée aux utilisateurs, passionnés de tatouage et tatoueurs, permettant de créer un profil, publier du contenu, échanger par messages, découvrir des artistes et présenter un portfolio.",
                    "L’utilisation de Tatzo implique l’acceptation des présentes conditions d’utilisation.",
                ],
            },
            {
                "heading": "2. Compte utilisateur",
                "paragraphs": [
                    "L’utilisateur s’engage à fournir des informations exactes lors de son inscription et à maintenir la confidentialité de ses identifiants.",
                    "Tatzo peut suspendre ou supprimer un compte en cas de violation des présentes conditions, d’abus, de spam, d’usurpation d’identité ou de comportement dangereux.",
                ],
            },
            {
                "heading": "3. Contenu publié",
                "paragraphs": [
                    "L’utilisateur reste propriétaire du contenu qu’il publie sur Tatzo.",
                    "En publiant du contenu, l’utilisateur accorde à Tatzo une licence non exclusive, gratuite et mondiale permettant d’afficher, héberger, reproduire techniquement et diffuser ce contenu dans le cadre du fonctionnement de la plateforme.",
                    "L’utilisateur garantit disposer des droits nécessaires sur les images, textes, vidéos ou éléments publiés.",
                ],
            },
            {
                "heading": "4. Contenus interdits",
                "paragraphs": [
                    "Sont interdits : contenus illégaux, haineux, harcelants, discriminatoires, violents, pornographiques, trompeurs, frauduleux, portant atteinte à la vie privée ou aux droits de propriété intellectuelle d’autrui.",
                    "Tatzo se réserve le droit de retirer tout contenu manifestement contraire aux présentes règles ou à la loi.",
                ],
            },
            {
                "heading": "5. Tatoueurs et vérification",
                "paragraphs": [
                    "Les comptes tatoueurs peuvent être soumis à une vérification avant l’accès complet aux fonctionnalités professionnelles, notamment le portfolio.",
                    "La vérification ne constitue pas une certification officielle de diplôme, d’assurance, d’autorisation administrative ou de qualité professionnelle.",
                ],
            },
            {
                "heading": "6. Responsabilité",
                "paragraphs": [
                    "Tatzo agit comme intermédiaire technique entre utilisateurs. Les tatoueurs restent responsables de leurs prestations, de leurs tarifs, de leurs rendez-vous, de leur conformité professionnelle et sanitaire.",
                    "Tatzo ne garantit pas la disponibilité permanente du service et peut interrompre temporairement l’accès pour maintenance, sécurité ou amélioration.",
                ],
            },
            {
                "heading": "7. Signalement et modération",
                "paragraphs": [
                    "Les utilisateurs peuvent signaler un contenu ou un comportement via les outils de signalement disponibles sur la plateforme.",
                    "Tatzo peut supprimer un contenu, limiter sa visibilité, suspendre un compte ou prendre toute mesure proportionnée en cas de violation.",
                ],
            },
            {
                "heading": "8. Modification des conditions",
                "paragraphs": [
                    "Tatzo peut modifier les présentes conditions. En cas de modification importante, les utilisateurs seront informés par un moyen approprié.",
                ],
            },
            {
                "heading": "9. Contact",
                "paragraphs": [
                    "Pour toute question concernant ces conditions : contact@tatzo.eu",
                ],
            },
        ],
    },

    "privacy": {
        "title": "Politique de confidentialité",
        "updated": "2 juillet 2026",
        "sections": [
            {
                "heading": "1. Responsable du traitement",
                "paragraphs": [
                    "Le responsable du traitement est Tatzo, représenté par Vladimir Procopisin.",
                    "Contact confidentialité : privacy@tatzo.eu",
                ],
            },
            {
                "heading": "2. Données collectées",
                "paragraphs": [
                    "Tatzo peut collecter les données suivantes : nom d’utilisateur, adresse email, mot de passe chiffré, type de compte, photo de profil, biographie, publications, commentaires, messages, fichiers envoyés, documents de vérification pour les tatoueurs, signalements, préférences de langue, données techniques de sécurité et logs.",
                    "Tatzo ne demande pas de données sensibles sauf si l’utilisateur les publie volontairement dans son profil, ses messages ou ses contenus.",
                ],
            },
            {
                "heading": "3. Finalités",
                "paragraphs": [
                    "Les données sont utilisées pour créer et gérer les comptes, afficher les profils, publier du contenu, permettre la messagerie, modérer la plateforme, vérifier certains comptes tatoueurs, assurer la sécurité, prévenir les abus et répondre aux demandes des utilisateurs.",
                ],
            },
            {
                "heading": "4. Bases légales",
                "paragraphs": [
                    "Les traitements peuvent être fondés sur l’exécution du contrat, l’intérêt légitime de Tatzo à sécuriser et améliorer la plateforme, le consentement lorsque nécessaire, ou le respect d’obligations légales.",
                ],
            },
            {
                "heading": "5. Conservation",
                "paragraphs": [
                    "Les données de compte sont conservées tant que le compte existe.",
                    "Les contenus publiés sont conservés tant qu’ils restent en ligne ou jusqu’à suppression.",
                    "Les documents de vérification sont conservés uniquement pendant la durée nécessaire à l’examen et à la sécurité de la vérification.",
                    "Les logs techniques peuvent être conservés temporairement pour la sécurité, le diagnostic et la prévention des abus.",
                ],
            },
            {
                "heading": "6. Sous-traitants",
                "paragraphs": [
                    "Tatzo peut utiliser des prestataires techniques pour l’hébergement, la base de données, l’envoi d’emails, le stockage des médias et la sécurité.",
                    "À ce stade, Tatzo utilise notamment Render pour l’hébergement et PostgreSQL, Cloudinary pour les médias, et un prestataire email pour l’envoi des emails transactionnels.",
                ],
            },
            {
                "heading": "7. Droits des utilisateurs",
                "paragraphs": [
                    "Conformément au RGPD, les utilisateurs peuvent demander l’accès, la rectification, l’effacement, la limitation, l’opposition ou la portabilité de leurs données.",
                    "Pour exercer ces droits : privacy@tatzo.eu",
                    "Les utilisateurs peuvent également introduire une réclamation auprès de la CNIL.",
                ],
            },
            {
                "heading": "8. Sécurité",
                "paragraphs": [
                    "Tatzo met en place des mesures raisonnables pour protéger les comptes et les données : mots de passe chiffrés, limitation des abus, vérification email, contrôles d’accès, modération et surveillance technique.",
                ],
            },
        ],
    },

    "cookies": {
        "title": "Politique cookies",
        "updated": "2 juillet 2026",
        "sections": [
            {
                "heading": "1. Qu’est-ce qu’un cookie ?",
                "paragraphs": [
                    "Un cookie est un petit fichier déposé sur le terminal de l’utilisateur lors de la navigation sur un site.",
                ],
            },
            {
                "heading": "2. Cookies utilisés par Tatzo",
                "paragraphs": [
                    "Tatzo utilise des cookies strictement nécessaires au fonctionnement du site, notamment pour la session utilisateur, la sécurité CSRF, la connexion et les préférences de langue.",
                    "Ces cookies sont nécessaires au fonctionnement normal de la plateforme.",
                ],
            },
            {
                "heading": "3. Cookies de mesure ou marketing",
                "paragraphs": [
                    "À ce stade, Tatzo n’utilise pas de cookies publicitaires tiers ni de tracking marketing externe.",
                    "Si Tatzo ajoute plus tard des outils de mesure d’audience, publicité ou tracking, une bannière de consentement et des options de gestion seront ajoutées.",
                ],
            },
            {
                "heading": "4. Gestion des cookies",
                "paragraphs": [
                    "L’utilisateur peut gérer les cookies depuis les paramètres de son navigateur.",
                    "Le blocage de certains cookies nécessaires peut empêcher la connexion ou certaines fonctionnalités de fonctionner correctement.",
                ],
            },
        ],
    },

    "community-guidelines": {
        "title": "Règles de la communauté",
        "updated": "2 juillet 2026",
        "sections": [
            {
                "heading": "1. Respect",
                "paragraphs": [
                    "Tatzo doit rester un espace respectueux pour les utilisateurs, tatoueurs et passionnés de tatouage.",
                    "Le harcèlement, les insultes, menaces, humiliations, discriminations et comportements agressifs sont interdits.",
                ],
            },
            {
                "heading": "2. Contenu autorisé",
                "paragraphs": [
                    "Les utilisateurs peuvent publier des photos de tatouages, inspirations, flashs, portfolios, questions, expériences et contenus liés au tatouage.",
                ],
            },
            {
                "heading": "3. Contenu interdit",
                "paragraphs": [
                    "Sont interdits : haine, harcèlement, nudité explicite non nécessaire, exploitation de mineurs, violence extrême, spam, arnaques, usurpation d’identité, publication de données privées, contenu volé ou non autorisé.",
                ],
            },
            {
                "heading": "4. Propriété intellectuelle",
                "paragraphs": [
                    "Ne publiez pas le travail d’un autre artiste comme s’il était le vôtre.",
                    "Les flashs, dessins, photos et œuvres protégées doivent être publiés uniquement si vous avez les droits nécessaires.",
                ],
            },
            {
                "heading": "5. Signalements",
                "paragraphs": [
                    "Les utilisateurs peuvent signaler un post, un commentaire, un message ou un problème via les outils de signalement.",
                    "Les signalements abusifs ou mensongers peuvent entraîner des restrictions.",
                ],
            },
            {
                "heading": "6. Sanctions",
                "paragraphs": [
                    "Tatzo peut supprimer du contenu, limiter certaines fonctionnalités, suspendre temporairement ou supprimer définitivement un compte selon la gravité de la violation.",
                ],
            },
        ],
    },

    "legal-notice": {
        "title": "Mentions légales",
        "updated": "2 juillet 2026",
        "sections": [
            {
                "heading": "1. Éditeur du site",
                "paragraphs": [
                    "Site : Tatzo",
                    "URL : https://tatzo.eu",
                    "Éditeur : Vladimir Procopisin",
                    "Statut : à compléter",
                    "Adresse : à compléter",
                    "Email : contact@tatzo.eu",
                    "Numéro d’immatriculation : à compléter si applicable",
                    "TVA intracommunautaire : à compléter si applicable",
                ],
            },
            {
                "heading": "2. Directeur de la publication",
                "paragraphs": [
                    "Directeur de la publication : Vladimir Procopisin",
                ],
            },
            {
                "heading": "3. Hébergement",
                "paragraphs": [
                    "Le site est hébergé par Render.",
                    "Render Services, Inc.",
                    "Adresse : à compléter depuis les informations officielles Render.",
                    "Site : render.com",
                ],
            },
            {
                "heading": "4. Stockage des médias",
                "paragraphs": [
                    "Les médias publiés sur Tatzo peuvent être stockés via Cloudinary.",
                    "Cloudinary Ltd.",
                    "Site : cloudinary.com",
                ],
            },
            {
                "heading": "5. Propriété intellectuelle",
                "paragraphs": [
                    "La marque, le logo, l’interface, les textes et éléments graphiques de Tatzo sont protégés.",
                    "Les contenus publiés par les utilisateurs restent sous leur responsabilité et leur propriété, sous réserve des droits accordés à Tatzo pour le fonctionnement de la plateforme.",
                ],
            },
        ],
    },
}

LEGAL_PAGES_RU = {
    "terms": {
        "title": "Условия использования",
        "updated": "2 июля 2026",
        "sections": [
            {
                "heading": "1. Назначение",
                "paragraphs": [
                    "Tatzo — социальная платформа для пользователей, любителей татуировки и тату-мастеров. Она позволяет создавать профиль, публиковать контент, общаться, находить мастеров и показывать портфолио.",
                    "Использование Tatzo означает принятие этих условий.",
                ],
            },
            {
                "heading": "2. Аккаунт пользователя",
                "paragraphs": [
                    "Пользователь обязуется предоставлять точную информацию при регистрации и сохранять конфиденциальность своих данных для входа.",
                    "Tatzo может ограничить, приостановить или удалить аккаунт при нарушении правил, спаме, злоупотреблениях, выдаче себя за другого человека или опасном поведении.",
                ],
            },
            {
                "heading": "3. Публикуемый контент",
                "paragraphs": [
                    "Пользователь сохраняет права на контент, который публикует на Tatzo.",
                    "Публикуя контент, пользователь предоставляет Tatzo неисключительную бесплатную лицензию на отображение, хранение и техническое распространение этого контента в рамках работы платформы.",
                    "Пользователь подтверждает, что имеет необходимые права на публикуемые изображения, тексты, видео и другие материалы.",
                ],
            },
            {
                "heading": "4. Запрещённый контент",
                "paragraphs": [
                    "Запрещены незаконные, оскорбительные, дискриминационные, мошеннические, вводящие в заблуждение материалы, спам, угрозы, преследование, публикация чужих персональных данных и нарушение интеллектуальных прав.",
                    "Tatzo может удалить контент, ограничить его видимость или принять меры к аккаунту, если контент нарушает правила или закон.",
                ],
            },
            {
                "heading": "5. Тату-мастера и верификация",
                "paragraphs": [
                    "Аккаунты тату-мастеров могут проходить проверку перед получением полного доступа к профессиональным функциям, включая портфолио.",
                    "Верификация на Tatzo не является официальной сертификацией диплома, страховки, разрешения на деятельность или профессионального качества услуг.",
                ],
            },
            {
                "heading": "6. Ответственность",
                "paragraphs": [
                    "Tatzo выступает техническим посредником между пользователями. Тату-мастера самостоятельно отвечают за свои услуги, цены, записи, санитарные требования и профессиональную деятельность.",
                    "Tatzo не гарантирует постоянную доступность сервиса и может временно ограничивать доступ для обслуживания, безопасности или улучшения платформы.",
                ],
            },
            {
                "heading": "7. Жалобы и модерация",
                "paragraphs": [
                    "Пользователи могут жаловаться на контент или поведение через инструменты жалоб на платформе.",
                    "Tatzo может удалить контент, ограничить его видимость, временно заблокировать функции или аккаунт при нарушении правил.",
                ],
            },
            {
                "heading": "8. Изменение условий",
                "paragraphs": [
                    "Tatzo может обновлять эти условия. При существенных изменениях пользователи будут уведомлены подходящим способом.",
                ],
            },
            {
                "heading": "9. Контакт",
                "paragraphs": [
                    "По вопросам условий использования: contact@tatzo.eu",
                ],
            },
        ],
    },

    "privacy": {
        "title": "Политика конфиденциальности",
        "updated": "2 июля 2026",
        "sections": [
            {
                "heading": "1. Ответственный за обработку данных",
                "paragraphs": [
                    "Ответственным за обработку данных является Tatzo, представленный Владимиром Прокопишиным.",
                    "Контакт по вопросам конфиденциальности: privacy@tatzo.eu",
                ],
            },
            {
                "heading": "2. Какие данные собираются",
                "paragraphs": [
                    "Tatzo может собирать имя пользователя, email, зашифрованный пароль, тип аккаунта, фото профиля, биографию, публикации, комментарии, сообщения, загруженные файлы, документы верификации тату-мастеров, жалобы, языковые предпочтения и технические данные безопасности.",
                    "Tatzo не запрашивает чувствительные данные, кроме случаев, когда пользователь сам публикует их в профиле, сообщениях или контенте.",
                ],
            },
            {
                "heading": "3. Для чего используются данные",
                "paragraphs": [
                    "Данные используются для создания и управления аккаунтами, отображения профилей, публикации контента, работы сообщений, модерации, проверки аккаунтов мастеров, безопасности, предотвращения злоупотреблений и ответа на запросы пользователей.",
                ],
            },
            {
                "heading": "4. Правовые основания",
                "paragraphs": [
                    "Обработка данных может основываться на выполнении договора, законном интересе Tatzo в обеспечении безопасности и улучшении платформы, согласии пользователя или выполнении юридических обязанностей.",
                ],
            },
            {
                "heading": "5. Срок хранения",
                "paragraphs": [
                    "Данные аккаунта хранятся, пока аккаунт существует.",
                    "Публикации и медиа хранятся, пока они остаются онлайн или до удаления.",
                    "Документы верификации хранятся только столько, сколько необходимо для проверки и безопасности.",
                    "Технические логи могут временно храниться для диагностики, безопасности и предотвращения злоупотреблений.",
                ],
            },
            {
                "heading": "6. Технические поставщики",
                "paragraphs": [
                    "Tatzo может использовать технических поставщиков для хостинга, базы данных, email-рассылок, хранения медиа и безопасности.",
                    "На текущем этапе используются Render для хостинга и PostgreSQL, Cloudinary для медиа и email-поставщик для транзакционных писем.",
                ],
            },
            {
                "heading": "7. Права пользователей",
                "paragraphs": [
                    "В соответствии с RGPD/GDPR пользователи могут запросить доступ, исправление, удаление, ограничение обработки, возражение или переносимость своих данных.",
                    "Для реализации прав: privacy@tatzo.eu",
                    "Пользователь также может обратиться в CNIL.",
                ],
            },
            {
                "heading": "8. Безопасность",
                "paragraphs": [
                    "Tatzo применяет разумные меры защиты: хеширование паролей, ограничение злоупотреблений, подтверждение email, контроль доступа, модерацию и технический мониторинг.",
                ],
            },
        ],
    },

    "cookies": {
        "title": "Политика cookies",
        "updated": "2 июля 2026",
        "sections": [
            {
                "heading": "1. Что такое cookie",
                "paragraphs": [
                    "Cookie — это небольшой файл, который сохраняется на устройстве пользователя при посещении сайта.",
                ],
            },
            {
                "heading": "2. Cookies, используемые Tatzo",
                "paragraphs": [
                    "Tatzo использует необходимые cookies для работы сайта: пользовательская сессия, защита CSRF, вход в аккаунт и языковые предпочтения.",
                    "Эти cookies нужны для нормальной работы платформы.",
                ],
            },
            {
                "heading": "3. Аналитика и реклама",
                "paragraphs": [
                    "На текущем этапе Tatzo не использует сторонние рекламные cookies и внешний маркетинговый трекинг.",
                    "Если позже будут добавлены инструменты аналитики, рекламы или трекинга, будет добавлено управление согласием.",
                ],
            },
            {
                "heading": "4. Управление cookies",
                "paragraphs": [
                    "Пользователь может управлять cookies через настройки браузера.",
                    "Отключение необходимых cookies может нарушить работу входа в аккаунт и некоторых функций.",
                ],
            },
        ],
    },

    "community-guidelines": {
        "title": "Правила сообщества",
        "updated": "2 июля 2026",
        "sections": [
            {
                "heading": "1. Уважение",
                "paragraphs": [
                    "Tatzo должен оставаться уважительным пространством для пользователей, тату-мастеров и любителей татуировки.",
                    "Запрещены преследование, угрозы, оскорбления, унижения, дискриминация и агрессивное поведение.",
                ],
            },
            {
                "heading": "2. Разрешённый контент",
                "paragraphs": [
                    "Пользователи могут публиковать фотографии татуировок, вдохновение, flash-эскизы, портфолио, вопросы, опыт и другой контент, связанный с татуировкой.",
                ],
            },
            {
                "heading": "3. Запрещённый контент",
                "paragraphs": [
                    "Запрещены ненависть, преследование, незаконный контент, мошенничество, спам, выдача себя за другого человека, публикация личных данных, украденный контент и материалы без необходимых прав.",
                ],
            },
            {
                "heading": "4. Интеллектуальная собственность",
                "paragraphs": [
                    "Не публикуйте работу другого мастера как свою.",
                    "Эскизы, flash, фотографии и защищённые работы можно публиковать только при наличии необходимых прав.",
                ],
            },
            {
                "heading": "5. Жалобы",
                "paragraphs": [
                    "Пользователи могут пожаловаться на пост, комментарий, сообщение или проблему через инструменты жалоб.",
                    "Злоупотребление жалобами может привести к ограничениям.",
                ],
            },
            {
                "heading": "6. Санкции",
                "paragraphs": [
                    "Tatzo может удалить контент, ограничить функции, временно заблокировать или удалить аккаунт в зависимости от серьёзности нарушения.",
                ],
            },
        ],
    },

    "legal-notice": {
        "title": "Правовая информация",
        "updated": "2 июля 2026",
        "sections": [
            {
                "heading": "1. Издатель сайта",
                "paragraphs": [
                    "Сайт: Tatzo",
                    "URL: https://tatzo.eu",
                    "Издатель: Vladimir Procopisin",
                    "Статус: уточнить",
                    "Адрес: уточнить",
                    "Email: contact@tatzo.eu",
                    "Регистрационный номер: уточнить, если применимо",
                    "Внутриевропейский НДС: уточнить, если применимо",
                ],
            },
            {
                "heading": "2. Директор публикации",
                "paragraphs": [
                    "Директор публикации: Vladimir Procopisin",
                ],
            },
            {
                "heading": "3. Хостинг",
                "paragraphs": [
                    "Сайт размещён на Render.",
                    "Render Services, Inc.",
                    "Адрес: уточнить по официальной информации Render.",
                    "Сайт: render.com",
                ],
            },
            {
                "heading": "4. Хранение медиа",
                "paragraphs": [
                    "Медиа, опубликованные на Tatzo, могут храниться через Cloudinary.",
                    "Cloudinary Ltd.",
                    "Сайт: cloudinary.com",
                ],
            },
            {
                "heading": "5. Интеллектуальная собственность",
                "paragraphs": [
                    "Название, логотип, интерфейс, тексты и графические элементы Tatzo защищены.",
                    "Контент пользователей остаётся под их ответственностью и собственностью, с учётом прав, предоставленных Tatzo для работы платформы.",
                ],
            },
        ],
    },
}

LEGAL_PAGES_EN = {
    "terms": {
        "title": "Terms of Use",
        "updated": "July 2, 2026",
        "sections": [
            {"heading": "1. Purpose", "paragraphs": ["Tatzo is a social platform for tattoo users, tattoo enthusiasts and tattoo artists. It allows users to create profiles, publish content, communicate, discover artists and present a portfolio.", "Using Tatzo means accepting these Terms of Use."]},
            {"heading": "2. User account", "paragraphs": ["Users agree to provide accurate information and keep their login credentials confidential.", "Tatzo may restrict, suspend or delete accounts in case of abuse, spam, impersonation, harassment or rule violations."]},
            {"heading": "3. Published content", "paragraphs": ["Users remain the owners of the content they publish on Tatzo.", "By publishing content, users grant Tatzo a non-exclusive, free license to host, display and technically distribute that content as part of the platform.", "Users confirm they have the necessary rights to the images, texts, videos and other materials they publish."]},
            {"heading": "4. Prohibited content", "paragraphs": ["Illegal, hateful, harassing, discriminatory, fraudulent, misleading, violent, spammy or rights-infringing content is prohibited.", "Tatzo may remove content, limit visibility or take action against an account when content violates the rules or the law."]},
            {"heading": "5. Tattoo artists and verification", "paragraphs": ["Tattoo artist accounts may be subject to verification before accessing professional features such as portfolio tools.", "Tatzo verification is not an official certification of diploma, insurance, authorization or professional quality."]},
            {"heading": "6. Liability", "paragraphs": ["Tatzo acts as a technical intermediary between users. Tattoo artists remain responsible for their services, prices, appointments, health standards and professional activity.", "Tatzo does not guarantee permanent availability and may temporarily interrupt access for maintenance, security or improvements."]},
            {"heading": "7. Reports and moderation", "paragraphs": ["Users can report content or behavior through the reporting tools available on the platform.", "Tatzo may remove content, limit visibility, restrict features or suspend accounts in case of violations."]},
            {"heading": "8. Changes", "paragraphs": ["Tatzo may update these Terms. Users will be informed appropriately in case of important changes."]},
            {"heading": "9. Contact", "paragraphs": ["For questions about these Terms: contact@tatzo.eu"]},
        ],
    },
    "privacy": {
        "title": "Privacy Policy",
        "updated": "July 2, 2026",
        "sections": [
            {"heading": "1. Data controller", "paragraphs": ["The data controller is Tatzo, represented by Vladimir Procopisin.", "Privacy contact: privacy@tatzo.eu"]},
            {"heading": "2. Data collected", "paragraphs": ["Tatzo may collect username, email address, encrypted password, account type, profile picture, biography, posts, comments, messages, uploaded files, tattoo artist verification documents, reports, language preferences and technical security data."]},
            {"heading": "3. Purposes", "paragraphs": ["Data is used to manage accounts, display profiles, publish content, enable messaging, moderate the platform, verify tattoo artists, ensure security, prevent abuse and respond to user requests."]},
            {"heading": "4. Legal bases", "paragraphs": ["Processing may be based on contract performance, Tatzo’s legitimate interest in securing and improving the platform, user consent where required, or legal obligations."]},
            {"heading": "5. Retention", "paragraphs": ["Account data is kept while the account exists.", "Published content is kept while it remains online or until deletion.", "Verification documents are kept only as long as necessary for review and security.", "Technical logs may be stored temporarily for security and diagnostics."]},
            {"heading": "6. Service providers", "paragraphs": ["Tatzo may use technical providers for hosting, database, email sending, media storage and security.", "At this stage, Tatzo uses Render, PostgreSQL, Cloudinary and an email provider for transactional emails."]},
            {"heading": "7. User rights", "paragraphs": ["Under GDPR, users may request access, rectification, erasure, restriction, objection or portability of their data.", "To exercise these rights: privacy@tatzo.eu"]},
            {"heading": "8. Security", "paragraphs": ["Tatzo applies reasonable protection measures, including password hashing, abuse limits, email verification, access controls, moderation and technical monitoring."]},
        ],
    },
    "cookies": {
        "title": "Cookie Policy",
        "updated": "July 2, 2026",
        "sections": [
            {"heading": "1. What is a cookie?", "paragraphs": ["A cookie is a small file stored on the user’s device while browsing a website."]},
            {"heading": "2. Cookies used by Tatzo", "paragraphs": ["Tatzo uses strictly necessary cookies for sessions, CSRF security, login and language preferences.", "These cookies are required for the platform to work correctly."]},
            {"heading": "3. Analytics and marketing", "paragraphs": ["At this stage, Tatzo does not use third-party advertising cookies or external marketing tracking.", "If analytics or advertising tools are added later, consent management will be added."]},
            {"heading": "4. Cookie management", "paragraphs": ["Users can manage cookies through their browser settings.", "Blocking necessary cookies may prevent login or some features from working correctly."]},
        ],
    },
    "community-guidelines": {
        "title": "Community Guidelines",
        "updated": "July 2, 2026",
        "sections": [
            {"heading": "1. Respect", "paragraphs": ["Tatzo must remain a respectful space for users, tattoo artists and tattoo enthusiasts.", "Harassment, threats, insults, humiliation, discrimination and abusive behavior are prohibited."]},
            {"heading": "2. Allowed content", "paragraphs": ["Users may publish tattoo photos, inspiration, flash designs, portfolios, questions, experiences and tattoo-related content."]},
            {"heading": "3. Prohibited content", "paragraphs": ["Hate, harassment, illegal content, scams, spam, impersonation, private data publication, stolen content and unauthorized material are prohibited."]},
            {"heading": "4. Intellectual property", "paragraphs": ["Do not publish another artist’s work as your own.", "Flash designs, drawings, photos and protected works may only be published if you have the necessary rights."]},
            {"heading": "5. Reports", "paragraphs": ["Users can report posts, comments, messages or problems through reporting tools.", "Abusive or false reports may lead to restrictions."]},
            {"heading": "6. Sanctions", "paragraphs": ["Tatzo may remove content, limit features, temporarily suspend or permanently delete an account depending on the seriousness of the violation."]},
        ],
    },
    "legal-notice": {
        "title": "Legal Notice",
        "updated": "July 2, 2026",
        "sections": [
            {"heading": "1. Website publisher", "paragraphs": ["Website: Tatzo", "URL: https://tatzo.eu", "Publisher: Vladimir Procopisin", "Status: to be completed", "Address: to be completed", "Email: contact@tatzo.eu", "Registration number: to be completed if applicable", "EU VAT number: to be completed if applicable"]},
            {"heading": "2. Publication director", "paragraphs": ["Publication director: Vladimir Procopisin"]},
            {"heading": "3. Hosting", "paragraphs": ["The website is hosted by Render.", "Render Services, Inc.", "Address: to be completed from Render official information.", "Website: render.com"]},
            {"heading": "4. Media storage", "paragraphs": ["Media published on Tatzo may be stored through Cloudinary.", "Cloudinary Ltd.", "Website: cloudinary.com"]},
            {"heading": "5. Intellectual property", "paragraphs": ["Tatzo’s name, logo, interface, texts and graphic elements are protected.", "User content remains under the user’s responsibility and ownership, subject to the rights granted to Tatzo for platform operation."]},
        ],
    },
}

LEGAL_PAGES_BY_LANGUAGE = {
    "fr": LEGAL_PAGES,
    "ru": LEGAL_PAGES_RU,
    "en": LEGAL_PAGES_EN,
}


def get_legal_pages():
    language_code = (get_language() or "en").split("-")[0]
    return LEGAL_PAGES_BY_LANGUAGE.get(language_code, LEGAL_PAGES_EN)


def get_legal_page(page_key):
    return get_legal_pages().get(page_key)