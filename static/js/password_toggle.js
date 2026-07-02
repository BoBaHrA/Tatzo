document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-password-toggle]");

    if (!button) {
        return;
    }

    event.preventDefault();

    const wrapper = button.closest(".password-input-wrap");
    const input = wrapper?.querySelector("input");
    const icon = button.querySelector(".password-toggle-icon");

    if (!input || !icon) {
        return;
    }

    const shouldShow = input.type === "password";

    input.type = shouldShow ? "text" : "password";

    icon.src = shouldShow
        ? button.dataset.closedIcon
        : button.dataset.openIcon;

    icon.alt = shouldShow
        ? button.dataset.hideLabel || "Hide password"
        : button.dataset.showLabel || "Show password";

    button.setAttribute(
        "aria-label",
        shouldShow
            ? button.dataset.hideLabel || "Hide password"
            : button.dataset.showLabel || "Show password"
    );

    button.classList.toggle("is-visible", shouldShow);
});