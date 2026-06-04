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
    const fileInputs = document.querySelectorAll('.tatzo-file-upload input[type="file"]');

    fileInputs.forEach((input) => {
        const wrapper = input.closest(".tatzo-file-upload");
        const button = wrapper?.querySelector(".tatzo-file-button");
        const fileName = wrapper?.querySelector(".tatzo-file-name");

        if (!wrapper || !button || !fileName) {
            return;
        }

        const defaultButtonText = button.dataset.defaultText || button.textContent.trim();
        const selectedButtonText = button.dataset.selectedText || defaultButtonText;
        const emptyFileText = fileName.dataset.emptyText || fileName.textContent.trim();

        input.addEventListener("change", function () {
            if (this.files.length > 0) {
                const names = Array.from(this.files).map((file) => file.name);

                button.textContent = selectedButtonText;
                fileName.textContent =
                    names.length === 1
                        ? names[0]
                        : `${names[0]} +${names.length - 1}`;

                wrapper.classList.add("file-selected");
            } else {
                button.textContent = defaultButtonText;
                fileName.textContent = emptyFileText;
                wrapper.classList.remove("file-selected");
            }
        });
    });
});