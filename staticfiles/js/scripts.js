window.onload = function() {
    var notificationModal = document.getElementById("notificationModal");
    if (notificationModal) {
        var closeButton = document.querySelector(".close");
        if (closeButton) {
            closeButton.addEventListener("click", closeModal);
        }
    }
}

function closeModal() {
    var modal = document.getElementById("notificationModal");
    modal.style.display = "none";
}
