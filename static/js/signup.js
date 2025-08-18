document.addEventListener("DOMContentLoaded", function () {
    const passwordInput = document.getElementById("password1");
    const hint = document.getElementById("password-hint");

    passwordInput.addEventListener("focus", () => {
        hint.style.display = "block";
    });

    passwordInput.addEventListener("blur", () => {
        hint.style.display = "none";
    });
});
