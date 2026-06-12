const API_URL = window.API_URL || "http://127.0.0.1:8000";
let currentReceiptData = null;
function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function showStyledAlert(title, message) {
    document.getElementById("modalTitle").innerText = title;
    document.getElementById("modalMessage").innerText = message;
    document.getElementById("customModal").style.display = "flex";
}

function closeCustomModal() {
    document.getElementById("customModal").style.display = "none";
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

function formatMoney(value) {
    return `₱${Number(value || 0).toFixed(2)}`;
}
function formatDateTime(value) {
    if (!value) return "--";

    const normalizedValue =
        typeof value === "string" && !/[zZ]|[+\-]\d{2}:\d{2}$/.test(value)
            ? `${value}Z`
            : value;

    const date = new Date(normalizedValue);
    if (Number.isNaN(date.getTime())) return "--";

    return date.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
}
function prettifyPayment(paymentMethod) {
    const pm = String(paymentMethod || "").toLowerCase();
    if (pm === "wallet") return "TeoPay";
    if (pm === "cash") return "Cash";
    return paymentMethod || "-";
}

function prettifyPointsStatus(status) {
    const s = String(status || "").toLowerCase();
    if (s === "synced") return "Already Added";
    if (s === "claimable") return "Claimable";
    if (s === "none") return "None";
    return status || "-";
}

function prettifyOrderType(orderType) {
    const value = String(orderType || "").trim().toLowerCase();
    if (!value) return "-";
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function prettifyStatus(status) {
    const value = String(status || "").trim().toLowerCase();
    if (!value) return "-";
    return value.toUpperCase();
}

function buildClaimMessage(receipt) {
    const parts = [];

    if (receipt?.claim_message) {
        parts.push(receipt.claim_message);
    }

    if (receipt?.claim_expires_at) {
        parts.push(`Claim until: ${formatDateTime(receipt.claim_expires_at)}`);
    }

    if (receipt?.points_claim_method) {
        parts.push(`Claim method: ${String(receipt.points_claim_method).replaceAll("_", " ")}`);
    }

    if (receipt?.points_claimed_at) {
        parts.push(`Claimed at: ${formatDateTime(receipt.points_claimed_at)}`);
    }

    return parts.join(" | ");
}

function renderReceiptItems(items) {
    const itemsContainer = document.getElementById("receiptItems");

    if (!Array.isArray(items) || !items.length) {
        itemsContainer.innerHTML = `<div class="loading-text">No items found.</div>`;
        return;
    }

    itemsContainer.innerHTML = items.map(item => {
        const addOnsHtml = Array.isArray(item.add_ons) && item.add_ons.length
            ? item.add_ons.map(addon => `
                <div class="addon-row">
                    <span>+ ${escapeHTML(addon.name || "-")}</span>
                    <span>${formatMoney(addon.line_total)}</span>
                </div>
            `).join("")
            : `<div class="detail-row">Add-ons: None</div>`;

        const noteHtml = item.notes
            ? `<div class="detail-row" style="color:#ff8c00;">Note: ${escapeHTML(item.notes)}</div>`
            : "";

        return `
            <div class="item-group">
                <div class="item-row">
                    <span>${Number(item.qty || 0)}x ${escapeHTML(item.name || "-")}</span>
                    <span>${formatMoney(item.line_total)}</span>
                </div>
                ${addOnsHtml}
                ${noteHtml}
            </div>
        `;
    }).join("");
}

function toggleRow(rowId, shouldShow) {
    const el = document.getElementById(rowId);
    if (!el) return;
    el.style.display = shouldShow ? "flex" : "none";
}

async function loadReceipt() {
    const orderId = localStorage.getItem("latest_order_id");

    if (!orderId) {
        throw new Error("No kiosk order found. Please place an order first.");
    }

    const receipt = await fetchJSON(`${API_URL}/orders/${orderId}/receipt`);
    currentReceiptData = receipt;
    const customerName = receipt.customer_name || "WALK-IN CUSTOMER";
    const paymentMethod = String(receipt.payment_method || "").toLowerCase();
    const discount = Number(receipt.discount_amount || 0);
    const amountReceived = receipt.amount_received;
    const changeAmount = receipt.change_amount;
    const promoCode = receipt.promo_code_text || "";

    document.getElementById("topIdentifier").innerText = customerName;
    document.getElementById("receiptCustomerName").innerText = customerName;
    document.getElementById("orderType").innerText = prettifyOrderType(receipt.order_type);
    document.getElementById("dateTime").innerText = formatDateTime(receipt.created_at);
    document.getElementById("paymentMethod").innerText = prettifyPayment(receipt.payment_method);
    document.getElementById("orderStatus").innerText = prettifyStatus(receipt.status);
    document.getElementById("orderId").innerText = receipt.display_id || `#${receipt.order_id}`;
    document.getElementById("receiptRawId").innerText = receipt.order_id ?? "--";

    renderReceiptItems(receipt.items || []);

    document.getElementById("subtotalAmount").innerText = formatMoney(receipt.subtotal);
    document.getElementById("vatableSales").innerText = formatMoney(receipt.subtotal);
    document.getElementById("vatAmount").innerText = formatMoney(receipt.vat_amount);
    document.getElementById("totalAmount").innerText = formatMoney(receipt.total_amount);

    if (discount > 0) {
        toggleRow("discountRow", true);
        document.getElementById("discountAmount").innerText = `- ${formatMoney(discount)}`;
    } else {
        toggleRow("discountRow", false);
    }

    if (promoCode) {
        toggleRow("promoCodeRow", true);
        document.getElementById("promoCodeText").innerText = promoCode;
    } else {
        toggleRow("promoCodeRow", false);
    }

    const paymentBreakdownBox = document.getElementById("paymentBreakdownBox");
    const hasReceived = amountReceived !== null && amountReceived !== undefined;
    const hasChange = changeAmount !== null && changeAmount !== undefined;

    if (hasReceived || hasChange) {
        paymentBreakdownBox.style.display = "block";

        if (hasReceived) {
            toggleRow("receivedRow", true);
            document.getElementById("amountReceivedText").innerText = formatMoney(amountReceived);
        } else {
            toggleRow("receivedRow", false);
        }

        if (hasChange) {
            toggleRow("changeRow", true);
            document.getElementById("changeAmountText").innerText = formatMoney(changeAmount);
        } else {
            toggleRow("changeRow", false);
        }
    } else {
        paymentBreakdownBox.style.display = "none";
    }

    const rewardsBox = document.getElementById("rewardsBox");
    const claimBox = document.getElementById("claimBox");
    const claimMessage = document.getElementById("claimMessage");
    const earnedPoints = Number(receipt.earned_points || 0);
    const formattedClaimMessage = buildClaimMessage(receipt);

    if (earnedPoints > 0 || paymentMethod === "wallet" || formattedClaimMessage) {
        rewardsBox.style.display = "block";
        document.getElementById("earnedPoints").innerText = earnedPoints;
        document.getElementById("pointsStatusText").innerText = prettifyPointsStatus(receipt.points_status);

        if (formattedClaimMessage) {
            claimBox.style.display = "block";
            claimMessage.innerText = formattedClaimMessage;
        } else {
            claimBox.style.display = "none";
            claimMessage.innerText = "";
        }
    } else {
        rewardsBox.style.display = "none";
        claimBox.style.display = "none";
        claimMessage.innerText = "";
    }
}
function isValidEmailFormat(email) {
    const clean = String(email || "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

function openEmailReceiptModal() {
    const paymentMethod = String(currentReceiptData?.payment_method || "").toLowerCase();
    const walletEmail = localStorage.getItem("walletEmail") || currentReceiptData?.customer_email || "";

    if (paymentMethod === "wallet") {
        sendReceiptEmail(walletEmail || "");
        return;
    }

    const modal = document.getElementById("emailReceiptModal");
    const input = document.getElementById("receiptEmailInput");
    const message = document.getElementById("emailReceiptModalMessage");

    if (message) {
        message.innerText = "Enter your email address to receive a copy of your receipt.";
    }

    if (input) {
        input.value = "";
    }

    if (modal) {
        modal.style.display = "flex";
        setTimeout(() => input?.focus(), 100);
    }
}

function closeEmailReceiptModal() {
    const modal = document.getElementById("emailReceiptModal");
    if (modal) modal.style.display = "none";
}

async function sendReceiptEmail(email = "") {
    const orderId = localStorage.getItem("latest_order_id");

    if (!orderId) {
        showStyledAlert("Receipt Error", "No order found.");
        return;
    }

    const sendBtn = document.getElementById("sendReceiptEmailBtn");
    const confirmBtn = document.getElementById("confirmEmailReceiptBtn");
    const cleanEmail = String(email || "").trim();

    if (cleanEmail && !isValidEmailFormat(cleanEmail)) {
        showStyledAlert("Invalid Email", "Please enter a valid email address.");
        return;
    }

    try {
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerText = "Sending Receipt...";
        }

        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerText = "Sending...";
        }

        const payload = cleanEmail ? { email: cleanEmail } : {};

        const result = await fetchJSON(`${API_URL}/orders/${orderId}/receipt/email`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        closeEmailReceiptModal();

        showStyledAlert(
            "Receipt Email",
            result.message || "Receipt email request processed."
        );
    } catch (error) {
        showStyledAlert("Email Failed", error.message || "Failed to send receipt email.");
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerText = "Send Receipt to Email";
        }

        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerText = "Send";
        }
    }
}

function setupEmailReceiptActions() {
    const sendReceiptEmailBtn = document.getElementById("sendReceiptEmailBtn");
    const cancelEmailReceiptBtn = document.getElementById("cancelEmailReceiptBtn");
    const confirmEmailReceiptBtn = document.getElementById("confirmEmailReceiptBtn");
    const receiptEmailInput = document.getElementById("receiptEmailInput");
    const emailReceiptModal = document.getElementById("emailReceiptModal");

    sendReceiptEmailBtn?.addEventListener("click", openEmailReceiptModal);
    cancelEmailReceiptBtn?.addEventListener("click", closeEmailReceiptModal);

    confirmEmailReceiptBtn?.addEventListener("click", () => {
        const email = receiptEmailInput?.value || "";
        sendReceiptEmail(email);
    });

    receiptEmailInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendReceiptEmail(receiptEmailInput.value || "");
        }
    });

    emailReceiptModal?.addEventListener("click", (event) => {
        if (event.target === emailReceiptModal) {
            closeEmailReceiptModal();
        }
    });
}
function clearKioskCheckoutState() {
    localStorage.removeItem("teo_tray");
    localStorage.removeItem("customerName");
    localStorage.removeItem("walletEmail");
    localStorage.removeItem("walletCode");
    localStorage.removeItem("cardHolderName");
    localStorage.removeItem("latest_order_id");
    localStorage.removeItem("latest_order_payment_method");
    localStorage.removeItem("kiosk_payment_mode");
    localStorage.removeItem("paymentMethod");
}

function confirmOrder() {
    const overlay = document.getElementById("successOverlay");
    const card = document.getElementById("glassCard");

    overlay.style.display = "flex";

    setTimeout(() => {
        overlay.style.opacity = "1";
        card.style.transform = "scale(1)";
    }, 50);

    setTimeout(() => {
        clearKioskCheckoutState();
        window.location.href = "index.html";
    }, 2500);
}
function initReceiptPage() {
    document.getElementById("modalOkBtn")?.addEventListener("click", closeCustomModal);
    document.getElementById("finishBtn")?.addEventListener("click", confirmOrder);
    setupEmailReceiptActions();

    loadReceipt().catch(error => {
        showStyledAlert("Receipt Error", error.message || "Failed to load receipt.");
    });
}
window.addEventListener("DOMContentLoaded", initReceiptPage);