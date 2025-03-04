console.log("✅ JS загружен и выполняется!");

document.addEventListener("DOMContentLoaded", function () {
    const form = document.querySelector(".verification-form");
    const submitButton = document.querySelector(".btn-submit");

    if (form) {
        form.addEventListener("submit", function (event) {
            console.log("📩 Форма отправлена, запускаем анимацию!");

            event.preventDefault(); // Останавливаем стандартную отправку формы
            submitButton.disabled = true;

            const confirmationBox = document.getElementById("confirmation-animation");
            console.log("🖼️ Показываем контейнер анимации!");

            confirmationBox.classList.remove("hidden");
            confirmationBox.style.opacity = "1";
            confirmationBox.classList.add("animate"); // Добавляем класс анимации

            const paper = document.querySelector(".paper");
            if (paper) {
                paper.classList.add("animate");
                paper.style.opacity = "1";
                paper.style.transform = "scale(1)";
                console.log("📜 Лист бумаги появился!");
            } else {
                console.log("⚠️ Ошибка: лист бумаги не найден!");
            }

            console.log("✅ Запускаем анимацию рисования галочки!");
            drawCheckmark(); // Запускаем рисование галочки

            // После завершения анимации отправляем форму
            setTimeout(() => {
                console.log("📤 Отправка формы после анимации");
                confirmationBox.classList.add("animate"); // 🔄 Включаем кликабельность
                form.submit();
            }, 3000);
        });
    } else {
        console.log("⚠️ Ошибка: форма не найдена!");
    }
});

// Функция рисования галочки
function drawCheckmark() {
    console.log("🖌 Начинаем рисование галочки");

    const canvas = document.getElementById("drawCanvas");
    if (!canvas) {
        console.log("⚠️ Ошибка: canvas не найден!");
        return;
    }

    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#04c5bf";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";

    let progress = 0;
    const checkPoints = [
        { x: 50, y: 100 },
        { x: 80, y: 150 },
        { x: 130, y: 60 }
    ];

    function draw() {
        if (progress < checkPoints.length - 1) {
            ctx.beginPath();
            ctx.moveTo(checkPoints[progress].x, checkPoints[progress].y);
            ctx.lineTo(checkPoints[progress + 1].x, checkPoints[progress + 1].y);
            ctx.stroke();

            progress++;
            setTimeout(draw, 500);
        }
    }

    draw();
    console.log("📜 Бумага должна стать видимой!");

    setTimeout(() => {
        const checkmark = document.querySelector(".checkmark");
        if (checkmark) {
            checkmark.classList.add("animate");
            console.log("✅ Галочка появилась!");
        } else {
            console.log("⚠️ Ошибка: галочка не найдена!");
        }
    }, 1500);
}
