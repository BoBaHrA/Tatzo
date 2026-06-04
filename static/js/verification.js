document.addEventListener("DOMContentLoaded", function () {
    const form = document.querySelector(".verification-form");
    const submitButton = document.querySelector(".btn-submit");
    const verificationContainer = document.querySelector(".verification-container");

    if (!form || !submitButton || !verificationContainer) {
        return;
    }

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        submitButton.disabled = true;
        verificationContainer.style.pointerEvents = "none";
        verificationContainer.classList.add("hide-during-animation");

        const confirmationBox = document.getElementById("confirmation-animation");

        if (confirmationBox) {
            confirmationBox.classList.remove("hidden");
            confirmationBox.style.opacity = "1";
            confirmationBox.classList.add("animate");
        }

        const paper = document.querySelector(".paper");

        if (paper) {
            paper.classList.add("animate");
        }

        const overlay = document.getElementById("dark-overlay");

        if (overlay) {
            overlay.classList.remove("hidden");
            overlay.classList.add("show");
        }

        setTimeout(() => {
            window.location.href = "/";
        }, 3000);
    });
});

document.addEventListener("DOMContentLoaded", function () {
    const fileInputs = document.querySelectorAll('input[type="file"]');

    fileInputs.forEach((input) => {
        const label = input.previousElementSibling;

        if (!label) {
            return;
        }

        if (!label.dataset.defaultText) {
            label.dataset.defaultText = label.textContent.trim();
        }

        input.addEventListener("change", function () {
            const selectedText = label.dataset.selectedText || "File uploaded ✅";
            const defaultText = label.dataset.defaultText || "Choose file";

            if (this.files.length > 0) {
                label.textContent = selectedText;
                label.classList.add("file-selected");
            } else {
                label.textContent = defaultText;
                label.classList.remove("file-selected");
            }
        });
    });
});