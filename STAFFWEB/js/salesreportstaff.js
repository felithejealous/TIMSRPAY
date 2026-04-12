const reportSubtitle = document.getElementById("reportSubtitle");
const refreshBtn = document.getElementById("refreshBtn");

const expectedCashValue = document.getElementById("expectedCashValue");
const totalSalesValue = document.getElementById("totalSalesValue");
const totalSalesSub = document.getElementById("totalSalesSub");
const cashSalesValue = document.getElementById("cashSalesValue");
const cashSalesSub = document.getElementById("cashSalesSub");
const walletSalesValue = document.getElementById("walletSalesValue");
const walletSalesSub = document.getElementById("walletSalesSub");
const cashReceivedValue = document.getElementById("cashReceivedValue");
const changeGivenValue = document.getElementById("changeGivenValue");

const staffNameValue = document.getElementById("staffNameValue");
const reportDateValue = document.getElementById("reportDateValue");
const paidCountValue = document.getElementById("paidCountValue");
const cashTxnCountValue = document.getElementById("cashTxnCountValue");
const walletTxnCountValue = document.getElementById("walletTxnCountValue");

const discountTotalValue = document.getElementById("discountTotalValue");
const pwdDiscountValue = document.getElementById("pwdDiscountValue");
const promoDiscountValue = document.getElementById("promoDiscountValue");
const vatExemptValue = document.getElementById("vatExemptValue");
const pwdTxnCountValue = document.getElementById("pwdTxnCountValue");
const promoTxnCountValue = document.getElementById("promoTxnCountValue");

const salesTableBody = document.getElementById("salesTableBody");

let currentStaffUser = null;
let allRelevantOrders = [];
let salesRefreshInterval = null;

const PH_TIMEZONE = "Asia/Manila";

/* =========================
   CORE HELPERS
========================= */
function getAPIURL() {
    if (!window.API_URL) {
        throw new Error("API_URL is not defined. Make sure authGuard.js loads first.");
    }
    return window.API_URL;
}

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        ...options,
        headers: getAuthHeaders(options.headers || {})
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

/* =========================
   DATE / TIME HELPERS
========================= */
function parseServerDate(value) {
    if (!value) return null;

    const raw = String(value).trim();
    if (!raw) return null;

    if (/[zZ]$|[+\-]\d{2}:\d{2}$/.test(raw)) {
        const zonedDate = new Date(raw);
        return Number.isNaN(zonedDate.getTime()) ? null : zonedDate;
    }

    const normalized = raw.replace(" ", "T");
    const assumedUtc = new Date(`${normalized}Z`);

    return Number.isNaN(assumedUtc.getTime()) ? null : assumedUtc;
}

function getPHDateKey(value) {
    const date = value instanceof Date ? value : (value ? parseServerDate(value) : new Date());
    if (!date || Number.isNaN(date.getTime())) return "";

    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: PH_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);

    const year = parts.find(part => part.type === "year")?.value || "0000";
    const month = parts.find(part => part.type === "month")?.value || "00";
    const day = parts.find(part => part.type === "day")?.value || "00";

    return `${year}-${month}-${day}`;
}

function formatPHDate(value) {
    const date = value instanceof Date ? value : (value ? parseServerDate(value) : new Date());
    if (!date || Number.isNaN(date.getTime())) return "-";

    return date.toLocaleDateString("en-PH", {
        timeZone: PH_TIMEZONE,
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function formatPHTime(value) {
    const date = value instanceof Date ? value : parseServerDate(value);
    if (!date || Number.isNaN(date.getTime())) return "-";

    return date.toLocaleTimeString("en-US", {
        timeZone: PH_TIMEZONE,
        hour12: true,
        hour: "2-digit",
        minute: "2-digit"
    });
}

function isTodayPH(value) {
    if (!value) return false;
    return getPHDateKey(value) === getPHDateKey(new Date());
}

/* =========================
   NAME HELPERS
========================= */
function normalizeComparableText(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function getCurrentStaffComparableNames() {
    return [
        currentStaffUser?.full_name,
        currentStaffUser?.display_name,
        currentStaffUser?.name,
        currentStaffUser?.email,
        localStorage.getItem("staff_user_email")
    ]
        .map(normalizeComparableText)
        .filter(Boolean);
}

/* =========================
   ORDER HELPERS
========================= */
function isPaidLike(order) {
    const status = String(order?.status || "").trim().toLowerCase();
    return status === "paid" || status === "completed";
}

function normalizePaymentMethod(method) {
    const clean = String(method || "").trim().toLowerCase();

    if (clean === "wallet" || clean === "teopay") return "wallet";
    if (clean === "cash") return "cash";

    return "cash";
}

function getCurrentStaffId() {
    return Number(
        currentStaffUser?.id ||
        currentStaffUser?.user_id ||
        localStorage.getItem("staff_user_id") ||
        0
    ) || null;
}

function getCurrentStaffEmail() {
    return String(
        currentStaffUser?.email ||
        localStorage.getItem("staff_user_email") ||
        ""
    ).trim().toLowerCase();
}

function getCurrentStaffName() {
    return (
        currentStaffUser?.full_name ||
        currentStaffUser?.display_name ||
        currentStaffUser?.name ||
        currentStaffUser?.email ||
        localStorage.getItem("staff_user_email") ||
        "Current Staff"
    );
}

function getRelevantOrderDate(order) {
    return (
        order?.paid_at ||
        order?.completed_at ||
        order?.created_at ||
        null
    );
}

function doesOrderBelongToCurrentStaff(order) {
    const currentStaffId = getCurrentStaffId();
    const processedStaffId = Number(order?.processed_by_staff_id || 0) || null;

    if (currentStaffId && processedStaffId && currentStaffId === processedStaffId) {
        return true;
    }

    const processedStaffName = normalizeComparableText(order?.processed_by_staff_name);
    if (!processedStaffName) return false;

    const comparableNames = getCurrentStaffComparableNames();
    return comparableNames.includes(processedStaffName);
}

function buildFlags(order) {
    const flags = [];

    if (order.is_pwd_discount) {
        flags.push(`<span class="pill pill-pwd">PWD</span>`);
    }

    if (order.promo_code_text) {
        flags.push(`<span class="pill pill-wallet">PROMO</span>`);
    }

    if (order.is_refunded) {
        flags.push(`<span class="pill pill-refund">REFUNDED</span>`);
    }

    const paymentMethod = normalizePaymentMethod(order.payment_method);
    if (paymentMethod === "cash") {
        flags.push(`<span class="pill pill-cash">CASH</span>`);
    } else {
        flags.push(`<span class="pill pill-wallet">TEOPAY</span>`);
    }

    return flags.join(" ");
}

/* =========================
   DATA LOADING
========================= */
async function loadCurrentUser() {
    currentStaffUser = await fetchJSON(`${getAPIURL()}/auth/me`);
    console.log("salesreport current user:", currentStaffUser);
}

async function loadSalesData() {
    const data = await fetchJSON(`${getAPIURL()}/orders/?limit=500`);
    const orders = Array.isArray(data?.data) ? data.data : [];

    console.log("salesreport raw orders:", orders);
    console.log("salesreport currentStaffUser:", currentStaffUser);
    console.log("salesreport currentStaffId:", getCurrentStaffId());
    console.log("salesreport currentStaffEmail:", getCurrentStaffEmail());

    allRelevantOrders = orders.filter(order => {
        const paidLike = isPaidLike(order);
        const relevantDate = getRelevantOrderDate(order);
        const todayPH = isTodayPH(relevantDate);
        const sameStaff = doesOrderBelongToCurrentStaff(order);

        console.log("salesreport order check:", {
            order_id: order?.order_id,
            display_id: order?.display_id,
            status: order?.status,
            created_at: order?.created_at,
            paid_at: order?.paid_at,
            completed_at: order?.completed_at,
            processed_by_staff_id: order?.processed_by_staff_id,
            processed_by_staff_name: order?.processed_by_staff_name,
            paidLike,
            relevantDate,
            todayPH,
            sameStaff
        });

        return paidLike && todayPH && sameStaff;
    });

    console.log("salesreport filtered orders:", allRelevantOrders);
}

/* =========================
   RENDER SUMMARY
========================= */
function renderSummary() {
    const paidOrders = allRelevantOrders;
    const cashOrders = paidOrders.filter(order => normalizePaymentMethod(order.payment_method) === "cash");
    const walletOrders = paidOrders.filter(order => normalizePaymentMethod(order.payment_method) === "wallet");
    const pwdOrders = paidOrders.filter(order => !!order.is_pwd_discount);
    const promoOrders = paidOrders.filter(order => !!String(order.promo_code_text || "").trim());

    const totalSales = paidOrders.reduce((sum, order) => {
        const total = Number(order.total_amount || 0);
        const refund = Number(order.refund_amount || 0);
        return sum + (total - refund);
    }, 0);

    const cashSales = cashOrders.reduce((sum, order) => {
        const total = Number(order.total_amount || 0);
        const refund = Number(order.refund_amount || 0);
        return sum + (total - refund);
    }, 0);

    const walletSales = walletOrders.reduce((sum, order) => {
        const total = Number(order.total_amount || 0);
        const refund = Number(order.refund_amount || 0);
        return sum + (total - refund);
    }, 0);

    const totalDiscounts = paidOrders.reduce((sum, order) => {
        const pwdDiscount = Number(order.pwd_discount_amount || 0);
        const regularDiscount = Number(order.discount_amount || 0);
        return sum + Math.max(pwdDiscount, regularDiscount);
    }, 0);

    const totalPwdDiscount = paidOrders.reduce((sum, order) => sum + Number(order.pwd_discount_amount || 0), 0);

    const totalPromoDiscount = paidOrders.reduce((sum, order) => {
        const isPwd = !!order.is_pwd_discount;
        return sum + (isPwd ? 0 : Number(order.discount_amount || 0));
    }, 0);

    const totalVatExempt = paidOrders.reduce((sum, order) => sum + Number(order.vat_exempt_sales || 0), 0);

    const totalCashReceived = cashOrders.reduce((sum, order) => {
        const value = order.amount_received;
        return sum + (value !== null && value !== undefined ? Number(value) : 0);
    }, 0);

    const totalChangeGiven = cashOrders.reduce((sum, order) => {
        const value = order.change_amount;
        return sum + (value !== null && value !== undefined ? Number(value) : 0);
    }, 0);

    const expectedCash = cashSales;

    expectedCashValue.textContent = formatPeso(expectedCash);
    totalSalesValue.textContent = formatPeso(totalSales);
    totalSalesSub.textContent = `${paidOrders.length} paid transaction${paidOrders.length === 1 ? "" : "s"}`;

    cashSalesValue.textContent = formatPeso(cashSales);
    cashSalesSub.textContent = `${cashOrders.length} cash transaction${cashOrders.length === 1 ? "" : "s"}`;

    walletSalesValue.textContent = formatPeso(walletSales);
    walletSalesSub.textContent = `${walletOrders.length} TeoPay transaction${walletOrders.length === 1 ? "" : "s"}`;

    cashReceivedValue.textContent = formatPeso(totalCashReceived);
    changeGivenValue.textContent = formatPeso(totalChangeGiven);

    staffNameValue.textContent = getCurrentStaffName();
    reportDateValue.textContent = formatPHDate(new Date());
    paidCountValue.textContent = String(paidOrders.length);
    cashTxnCountValue.textContent = String(cashOrders.length);
    walletTxnCountValue.textContent = String(walletOrders.length);

    discountTotalValue.textContent = formatPeso(totalDiscounts);
    pwdDiscountValue.textContent = formatPeso(totalPwdDiscount);
    promoDiscountValue.textContent = formatPeso(totalPromoDiscount);
    vatExemptValue.textContent = formatPeso(totalVatExempt);
    pwdTxnCountValue.textContent = String(pwdOrders.length);
    promoTxnCountValue.textContent = String(promoOrders.length);

    reportSubtitle.textContent = `Today • ${getCurrentStaffName()}`;
}

/* =========================
   RENDER TABLE
========================= */
function renderTable() {
    if (!salesTableBody) return;

    if (!allRelevantOrders.length) {
        salesTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">No paid or completed sales found for your account today.</td>
            </tr>
        `;
        return;
    }

    salesTableBody.innerHTML = allRelevantOrders
        .slice()
        .sort((a, b) => {
            const aTime = parseServerDate(getRelevantOrderDate(a))?.getTime() || 0;
            const bTime = parseServerDate(getRelevantOrderDate(b))?.getTime() || 0;
            return bTime - aTime;
        })
        .map(order => {
            const isPwd = !!order.is_pwd_discount;
            const discountShown = isPwd
                ? Number(order.pwd_discount_amount || 0)
                : Number(order.discount_amount || 0);

            const received = order.amount_received !== null && order.amount_received !== undefined
                ? formatPeso(order.amount_received)
                : "-";

            const change = order.change_amount !== null && order.change_amount !== undefined
                ? formatPeso(order.change_amount)
                : "-";

            return `
                <tr>
                    <td>${escapeHTML(formatPHTime(getRelevantOrderDate(order)))}</td>
                    <td>
                        <div style="font-weight:900;">${escapeHTML(order.display_id || `#${order.order_id}`)}</div>
                        <div style="color:var(--text-muted); font-size:11px; margin-top:4px;">
                            ${escapeHTML(order.items_summary || "No items")}
                        </div>
                    </td>
                    <td>${escapeHTML(order.customer_name || "Walk-in Customer")}</td>
                    <td>${escapeHTML(normalizePaymentMethod(order.payment_method) === "wallet" ? "TeoPay" : "Cash")}</td>
                    <td>${escapeHTML(formatPeso(order.total_amount || 0))}</td>
                    <td>${escapeHTML(received)}</td>
                    <td>${escapeHTML(change)}</td>
                    <td>${escapeHTML(formatPeso(discountShown))}</td>
                    <td>${buildFlags(order)}</td>
                </tr>
            `;
        })
        .join("");
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
                credentials: "include",
                headers: getAuthHeaders()
            });
        } catch (error) {
            console.error("Logout failed:", error);
        } finally {
            localStorage.removeItem("token");
            localStorage.removeItem("staff_user_id");
            localStorage.removeItem("staff_user_email");
            localStorage.removeItem("staff_user_role");
            window.location.href = "loginstaff.html";
        }
    });
}

/* =========================
   AUTO REFRESH
========================= */
function startSalesAutoRefresh() {
    if (salesRefreshInterval) {
        clearInterval(salesRefreshInterval);
    }

    salesRefreshInterval = setInterval(async () => {
        try {
            await refreshSalesReport(true);
        } catch (error) {
            console.error("salesreport auto refresh failed:", error);
        }
    }, 15000);
}

/* =========================
   ACTIONS
========================= */
async function refreshSalesReport(isAutoRefresh = false) {
    try {
        if (refreshBtn && !isAutoRefresh) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp;Refreshing`;
        }

        await loadCurrentUser();
        await loadSalesData();
        renderSummary();
        renderTable();
    } catch (error) {
        console.error("Failed to load sales report:", error);

        if (salesTableBody) {
            salesTableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="empty-state">Failed to load sales report: ${escapeHTML(error.message || "Unknown error")}</td>
                </tr>
            `;
        }
    } finally {
        if (refreshBtn && !isAutoRefresh) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = `<i class="fa-solid fa-rotate"></i>&nbsp;Refresh`;
        }
    }
}

function setupActions() {
    refreshBtn?.addEventListener("click", () => refreshSalesReport(false));
}

/* =========================
   INIT
========================= */
async function initSalesReportPage() {
    setupLogout();
    setupActions();
    await refreshSalesReport(false);
    startSalesAutoRefresh();
}

document.addEventListener("DOMContentLoaded", initSalesReportPage);