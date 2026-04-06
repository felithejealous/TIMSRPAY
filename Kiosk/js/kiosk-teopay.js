const API_URL = window.API_URL || "http://127.0.0.1:8000";

let currentMode = "";
let phase = "selectionPhase";
let isShift = true;
let isAlt = false;
let pinCode = "";
let isSubmitting = false;

const pageTitle = document.getElementById("pageTitle");
const input = document.getElementById("loginInput");
const layout = document.getElementById("keyboardLayout");
const keyboard = document.getElementById("keyboard");
const errorModal = document.getElementById("errorModal");
const errorTitle = document.getElementById("errorTitle");
const errorMessage = document.getElementById("errorMessage");
const errorOkBtn = document.getElementById("errorOkBtn");
const pinContainer = document.getElementById("pinContainer");
const backBtn = document.getElementById("backBtn");

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

function switchUI(targetPhase) {
    document.querySelectorAll(".ui-phase, .verifying-content, .success-content").forEach(p => {
        p.style.display = "none";
    });

    const target = document.getElementById(targetPhase);
    if (target) {
        target.style.display = "flex";
    }

    phase = targetPhase;
}

function sanitizeInputValue(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function openError(title, message) {
    errorTitle.innerText = title || "Payment Error";
    errorMessage.innerText = message || "Something went wrong.";
    errorModal.style.display = "flex";
}

function closeError() {
    errorModal.style.display = "none";
    if (phase === "pinPhase") {
        pinCode = "";
        updatePinDots();
        validate();
    }
}

function handleBack() {
    if (isSubmitting) return;

    if (phase === "inputPhase") {
        switchUI("selectionPhase");
        pageTitle.innerText = "Choose Login";
        input.value = "";
        pinCode = "";
        currentMode = "";
        keyboard.style.display = "none";
        document.body.classList.remove("kb-active");
        return;
    }

    if (phase === "pinPhase") {
        switchUI("inputPhase");
        pageTitle.innerText = currentMode === "email" ? "LOGIN VIA EMAIL" : "LOGIN VIA WALLET CODE";
        pinCode = "";
        updatePinDots();
        renderKeyboard();
        return;
    }

    history.back();
}

function startLogin(mode) {
    currentMode = mode;
    input.value = "";
    pinCode = "";
    isAlt = false;
    isShift = true;

    switchUI("inputPhase");

    switchUI("inputPhase");
    pageTitle.innerText = mode === "email" ? "LOGIN VIA EMAIL" : "LOGIN VIA WALLET CODE";

    document.getElementById("inputHint").innerText =
        mode === "email" ? "Input registered email" : "Input 6-character wallet code";

    renderKeyboard();
    keyboard.style.display = "flex";
    document.body.classList.add("kb-active");
}

function createKey(label, cls = "", fn = null, flex = 1) {
    const key = document.createElement("div");
    key.className = `key ${cls}`.trim();
    key.innerText = label;
    key.style.flex = String(flex);
    key.onclick = fn || (() => type(label));
    if (label === "OK") key.id = "okBtn";
    return key;
}

function renderKeyboard() {
    layout.innerHTML = "";

    const isNumeric = phase === "pinPhase";

    if (!isNumeric) {
        const rows = isAlt
            ? [
                ["1","2","3","4","5","6","7","8","9","0"],
                ["-","_",".","@"]
            ]
            : [
                ["Q","W","E","R","T","Y","U","I","O","P"],
                ["A","S","D","F","G","H","J","K","L"],
                ["Z","X","C","V","B","N","M"]
            ];

        rows.forEach(row => {
            const rowDiv = document.createElement("div");
            rowDiv.className = "kb-row";
            row.forEach(key => {
                rowDiv.appendChild(createKey(isShift || isAlt ? key : key.toLowerCase()));
            });
            layout.appendChild(rowDiv);
        });

        const last = document.createElement("div");
        last.className = "kb-row";

        last.appendChild(createKey(isAlt ? "ABC" : "123", "action", () => {
            isAlt = !isAlt;
            renderKeyboard();
        }));

        last.appendChild(createKey("SPACE", "", () => type(" "), 2));
        last.appendChild(createKey("⌫", "action", del));
        last.appendChild(createKey("OK", "done", nextPhase, 1.2));

        layout.appendChild(last);
    } else {
        [["1","2","3"],["4","5","6"],["7","8","9"],["0"]].forEach(row => {
            const rowDiv = document.createElement("div");
            rowDiv.className = "kb-row";

            row.forEach(key => rowDiv.appendChild(createKey(key)));

            if (row[0] === "0") {
                rowDiv.appendChild(createKey("⌫", "action", del));
                rowDiv.appendChild(createKey("OK", "done", nextPhase));
            }

            layout.appendChild(rowDiv);
        });
    }

    validate();
}
function type(char) {
    if (isSubmitting) return;

    if (phase === "pinPhase") {
        if (pinCode.length < 6 && /^\d$/.test(char)) {
            pinCode += char;
            updatePinDots();
        }
    } else {
        const currentValue = input.value;

        if (currentMode === "card") {
            if (currentValue.length >= 6) return;

            if (!/^[a-zA-Z0-9]$/.test(char)) return;

            input.value += char.toUpperCase();
        } else {
            input.value += char;
        }

        adjustFont();
    }

    validate();
}

function del() {
    if (isSubmitting) return;

    if (phase === "pinPhase") {
        pinCode = pinCode.slice(0, -1);
        updatePinDots();
    } else {
        input.value = input.value.slice(0, -1);
        adjustFont();
    }

    validate();
}

function updatePinDots() {
    const dots = document.querySelectorAll(".pin-dot");
    dots.forEach((dot, index) => {
        dot.classList.toggle("filled", index < pinCode.length);
    });
}

function adjustFont() {
    const len = input.value.length;
    input.style.fontSize = len > 25 ? "1rem" : len > 15 ? "1.3rem" : "1.8rem";
}

function validate() {
    const btn = document.getElementById("okBtn");
    if (!btn) return;

    let ok = false;
    const cleanValue = sanitizeInputValue(input.value);

    if (phase === "pinPhase") {
        ok = pinCode.length >= 4 && pinCode.length <= 6;
    } else if (currentMode === "card") {
        ok = /^[A-Z0-9]{6}$/i.test(cleanValue);
    } else {
        ok = cleanValue.includes("@");
    }

    btn.classList.toggle("ready", ok && !isSubmitting);
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

async function createWalletKioskOrder() {
    const tray = getTray();
    if (!tray.length) {
        throw new Error("Your tray is empty.");
    }

    const identifier = sanitizeInputValue(input.value);
    const payload = {
        order_type: "kiosk",
        payment_method: "wallet",
        customer_name: "TeoPay Customer",
        wallet_pin: pinCode,
        items: buildOrderItemsFromTray(tray)
    };

    if (currentMode === "email") {
        payload.wallet_email = identifier.toLowerCase();
    } else {
        payload.wallet_code = identifier.toUpperCase();
    }

    const result = await fetchJSON(`${API_URL}/orders/kiosk`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (result?.customer_name) {
        localStorage.setItem("latest_order_customer_name", result.customer_name);
    }

    return result;
}

async function nextPhase() {
    if (isSubmitting) return;

    if (phase === "inputPhase") {
        switchUI("pinPhase");
        pageTitle.innerText = "VERIFICATION";
        renderKeyboard();
        return;
    }

    try {
        isSubmitting = true;
        validate();

        keyboard.style.display = "none";
        document.body.classList.remove("kb-active");
        switchUI("verifyingPhase");
        pageTitle.style.display = "none";

        const result = await createWalletKioskOrder();

        const identifier = sanitizeInputValue(input.value);
        if (currentMode === "email") {
            localStorage.setItem("walletEmail", identifier.toLowerCase());
        } else {
            localStorage.setItem("walletCode", identifier.toUpperCase());
        }

        localStorage.setItem("latest_order_id", String(result.order_id));
        localStorage.setItem("latest_order_payment_method", "wallet");
        localStorage.setItem("kiosk_payment_mode", "wallet");

        switchUI("authorizedPhase");

        setTimeout(() => {
            window.location.href = "receipt.html";
        }, 1500);
    } catch (error) {
        isSubmitting = false;
        pageTitle.style.display = "block";
        switchUI("pinPhase");
        renderKeyboard();
        keyboard.style.display = "flex";
        document.body.classList.add("kb-active");

        pinContainer.classList.add("shake");
        setTimeout(() => pinContainer.classList.remove("shake"), 400);

        openError("Payment Error", error.message || "Failed to process TeoPay payment.");
    }
}

function initTeoPayPage() {
    document.getElementById("emailLoginCard")?.addEventListener("click", () => startLogin("email"));
    document.getElementById("cardLoginCard")?.addEventListener("click", () => startLogin("card"));
    errorOkBtn?.addEventListener("click", closeError);
    backBtn?.addEventListener("click", handleBack);

    const tray = getTray();
    if (!tray.length) {
        openError("Empty Tray", "Your tray is empty. Please add items first.");
    }
}

window.addEventListener("DOMContentLoaded", initTeoPayPage);