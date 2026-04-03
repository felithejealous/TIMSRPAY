let currentTopupUser = null;
let forgotPinCooldownTimer = null;
let forgotPinCooldownEnd = 0;

/* =========================
   BASIC HELPERS
========================= */

function getUserInitials(fullName) {
    if (!fullName) return "USR";
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const initials = parts.map(part => part[0].toUpperCase()).join("");
    return initials.slice(0, 3);
}

function formatWalletDisplay(walletCode) {
    if (!walletCode) return "NO WALLET";

    const clean = String(walletCode).replace(/[^A-Z0-9]/gi, "").toUpperCase();

    if (clean.length <= 6) {
        return `${clean.slice(0, 3)} ${clean.slice(3)}`;
    }

    const groups = clean.match(/.{1,3}/g);
    return groups ? groups.join(" ") : clean;
}

function getCurrentTimestamp() {
    const now = new Date();

    const date = now.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });

    const time = now.toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });

    return `${date} • ${time}`;
}

function showToast(message, isError = false) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.style.background = isError ? "#b00020" : "#111";
    toast.classList.add("show");

    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

/* =========================
   PAGE UI
========================= */

function renderStoreQr(walletCode) {
    const qrContainer = document.getElementById("qrcode");
    if (!qrContainer) return;

    qrContainer.innerHTML = "";

    if (!walletCode) {
        qrContainer.innerHTML = "<p style='color:var(--text-muted);font-weight:700'>No wallet code</p>";
        return;
    }

    if (window.QRCode) {
        new QRCode(qrContainer, {
            text: String(walletCode),
            width: 180,
            height: 180
        });
    }
}

function updateTopupPageUI({ user, walletBalance }) {
    const fullName =
        user.full_name ||
        user.name ||
        user.username ||
        user.email ||
        "User";

    const walletCode = user.wallet_code || null;

    const holderEls = document.querySelectorAll(".holder-name");
    const cardNumEls = document.querySelectorAll(".card-num");
    const balanceEl = document.getElementById("displayBalance");
    const qrLabel = document.getElementById("qrLabel");
    const lastUpdatedEl = document.getElementById("lastUpdated");

    const displayWallet = formatWalletDisplay(walletCode);

    holderEls.forEach(el => {
        el.textContent = fullName.toUpperCase();
    });

    cardNumEls.forEach(el => {
        el.textContent = displayWallet;
    });

    if (balanceEl) {
        balanceEl.innerHTML = `<span class="balance-currency">₱</span>${Number(walletBalance || 0).toFixed(2)}`;
    }

    if (qrLabel) {
        qrLabel.textContent = walletCode || "NO-WALLET";
    }

    if (lastUpdatedEl) {
        lastUpdatedEl.textContent = `Updated ${getCurrentTimestamp()}`;
    }

    renderStoreQr(walletCode);
}

/* =========================
   HISTORY
========================= */

async function openHistory() {
    openModal("historyModal");
    await loadHistory("month");
}

async function loadHistory(range) {
    const container = document.getElementById("historyContainer");
    if (!container) return;

    container.innerHTML = "<p>Loading...</p>";

    try {
        const { res, data } = await apiGet(`/wallet/history?range=${encodeURIComponent(range)}`);

        if (!res.ok) {
            throw new Error(data?.detail || "Failed to load history");
        }

        if (!data.transactions || data.transactions.length === 0) {
            container.innerHTML = "<p>No top-up transactions found.</p>";
            return;
        }

        container.innerHTML = data.transactions.map(tx => {
            const date = tx.created_at
                ? new Date(tx.created_at).toLocaleString("en-PH")
                : "No date";

            return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);gap:12px;">
                    <div style="text-align:left;">
                        <strong>Top-Up</strong><br>
                        <small style="color:var(--text-muted);">${date}</small>
                    </div>
                    <div style="color:var(--mango);font-weight:900;white-space:nowrap;">
                        +₱${Number(tx.amount || 0).toFixed(2)}
                    </div>
                </div>
            `;
        }).join("");
    } catch (err) {
        console.error("History error:", err);
        container.innerHTML = "<p>Failed to load history.</p>";
    }
}

/* =========================
   MODALS
========================= */

function openModal(id) {
    const modal = document.getElementById(id);
    const overlay = document.getElementById("mainOverlay");

    if (modal) modal.classList.add("active");
    if (overlay) overlay.classList.add("active");

    document.body.style.overflow = "hidden";
}

function closeModal(id) {
    const modal = document.getElementById(id);
    const overlay = document.getElementById("mainOverlay");

    if (modal) modal.classList.remove("active");
    if (overlay) overlay.classList.remove("active");

    document.body.style.overflow = "auto";
}

function closeAll() {
    document.querySelectorAll(".modal-overlay").forEach(modal => {
        modal.classList.remove("active");
    });

    const panel = document.getElementById("accountPanel");
    if (panel) panel.classList.remove("active");

    document.body.style.overflow = "auto";
}

window.openModal = openModal;
window.closeModal = closeModal;
window.closeAll = closeAll;
window.openHistory = openHistory;
window.loadHistory = loadHistory;

/* =========================
   PIN INPUT HELPERS
========================= */

function getPinValues(containerSelector) {
    const inputs = document.querySelectorAll(`${containerSelector} .pin-box`);
    return Array.from(inputs).map(input => input.value.trim()).join("");
}

function clearPinInputs(containerSelector) {
    const inputs = document.querySelectorAll(`${containerSelector} .pin-box`);
    inputs.forEach(input => {
        input.value = "";
    });

    if (inputs.length) {
        inputs[0].focus();
    }
}

function moveToNext(input, event) {
    const parent = input.closest(".pin-container");
    if (!parent) return;

    const inputs = Array.from(parent.querySelectorAll(".pin-box"));
    const index = inputs.indexOf(input);

    if (event.key === "Backspace") {
        if (!input.value && index > 0) {
            inputs[index - 1].focus();
        }
        return;
    }

    if (input.value.length === 1 && index < inputs.length - 1) {
        inputs[index + 1].focus();
    }
}

window.moveToNext = moveToNext;

/* =========================
   PIN STATUS / SET / VERIFY
========================= */

async function fetchPinStatus() {
    const { res, data } = await apiGet("/wallet/pin-status");

    if (!res.ok) {
        throw new Error(data?.detail || "Failed to fetch PIN status");
    }

    return !!data.has_pin;
}

async function handlePinClick() {
    try {
        const hasPin = await fetchPinStatus();

        if (hasPin) {
            clearPinInputs("#verifyPinModal");
            openModal("verifyPinModal");
        } else {
            clearPinInputs("#setPinModal");
            openModal("setPinModal");
        }
    } catch (err) {
        console.error("PIN status error:", err);
        showToast("Failed to check PIN status.", true);
    }
}

window.handlePinClick = handlePinClick;

async function savePin() {
    const pin = getPinValues("#setPinModal");

    if (!/^\d{4,6}$/.test(pin)) {
        showToast("PIN must be 4 to 6 digits.", true);
        return;
    }

    try {
        const { res, data } = await apiPost("/wallet/set-pin", { pin });

        if (!res.ok) {
            throw new Error(data?.detail || "Failed to set PIN");
        }

        showToast("PIN set successfully.");
        clearPinInputs("#setPinModal");
        closeModal("setPinModal");
    } catch (err) {
        console.error("Set PIN error:", err);
        showToast(err.message || "Failed to set PIN.", true);
    }
}

window.savePin = savePin;

async function verifyPIN() {
    const pin = getPinValues("#verifyPinModal");

    if (!/^\d{4,6}$/.test(pin)) {
        showToast("Enter a valid PIN.", true);
        return;
    }

    try {
        const { res, data } = await apiPost("/wallet/verify-pin", { pin });

        if (!res.ok) {
            throw new Error(data?.detail || "PIN verification failed");
        }

        showToast("PIN verified successfully.");
        clearPinInputs("#verifyPinModal");
        closeModal("verifyPinModal");
    } catch (err) {
        console.error("Verify PIN error:", err);
        showToast(err.message || "PIN verification failed.", true);
    }
}

window.verifyPIN = verifyPIN;

/* =========================
   FORGOT PIN COOLDOWN
========================= */

function setForgotPinCooldown(seconds) {
    forgotPinCooldownEnd = Date.now() + (seconds *100);
    localStorage.setItem("forgotPinCooldownEnd", String(forgotPinCooldownEnd));
    startForgotPinCooldownTimer();
}

function clearForgotPinCooldown() {
    forgotPinCooldownEnd = 0;
    localStorage.removeItem("forgotPinCooldownEnd");

    if (forgotPinCooldownTimer) {
        clearInterval(forgotPinCooldownTimer);
        forgotPinCooldownTimer = null;
    }

    updateForgotPinCooldownUI(0);
}

function getRemainingForgotPinCooldown() {
    const stored = Number(localStorage.getItem("forgotPinCooldownEnd") || 0);
    if (!stored) return 0;

    const remainingMs = stored - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

function updateForgotPinCooldownUI(seconds) {
    const cooldownText = document.getElementById("forgotPinCooldownText");
    const sendBtn = document.getElementById("sendForgotPinBtn");

    if (seconds > 0) {
        if (cooldownText) {
            cooldownText.textContent = `You can request another code in ${seconds}s`;
        }
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.style.opacity = "0.6";
            sendBtn.style.pointerEvents = "none";
        }
    } else {
        if (cooldownText) {
            cooldownText.textContent = "";
        }
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.style.opacity = "";
            sendBtn.style.pointerEvents = "";
        }
    }
}

function startForgotPinCooldownTimer() {
    if (forgotPinCooldownTimer) {
        clearInterval(forgotPinCooldownTimer);
        forgotPinCooldownTimer = null;
    }

    const tick = () => {
        const remaining = getRemainingForgotPinCooldown();

        if (remaining <= 0) {
            clearForgotPinCooldown();
            return;
        }

        updateForgotPinCooldownUI(remaining);
    };

    tick();
    forgotPinCooldownTimer = setInterval(tick, 1000);
}

/* =========================
   FORGOT PIN FLOW
========================= */

function resetForgotPinModalState() {
    const requestView = document.getElementById("requestView");
    const confirmView = document.getElementById("confirmView");
    const emailInput = document.getElementById("forgotPinEmail");

    if (requestView) requestView.style.display = "block";
    if (confirmView) confirmView.style.display = "none";

    if (emailInput) {
        emailInput.value = currentTopupUser?.email || "";
    }

    clearPinInputs("#forgotPinCodeContainer");
    clearPinInputs("#forgotPinNewPinContainer");

    const remaining = getRemainingForgotPinCooldown();
    if (remaining > 0) {
        forgotPinCooldownEnd = Number(localStorage.getItem("forgotPinCooldownEnd") || 0);
        startForgotPinCooldownTimer();
    } else {
        clearForgotPinCooldown();
    }
}

function showForgotPin() {
    closeModal("verifyPinModal");
    resetForgotPinModalState();
    openModal("forgotPinModal");
}

window.showForgotPin = showForgotPin;

function backToForgotPinRequest() {
    const requestView = document.getElementById("requestView");
    const confirmView = document.getElementById("confirmView");

    if (requestView) requestView.style.display = "block";
    if (confirmView) confirmView.style.display = "none";

    clearPinInputs("#forgotPinCodeContainer");
    clearPinInputs("#forgotPinNewPinContainer");
}

window.backToForgotPinRequest = backToForgotPinRequest;

async function sendForgotPinCode() {
    const emailInput = document.getElementById("forgotPinEmail");
    const email = (emailInput?.value || "").trim();

    if (!email) {
        showToast("Enter your email first.", true);
        return;
    }

    const remaining = getRemainingForgotPinCooldown();
    if (remaining > 0) {
        updateForgotPinCooldownUI(remaining);
        showToast(`Please wait ${remaining}s before requesting again.`, true);
        return;
    }

    try {
        const { res, data } = await apiPost("/wallet/forgot-pin/request", { email });

        if (!res.ok) {
            throw new Error(data?.detail || "Failed to send reset code");
        }

        const requestView = document.getElementById("requestView");
        const confirmView = document.getElementById("confirmView");

        if (requestView) requestView.style.display = "none";
        if (confirmView) confirmView.style.display = "block";

        clearPinInputs("#forgotPinCodeContainer");
        clearPinInputs("#forgotPinNewPinContainer");

        setForgotPinCooldown(0);
        showToast(data?.message || "Reset code sent.");
    } catch (err) {
        console.error("Forgot PIN request error:", err);
        showToast(err.message || "Failed to send reset code.", true);
    }
}

window.sendForgotPinCode = sendForgotPinCode;

async function resetForgotPin() {
    const email = (document.getElementById("forgotPinEmail")?.value || "").trim();
    const code = getPinValues("#forgotPinCodeContainer");
    const newPin = getPinValues("#forgotPinNewPinContainer");

    if (!email) {
        showToast("Email is required.", true);
        return;
    }

    if (!/^\d{6}$/.test(code)) {
        showToast("Enter a valid 6-digit code.", true);
        return;
    }

    if (!/^\d{4,6}$/.test(newPin)) {
        showToast("New PIN must be 4 to 6 digits.", true);
        return;
    }

    try {
        const { res, data } = await apiPost("/wallet/forgot-pin/confirm", {
            email,
            code,
            new_pin: newPin
        });

        if (!res.ok) {
            throw new Error(data?.detail || "Failed to reset PIN");
        }

        showToast(data?.message || "PIN reset successful.");
        closeModal("forgotPinModal");
        clearPinInputs("#verifyPinModal");
        resetForgotPinModalState();
    } catch (err) {
        console.error("Forgot PIN confirm error:", err);
        showToast(err.message || "Failed to reset PIN.", true);
    }
}

window.resetForgotPin = resetForgotPin;

/* =========================
   INIT
========================= */

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const user = await fetchCurrentUser();
        currentTopupUser = user;

        const points = await fetchRewardPoints();
        const walletBalance = await fetchWalletBalance();
        const tier = getTierData(points);

        updateTopupPageUI({ user, walletBalance });

        updateAccountPanelUI({
            fullName: user.full_name || user.name || user.username || user.email || "User",
            tierLabel: tier.labelUpper,
            points,
            walletBalance
        });

        resetForgotPinModalState();
    } catch (err) {
        console.error("Topup init error:", err);
        showToast("Failed to load wallet page.", true);
    }
});