console.log("✅ JS загружен и выполняется!");

document.addEventListener("DOMContentLoaded", function () {
    const form = document.querySelector(".verification-form");
    const submitButton = document.querySelector(".btn-submit");
    const verificationContainer = document.querySelector(".verification-container");

    if (form) {
        form.addEventListener("submit", function (event) {
            console.log("📩 Форма отправлена, запускаем анимацию!");

            event.preventDefault(); // Останавливаем стандартную отправку формы
            submitButton.disabled = true;

            // Отключаем кликабельность всей формы и скрываем кнопки
            verificationContainer.style.pointerEvents = "none";
            verificationContainer.classList.add("hide-during-animation");

            const confirmationBox = document.getElementById("confirmation-animation");
            console.log("🖼️ Показываем контейнер анимации!");
            confirmationBox.classList.remove("hidden");
            confirmationBox.style.opacity = "1";
            confirmationBox.classList.add("animate");

            // Показываем бумагу
            const paper = document.querySelector(".paper");
            if (paper) {
                console.log("📜 Бумага найдена! Запускаем анимацию.");
                paper.classList.add("animate");
            } else {
                console.log("⚠️ Ошибка: бумага не найдена!");
            }

            const overlay = document.getElementById("dark-overlay");
            overlay.classList.remove("hidden");
            overlay.classList.add("show");



            // ⏳ Переадресация после завершения анимации
            setTimeout(() => {
                console.log("📤 Анимация завершена — можно перенаправлять пользователя.");
                window.location.href = "/"; // или другая нужная страница
            }, 3000); // Ожидание окончания анимации
        });
    } else {
        console.log("⚠️ Ошибка: форма не найдена!");
    }
});

document.addEventListener("DOMContentLoaded", function () {
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
        input.addEventListener("change", function () {
            const label = this.previousElementSibling;
            if (this.files.length > 0) {
                label.textContent = "Файл загружен ✅";
                label.classList.add("file-selected");
            } else {
                label.textContent = "Выберите файл";
                label.classList.remove("file-selected");
            }
        });
    });
});

