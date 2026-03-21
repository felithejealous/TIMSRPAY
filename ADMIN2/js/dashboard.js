let charts = {};
let modalChartInstance = null;

async function fetchInventoryMasterData() {
    try {
        const response = await fetch(`${API_URL}/inventory/master`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`Inventory fetch failed: ${response.status}`);
        }

        const result = await response.json();
        const items = result.data || [];

        const sortedItems = [...items]
            .filter(item => item.is_active)
            .sort((a, b) => a.quantity - b.quantity)
            .slice(0, 10);

        return {
            labels: sortedItems.map(item => item.name),
            values: sortedItems.map(item => item.quantity)
        };
    } catch (error) {
        console.error("Inventory fetch error:", error);
        return {
            labels: ["No Data"],
            values: [0]
        };
    }
}

async function fetchDashboardData() {
    try {
        const response = await fetch(`${API_URL}/reports/dashboard/overview`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`Dashboard fetch failed: ${response.status}`);
        }

        const data = await response.json();
        console.log("Dashboard data:", data);

        await renderDashboardFromAPI(data);
    } catch (error) {
        console.error("Dashboard error:", error);

        document.getElementById("statRevenue").innerText = "₱0";
        document.getElementById("statRewards").innerText = "0 pts";
        document.getElementById("statStock").innerText = "0%";
        document.getElementById("currentDate").innerText = new Date().toDateString();
    }
}

async function renderDashboardFromAPI(apiData) {
    const isLight = document.body.classList.contains("light-theme");
    Chart.defaults.color = isLight ? "#1c1917" : "#d1d5db";
    const accent = isLight ? "#ff8c00" : "#fcdb05";

    const salesToday = apiData.sales_today || {};
    const salesDaily = apiData.sales_daily_last_7_days || [];
    const topProducts = apiData.top_products_last_7_days || [];
    const walletToday = apiData.wallet_today?.by_type || {};

    const rewardsSummary = apiData.rewards_summary || {};
    const rewardsSeries = apiData.rewards_issued_last_7_days || [];
    const stockHealth = apiData.stock_health || {};

    const inventoryData = await fetchInventoryMasterData();

    const totalRevenue = salesToday.gross_sales || 0;
    const rewardsIssued = rewardsSummary.total_points_issued || 0;
    const stockHealthPercent = Number(stockHealth.percent || 0);

    document.getElementById("statRevenue").innerText = `₱${Number(totalRevenue).toLocaleString()}`;
    document.getElementById("statRewards").innerText = `${Number(rewardsIssued).toLocaleString()} pts`;
    document.getElementById("statStock").innerText = `${Math.round(stockHealthPercent)}%`;
    document.getElementById("currentDate").innerText = apiData.date || new Date().toDateString();

    renderChart(
        "salesChart",
        "line",
        salesDaily.map(x => x.date),
        salesDaily.map(x => x.total_orders),
        accent,
        "Orders",
        true
    );

    renderChart(
        "revenueChart",
        "bar",
        salesDaily.map(x => x.date),
        salesDaily.map(x => x.gross_sales),
        "#52c41a",
        "Revenue",
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
        topProducts.map(x => x.name),
        topProducts.map(x => x.qty_sold),
        accent,
        "Units",
        false
    );

    renderChart(
        "paymentChart",
        "doughnut",
        ["Topup", "Payment", "Refund"],
        [
            walletToday.TOPUP?.amount || 0,
            walletToday.PAYMENT?.amount || 0,
            walletToday.REFUND?.amount || 0
        ],
        [accent, "#1890ff", "#ef4444"],
        "Wallet"
    );

    renderChart(
        "rewardsChart",
        "line",
        rewardsSeries.map(x => x.date),
        rewardsSeries.map(x => x.points_issued),
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

async function exportData() {
    try {
        const response = await fetch(`${API_URL}/reports/csv/orders`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error("CSV export failed");
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Teo_Reports.csv";
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Export error:", error);
    }
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
    fetchDashboardData();
};