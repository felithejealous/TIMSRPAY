const optionCards = document.querySelectorAll(".option-card");
const nextBtn = document.getElementById("nextBtn");

let selectedTarget = null;
let selectedPaymentMode = null;

function showToast(text) {
    const msg = document.createElement("div");
    msg.className = "toast";
    msg.innerText = text;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 2500);
}

function resetPendingCheckoutState() {
    localStorage.removeItem("latest_order_id");
    localStorage.removeItem("latest_order_payment_method");
    localStorage.removeItem("customerName");
    localStorage.removeItem("walletEmail");
    localStorage.removeItem("walletCode");
    localStorage.removeItem("cardHolderName");
}

function handleOptionSelect(card) {
    optionCards.forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");

    selectedTarget = card.getAttribute("data-target") || "";
    selectedPaymentMode = selectedTarget.includes("teopaycardid") ? "wallet" : "cash";

    localStorage.setItem("kiosk_payment_mode", selectedPaymentMode);
    localStorage.setItem("paymentMethod", selectedPaymentMode === "wallet" ? "TeoPay" : "Counter");

    nextBtn.classList.add("active");
}

function handleNext() {
    const tray = JSON.parse(localStorage.getItem("teo_tray") || "[]");

    if (!tray.length) {
        showToast("Your tray is empty");
        return;
    }

    if (!selectedTarget) {
        showToast("Please select a payment mode first");
        return;
    }

    window.location.href = selectedTarget;
}

function initPaymentOptionPage() {
    resetPendingCheckoutState();

    optionCards.forEach(card => {
        card.addEventListener("click", () => handleOptionSelect(card));
    });

    nextBtn?.addEventListener("click", handleNext);
}

window.addEventListener("DOMContentLoaded", initPaymentOptionPage);