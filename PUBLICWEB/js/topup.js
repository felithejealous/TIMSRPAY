function getUserInitials(fullName) {
    if (!fullName) return "USR";

    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const initials = parts.map(part => part[0].toUpperCase()).join("");

    return initials.slice(0, 3);
}

function formatQCardLabel(user) {
    const fullName =
        user.full_name ||
        user.name ||
        user.username ||
        user.email ||
        "User";

    const initials = getUserInitials(fullName);
    const actualUserId = user.user_id || user.id || 0;
    const paddedId = String(actualUserId).padStart(4, "0");

    return `${initials}-000-${paddedId}`;
}

function formatCardDisplayNumber(user) {
    const actualUserId = user.user_id || user.id || 0;

    // Example:
    // 15 -> 000 015
    // 7  -> 000 007
    // 123 -> 000 123
    const paddedId = String(actualUserId).padStart(6, "0");

    return `${paddedId.slice(0, 3)} ${paddedId.slice(3)}`;
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

function renderStoreQr(qrValue) {
    const qrContainer = document.getElementById("qrcode");
    if (!qrContainer) return;

    qrContainer.innerHTML = "";

    if (!qrValue) {
        qrContainer.innerHTML =
            "<p style='color:var(--text-muted); font-weight:700;'>No user ID available</p>";
        return;
    }

    if (window.QRCode) {
        new QRCode(qrContainer, {
            text: String(qrValue), // actual scanned value = raw user id
            width: 180,
            height: 180
        });
    }
}

function updateTopupPageUI({ user, walletBalance, qrValue, qrLabelText }) {
    const fullName =
        user.full_name ||
        user.name ||
        user.username ||
        user.email ||
        "User";

    const cardHolderEls = document.querySelectorAll(".holder-name");
    const cardNumEls = document.querySelectorAll(".card-num");
    const balanceEl = document.getElementById("displayBalance");
    const qrLabel = document.getElementById("qrLabel");
    const lastUpdatedEl = document.getElementById("lastUpdated");

    const cardDisplayNumber = formatCardDisplayNumber(user);

    cardHolderEls.forEach(el => {
        el.textContent = fullName.toUpperCase();
    });

    cardNumEls.forEach(el => {
        el.textContent = cardDisplayNumber;
    });

    if (balanceEl) {
        balanceEl.innerHTML = `<span class="balance-currency">₱</span>${Number(walletBalance || 0).toFixed(2)}`;
    }

    if (qrLabel) {
        qrLabel.textContent = qrLabelText || "NO-USER-ID";
    }

    if (lastUpdatedEl) {
        lastUpdatedEl.textContent = `Updated ${getCurrentTimestamp()}`;
    }

    renderStoreQr(qrValue);
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    const overlay = document.getElementById("mainOverlay");

    if (modal) modal.classList.add("active");
    if (overlay) overlay.classList.add("active");

    document.body.style.overflow = "hidden";
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    const overlay = document.getElementById("mainOverlay");

    if (modal) modal.classList.remove("active");
    if (overlay) overlay.classList.remove("active");

    document.body.style.overflow = "auto";
}

function closeAll() {
    document.querySelectorAll(".modal-overlay").forEach(modal => {
        modal.classList.remove("active");
    });

    const overlay = document.getElementById("mainOverlay");
    if (overlay) overlay.classList.remove("active");

    const accountPanel = document.getElementById("accountPanel");
    if (accountPanel) accountPanel.classList.remove("active");

    document.body.style.overflow = "auto";
}

window.openModal = openModal;
window.closeModal = closeModal;
window.closeAll = closeAll;

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const user = await fetchCurrentUser();
        const points = await fetchRewardPoints();
        const walletBalance = await fetchWalletBalance();
        const tier = getTierData(points);

        const actualUserId = user.user_id || user.id || null;

        console.log("AUTH / ME USER:", user);
        console.log("USER ID FROM auth/me:", actualUserId);

        // QR actual scanned value = raw user id
        const qrValue = actualUserId ? String(actualUserId) : "NO-USER-ID";

        // Display label under QR = formal qcard number
        const qrLabelText = actualUserId ? formatQCardLabel(user) : "NO-USER-ID";

        updateTopupPageUI({
            user,
            walletBalance,
            qrValue,
            qrLabelText
        });

        updateAccountPanelUI({
            fullName:
                user.full_name ||
                user.name ||
                user.username ||
                user.email ||
                "User",
            tierLabel: tier.labelUpper,
            points,
            walletBalance
        });
    } catch (err) {
        console.error("Failed to initialize topup page", err);
    }
});