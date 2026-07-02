document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-password-toggle]");
    if (!button) return;

    const wrapper = button.closest(".password-input-wrap");
    const input = wrapper?.querySelector("input");
    const icon = button.querySelector(".password-toggle-icon");

    if (!input || !icon) return;

    const isHidden = input.type === "password";

    if (isHidden) {
        // пароль был скрыт -> показываем
        input.type = "text";
        icon.src = button.dataset.closedIcon;
        icon.alt = button.dataset.hideLabel || "Hide password";
        button.setAttribute("aria-label", button.dataset.hideLabel || "Hide password");
        button.classList.add("is-visible");
    } else {
        // пароль был виден -> скрываем
        input.type = "password";
        icon.src = button.dataset.openIcon;
        icon.alt = button.dataset.showLabel || "Show password";
        button.setAttribute("aria-label", button.dataset.showLabel || "Show password");
        button.classList.remove("is-visible");
    }
});