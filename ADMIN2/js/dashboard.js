let charts = {};
let modalChartInstance = null;
let lowStockPollInterval = null;
const LOW_STOCK_POLL_MS = 60000;
const PH_TIMEZONE = "Asia/Manila";

function getSelectedTimeframe() {
    const filter = document.getElementById("timeframeFilter");
    return filter?.value === "daily" ? "daily" : "weekly";
}

function updateDashboardTitle(timeframe) {
    const titleEl = document.getElementById("dashboardTitle");
    if (!titleEl) return;

    titleEl.innerText = timeframe === "daily" ? "Daily Report" : "Weekly Report";
}
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
function formatPesoDisplay(value) {
    return `₱${Number(value || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}
function getInventoryDataFromDashboard(apiData) {
    const items = apiData?.low_stock?.items || [];

    const sortedItems = [...items]
        .sort((a, b) => Number(a.quantity || 0) - Number(b.quantity || 0))
        .slice(0, 10);

    if (!sortedItems.length) {
        return {
            labels: ["No Low Stock"],
            values: [0]
        };
    }

    return {
        labels: sortedItems.map(item => item.name || "Unknown"),
        values: sortedItems.map(item => Number(item.quantity || 0))
    };
}

async function fetchDashboardData() {
    try {
        const timeframe = getSelectedTimeframe();

        const response = await fetch(`${API_URL}/reports/dashboard/overview?timeframe=${encodeURIComponent(timeframe)}`, {
            method: "GET",
            headers: getAuthHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Dashboard fetch failed: ${response.status}`);
        }

        const data = await response.json();
        console.log("Dashboard data:", data);

        updateDashboardTitle(timeframe);
        await renderDashboardFromAPI(data, timeframe);
    } catch (error) {
        console.error("Dashboard error:", error);

        document.getElementById("statRevenue").innerText = "₱0";
        document.getElementById("statCOGS").innerText = "₱0";
        document.getElementById("statGrossProfit").innerText = "₱0";
        document.getElementById("statProfitMargin").innerText = "0%";
        document.getElementById("statRewards").innerText = "0 pts";
        document.getElementById("statStock").innerText = "0%";
        document.getElementById("currentDate").innerText = new Date().toLocaleDateString("en-PH", {
            timeZone: PH_TIMEZONE,
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }
}
async function renderDashboardFromAPI(apiData, timeframe = "weekly") {
    const isLight = document.body.classList.contains("light-theme");
    Chart.defaults.color = isLight ? "#1c1917" : "#d1d5db";
    const accent = isLight ? "#ff8c00" : "#fcdb05";

    const salesSummary = timeframe === "daily"
        ? (apiData.sales_today || {})
        : (apiData.sales_last_7_days || {});

    const salesSeries = timeframe === "daily"
        ? (apiData.sales_daily_current_day || [])
        : (apiData.sales_daily_last_7_days || []);

    const topProducts = timeframe === "daily"
        ? (apiData.top_products_today || [])
        : (apiData.top_products_last_7_days || []);

    const paymentBreakdown = timeframe === "daily"
        ? (apiData.payment_breakdown_today?.by_type || {})
        : (apiData.payment_breakdown_last_7_days?.by_type || {});
    const rewardsSummary = timeframe === "daily"
        ? (apiData.rewards_today_summary || {})
        : (apiData.rewards_summary || {});
    const profitSummary = timeframe === "daily"
        ? (apiData.profit_today || {})
        : (apiData.profit_last_7_days || {});
    const rewardsSeries = timeframe === "daily"
        ? (apiData.rewards_issued_today || [])
        : (apiData.rewards_issued_last_7_days || []);

    const stockHealth = apiData.stock_health || {};
    const inventoryData = getInventoryDataFromDashboard(apiData);

    const totalRevenue = Number(salesSummary.gross_sales || 0);
    const ingredientCost = Number(profitSummary.cost_of_goods_sold || 0);
    const grossProfit = Number(profitSummary.gross_profit || 0);
    const profitMargin = Number(profitSummary.profit_margin_percent || 0);

    const rewardsIssued = Number(rewardsSummary.total_points_issued || 0);
    const stockHealthPercent = Number(stockHealth.percent || 0);

    document.getElementById("statRevenue").innerText = formatPesoDisplay(totalRevenue);
    document.getElementById("statCOGS").innerText = formatPesoDisplay(ingredientCost);
    document.getElementById("statGrossProfit").innerText = formatPesoDisplay(grossProfit);
    document.getElementById("statProfitMargin").innerText = `${profitMargin.toFixed(2)}%`;

    document.getElementById("statRewards").innerText = `${rewardsIssued.toLocaleString()} pts`;
    document.getElementById("statStock").innerText = `${Math.round(stockHealthPercent)}%`;
    document.getElementById("currentDate").innerText = apiData.date_label || apiData.date || "-";

    renderChart(
        "salesChart",
        "line",
        salesSeries.map(x => x.label || x.date || x.hour || "-"),
        salesSeries.map(x => Number(x.total_orders || 0)),
        accent,
        "Orders",
        true
    );

    renderChart(
        "revenueChart",
        "bar",
        salesSeries.map(x => x.label || x.date || x.hour || "-"),
        salesSeries.map(x => Number(x.gross_sales || 0)),
        "#52c41a",
        "Revenue",
        false
    );
    renderChart(
    "profitChart",
    "bar",
    ["Revenue", "Ingredient Cost", "Gross Profit"],
    [
        Number(profitSummary.gross_sales || 0),
        Number(profitSummary.cost_of_goods_sold || 0),
        Number(profitSummary.gross_profit || 0)
    ],
    ["#52c41a", "#ef4444", "#fcdb05"],
    "Profit Overview",
    false
    );

    renderChart(
        "inventoryChart",
        "bar",
        inventoryData.labels,
        inventoryData.values,
        "#ef4444",
        "Stock Level",
        false
    );

    renderChart(
        "bestSellersChart",
        "bar",
        topProducts.map(x => x.name || "Unknown"),
        topProducts.map(x => Number(x.qty_sold || 0)),
        accent,
        "Units",
        false
    );

    renderChart(
        "paymentChart",
        "doughnut",
        ["Topup", "TeoPay", "Cash", "Refund"],
        [
            Number(paymentBreakdown.TOPUP?.amount || 0),
            Number(paymentBreakdown.TEOPAY_PAYMENT?.amount || 0),
            Number(paymentBreakdown.CASH_PAYMENT?.amount || 0),
            Number(paymentBreakdown.REFUND?.amount || 0)
        ],
        [accent, "#1890ff", "#10b981", "#ef4444"],
        "Payment Breakdown"
    );
    renderChart(
        "rewardsChart",
        "line",
        rewardsSeries.map(x => x.label || x.date || x.hour || "-"),
        rewardsSeries.map(x => Number(x.points_issued || 0)),
        "#a855f7",
        "Rewards Points",
        true
    );
}
function renderChart(id, type, labels, data, color, labelName, isGradient = false) {
    const canvas = document.getElementById(id);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (charts[id]) {
        charts[id].destroy();
    }

    const isLight = document.body.classList.contains("light-theme");

    let safeLabels = Array.isArray(labels) ? [...labels] : [];
    let safeData = Array.isArray(data) ? [...data] : [];

    if (safeLabels.length === 0 || safeData.length === 0) {
        if (type === "doughnut") {
            safeLabels = ["No Data"];
            safeData = [1];
            color = ["#444"];
        } else {
            safeLabels = ["No Data"];
            safeData = [0];
        }
    }

    let bg = Array.isArray(color) ? color : color + "33";

    if (isGradient && !Array.isArray(color)) {
        bg = ctx.createLinearGradient(0, 0, 0, 200);
        bg.addColorStop(0, color + "66");
        bg.addColorStop(1, "transparent");
    }

    charts[id] = new Chart(ctx, {
        type: type,
        data: {
            labels: safeLabels,
            datasets: [{
                label: labelName,
                data: safeData,
                backgroundColor: bg,
                borderColor: Array.isArray(color) ? color : color,
                borderWidth: 2.5,
                tension: 0.4,
                borderRadius: 8,
                fill: isGradient && type === "line"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 1200, easing: "easeOutQuart" },
            plugins: {
                legend: { display: type === "doughnut" }
            },
            scales: type === "doughnut" ? {} : {
                y: {
                    display: true,
                    grid: {
                        color: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"
                    },
                    beginAtZero: true
                },
                x: {
                    display: true,
                    grid: { display: false }
                }
            }
        }
    });
}

function openModal(chartId, title) {
    const modal = document.getElementById("chartModal");
    const source = charts[chartId];

    if (!source) return;

    document.getElementById("modalTitle").innerText = title;
    modal.classList.add("show");

    const ctx = document.getElementById("modalCanvas").getContext("2d");
    if (modalChartInstance) modalChartInstance.destroy();

    modalChartInstance = new Chart(ctx, {
        type: source.config.type,
        data: {
            labels: source.config.data.labels,
            datasets: source.config.data.datasets.map(ds => ({
                ...ds,
                data: ds.data.map(() => 0)
            }))
        },
        options: {
            ...source.config.options,
            animation: { duration: 1500, easing: "easeOutBack" },
            maintainAspectRatio: false,
            plugins: { legend: { display: true } }
        }
    });

    setTimeout(() => {
        modalChartInstance.data.datasets.forEach((dataset, i) => {
            dataset.data = source.config.data.datasets[i].data;
        });
        modalChartInstance.update();
    }, 100);
}

function closeModal() {
    document.getElementById("chartModal").classList.remove("show");
}
function getDateRangeForExport() {
    const timeframe = getSelectedTimeframe();
    const now = new Date();

    const pad = (n) => String(n).padStart(2, "0");
    const toDateString = (date) =>
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    const endDate = toDateString(now);

    if (timeframe === "daily") {
        return {
            start_date: endDate,
            end_date: endDate
        };
    }

    const start = new Date(now);
    start.setDate(start.getDate() - 6);

    return {
        start_date: toDateString(start),
        end_date: endDate
    };
}

async function exportData() {
    try {
        const range = getDateRangeForExport();
        const qs = new URLSearchParams(range).toString();

        const response = await fetch(`${API_URL}/reports/csv/orders?${qs}`, {
            method: "GET",
            headers: getAuthHeaders(),
        });

        if (!response.ok) {
            let message = `CSV export failed: ${response.status}`;
            try {
                const data = await response.json();
                message = data.detail || data.message || message;
            } catch {}
            throw new Error(message);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `Teo_Reports_${range.start_date}_to_${range.end_date}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Export error:", error);
        alert(error.message || "Failed to export CSV.");
    }
}
async function fetchLowStockAlerts() {
    try {
        const response = await fetch(`${API_URL}/inventory/alerts/low-stock`, {
            method: "GET",
            headers: getAuthHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Low stock alert fetch failed: ${response.status}`);
        }

        const result = await response.json();
        return Array.isArray(result?.data) ? result.data : [];
    } catch (error) {
        console.error("fetchLowStockAlerts error:", error);
        return [];
    }
}

function renderLowStockToasts(items) {
    const container = document.getElementById("lowStockToastContainer");
    if (!container) return;

    const currentIds = new Set(items.map(item => String(item.inventory_master_id)));

    Array.from(container.querySelectorAll(".low-stock-toast")).forEach((toast) => {
        const id = toast.dataset.alertId;
        if (!currentIds.has(id)) {
            toast.remove();
        }
    });

    items.forEach((item) => {
        const alertId = String(item.inventory_master_id);
        let toast = container.querySelector(`.low-stock-toast[data-alert-id="${alertId}"]`);

        const html = `
            <div class="low-stock-toast-head">
                <div class="low-stock-toast-title">
                    Low Stock Alert
                </div>
                <button class="low-stock-toast-close" data-action="dismiss" data-id="${item.inventory_master_id}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <div class="low-stock-toast-body">
                <strong>${item.name}</strong><br>
                Current: ${item.quantity} ${item.unit}<br>
                Threshold: ${item.alert_threshold} ${item.unit}<br>
                Severity: ${item.severity}
            </div>

            <div class="low-stock-toast-actions">
                <button class="low-stock-toast-btn primary" data-action="view">
                    View Inventory
                </button>
                <button class="low-stock-toast-btn secondary" data-action="dismiss" data-id="${item.inventory_master_id}">
                    Dismiss
                </button>
            </div>
        `;

        if (!toast) {
            toast = document.createElement("div");
            toast.className = `low-stock-toast ${item.severity}`;
            toast.dataset.alertId = alertId;
            container.appendChild(toast);
        }

        toast.innerHTML = html;

        toast.querySelectorAll('[data-action="dismiss"]').forEach((btn) => {
            btn.addEventListener("click", async () => {
                await dismissLowStockAlert(item.inventory_master_id);
            });
        });

        const viewBtn = toast.querySelector('[data-action="view"]');
        if (viewBtn) {
            viewBtn.addEventListener("click", () => {
                window.location.href = "inventory.html";
            });
        }
    });
}

async function dismissLowStockAlert(inventoryMasterId) {
    try {
        const response = await fetch(`${API_URL}/inventory/alerts/low-stock/${inventoryMasterId}/dismiss`, {
            method: "POST",
            headers: getAuthHeaders(),
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result?.detail || `Dismiss failed: ${response.status}`);
        }

        await refreshLowStockToasts();
    } catch (error) {
        console.error("dismissLowStockAlert error:", error);
    }
}

async function refreshLowStockToasts() {
    const items = await fetchLowStockAlerts();
    renderLowStockToasts(items);
}

function startLowStockPolling() {
    refreshLowStockToasts();

    if (lowStockPollInterval) {
        clearInterval(lowStockPollInterval);
    }

    lowStockPollInterval = setInterval(() => {
        if (!document.hidden) {
            refreshLowStockToasts();
        }
    }, LOW_STOCK_POLL_MS);
}
window.toggleTheme = function () {
    document.body.classList.toggle("light-theme");
    const isLight = document.body.classList.contains("light-theme");
    localStorage.setItem("theme", isLight ? "light" : "dark");
    document.getElementById("themeIcon").className = isLight ? "fa-solid fa-moon" : "fa-solid fa-sun";
    fetchDashboardData();
};

window.openModal = openModal;
window.closeModal = closeModal;
window.exportData = exportData;

window.onload = () => {
    if (localStorage.getItem("theme") === "light") {
        document.body.classList.add("light-theme");
        document.getElementById("themeIcon").className = "fa-solid fa-moon";
    }

    const timeframeFilter = document.getElementById("timeframeFilter");
    if (timeframeFilter) {
        timeframeFilter.value = "weekly";
    }

    updateDashboardTitle("weekly");
    fetchDashboardData();
    startLowStockPolling();
};