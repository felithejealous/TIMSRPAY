const translations = {
    en: {
        nav_dash: "Dashboard",
        nav_accounts: "Accounts",
        nav_inv: "Inventory",
        nav_menu: "Menu Manager",
        nav_promo: "Promos",
        nav_rewards: "Rewards",
        nav_ann: "Announce",
        nav_pay: "Reports",
        nav_set: "Settings"
    },
    tl: {
        nav_dash: "Dashbord",
        nav_accounts: "Mga Account",
        nav_inv: "Imbentaryo",
        nav_menu: "Tagapamahala ng Menu",
        nav_promo: "Mga Promo",
        nav_rewards: "Mga Gantimpala",
        nav_ann: "Anunsyo",
        nav_pay: "Mga Ulat",
        nav_set: "Settings"
    }
};
function getToken() {
return localStorage.getItem("token");
}

function getAuthHeaders(extra = {}) {
    const token = getToken();
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra
    };
}
function formatPeso(value) {
    return `₱${Number(value || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showAlert(message) {
    const container = document.getElementById("alertContainer");
    if (!container) return;

    const alert = document.createElement("div");
    alert.className = "alert";
    alert.innerText = message;
    container.appendChild(alert);

    setTimeout(() => alert.classList.add("show"), 100);

    setTimeout(() => {
        alert.classList.remove("show");
        setTimeout(() => alert.remove(), 500);
    }, 2800);
}
function applySync() {
    const lang = localStorage.getItem("teoLang") || "en";
    document.querySelectorAll("[data-lang]").forEach((el) => {
        const key = el.getAttribute("data-lang");
        if (!translations[lang] || !translations[lang][key]) return;

        const icon = el.querySelector("i");
        if (icon) {
            el.innerHTML = "";
            el.appendChild(icon);
            el.innerHTML += ` ${translations[lang][key]}`;
        } else {
            el.textContent = translations[lang][key];
        }
    });
}

function buildQuery(params) {
    const search = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== "") {
            search.append(key, String(value).trim());
        }
    });

    return search.toString();
}

function downloadFile(url, filenameFallback = "report.csv") {
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filenameFallback);
    document.body.appendChild(link);
    link.click();
    link.remove();
}

async function fetchJson(url) {
    const response = await fetch(url, {
        method: "GET",
        headers: getAuthHeaders(),
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.detail || `Request failed: ${response.status}`);
    }

    return result;
}

function setPreview(elementId, html) {
    const target = document.getElementById(elementId);
    if (!target) return;
    target.innerHTML = html;
}

function getValue(id) {
    return document.getElementById(id)?.value || "";
}

async function loadTopSummaryCards() {
    try {
        const overview = await fetchJson(`${API_URL}/reports/dashboard/overview`);

        const salesToday = overview?.sales_today?.gross_sales || 0;
        const ordersToday = overview?.sales_today?.total_orders || 0;
        const walletPaymentsToday = overview?.wallet_today?.by_type?.PAYMENT?.amount || 0;
        const lowStockCount = overview?.low_stock?.count || 0;

        const salesTodayEl = document.getElementById("salesToday");
        const ordersTodayEl = document.getElementById("ordersToday");
        const walletPaymentsTodayEl = document.getElementById("walletPaymentsToday");
        const lowStockCountEl = document.getElementById("lowStockCount");

        if (salesTodayEl) salesTodayEl.innerText = formatPeso(salesToday);
        if (ordersTodayEl) ordersTodayEl.innerText = Number(ordersToday).toLocaleString();
        if (walletPaymentsTodayEl) walletPaymentsTodayEl.innerText = formatPeso(walletPaymentsToday);
        if (lowStockCountEl) lowStockCountEl.innerText = Number(lowStockCount).toLocaleString();
    } catch (error) {
        console.error("Dashboard overview error:", error);
        showAlert("Failed to load summary cards");
    }
}

function downloadOrdersCsv() {
    const qs = buildQuery({
        start_date: getValue("ordersStartDate"),
        end_date: getValue("ordersEndDate"),
        status: getValue("ordersStatus"),
        order_type: getValue("ordersType")
    });

    downloadFile(`${API_URL}/reports/csv/orders${qs ? `?${qs}` : ""}`, "orders_sales.csv");
    showAlert("Orders CSV download started");
}

function downloadWalletCsv() {
    const qs = buildQuery({
        start_date: getValue("walletStartDate"),
        end_date: getValue("walletEndDate"),
        tx_type: getValue("walletTxType"),
        user_id: getValue("walletUserId")
    });

    downloadFile(`${API_URL}/reports/csv/wallet-transactions${qs ? `?${qs}` : ""}`, "wallet_transactions.csv");
    showAlert("Wallet CSV download started");
}

function downloadLowStockCsv() {
    const qs = buildQuery({
        threshold: getValue("lowStockThreshold")
    });

    downloadFile(`${API_URL}/reports/csv/low-stock${qs ? `?${qs}` : ""}`, "low_stock.csv");
    showAlert("Low stock CSV download started");
}

function downloadInventoryCsv() {
    const qs = buildQuery({
        kind: getValue("inventoryKind"),
        start_date: getValue("inventoryStartDate"),
        end_date: getValue("inventoryEndDate")
    });

    downloadFile(`${API_URL}/reports/csv/inventory-movements${qs ? `?${qs}` : ""}`, "inventory_movements.csv");
    showAlert("Inventory CSV download started");
}

async function previewSalesSummary() {
    try {
        const qs = buildQuery({
            start_date: getValue("ordersStartDate"),
            end_date: getValue("ordersEndDate")
        });

        const data = await fetchJson(`${API_URL}/reports/sales/summary${qs ? `?${qs}` : ""}`);

        setPreview("ordersPreview", `
            <div><span class="label">Range:</span> ${escapeHtml(data.range.start_date)} to ${escapeHtml(data.range.end_date)}</div>
            <div><span class="label">Total Orders:</span> ${Number(data.total_orders || 0).toLocaleString()}</div>
            <div><span class="label">Gross Sales:</span> ${escapeHtml(formatPeso(data.gross_sales || 0))}</div>
            <div><span class="label">Subtotal:</span> ${escapeHtml(formatPeso(data.subtotal_total || 0))}</div>
            <div><span class="label">VAT:</span> ${escapeHtml(formatPeso(data.vat_total || 0))}</div>
            <div><span class="label">Average Order Value:</span> ${escapeHtml(formatPeso(data.avg_order_value || 0))}</div>
        `);

        showAlert("Sales summary loaded");
    } catch (error) {
        console.error("Sales summary preview error:", error);
        setPreview("ordersPreview", `<div class="text-red-400">Failed to load sales summary.</div>`);
    }
}

async function previewWalletSummary() {
    try {
        const qs = buildQuery({
            start_date: getValue("walletStartDate"),
            end_date: getValue("walletEndDate")
        });

        const data = await fetchJson(`${API_URL}/reports/wallet/summary${qs ? `?${qs}` : ""}`);
        const topup = data?.by_type?.TOPUP || { count: 0, amount: 0 };
        const payment = data?.by_type?.PAYMENT || { count: 0, amount: 0 };
        const refund = data?.by_type?.REFUND || { count: 0, amount: 0 };

        setPreview("walletPreview", `
            <div><span class="label">Range:</span> ${escapeHtml(data.range.start_date)} to ${escapeHtml(data.range.end_date)}</div>
            <div><span class="label">Topup:</span> ${topup.count} tx • ${escapeHtml(formatPeso(topup.amount))}</div>
            <div><span class="label">Payment:</span> ${payment.count} tx • ${escapeHtml(formatPeso(payment.amount))}</div>
            <div><span class="label">Refund:</span> ${refund.count} tx • ${escapeHtml(formatPeso(refund.amount))}</div>
        `);

        showAlert("Wallet summary loaded");
    } catch (error) {
        console.error("Wallet summary preview error:", error);
        setPreview("walletPreview", `<div class="text-red-400">Failed to load wallet summary.</div>`);
    }
}

async function previewLowStock() {
    try {
        const qs = buildQuery({
            threshold: getValue("lowStockThreshold")
        });

        const data = await fetchJson(`${API_URL}/reports/inventory/low-stock${qs ? `?${qs}` : ""}`);
        const items = data.data || [];

        if (!items.length) {
            setPreview("lowStockPreview", `
                <div><span class="label">Threshold:</span> ${escapeHtml(String(data.threshold))}</div>
                <div>No low stock items found.</div>
            `);
            showAlert("Low stock preview loaded");
            return;
        }

        const topItems = items.slice(0, 5).map(item => `
            <div>• ${escapeHtml(item.name)} — ${escapeHtml(String(item.quantity))} ${escapeHtml(item.unit || "")}</div>
        `).join("");

        setPreview("lowStockPreview", `
            <div><span class="label">Threshold:</span> ${escapeHtml(String(data.threshold))}</div>
            <div><span class="label">Matches:</span> ${items.length}</div>
            ${topItems}
        `);

        showAlert("Low stock preview loaded");
    } catch (error) {
        console.error("Low stock preview error:", error);
        setPreview("lowStockPreview", `<div class="text-red-400">Failed to load low stock items.</div>`);
    }
}

async function previewInventoryUsage() {
    try {
        const kind = getValue("inventoryKind");
        const previewId = "inventoryPreview";

        if (kind === "master") {
            const qs = buildQuery({
                start_date: getValue("inventoryStartDate"),
                end_date: getValue("inventoryEndDate")
            });

            const data = await fetchJson(`${API_URL}/reports/inventory/master-usage${qs ? `?${qs}` : ""}`);
            const items = data.data || [];

            if (!items.length) {
                setPreview(previewId, `<div>No inventory usage records found.</div>`);
                showAlert("Inventory usage loaded");
                return;
            }

            const topItems = items.slice(0, 5).map(item => `
                <div>• ${escapeHtml(item.name)} — used ${escapeHtml(String(item.used_qty))} ${escapeHtml(item.unit || "")}</div>
            `).join("");

            setPreview(previewId, `
                <div><span class="label">Range:</span> ${escapeHtml(data.range.start_date)} to ${escapeHtml(data.range.end_date)}</div>
                <div><span class="label">Top Results:</span></div>
                ${topItems}
            `);

            showAlert("Inventory usage loaded");
            return;
        }

        const qs = buildQuery({
            kind,
            start_date: getValue("inventoryStartDate"),
            end_date: getValue("inventoryEndDate"),
            limit: 5
        });

        const data = await fetchJson(`${API_URL}/reports/logs/inventory-movements?${qs}`);
        const items = data.data || [];

        if (!items.length) {
            setPreview(previewId, `<div>No inventory product movement records found.</div>`);
            showAlert("Inventory movements loaded");
            return;
        }

        const topItems = items.slice(0, 5).map(item => `
            <div>• ${escapeHtml(item.product_name || "Unknown")} — ${escapeHtml(String(item.change_quantity))} (${escapeHtml(item.reason || "-")})</div>
        `).join("");

        setPreview(previewId, `
            <div><span class="label">Kind:</span> ${escapeHtml(kind)}</div>
            <div><span class="label">Recent Results:</span></div>
            ${topItems}
        `);

        showAlert("Inventory movements loaded");
    } catch (error) {
        console.error("Inventory preview error:", error);
        setPreview("inventoryPreview", `<div class="text-red-400">Failed to load inventory preview.</div>`);
    }
}

async function previewCancellationLogs() {
    try {
        const qs = buildQuery({
            start_date: getValue("cancelStartDate"),
            end_date: getValue("cancelEndDate"),
            limit: 5
        });

        const data = await fetchJson(`${API_URL}/reports/logs/order-cancellations${qs ? `?${qs}` : ""}`);
        const items = data.data || [];

        if (!items.length) {
            setPreview("cancelPreview", `<div>No cancellation logs found.</div>`);
            showAlert("Cancellation logs loaded");
            return;
        }

        const lines = items.map(item => `
            <div>
                • Order #${escapeHtml(String(item.order_id))} — ${escapeHtml(formatPeso(item.total_amount || 0))}
                <br><span class="label">Reason:</span> ${escapeHtml(item.cancel_reason || "No reason")}
            </div>
        `).join("");

        setPreview("cancelPreview", `
            <div><span class="label">Total Results:</span> ${Number(data.total || 0).toLocaleString()}</div>
            ${lines}
        `);

        showAlert("Cancellation logs loaded");
    } catch (error) {
        console.error("Cancellation logs preview error:", error);
        setPreview("cancelPreview", `<div class="text-red-400">Failed to load cancellation logs.</div>`);
    }
}

async function previewRewardsIssued() {
    try {
        const days = getValue("rewardsDays") || "7";
        const qs = buildQuery({ days });

        const data = await fetchJson(`${API_URL}/reports/rewards/issued?${qs}`);
        const rows = data.data || [];

        const lines = rows.slice(-5).map(item => `
            <div>
                • ${escapeHtml(item.date)} — ${Number(item.points_issued || 0).toLocaleString()} pts
                (${Number(item.cups_equivalent || 0).toLocaleString()} cups)
            </div>
        `).join("");

        setPreview("rewardsPreview", `
            <div><span class="label">Days:</span> ${escapeHtml(String(data.days || days))}</div>
            <div><span class="label">Total Points Issued:</span> ${Number(data.total_points_issued || 0).toLocaleString()}</div>
            <div><span class="label">Cup Equivalent:</span> ${Number(data.total_cups_equivalent || 0).toLocaleString()}</div>
            ${lines}
        `);

        showAlert("Rewards overview loaded");
    } catch (error) {
        console.error("Rewards issued preview error:", error);
        setPreview("rewardsPreview", `<div class="text-red-400">Failed to load rewards overview.</div>`);
    }
}

async function previewDashboardOverview() {
    try {
        const data = await fetchJson(`${API_URL}/reports/dashboard/overview`);

        setPreview("rewardsPreview", `
            <div><span class="label">Date:</span> ${escapeHtml(data.date || "-")}</div>
            <div><span class="label">Sales Today:</span> ${escapeHtml(formatPeso(data?.sales_today?.gross_sales || 0))}</div>
            <div><span class="label">Orders Today:</span> ${Number(data?.sales_today?.total_orders || 0).toLocaleString()}</div>
            <div><span class="label">Low Stock Items:</span> ${Number(data?.low_stock?.count || 0).toLocaleString()}</div>
            <div><span class="label">Points Issued (7d):</span> ${Number(data?.rewards_summary?.total_points_issued || 0).toLocaleString()}</div>
        `);

        await loadTopSummaryCards();
        showAlert("Dashboard overview loaded");
    } catch (error) {
        console.error("Dashboard overview preview error:", error);
        setPreview("rewardsPreview", `<div class="text-red-400">Failed to load dashboard overview.</div>`);
    }
}

function initializeDefaultDates() {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    [
        "ordersStartDate",
        "ordersEndDate",
        "walletStartDate",
        "walletEndDate",
        "inventoryStartDate",
        "inventoryEndDate",
        "cancelStartDate",
        "cancelEndDate"
    ].forEach(id => {
        const input = document.getElementById(id);
        if (input && !input.value) {
            input.value = todayStr;
        }
    });
}

async function initializeReportsPage() {
    initializeDefaultDates();
    await loadTopSummaryCards();
}

window.downloadOrdersCsv = downloadOrdersCsv;
window.downloadWalletCsv = downloadWalletCsv;
window.downloadLowStockCsv = downloadLowStockCsv;
window.downloadInventoryCsv = downloadInventoryCsv;
window.previewSalesSummary = previewSalesSummary;
window.previewWalletSummary = previewWalletSummary;
window.previewLowStock = previewLowStock;
window.previewInventoryUsage = previewInventoryUsage;
window.previewCancellationLogs = previewCancellationLogs;
window.previewRewardsIssued = previewRewardsIssued;
window.previewDashboardOverview = previewDashboardOverview;

window.onload = () => {
    initializeReportsPage();
};