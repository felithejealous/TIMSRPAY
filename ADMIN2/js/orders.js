let ordersCache = [];
let refundsCache = [];
let autoRefreshInterval = null;
const AUTO_REFRESH_MS = 5000;

async function fetchOrders() {
    try {
        const response = await fetch(`${API_URL}/orders`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`Orders fetch failed: ${response.status}`);
        }

        const result = await response.json();
        ordersCache = result.data || [];
    } catch (error) {
        console.error("Orders fetch error:", error);
        ordersCache = [];
    }
}

async function fetchRefunds() {
    try {
        const response = await fetch(`${API_URL}/orders/refunds`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`Refund fetch failed: ${response.status}`);
        }

        const result = await response.json();
        refundsCache = result.data || [];
    } catch (error) {
        console.error("Refund fetch error:", error);
        refundsCache = [];
    }
}

function formatPeso(value) {
    return `₱${Number(value || 0).toFixed(2)}`;
}

function getPeriodRange(period) {
    const now = new Date();
    const start = new Date(now);

    if (period === "today") {
        start.setHours(0, 0, 0, 0);
    } else if (period === "week") {
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1);
        start.setDate(diff);
        start.setHours(0, 0, 0, 0);
    } else if (period === "month") {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
    }

    return start;
}

function mapPaymentForUI(paymentMethod) {
    const raw = (paymentMethod || "").toLowerCase();

    if (raw === "wallet" || raw === "teopay") return "TeoPay";
    if (raw === "gcash") return "GCash";
    return "Cash";
}

function mapServiceForUI(orderType) {
    const raw = (orderType || "").toLowerCase();

    if (raw === "online") return "Delivery";
    return "Walk-in";
}

function isRevenueCountable(status) {
    const s = (status || "").toLowerCase();
    return s === "paid" || s === "completed";
}

function isSuccessfulOrder(status) {
    const s = (status || "").toLowerCase();
    return s === "paid" || s === "completed";
}

function loadOrders() {
    const body = document.getElementById("orderTableBody");
    const paymentFilter = document.getElementById("paymentFilter").value;
    const serviceFilter = document.getElementById("serviceFilter").value;
    const periodFilter = document.getElementById("periodFilter").value;
    const recordViewFilter = document.getElementById("recordViewFilter").value;

    const periodStart = getPeriodRange(periodFilter);

    body.innerHTML = "";

    let totalRev = 0;
    let teoVol = 0;
    let count = 0;

    const filtered = ordersCache.filter(order => {
        const payment = mapPaymentForUI(order.payment_method);
        const service = mapServiceForUI(order.order_type);
        const createdAt = new Date(order.created_at);

        const periodMatch = createdAt >= periodStart;
        const paymentMatch = paymentFilter === "all" || payment === paymentFilter;
        const serviceMatch = serviceFilter === "all" || service === serviceFilter;

        let recordMatch = true;
        if (recordViewFilter === "successful") {
            recordMatch = isSuccessfulOrder(order.status);
        }

        return periodMatch && paymentMatch && serviceMatch && recordMatch;
    });

    filtered.forEach(order => {
        count++;

        const payment = mapPaymentForUI(order.payment_method);
        const service = mapServiceForUI(order.order_type);
        const status = (order.status || "").toLowerCase();
        const revenueAllowed = isRevenueCountable(status);

        if (revenueAllowed) {
            totalRev += Number(order.total_amount || 0);

            if (payment === "TeoPay") {
                teoVol += Number(order.total_amount || 0);
            }
        }

        body.innerHTML += `
            <tr>
                <td class="font-mono text-yellow-400 font-bold">${order.display_id || "#" + order.order_id}</td>
                <td>
                    <div class="font-bold">${order.customer_name || "Unknown Customer"}</div>
                    <div class="text-[10px] opacity-50">${service}</div>
                </td>
                <td class="text-xs opacity-70">${new Date(order.created_at).toLocaleString()}</td>
                <td class="text-xs opacity-70">-</td>
                <td class="font-black">${formatPeso(order.total_amount)}</td>
                <td>
                    <button onclick="viewDetails(${order.order_id})"
                        class="bg-white/5 hover:bg-yellow-400 hover:text-black p-2 px-4 rounded-lg text-[10px] font-black uppercase transition">
                        View
                    </button>
                </td>
            </tr>
        `;
    });

    document.getElementById("countToday").innerText = count;
    document.getElementById("revenueToday").innerText = formatPeso(totalRev);
    document.getElementById("teopayToday").innerText = formatPeso(teoVol);
}

function loadRefunds() {
    const body = document.getElementById("refundTableBody");
    if (!body) return;

    const paymentFilter = document.getElementById("paymentFilter").value;
    const serviceFilter = document.getElementById("serviceFilter").value;
    const periodFilter = document.getElementById("periodFilter").value;

    const periodStart = getPeriodRange(periodFilter);

    body.innerHTML = "";

    const filtered = refundsCache.filter(refund => {
        const payment = mapPaymentForUI(refund.payment_method);
        const service = mapServiceForUI(refund.order_type);
        const refundDate = refund.last_refund_at ? new Date(refund.last_refund_at) : new Date(refund.created_at);

        const periodMatch = refundDate >= periodStart;
        const paymentMatch = paymentFilter === "all" || payment === paymentFilter;
        const serviceMatch = serviceFilter === "all" || service === serviceFilter;

        return periodMatch && paymentMatch && serviceMatch;
    });

    if (!filtered.length) {
        body.innerHTML = `
            <tr>
                <td colspan="6" class="text-center opacity-60">No refund history found.</td>
            </tr>
        `;
        return;
    }

    filtered.forEach(refund => {
        body.innerHTML += `
            <tr>
                <td class="font-mono text-yellow-400 font-bold">${refund.display_id || "#" + refund.order_id}</td>
                <td>
                    <div class="font-bold">${refund.customer_name || "Unknown Customer"}</div>
                    <div class="text-[10px] opacity-50">${mapServiceForUI(refund.order_type)}</div>
                </td>
                <td class="text-xs opacity-70">
                    ${refund.last_refund_at ? new Date(refund.last_refund_at).toLocaleString() : "-"}
                </td>
                <td class="text-xs">${mapPaymentForUI(refund.payment_method)}</td>
                <td><span class="text-red-400 font-black text-xs uppercase">Refunded</span></td>
                <td class="font-black text-red-400">${formatPeso(refund.refund_amount)}</td>
            </tr>
        `;
    });
}

function loadOrdersView() {
    const recordViewFilter = document.getElementById("recordViewFilter").value;
    const ordersSection = document.getElementById("ordersSection");
    const refundSection = document.getElementById("refundSection");

    if (recordViewFilter === "all") {
        if (ordersSection) ordersSection.style.display = "";
        if (refundSection) refundSection.style.display = "";
        loadOrders();
        loadRefunds();
        return;
    }

    if (recordViewFilter === "successful") {
        if (ordersSection) ordersSection.style.display = "";
        if (refundSection) refundSection.style.display = "none";
        loadOrders();
        return;
    }

    if (recordViewFilter === "refunded") {
        if (ordersSection) ordersSection.style.display = "none";
        if (refundSection) refundSection.style.display = "";
        loadRefunds();
    }
}

async function viewDetails(orderId) {
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}/receipt`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`Receipt fetch failed: ${response.status}`);
        }

        const o = await response.json();
        const sourceOrder = ordersCache.find(x => x.order_id === orderId);

        const content = document.getElementById("modalContent");
        const rewardSection = document.getElementById("rewardSection");

        const itemLines = (o.items || [])
            .map(item => `${item.qty}x ${item.name}`)
            .join(", ");

        const paymentMode = mapPaymentForUI(sourceOrder?.payment_method);
        const customerName = sourceOrder?.customer_name || o.customer_name || "Unknown Customer";

        const refundedBadge = o.is_refunded
            ? `<span class="text-red-400 font-black">REFUNDED</span>`
            : `<span class="font-bold text-xs">${o.status}</span>`;

        const refundBlock = o.is_refunded
            ? `
                <div class="flex justify-between border-b border-white/5 pb-2">
                    <span class="text-[10px] font-black uppercase opacity-40">Refund Status</span>
                    <span class="text-red-400 font-black text-xs">Refunded</span>
                </div>
                <div class="flex justify-between border-b border-white/5 pb-2">
                    <span class="text-[10px] font-black uppercase opacity-40">Refund Amount</span>
                    <span class="font-bold text-xs text-red-400">${formatPeso(o.refund_amount || 0)}</span>
                </div>
                <div class="flex justify-between border-b border-white/5 pb-2">
                    <span class="text-[10px] font-black uppercase opacity-40">Refund Date</span>
                    <span class="font-bold text-xs">${o.last_refund_at ? new Date(o.last_refund_at).toLocaleString() : "-"}</span>
                </div>
            `
            : "";

        content.innerHTML = `
            <div class="flex justify-between border-b border-white/5 pb-2">
                <span class="text-[10px] font-black uppercase opacity-40">Customer</span>
                <span class="font-bold text-xs text-right">${customerName}</span>
            </div>
            <div class="flex justify-between border-b border-white/5 pb-2">
                <span class="text-[10px] font-black uppercase opacity-40">Items</span>
                <span class="font-bold text-xs text-right">${itemLines || "No items"}</span>
            </div>
            <div class="flex justify-between border-b border-white/5 pb-2">
                <span class="text-[10px] font-black uppercase opacity-40">Payment Mode</span>
                <span class="font-bold text-xs">${paymentMode}</span>
            </div>
            <div class="flex justify-between border-b border-white/5 pb-2">
                <span class="text-[10px] font-black uppercase opacity-40">Order Type</span>
                <span class="font-bold text-xs">${mapServiceForUI(o.order_type)}</span>
            </div>
            <div class="flex justify-between border-b border-white/5 pb-2">
                <span class="text-[10px] font-black uppercase opacity-40">Status</span>
                ${refundedBadge}
            </div>
            <div class="flex justify-between border-b border-white/5 pb-2">
                <span class="text-[10px] font-black uppercase opacity-40">Total</span>
                <span class="font-bold text-xs">${formatPeso(o.total_amount)}</span>
            </div>
            ${refundBlock}
        `;

        rewardSection.innerHTML = `
            <div class="reward-highlight">
                <div class="text-yellow-400 text-[10px] font-black uppercase tracking-widest mb-2">
                    <i class="fa-solid fa-gift mr-2"></i> Rewards Info
                </div>
                <div class="flex justify-between text-xs">
                    <span>Earned Points:</span>
                    <b class="text-green-400">${o.earned_points || 0} Points</b>
                </div>
                <div class="flex justify-between text-xs mt-1">
                    <span>Points Status:</span>
                    <b>${o.points_status || "none"}</b>
                </div>
            </div>
        `;

        document.getElementById("detailsModal").classList.add("show");
    } catch (error) {
        console.error("View details error:", error);
        alert("Failed to load order details.");
    }
}

function closeModal() {
    document.getElementById("detailsModal").classList.remove("show");
}

function exportToExcel() {
    const exportRows = ordersCache.map(o => ({
        ID: o.display_id || `#${o.order_id}`,
        Customer: o.customer_name || "Unknown Customer",
        Email: o.customer_email || "",
        DateTime: new Date(o.created_at).toLocaleString(),
        Payment: mapPaymentForUI(o.payment_method),
        Service: mapServiceForUI(o.order_type),
        Status: o.status,
        Total: Number(o.total_amount || 0),
        Items: o.items_summary || "",
        EarnedPoints: o.earned_points || 0
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, `TeoDMango_Ledger_${new Date().toISOString().split("T")[0]}.xlsx`);
}

function toggleTheme() {
    document.body.classList.toggle("light-theme");
    const isLight = document.body.classList.contains("light-theme");
    localStorage.setItem("theme", isLight ? "light" : "dark");
    document.getElementById("themeIcon").className = isLight ? "fa-solid fa-moon" : "fa-solid fa-sun";
}

async function refreshOrdersData() {
    await Promise.all([fetchOrders(), fetchRefunds()]);
    loadOrdersView();
}

function startAutoRefresh() {
    if (autoRefreshInterval) return;

    autoRefreshInterval = setInterval(async () => {
        if (document.hidden) return;
        await refreshOrdersData();
    }, AUTO_REFRESH_MS);
}

function stopAutoRefresh() {
    if (!autoRefreshInterval) return;
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
}

document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
        stopAutoRefresh();
    } else {
        await refreshOrdersData();
        startAutoRefresh();
    }
});

window.viewDetails = viewDetails;
window.closeModal = closeModal;
window.exportToExcel = exportToExcel;
window.toggleTheme = toggleTheme;
window.loadOrders = loadOrders;
window.loadOrdersView = loadOrdersView;

window.onload = async () => {
    applySync();

    const theme = localStorage.getItem("theme");
    if (theme === "light") {
        document.body.classList.add("light-theme");
        document.getElementById("themeIcon").className = "fa-solid fa-moon";
    }

    await refreshOrdersData();
    startAutoRefresh();
};