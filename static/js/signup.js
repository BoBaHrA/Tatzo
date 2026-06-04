document.addEventListener("DOMContentLoaded", function () {
    const passwordInput = document.getElementById("password1");
    const hint = document.getElementById("password-hint");

    if (!passwordInput || !hint) {
        return;
    }

    passwordInput.addEventListener("focus", () => {
        hint.style.display = "block";
    });

    passwordInput.addEventListener("blur", () => {
        hint.style.display = "none";
    });
});