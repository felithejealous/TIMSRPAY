let ordersCache = [];
let refundsCache = [];
let autoRefreshInterval = null;

const AUTO_REFRESH_MS = 5000;
const ORDER_DISPLAY_OFFSET = 900;

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatPeso(value) {
    return `₱${Number(value || 0).toFixed(2)}`;
}

function formatPoints(value) {
    return `${Number(value || 0).toLocaleString()} pts`;
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
}

function formatOrderDisplayId(orderId, displayId = null) {
    if (displayId) return displayId;
    return `#TM-${ORDER_DISPLAY_OFFSET + Number(orderId || 0)}`;
}

function getOrderDisplayId(order) {
    return formatOrderDisplayId(order?.order_id, order?.display_id);
}

async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        ...options
    });

    let result = {};
    try {
        result = await response.json();
    } catch {
        result = {};
    }

    if (!response.ok) {
        throw new Error(result.detail || `Request failed: ${response.status}`);
    }

    return result;
}

async function fetchOrders() {
    try {
        const result = await apiFetch(`${API_URL}/orders/`, {
            method: "GET"
        });

        ordersCache = result.data || [];
    } catch (error) {
        console.error("Orders fetch error:", error);
        ordersCache = [];
    }
}

async function fetchRefunds() {
    try {
        const result = await apiFetch(`${API_URL}/orders/refunds/`, {
            method: "GET"
        });

        refundsCache = result.data || [];
    } catch (error) {
        console.error("Refund fetch error:", error);
        refundsCache = [];
    }
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

function getPointsSyncLabel(order) {
    const synced = Boolean(order?.points_synced);
    const earned = Number(order?.earned_points || 0);

    if (earned <= 0) return "No points";
    if (synced) return "Claimed";
    return "Pending";
}

function getPointsSyncColor(order) {
    const synced = Boolean(order?.points_synced);
    const earned = Number(order?.earned_points || 0);

    if (earned <= 0) return "text-white/50";
    if (synced) return "text-green-400";
    return "text-yellow-400";
}

function getSelectedFilters() {
    return {
        paymentFilter: $("paymentFilter")?.value || "all",
        serviceFilter: $("serviceFilter")?.value || "all",
        periodFilter: $("periodFilter")?.value || "today",
        recordViewFilter: $("recordViewFilter")?.value || "all"
    };
}

function matchesOrderFilters(order, filters) {
    const payment = mapPaymentForUI(order.payment_method);
    const service = mapServiceForUI(order.order_type);
    const createdAt = new Date(order.created_at);
    const periodStart = getPeriodRange(filters.periodFilter);

    const periodMatch = createdAt >= periodStart;
    const paymentMatch = filters.paymentFilter === "all" || payment === filters.paymentFilter;
    const serviceMatch = filters.serviceFilter === "all" || service === filters.serviceFilter;

    let recordMatch = true;
    if (filters.recordViewFilter === "successful") {
        recordMatch = isSuccessfulOrder(order.status);
    }

    return periodMatch && paymentMatch && serviceMatch && recordMatch;
}

function matchesRefundFilters(refund, filters) {
    const payment = mapPaymentForUI(refund.payment_method);
    const service = mapServiceForUI(refund.order_type);
    const refundDate = refund.last_refund_at
        ? new Date(refund.last_refund_at)
        : new Date(refund.created_at);

    const periodStart = getPeriodRange(filters.periodFilter);

    const periodMatch = refundDate >= periodStart;
    const paymentMatch = filters.paymentFilter === "all" || payment === filters.paymentFilter;
    const serviceMatch = filters.serviceFilter === "all" || service === filters.serviceFilter;

    return periodMatch && paymentMatch && serviceMatch;
}

function renderEmptyRow(colspan, text) {
    return `
        <tr>
            <td colspan="${colspan}" class="text-center opacity-60">${escapeHtml(text)}</td>
        </tr>
    `;
}

function loadOrders() {
    const body = $("orderTableBody");
    if (!body) return;

    const filters = getSelectedFilters();
    const filtered = ordersCache.filter(order => matchesOrderFilters(order, filters));

    let totalRevenue = 0;
    let teoPayVolume = 0;
    let totalCount = 0;

    if (!filtered.length) {
        body.innerHTML = renderEmptyRow(6, "No orders found.");
        $("countToday").innerText = "0";
        $("revenueToday").innerText = formatPeso(0);
        $("teopayToday").innerText = formatPeso(0);
        return;
    }

    body.innerHTML = filtered.map(order => {
        totalCount++;

        const payment = mapPaymentForUI(order.payment_method);
        const service = mapServiceForUI(order.order_type);
        const status = (order.status || "").toLowerCase();

        if (isRevenueCountable(status)) {
            totalRevenue += Number(order.total_amount || 0);

            if (payment === "TeoPay") {
                teoPayVolume += Number(order.total_amount || 0);
            }
        }

        return `
    <tr>
        <td class="font-mono text-yellow-400 font-bold">${escapeHtml(getOrderDisplayId(order))}</td>
        <td>
            <div class="font-bold">${escapeHtml(order.customer_name || "Unknown Customer")}</div>
            <div class="text-[10px] opacity-50 flex gap-2 flex-wrap">
                <span>${escapeHtml(service)}</span>
                <span class="${getPointsSyncColor(order)}">${escapeHtml(getPointsSyncLabel(order))}</span>
            </div>
        </td>
        <td class="text-xs opacity-70">${escapeHtml(formatDateTime(order.created_at))}</td>
        <td class="text-xs opacity-70">${escapeHtml(order.processed_by_staff_name || "-")}</td>
        <td class="font-black">${escapeHtml(formatPeso(order.total_amount))}</td>
        <td>
            <button
                onclick="viewDetails(${Number(order.order_id)})"
                class="bg-white/5 hover:bg-yellow-400 hover:text-black p-2 px-4 rounded-lg text-[10px] font-black uppercase transition"
            >
                View
            </button>
        </td>
    </tr>
`;
    }).join("");

    $("countToday").innerText = String(totalCount);
    $("revenueToday").innerText = formatPeso(totalRevenue);
    $("teopayToday").innerText = formatPeso(teoPayVolume);
}

function loadRefunds() {
    const body = $("refundTableBody");
    if (!body) return;

    const filters = getSelectedFilters();
    const filtered = refundsCache.filter(refund => matchesRefundFilters(refund, filters));

    if (!filtered.length) {
        body.innerHTML = renderEmptyRow(6, "No refund history found.");
        return;
    }

    body.innerHTML = filtered.map(refund => `
        <tr>
            <td class="font-mono text-yellow-400 font-bold">
                ${escapeHtml(formatOrderDisplayId(refund.order_id, refund.display_id))}
            </td>
            <td>
                <div class="font-bold">${escapeHtml(refund.customer_name || "Unknown Customer")}</div>
                <div class="text-[10px] opacity-50">${escapeHtml(mapServiceForUI(refund.order_type))}</div>
            </td>
            <td class="text-xs opacity-70">${escapeHtml(formatDateTime(refund.last_refund_at || refund.created_at))}</td>
            <td class="text-xs">${escapeHtml(mapPaymentForUI(refund.payment_method))}</td>
            <td><span class="text-red-400 font-black text-xs uppercase">Refunded</span></td>
            <td class="font-black text-red-400">${escapeHtml(formatPeso(refund.refund_amount))}</td>
        </tr>
    `).join("");
}

function loadOrdersView() {
    const recordViewFilter = $("recordViewFilter")?.value || "all";
    const ordersSection = $("ordersSection");
    const refundSection = $("refundSection");

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

function buildRefundBlock(receipt) {
    if (!receipt.is_refunded) return "";

    return `
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Refund Status</span>
            <span class="text-red-400 font-black text-xs">Refunded</span>
        </div>
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Refund Amount</span>
            <span class="font-bold text-xs text-red-400">${formatPeso(receipt.refund_amount || 0)}</span>
        </div>
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Refund Date</span>
            <span class="font-bold text-xs">${escapeHtml(formatDateTime(receipt.last_refund_at))}</span>
        </div>
    `;
}

function buildPromoBlock(receipt) {
    if (!receipt.promo_code_text) return "";

    return `
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Promo Code</span>
            <span class="font-bold text-xs">${escapeHtml(receipt.promo_code_text)}</span>
        </div>
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Discount</span>
            <span class="font-bold text-xs text-green-400">${formatPeso(receipt.discount_amount || 0)}</span>
        </div>
    `;
}

function buildReceiptItemsText(items) {
    if (!Array.isArray(items) || !items.length) return "No items";

    return items
        .map(item => `${item.qty}x ${item.name}`)
        .join(", ");
}

function buildOrderDetailsHtml(receipt, sourceOrder) {
    const paymentMode = mapPaymentForUI(sourceOrder?.payment_method || receipt.payment_method);
    const customerName = sourceOrder?.customer_name || receipt.customer_name || "Unknown Customer";
    const displayId = sourceOrder?.display_id || receipt.display_id || formatOrderDisplayId(receipt.order_id);

    const refundedBadge = receipt.is_refunded
        ? `<span class="text-red-400 font-black">REFUNDED</span>`
        : `<span class="font-bold text-xs uppercase">${escapeHtml(receipt.status || "-")}</span>`;

    return `
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Order Ref</span>
            <span class="font-bold text-xs text-right">${escapeHtml(displayId)}</span>
        </div>
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Raw Order ID</span>
            <span class="font-bold text-xs text-right">${escapeHtml(receipt.order_id || "-")}</span>
        </div>
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Customer</span>
            <span class="font-bold text-xs text-right">${escapeHtml(customerName)}</span>
        </div>
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Items</span>
            <span class="font-bold text-xs text-right">${escapeHtml(buildReceiptItemsText(receipt.items))}</span>
        </div>
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Payment Mode</span>
            <span class="font-bold text-xs">${escapeHtml(paymentMode)}</span>
        </div>
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Order Type</span>
            <span class="font-bold text-xs">${escapeHtml(mapServiceForUI(receipt.order_type))}</span>
        </div>
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Status</span>
            ${refundedBadge}
        </div>
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Subtotal</span>
            <span class="font-bold text-xs">${formatPeso(receipt.subtotal || 0)}</span>
        </div>
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">VAT</span>
            <span class="font-bold text-xs">${formatPeso(receipt.vat_amount || 0)}</span>
        </div>
        ${buildPromoBlock(receipt)}
        <div class="flex justify-between border-b border-white/5 pb-2">
            <span class="text-[10px] font-black uppercase opacity-40">Total</span>
            <span class="font-bold text-xs">${formatPeso(receipt.total_amount || 0)}</span>
        </div>
        ${buildRefundBlock(receipt)}
    `;
}

function buildRewardsInfoHtml(receipt) {
    const claimedUserId = receipt.points_claimed_user_id ?? "-";
    const claimedByStaffId = receipt.points_claimed_by_staff_id ?? "-";
    const claimMethod = receipt.points_claim_method || "-";
    const claimedAt = formatDateTime(receipt.points_claimed_at);
    const claimExpires = formatDateTime(receipt.claim_expires_at);

    return `
        <div class="reward-highlight">
            <div class="text-yellow-400 text-[10px] font-black uppercase tracking-widest mb-3">
                <i class="fa-solid fa-gift mr-2"></i> Rewards Info
            </div>

            <div class="flex justify-between text-xs mb-1">
                <span>Earned Points:</span>
                <b class="text-green-400">${formatPoints(receipt.earned_points || 0)}</b>
            </div>

            <div class="flex justify-between text-xs mb-1">
                <span>Potential Points:</span>
                <b>${formatPoints(receipt.potential_points || 0)}</b>
            </div>

            <div class="flex justify-between text-xs mb-1">
                <span>Points Status:</span>
                <b>${escapeHtml(receipt.points_status || "none")}</b>
            </div>

            <div class="flex justify-between text-xs mb-1">
                <span>Points Synced:</span>
                <b class="${receipt.points_synced ? "text-green-400" : "text-yellow-400"}">
                    ${receipt.points_synced ? "Yes" : "No"}
                </b>
            </div>

            <div class="flex justify-between text-xs mb-1">
                <span>Claim Method:</span>
                <b>${escapeHtml(claimMethod)}</b>
            </div>

            <div class="flex justify-between text-xs mb-1">
                <span>Claimed User ID:</span>
                <b>${escapeHtml(claimedUserId)}</b>
            </div>

            <div class="flex justify-between text-xs mb-1">
                <span>Processed By Staff ID:</span>
                <b>${escapeHtml(claimedByStaffId)}</b>
            </div>

            <div class="flex justify-between text-xs mb-1">
                <span>Claimed At:</span>
                <b>${escapeHtml(claimedAt)}</b>
            </div>

            <div class="flex justify-between text-xs">
                <span>Claim Expires At:</span>
                <b>${escapeHtml(claimExpires)}</b>
            </div>
        </div>
    `;
}

async function viewDetails(orderId) {
    try {
        const receipt = await apiFetch(`${API_URL}/orders/${orderId}/receipt/`, {
            method: "GET"
        });

        const sourceOrder = ordersCache.find(order => Number(order.order_id) === Number(orderId));
        const content = $("modalContent");
        const rewardSection = $("rewardSection");

        if (content) {
            content.innerHTML = buildOrderDetailsHtml(receipt, sourceOrder);
        }

        if (rewardSection) {
            rewardSection.innerHTML = buildRewardsInfoHtml(receipt);
        }

        $("detailsModal")?.classList.add("show");
    } catch (error) {
        console.error("View details error:", error);
        alert("Failed to load order details.");
    }
}

function closeModal() {
    $("detailsModal")?.classList.remove("show");
}

function exportToExcel() {
    const exportRows = ordersCache.map(order => ({
        ID: getOrderDisplayId(order),
        RawOrderID: order.order_id,
        Customer: order.customer_name || "Unknown Customer",
        Email: order.customer_email || "",
        DateTime: formatDateTime(order.created_at),
        Payment: mapPaymentForUI(order.payment_method),
        Service: mapServiceForUI(order.order_type),
        Status: order.status || "",
        Total: Number(order.total_amount || 0),
        Discount: Number(order.discount_amount || 0),
        PromoCode: order.promo_code_text || "",
        Items: order.items_summary || "",
        EarnedPoints: order.earned_points || 0,
        PointsSynced: order.points_synced ? "Yes" : "No"
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    XLSX.writeFile(
        workbook,
        `TeoDMango_Ledger_${new Date().toISOString().split("T")[0]}.xlsx`
    );
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
window.loadOrders = loadOrders;
window.loadOrdersView = loadOrdersView;

window.onload = async () => {
    if (typeof applySync === "function") {
        applySync();
    }
    await refreshOrdersData();
    startAutoRefresh();
};