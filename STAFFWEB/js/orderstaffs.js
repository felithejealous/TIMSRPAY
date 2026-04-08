const pendingCount = document.getElementById("pendingCount");
const onlineQueue = document.getElementById("onlineQueue");
const instoreQueue = document.getElementById("instoreQueue");

const filterButtons = document.querySelectorAll(".filter-btn");

const orderModal = document.getElementById("orderModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalOrderId = document.getElementById("modalOrderId");
const modalSource = document.getElementById("modalSource");
const modalContent = document.getElementById("modalContent");
const rewardSection = document.getElementById("rewardSection");
const statusSelect = document.getElementById("statusSelect");
const printBtn = document.getElementById("printBtn");
const showCancelBtn = document.getElementById("showCancelBtn");
const cancelArea = document.getElementById("cancelArea");
const cancelReasonInput = document.getElementById("cancelReasonInput");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const saveChangesBtn = document.getElementById("saveChangesBtn");
const resumePaymentBtn = document.getElementById("resumePaymentBtn");
const markPaidBtn = document.getElementById("markPaidBtn");

let allOrders = [];
let currentFilter = "all";
let selectedOrder = null;
let ordersRefreshInterval = null;

/* =========================
   HELPERS
========================= */
function getAPIURL() {
    if (!window.API_URL) {
        throw new Error("API_URL is not defined. Make sure config.js loads first.");
    }
    return window.API_URL;
}
async function fetchJSON(url, options = {}) {
    const mergedHeaders = getAuthHeaders(options.headers || {});

    console.log("fetchJSON URL:", url);
    console.log("fetchJSON token:", localStorage.getItem("token"));
    console.log("fetchJSON headers:", mergedHeaders);

    const response = await fetch(url, {
        credentials: "include",
        ...options,
        headers: mergedHeaders
    });

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    console.log("fetchJSON status:", response.status, "response:", data);

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

function formatDateTimeAgo(value) {
    if (!value) return "Unknown time";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown time";

    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
}

function getStatusClass(status) {
    const clean = String(status || "").toLowerCase();

    if (clean === "pending") return "status-pending";
    if (clean === "unpaid") return "status-unpaid";
    if (clean === "paid") return "status-paid";
    if (clean === "completed") return "status-completed";
    if (clean === "cancelled") return "status-cancelled";

    return "status-pending";
}

function getOrderSourceLabel(orderType) {
    const clean = String(orderType || "").toLowerCase();
    if (clean === "online") return "Online Order";
    if (clean === "cashier") return "Walk-in / POS";
    if (clean === "kiosk") return "Kiosk";
    return "Order";
}

function isWalkInOrder(order) {
    return ["cashier", "kiosk"].includes(String(order?.order_type || "").toLowerCase());
}

function matchesFilter(order, filter) {
    if (filter === "all") return true;
    return String(order?.status || "").toLowerCase() === filter;
}

function buildEmptyState(message) {
    return `<div class="empty-state">${escapeHTML(message)}</div>`;
}

function isSameLocalDate(dateValue) {
    if (!dateValue) return false;

    const orderDate = new Date(dateValue);
    if (Number.isNaN(orderDate.getTime())) return false;

    const now = new Date();

    return (
        orderDate.getFullYear() === now.getFullYear() &&
        orderDate.getMonth() === now.getMonth() &&
        orderDate.getDate() === now.getDate()
    );
}

function prettifyOrderType(orderType) {
    const clean = String(orderType || "").toLowerCase();
    if (clean === "online") return "Online";
    if (clean === "cashier") return "Walk-In / POS";
    if (clean === "kiosk") return "Kiosk";
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "-";
}

function prettifyPaymentMethod(method) {
    const clean = String(method || "").toLowerCase();
    if (clean === "wallet") return "TeoPay";
    if (clean === "cash") return "Cash";
    return method || "-";
}

function getReceivedAmount(receipt) {
    if (receipt?.amount_received !== null && receipt?.amount_received !== undefined) {
        return Number(receipt.amount_received);
    }

    const method = String(receipt?.payment_method || "").toLowerCase();
    if (method === "wallet") {
        return Number(receipt?.total_amount || 0);
    }

    return null;
}

function getChangeAmount(receipt) {
    if (receipt?.change_amount !== null && receipt?.change_amount !== undefined) {
        return Number(receipt.change_amount);
    }

    const method = String(receipt?.payment_method || "").toLowerCase();
    if (method === "wallet") {
        return 0;
    }

    return null;
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
   LOAD ORDERS
========================= */
async function loadOrders() {
    const data = await fetchJSON(`${getAPIURL()}/orders/?limit=200`);
    const rawOrders = Array.isArray(data?.data) ? data.data : [];

    allOrders = rawOrders.filter(order => isSameLocalDate(order.created_at));
    renderQueues();
}

function renderQueues() {
    const filtered = allOrders.filter(order => matchesFilter(order, currentFilter));

    const pendingLikeCount = allOrders.filter(order =>
        ["pending", "unpaid", "paid"].includes(String(order.status || "").toLowerCase())
    ).length;

    pendingCount.textContent = String(pendingLikeCount);

    const onlineOrders = filtered.filter(order => String(order.order_type || "").toLowerCase() === "online");
    const instoreOrders = filtered.filter(order => isWalkInOrder(order));

    renderQueueColumn(onlineQueue, onlineOrders, "No online orders for today.");
    renderQueueColumn(instoreQueue, instoreOrders, "No walk-in / POS orders for today.");
}

function renderQueueColumn(container, orders, emptyMessage) {
    if (!container) return;

    if (!orders.length) {
        container.innerHTML = buildEmptyState(emptyMessage);
        return;
    }

    container.innerHTML = orders.map(order => {
        const status = String(order.status || "pending").toLowerCase();
        const canResumePayment =
            isWalkInOrder(order) && ["pending", "unpaid", "paid"].includes(status);

        const canMarkCashPaid =
            isWalkInOrder(order) &&
            ["pending", "unpaid"].includes(status) &&
            String(order.payment_method || "").toLowerCase() === "cash";

        const canComplete = status === "paid";

        let actionButtons = `
            <button class="ticket-btn btn-view" data-action="view" data-order-id="${order.order_id}">
                <i class="fa-solid fa-eye"></i> View
            </button>
        `;

        if (canResumePayment) {
            actionButtons += `
                <button class="ticket-btn btn-resume" data-action="resume" data-order-id="${order.order_id}">
                    <i class="fa-solid fa-wallet"></i> Resume Payment
                </button>
            `;
        }

        if (canMarkCashPaid) {
            actionButtons += `
                <button class="ticket-btn btn-pay" data-action="pay" data-order-id="${order.order_id}">
                    <i class="fa-solid fa-money-bill-wave"></i> Mark Paid
                </button>
            `;
        }

        if (canComplete) {
            actionButtons += `
                <button class="ticket-btn btn-complete-card" data-action="complete" data-order-id="${order.order_id}">
                    <i class="fa-solid fa-check"></i> Mark Complete
                </button>
            `;
        }

        return `
            <div class="ticket-card">
                <div class="ticket-header">
                    <div class="ticket-id">${escapeHTML(order.display_id || `#${order.order_id}`)}</div>
                    <div class="ticket-time">${escapeHTML(formatDateTimeAgo(order.created_at))}</div>
                </div>

                <div class="ticket-items">${escapeHTML(order.items_summary || "No items")}</div>

                <div class="ticket-meta-grid">
                    <div class="ticket-meta">Customer: ${escapeHTML(order.customer_name || "Walk-in Customer")}</div>
                    <div class="ticket-meta">Payment: ${escapeHTML(order.payment_method || "N/A")}</div>
                    <div class="ticket-meta">Type: ${escapeHTML(order.order_type || "N/A")}</div>
                    <div class="ticket-meta">Total: ${escapeHTML(formatPeso(order.total_amount || 0))}</div>
                </div>

                ${
                    order.has_item_notes
                        ? `
                        <div class="ticket-note-indicator">
                            <i class="fa-solid fa-note-sticky"></i>
                            <span>Has note</span>
                        </div>
                        `
                        : ""
                }

                <div class="ticket-footer">
                    <span class="status-pill ${getStatusClass(status)}">${escapeHTML(status)}</span>
                    <div class="ticket-actions">
                        ${actionButtons}
                    </div>
                </div>
            </div>
        `;
    }).join("");

    attachQueueEvents(container);
}

function attachQueueEvents(container) {
    container.querySelectorAll("[data-action]").forEach(button => {
        button.addEventListener("click", async () => {
            const orderId = Number(button.dataset.orderId);
            const action = button.dataset.action;

            if (!orderId || !action) return;

            if (action === "view") {
                await openOrderModal(orderId);
                return;
            }

            if (action === "resume") {
                resumePayment(orderId);
                return;
            }

            if (action === "pay") {
                await markOrderPaid(orderId);
                return;
            }

            if (action === "complete") {
                await completeOrder(orderId);
            }
        });
    });
}

/* =========================
   FILTERS
========================= */
function setupFilters() {
    filterButtons.forEach(button => {
        button.addEventListener("click", () => {
            filterButtons.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");
            currentFilter = button.dataset.filter || "all";
            renderQueues();
        });
    });
}

/* =========================
   MODAL
========================= */
async function openOrderModal(orderId) {
    try {
        const orderSummary = allOrders.find(order => Number(order.order_id) === Number(orderId));
        const receipt = await fetchJSON(`${getAPIURL()}/orders/${orderId}/receipt`);

        selectedOrder = {
            summary: orderSummary || null,
            receipt
        };

        fillModal(receipt, orderSummary);
        orderModal.style.display = "flex";
        cancelArea.style.display = "none";
        cancelReasonInput.value = "";
    } catch (error) {
        console.error("Failed to open order modal:", error);
        alert(error.message || "Failed to load order details.");
    }
}

function closeModal() {
    orderModal.style.display = "none";
    selectedOrder = null;
    cancelArea.style.display = "none";
    cancelReasonInput.value = "";
}

function fillModal(receipt, summary) {
    const status = String(receipt?.status || summary?.status || "pending").toLowerCase();
    const orderType = String(receipt?.order_type || summary?.order_type || "").toLowerCase();
    const paymentMethod = String(receipt?.payment_method || summary?.payment_method || "").toLowerCase();

    const receivedAmount = getReceivedAmount(receipt);
    const changeAmount = getChangeAmount(receipt);

    modalOrderId.textContent = receipt?.display_id || summary?.display_id || `#${receipt?.order_id || summary?.order_id || 0}`;
    modalSource.textContent = getOrderSourceLabel(orderType);

    statusSelect.value = ["pending", "unpaid", "paid", "completed"].includes(status) ? status : "pending";

    modalContent.innerHTML = `
        <div class="manifest-row">
            <span>Display ID</span>
            <span>${escapeHTML(receipt?.display_id || summary?.display_id || "-")}</span>
        </div>
        <div class="manifest-row">
            <span>Raw Order ID</span>
            <span>${escapeHTML(String(receipt?.order_id || summary?.order_id || "-"))}</span>
        </div>
        <div class="manifest-row">
            <span>Customer</span>
            <span>${escapeHTML(receipt?.customer_name || summary?.customer_name || "Walk-in Customer")}</span>
        </div>
        <div class="manifest-row">
            <span>Status</span>
            <span>${escapeHTML(status)}</span>
        </div>
        <div class="manifest-row">
            <span>Order Type</span>
            <span>${escapeHTML(prettifyOrderType(receipt?.order_type || summary?.order_type || "-"))}</span>
        </div>
        <div class="manifest-row">
            <span>Payment</span>
            <span>${escapeHTML(prettifyPaymentMethod(paymentMethod || "-"))}</span>
        </div>
        <div class="manifest-row">
            <span>Created At</span>
            <span>${escapeHTML(formatDateTime(receipt?.created_at || summary?.created_at))}</span>
        </div>
        ${receipt?.promo_code_text ? `
            <div class="manifest-row">
                <span>Promo Code</span>
                <span>${escapeHTML(receipt.promo_code_text)}</span>
            </div>
        ` : ""}
        <div class="receipt-divider"></div>

      ${(receipt?.items || []).map(item => `
    <div class="manifest-row">
        <span>${escapeHTML(`${item.qty}x ${item.name}`)}</span>
        <span>${escapeHTML(formatPeso(item.line_total || 0))}</span>
    </div>

    <div class="manifest-row" style="border-bottom:none; padding-bottom:0;">
        <span>Add-ons</span>
        <span>${escapeHTML(
            item.add_ons?.length
                ? item.add_ons.map(addon => addon.name).join(", ")
                : "None"
        )}</span>
    </div>

    ${
        item.notes && String(item.notes).trim()
            ? `
            <div class="manifest-row" style="border-bottom:none; padding-top:6px; color:#ff8c00;">
                <span>Note</span>
                <span style="max-width: 220px; text-align:right; white-space:normal; word-break:break-word;">
                    ${escapeHTML(item.notes)}
                </span>
            </div>
            `
            : ""
    }
`).join("")}

        <div class="receipt-divider"></div>

        <div class="manifest-row">
            <span>Subtotal</span>
            <span>${escapeHTML(formatPeso(receipt?.subtotal || 0))}</span>
        </div>
        <div class="manifest-row">
            <span>VAT</span>
            <span>${escapeHTML(formatPeso(receipt?.vat_amount || 0))}</span>
        </div>
        <div class="manifest-row">
            <span>Discount</span>
            <span>${escapeHTML(formatPeso(receipt?.discount_amount || 0))}</span>
        </div>
        <div class="manifest-row">
            <span>Total</span>
            <span>${escapeHTML(formatPeso(receipt?.total_amount || 0))}</span>
        </div>
        <div class="manifest-row">
            <span>Received</span>
            <span>${receivedAmount === null ? "-" : escapeHTML(formatPeso(receivedAmount))}</span>
        </div>
        <div class="manifest-row">
            <span>Change</span>
            <span>${changeAmount === null ? "-" : escapeHTML(formatPeso(changeAmount))}</span>
        </div>

        ${receipt?.is_refunded ? `
            <div class="receipt-divider"></div>
            <div class="manifest-row">
                <span>Refunded</span>
                <span>Yes</span>
            </div>
            <div class="manifest-row">
                <span>Refund Count</span>
                <span>${escapeHTML(String(receipt?.refund_count || 0))}</span>
            </div>
            <div class="manifest-row">
                <span>Refund Amount</span>
                <span>${escapeHTML(formatPeso(receipt?.refund_amount || 0))}</span>
            </div>
            <div class="manifest-row">
                <span>Last Refund</span>
                <span>${escapeHTML(formatDateTime(receipt?.last_refund_at))}</span>
            </div>
        ` : ""}
    `;

    rewardSection.innerHTML = `
        <div class="reward-box">
            <div class="reward-title">Rewards / Points</div>

            <div class="reward-row">
                <span>Earned Points</span>
                <span>${escapeHTML(String(receipt?.earned_points || 0))} pts</span>
            </div>

            <div class="reward-row">
                <span>Potential Points</span>
                <span>${escapeHTML(String(receipt?.potential_points || 0))} pts</span>
            </div>

            <div class="reward-row">
                <span>Points Status</span>
                <span class="${receipt?.points_synced ? "text-green" : "text-yellow"}">${escapeHTML(receipt?.points_status || "none")}</span>
            </div>

            ${receipt?.claim_message ? `
                <div class="reward-row">
                    <span>Claim Note</span>
                    <span>${escapeHTML(receipt.claim_message)}</span>
                </div>
            ` : ""}

            ${receipt?.claim_expires_at ? `
                <div class="reward-row">
                    <span>Claim Expires</span>
                    <span>${escapeHTML(formatDateTime(receipt.claim_expires_at))}</span>
                </div>
            ` : ""}

            ${receipt?.points_claim_method ? `
                <div class="reward-row">
                    <span>Claim Method</span>
                    <span>${escapeHTML(receipt.points_claim_method)}</span>
                </div>
            ` : ""}

            ${receipt?.points_claimed_at ? `
                <div class="reward-row">
                    <span>Claimed At</span>
                    <span>${escapeHTML(formatDateTime(receipt.points_claimed_at))}</span>
                </div>
            ` : ""}
        </div>
    `;

    const isWalkIn = ["cashier", "kiosk"].includes(orderType);

    resumePaymentBtn.style.display = isWalkIn && ["pending", "unpaid", "paid"].includes(status) ? "flex" : "none";
    markPaidBtn.style.display = isWalkIn && ["pending", "unpaid"].includes(status) && paymentMethod === "cash" ? "flex" : "none";
}

function showCancelReason() {
    cancelArea.style.display = cancelArea.style.display === "flex" ? "none" : "flex";
}

/* =========================
   ACTIONS
========================= */
async function markOrderPaid(orderId) {
    try {
        await fetchJSON(`${getAPIURL()}/orders/${orderId}/pay-cash`, {
            method: "POST"
        });

        await loadOrders();

        if (selectedOrder && Number(selectedOrder.receipt?.order_id) === Number(orderId)) {
            await openOrderModal(orderId);
        }
    } catch (error) {
        alert(error.message || "Failed to mark order as paid.");
    }
}

async function completeOrder(orderId) {
    try {
        await fetchJSON(`${getAPIURL()}/orders/${orderId}/complete`, {
            method: "POST"
        });

        await loadOrders();

        if (selectedOrder && Number(selectedOrder.receipt?.order_id) === Number(orderId)) {
            await openOrderModal(orderId);
        }
    } catch (error) {
        alert(error.message || "Failed to complete order.");
    }
}

function resumePayment(orderId) {
    window.location.href = `paymentstaff.html?order_id=${orderId}`;
}

async function saveOrderChanges() {
    if (!selectedOrder?.receipt?.order_id) return;

    const orderId = selectedOrder.receipt.order_id;
    const targetStatus = String(statusSelect.value || "").toLowerCase();
    const currentStatus = String(selectedOrder.receipt.status || "").toLowerCase();

    try {
        if (targetStatus === currentStatus) {
            closeModal();
            return;
        }

        if (targetStatus === "paid") {
            await fetchJSON(`${getAPIURL()}/orders/${orderId}/pay-cash`, {
                method: "POST"
            });
        } else if (targetStatus === "completed") {
            if (currentStatus !== "paid") {
                throw new Error("Only paid orders can be marked as completed.");
            }

            await fetchJSON(`${getAPIURL()}/orders/${orderId}/complete`, {
                method: "POST"
            });
        } else if (["pending", "unpaid"].includes(targetStatus)) {
            await fetchJSON(`${getAPIURL()}/orders/${orderId}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ status: targetStatus })
            });
        } else {
            throw new Error("Unsupported status change.");
        }

        await loadOrders();
        await openOrderModal(orderId);
        alert("Order updated successfully.");
    } catch (error) {
        alert(error.message || "Failed to save changes.");
    }
}

async function confirmCancel() {
    if (!selectedOrder?.receipt?.order_id) return;

    const reason = cancelReasonInput.value.trim();
    if (reason.length < 3) {
        alert("Please enter a valid cancellation reason.");
        return;
    }

    try {
        await fetchJSON(`${getAPIURL()}/orders/${selectedOrder.receipt.order_id}/cancel`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ reason })
        });

        await loadOrders();
        closeModal();
        alert("Order cancelled successfully.");
    } catch (error) {
        alert(error.message || "Failed to cancel order.");
    }
}

/* =========================
   PRINT
========================= */
function printModalReceipt() {
    window.print();
}

/* =========================
   AUTO REFRESH
========================= */
function startOrdersAutoRefresh() {
    if (ordersRefreshInterval) {
        clearInterval(ordersRefreshInterval);
    }

    ordersRefreshInterval = setInterval(async () => {
        try {
            await loadOrders();
        } catch (error) {
            console.error("Auto refresh failed:", error);
        }
    }, 15000);
}

/* =========================
   EVENTS
========================= */
function setupModalEvents() {
    closeModalBtn?.addEventListener("click", closeModal);

    orderModal?.addEventListener("click", (event) => {
        if (event.target === orderModal) {
            closeModal();
        }
    });

    printBtn?.addEventListener("click", printModalReceipt);
    showCancelBtn?.addEventListener("click", showCancelReason);
    confirmCancelBtn?.addEventListener("click", confirmCancel);
    saveChangesBtn?.addEventListener("click", saveOrderChanges);

    resumePaymentBtn?.addEventListener("click", () => {
        if (!selectedOrder?.receipt?.order_id) return;
        resumePayment(selectedOrder.receipt.order_id);
    });

    markPaidBtn?.addEventListener("click", async () => {
        if (!selectedOrder?.receipt?.order_id) return;
        await markOrderPaid(selectedOrder.receipt.order_id);
    });
}

/* =========================
   INIT
========================= */
async function initOrdersPage() {
    try {
        setupLogout();
        setupFilters();
        setupModalEvents();

        await loadOrders();
        startOrdersAutoRefresh();
    } catch (error) {
        console.error("initOrdersPage error:", error);

        if (onlineQueue) {
            onlineQueue.innerHTML = buildEmptyState(`Failed to load orders: ${error.message}`);
        }

        if (instoreQueue) {
            instoreQueue.innerHTML = buildEmptyState(`Failed to load orders: ${error.message}`);
        }
    }
}

document.addEventListener("DOMContentLoaded", initOrdersPage);