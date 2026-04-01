const API_URL = window.API_URL || "http://127.0.0.1:8000";

const input = document.getElementById("customerName");
const kb = document.getElementById("keyboard");
const doneBtn = document.getElementById("doneBtn");
const overlay = document.getElementById("successOverlay");
const backBtn = document.getElementById("backBtn");
const errorModal = document.getElementById("errorModal");
const modalTitle = document.getElementById("modalTitle");
const modalMessage = document.getElementById("modalMessage");
const modalOkBtn = document.getElementById("modalOkBtn");

let isSubmitting = false;

function getTray() {
    try {
        return JSON.parse(localStorage.getItem("teo_tray")) || [];
    } catch {
        return [];
    }
}

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        ...options
    });

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        throw new Error(data?.detail || data?.message || `Request failed: ${response.status}`);
    }

    return data;
}

function showError(title, message) {
    modalTitle.innerText = title || "Order Error";
    modalMessage.innerText = message || "Something went wrong.";
    errorModal.style.display = "flex";
}

function closeError() {
    errorModal.style.display = "none";
}

function updateBtnState() {
    const valid = input.value.trim().length >= 2 && !isSubmitting;
    doneBtn.classList.toggle("ready", valid);
}

function openKeyboard() {
    kb.classList.add("show");
    document.body.classList.add("keyboard-open");
}

function closeKeyboard() {
    kb.classList.remove("show");
    document.body.classList.remove("keyboard-open");
}

function type(char) {
    if (isSubmitting) return;
    input.value += char;
    updateBtnState();
}

function del() {
    if (isSubmitting) return;
    input.value = input.value.slice(0, -1);
    updateBtnState();
}

function sanitizeName(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function buildOrderItemsFromTray(tray) {
    return tray.map(item => ({
        product_id: Number(item.productId),
        quantity: Number(item.qty || 1),
        size: String(item.size || "Small").toLowerCase(),
        add_ons: Array.isArray(item.addOnIds) ? item.addOnIds.map(Number) : [],
        notes: item.notes ? String(item.notes).trim() : null
    }));
}

async function createCashKioskOrder(customerName) {
    const tray = getTray();

    if (!tray.length) {
        throw new Error("Your tray is empty.");
    }

    const payload = {
        order_type: "kiosk",
        payment_method: "cash",
        customer_name: customerName,
        items: buildOrderItemsFromTray(tray)
    };

    return await fetchJSON(`${API_URL}/orders/kiosk`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
}

async function processOrder() {
    if (isSubmitting) return;

    const customerName = sanitizeName(input.value);
    if (customerName.length < 2) {
        showError("Invalid Name", "Please enter at least 2 characters for the customer name.");
        return;
    }

    try {
        isSubmitting = true;
        updateBtnState();
        closeKeyboard();

        overlay.classList.add("active");

        const result = await createCashKioskOrder(customerName);

        localStorage.setItem("customerName", customerName);
        localStorage.setItem("latest_order_id", String(result.order_id));
        localStorage.setItem("latest_order_payment_method", "cash");
        localStorage.setItem("kiosk_payment_mode", "cash");

        window.location.href = "receipt.html";
    } catch (error) {
        overlay.classList.remove("active");
        isSubmitting = false;
        updateBtnState();
        showError("Order Error", error.message || "Failed to create kiosk order.");
    }
}

function handleBack() {
    if (isSubmitting) return;
    history.back();
}

function initCounterPage() {
    modalOkBtn?.addEventListener("click", closeError);
    backBtn?.addEventListener("click", handleBack);

    input?.addEventListener("click", (e) => {
        e.stopPropagation();
        openKeyboard();
    });

    doneBtn?.addEventListener("click", processOrder);

    document.addEventListener("click", (e) => {
        if (!kb.contains(e.target) && e.target !== input) {
            closeKeyboard();
        }
    });

    const tray = getTray();
    if (!tray.length) {
        showError("Empty Tray", "Your tray is empty. Please add items first.");
    }

    updateBtnState();
}

window.type = type;
window.del = del;

window.addEventListener("DOMContentLoaded", initCounterPage);