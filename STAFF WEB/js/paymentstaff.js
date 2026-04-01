const orderSubtitle = document.getElementById("orderSubtitle");

const methodWalletCard = document.getElementById("methodWalletCard");
const methodCashCard = document.getElementById("methodCashCard");

const summaryCustomer = document.getElementById("summaryCustomer");
const summaryItemsCount = document.getElementById("summaryItemsCount");
const summaryTotal = document.getElementById("summaryTotal");

const cashCalc = document.getElementById("cashCalc");
const walletPanel = document.getElementById("walletPanel");
const walletIdentifierInput = document.getElementById("walletIdentifierInput");
const walletPinInput = document.getElementById("walletPinInput");

const tenderedText = document.getElementById("tenderedText");
const cashReceivedInput = document.getElementById("cashReceivedInput");
const exactMoneyBtn = document.getElementById("exactMoneyBtn");

const receiptBody = document.getElementById("receiptBody");
const receiptTendered = document.getElementById("receiptTendered");
const receiptChange = document.getElementById("receiptChange");
const methodLabel = document.getElementById("methodLabel");
const dateTime = document.getElementById("dateTime");
const receiptNoteBox = document.getElementById("receiptNoteBox");

const pointsCustomerLabel = document.getElementById("pointsCustomerLabel");
const pointsValueLabel = document.getElementById("pointsValueLabel");

const finishBtn = document.getElementById("finishBtn");
const printBtn = document.getElementById("printBtn");
const voidBtn = document.getElementById("voidBtn");
const resetMoneyBtn = document.getElementById("resetMoneyBtn");
const receiptDisplayId = document.getElementById("receiptDisplayId");
const receiptRawId = document.getElementById("receiptRawId");
const receiptCustomerName = document.getElementById("receiptCustomerName");
const receiptOrderType = document.getElementById("receiptOrderType");
const receiptStatus = document.getElementById("receiptStatus");
const receiptClaimBox = document.getElementById("receiptClaimBox");

let checkoutData = null;
let receiptData = null;
let currentMethod = "cash";
let tendered = 0;
let total = 0;

/* =========================
   HELPERS
========================= */
function prettifyText(value) {
    const clean = String(value || "").trim();
    if (!clean) return "-";
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function getAPIURL() {
    if (!window.API_URL) {
        throw new Error("API_URL is not defined. Make sure authGuard.js loads first.");
    }
    return window.API_URL;
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

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatPeso(value) {
    return `₱${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
}

function getOrderIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order_id");
    return orderId ? Number(orderId) : null;
}

function clearWalletInputs() {
    if (walletIdentifierInput) walletIdentifierInput.value = "";
    if (walletPinInput) walletPinInput.value = "";
}

function getTotalItemQuantity() {
    if (Array.isArray(checkoutData?.local_cart) && checkoutData.local_cart.length) {
        return checkoutData.local_cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    }

    if (Array.isArray(receiptData?.items) && receiptData.items.length) {
        return receiptData.items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    }

    return 0;
}

function normalizeMoneyInput(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return Number(numeric.toFixed(2));
}

function syncCashInputFromTendered() {
    if (!cashReceivedInput) return;
    cashReceivedInput.value = tendered > 0 ? tendered.toFixed(2) : "";
}

function syncTenderedFromCashInput() {
    if (!cashReceivedInput) return;
    tendered = normalizeMoneyInput(cashReceivedInput.value);
}

/* =========================
   LOGOUT
========================= */
function setupLogout() {
    const logoutLink = document.querySelector(".logout-link");
    if (!logoutLink) return;

    logoutLink.addEventListener("click", async (event) => {
        event.preventDefault();

        try {
            await fetch(`${getAPIURL()}/auth/logout`, {
                method: "POST",
                credentials: "include"
            });
        } catch (error) {
            console.error("Logout failed:", error);
        } finally {
            window.location.href = "loginstaff.html";
        }
    });
}

/* =========================
   LOAD CHECKOUT
========================= */
function loadCheckoutData() {
    const urlOrderId = getOrderIdFromURL();

    if (urlOrderId) {
        checkoutData = {
            order_id: urlOrderId,
            customer_name: "Walk-in Customer",
            local_cart: []
        };
        return;
    }

    const raw = localStorage.getItem("staff_checkout_order");
    if (!raw) {
        throw new Error("No checkout order found.");
    }

    checkoutData = JSON.parse(raw);
    if (!checkoutData?.order_id) {
        throw new Error("Invalid checkout order data.");
    }
}

async function loadReceipt() {
    receiptData = await fetchJSON(`${getAPIURL()}/orders/${checkoutData.order_id}/receipt`);
    total = Number(receiptData?.total_amount || checkoutData?.total_amount || 0);

    if (!checkoutData.customer_name && receiptData?.customer_name) {
        checkoutData.customer_name = receiptData.customer_name;
    }
}

/* =========================
   RENDER
========================= */
function renderSummary() {
    const resolvedCustomerName =
        receiptData?.customer_name ||
        checkoutData?.customer_name ||
        "Walk-in Customer";

    summaryCustomer.textContent = resolvedCustomerName;
    summaryItemsCount.textContent = String(getTotalItemQuantity());
    summaryTotal.textContent = formatPeso(total);

    orderSubtitle.textContent = `Processing ${receiptData?.display_id || `Order #${checkoutData.order_id}`}`;
    dateTime.textContent = formatDateTime(receiptData?.created_at || new Date());

    if (receiptDisplayId) {
        receiptDisplayId.textContent = receiptData?.display_id || "-";
    }

    if (receiptRawId) {
        receiptRawId.textContent = receiptData?.order_id ?? checkoutData?.order_id ?? "-";
    }

    if (receiptCustomerName) {
        receiptCustomerName.textContent = resolvedCustomerName;
    }

    if (receiptOrderType) {
        receiptOrderType.textContent = prettifyText(receiptData?.order_type || "-");
    }

    if (receiptStatus) {
        receiptStatus.textContent = prettifyText(receiptData?.status || "-");
    }

    if (receiptClaimBox) {
        const claimParts = [];

        if (receiptData?.claim_message) {
            claimParts.push(receiptData.claim_message);
        }

        if (receiptData?.claim_expires_at) {
            claimParts.push(`Claim until: ${formatDateTime(receiptData.claim_expires_at)}`);
        }

        if (receiptData?.points_claim_method) {
            claimParts.push(`Claim method: ${prettifyText(receiptData.points_claim_method)}`);
        }

        if (receiptData?.points_claimed_at) {
            claimParts.push(`Claimed at: ${formatDateTime(receiptData.points_claimed_at)}`);
        }

        if (claimParts.length) {
            receiptClaimBox.style.display = "block";
            receiptClaimBox.textContent = claimParts.join(" | ");
        } else {
            receiptClaimBox.style.display = "none";
            receiptClaimBox.textContent = "";
        }
    }
}

function renderReceipt() {
    const lines = [];
    const receiptItems = Array.isArray(receiptData?.items) ? receiptData.items : [];
    const localCart = Array.isArray(checkoutData?.local_cart) ? checkoutData.local_cart : [];

    if (receiptItems.length) {
        receiptItems.forEach((item, index) => {
            const localItem = localCart[index] || {};
            const displaySize = localItem.display_size || "Small";
            const addOnNames = Array.isArray(item.add_ons) && item.add_ons.length
                ? item.add_ons.map(addon => addon.name).join(", ")
                : "None";

            lines.push(`
                <div class="receipt-row">
                    <span>${escapeHTML(`${item.qty || 1}x ${item.name}`)} (${escapeHTML(displaySize)})</span>
                    <span>${escapeHTML(Number(item.line_total || 0).toFixed(2))}</span>
                </div>
            `);

            lines.push(`
                <div class="receipt-row-sub">
                    <span>Add-ons: ${escapeHTML(addOnNames)}</span>
                    <span></span>
                </div>
            `);
        });
    } else if (localCart.length) {
        localCart.forEach(item => {
            const qty = Number(item.quantity || 1);
            const lineTotal = Number(item.display_price || 0) * qty;

            lines.push(`
                <div class="receipt-row">
                    <span>${escapeHTML(`${qty}x ${item.display_name}`)} (${escapeHTML(item.display_size || "Small")})</span>
                    <span>${escapeHTML(lineTotal.toFixed(2))}</span>
                </div>
            `);

            lines.push(`
                <div class="receipt-row-sub">
                    <span>Add-ons: ${escapeHTML(item.display_addons?.length ? item.display_addons.join(", ") : "None")}</span>
                    <span></span>
                </div>
            `);
        });
    } else {
        receiptBody.innerHTML = `<div class="receipt-row"><span>No items found</span><span>--</span></div>`;
        return;
    }

    lines.push(`<div class="receipt-divider"></div>`);
    lines.push(`<div class="receipt-row"><span>Subtotal</span><span>${escapeHTML(Number(receiptData?.subtotal || 0).toFixed(2))}</span></div>`);
    lines.push(`<div class="receipt-row"><span>VAT</span><span>${escapeHTML(Number(receiptData?.vat_amount || 0).toFixed(2))}</span></div>`);

    if (Number(receiptData?.discount_amount || 0) > 0) {
        lines.push(`<div class="receipt-row"><span>Discount</span><span>- ${escapeHTML(Number(receiptData.discount_amount).toFixed(2))}</span></div>`);
    }

    lines.push(`<div class="receipt-divider"></div>`);
    lines.push(`
        <div class="receipt-row" style="font-size: 1.3rem; font-weight: 900;">
            <span>TOTAL</span>
            <span>${escapeHTML(formatPeso(total))}</span>
        </div>
    `);

    receiptBody.innerHTML = lines.join("");

    const resolvedCustomerName =
        receiptData?.customer_name ||
        checkoutData?.customer_name ||
        "Walk-in Customer";

    pointsCustomerLabel.textContent = resolvedCustomerName;
    pointsValueLabel.textContent = `${Number(receiptData?.earned_points || 0)} pts`;
}

function updatePaymentUI() {
    methodLabel.textContent = currentMethod === "wallet" ? "TeoPay" : "Cash";

    if (currentMethod === "wallet") {
        tendered = total;
    } else {
        tendered = normalizeMoneyInput(tendered);
    }

    tenderedText.textContent = formatPeso(tendered);
    receiptTendered.textContent = formatPeso(tendered);

    const change = Math.max(0, tendered - total);
    receiptChange.textContent = formatPeso(change);

    if (currentMethod === "cash") {
        syncCashInputFromTendered();
    } else if (cashReceivedInput) {
        cashReceivedInput.value = "";
    }
}

function showReceiptNote(message = "") {
    if (!message) {
        receiptNoteBox.style.display = "none";
        receiptNoteBox.textContent = "";
        return;
    }

    receiptNoteBox.style.display = "block";
    receiptNoteBox.textContent = message;
}

/* =========================
   PAYMENT METHOD
========================= */
function setMethod(method) {
    currentMethod = method;

    methodCashCard.classList.toggle("active", method === "cash");
    methodWalletCard.classList.toggle("active", method === "wallet");

    cashCalc.classList.toggle("hidden", method !== "cash");
    walletPanel.classList.toggle("hidden", method !== "wallet");

    if (method === "wallet") {
        clearWalletInputs();
    }

    if (method === "cash") {
        if (!Number.isFinite(tendered) || tendered < 0) {
            tendered = 0;
        }
        syncCashInputFromTendered();
    }

    showReceiptNote("");
    updatePaymentUI();
}

/* =========================
   CASH
========================= */
function addMoney(amount) {
    tendered = normalizeMoneyInput(tendered + Number(amount || 0));
    updatePaymentUI();
}

function resetMoney() {
    tendered = 0;
    updatePaymentUI();
}

function setExactMoney() {
    tendered = normalizeMoneyInput(total);
    updatePaymentUI();
}

function handleManualCashInput() {
    syncTenderedFromCashInput();
    updatePaymentUI();
}

function setupCashButtons() {
    document.querySelectorAll(".calc-btn[data-money]").forEach(btn => {
        btn.addEventListener("click", () => {
            addMoney(Number(btn.dataset.money || 0));
        });
    });

    resetMoneyBtn?.addEventListener("click", resetMoney);
    exactMoneyBtn?.addEventListener("click", setExactMoney);

    cashReceivedInput?.addEventListener("input", handleManualCashInput);
    cashReceivedInput?.addEventListener("change", handleManualCashInput);
}

/* =========================
   PAY EXISTING ORDER
========================= */
async function payCurrentOrderByCash() {
    if (tendered < total) {
        throw new Error("Insufficient payment amount.");
    }

    await fetchJSON(`${getAPIURL()}/orders/${checkoutData.order_id}/pay-cash`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            amount_received: Number(tendered)
        })
    });

    await loadReceipt();
}

async function payCurrentOrderByWallet() {
    const identifier = walletIdentifierInput?.value?.trim();
    const pin = walletPinInput?.value?.trim();

    if (!identifier) {
        throw new Error("Enter wallet code or email.");
    }

    if (!pin) {
        throw new Error("Enter wallet PIN.");
    }

    const isEmail = identifier.includes("@");

    await fetchJSON(`${getAPIURL()}/orders/${checkoutData.order_id}/pay-wallet`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            wallet_pin: pin,
            wallet_email: isEmail ? identifier : null,
            wallet_code: isEmail ? null : identifier.toUpperCase()
        })
    });

    await loadReceipt();
}

/* =========================
   ACTIONS
========================= */
async function handleFinish() {
    finishBtn.disabled = true;

    try {
        if (currentMethod === "cash") {
            syncTenderedFromCashInput();
            updatePaymentUI();
            await payCurrentOrderByCash();
        } else {
            await payCurrentOrderByWallet();
        }

        renderSummary();
        renderReceipt();
        updatePaymentUI();

        window.print();

        if (!getOrderIdFromURL()) {
            localStorage.removeItem("staff_checkout_order");
        }

        alert("Payment successful.");
        window.location.href = "orderstaffs.html";
    } catch (error) {
        alert(error.message || "Payment failed.");
    } finally {
        finishBtn.disabled = false;
    }
}

async function voidTransaction() {
    const confirmed = confirm("Are you sure you want to VOID this transaction?");
    if (!confirmed) return;

    try {
        await fetchJSON(`${getAPIURL()}/orders/${checkoutData.order_id}/void`, {
            method: "POST"
        });

        if (!getOrderIdFromURL()) {
            localStorage.removeItem("staff_checkout_order");
        }

        alert("Transaction voided.");
        window.location.href = "menustaff.html";
    } catch (error) {
        alert(error.message || "Failed to void transaction.");
    }
}

function setupActions() {
    finishBtn?.addEventListener("click", handleFinish);
    printBtn?.addEventListener("click", () => window.print());
    voidBtn?.addEventListener("click", voidTransaction);
}

/* =========================
   INIT
========================= */
async function initPaymentStaffPage() {
    try {
        setupLogout();
        setupMethodCards();
        setupCashButtons();
        setupActions();

        clearWalletInputs();
        loadCheckoutData();
        await loadReceipt();

        renderSummary();
        renderReceipt();
        setMethod("cash");
        resetMoney();
    } catch (error) {
        console.error("paymentstaff init error:", error);
        alert(error.message || "Failed to load checkout page.");
        window.location.href = "menustaff.html";
    }
}

function setupMethodCards() {
    methodCashCard?.addEventListener("click", () => setMethod("cash"));
    methodWalletCard?.addEventListener("click", () => setMethod("wallet"));
}

document.addEventListener("DOMContentLoaded", initPaymentStaffPage);