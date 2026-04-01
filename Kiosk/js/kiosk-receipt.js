const API_URL = window.API_URL || "http://127.0.0.1:8000";
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

function renderReceiptItems(items) {
    const itemsContainer = document.getElementById("receiptItems");

    if (!Array.isArray(items) || !items.length) {
        itemsContainer.innerHTML = `<div class="loading-text">No items found.</div>`;
        return;
    }

    itemsContainer.innerHTML = items.map(item => `
        <div class="item-group">
            <div class="item-row">
                <span>${Number(item.qty || 0)}x ${item.name || "-"}</span>
                <span>${formatMoney(item.line_total)}</span>
            </div>
            ${(item.add_ons || []).map(addon => `
                <div class="addon-row">
                    <span>+ ${addon.name}</span>
                    <span>${formatMoney(addon.line_total)}</span>
                </div>
            `).join("")}
            ${item.notes ? `<div class="detail-row" style="color:#ff8c00;">Note: "${item.notes}"</div>` : ""}
        </div>
    `).join("");
}

async function loadReceipt() {
    const orderId = localStorage.getItem("latest_order_id");

    if (!orderId) {
        throw new Error("No kiosk order found. Please place an order first.");
    }

    const receipt = await fetchJSON(`${API_URL}/orders/${orderId}/receipt`);

    document.getElementById("topIdentifier").innerText = receipt.customer_name || "WALK-IN CUSTOMER";
    document.getElementById("orderType").innerText = (receipt.order_type || "-").toUpperCase();
    document.getElementById("dateTime").innerText = receipt.created_at ? new Date(receipt.created_at).toLocaleString() : "--";
    document.getElementById("paymentMethod").innerText = prettifyPayment(receipt.payment_method);
    document.getElementById("orderStatus").innerText = String(receipt.status || "-").toUpperCase();
    document.getElementById("orderId").innerText = receipt.display_id || `#${receipt.order_id}`;

    renderReceiptItems(receipt.items || []);

    document.getElementById("subtotalAmount").innerText = formatMoney(receipt.subtotal);
    document.getElementById("vatableSales").innerText = formatMoney(receipt.subtotal);
    document.getElementById("vatAmount").innerText = formatMoney(receipt.vat_amount);
    document.getElementById("totalAmount").innerText = formatMoney(receipt.total_amount);

    const discount = Number(receipt.discount_amount || 0);
    if (discount > 0) {
        document.getElementById("discountRow").style.display = "flex";
        document.getElementById("discountAmount").innerText = `- ${formatMoney(discount)}`;
    }

    const rewardsBox = document.getElementById("rewardsBox");
    const earnedPoints = Number(receipt.earned_points || 0);
    const paymentMethod = String(receipt.payment_method || "").toLowerCase();

    if (earnedPoints > 0 || paymentMethod === "wallet") {
        rewardsBox.style.display = "block";
        document.getElementById("earnedPoints").innerText = earnedPoints;
        document.getElementById("pointsStatusText").innerText = prettifyPointsStatus(receipt.points_status);

        const claimBox = document.getElementById("claimBox");
        const claimMessage = document.getElementById("claimMessage");

        if (receipt.claim_message) {
            claimBox.style.display = "block";
            claimMessage.innerText = receipt.claim_message;
        }
    } else {
        rewardsBox.style.display = "none";
    }
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

    loadReceipt().catch(error => {
        showStyledAlert("Receipt Error", error.message || "Failed to load receipt.");
    });
}

window.addEventListener("DOMContentLoaded", initReceiptPage);