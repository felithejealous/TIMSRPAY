/* =========================
   ELEMENTS
========================= */
const welcomeText = document.getElementById("welcomeText");

const pendingOrdersCount = document.getElementById("pendingOrdersCount");
const readyOrdersCount = document.getElementById("readyOrdersCount");
const orderQueue = document.getElementById("orderQueue");
const scrollOrdersTopBtn = document.getElementById("scrollOrdersTopBtn");

const lowStockList = document.getElementById("lowStockList");
const announcementList = document.getElementById("announcementList");

const attendanceStatus = document.getElementById("attendanceStatus");
const attendanceTimeIn = document.getElementById("attendanceTimeIn");
const attendanceHours = document.getElementById("attendanceHours");

const pointsLookupInput = document.getElementById("pointsLookupInput");
const pointsLookupBtn = document.getElementById("pointsLookupBtn");
const pointsLookupResult = document.getElementById("pointsLookupResult");

/* =========================
   GLOBAL
========================= */
let currentStaffUser = null;
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

    const response = await fetch(url, {
        credentials: "include",
        ...options,
        headers: mergedHeaders
    });

    let data = null;
    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        const message =
            data?.detail ||
            data?.message ||
            `Request failed with status ${response.status}`;
        throw new Error(message);
    }

    return data;
}

function maskWalletCode(code) {
    const raw = String(code || "").trim().toUpperCase();
    if (!raw) return "-";
    if (raw.length <= 3) return raw;
    return `${raw.slice(0, 3)}***`;
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function parseServerDate(value) {
    if (!value) return null;

    const raw = String(value).trim();
    if (!raw) return null;

    if (raw.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(raw)) {
        const utcDate = new Date(raw);
        return Number.isNaN(utcDate.getTime()) ? null : utcDate;
    }

    const normalized = raw.replace(" ", "T");
    const match = normalized.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/
    );

    if (!match) {
        const fallbackDate = new Date(raw);
        return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
    }

    const [, year, month, day, hour, minute, second = "00"] = match;

    return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
    );
}
function formatTime(dateString) {
    if (!dateString) return "--:--";

    const date = parseServerDate(dateString);
    if (!date || Number.isNaN(date.getTime())) return "--:--";

    return date.toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit"
    });
}
function formatDateTimeAgo(dateString) {
    if (!dateString) return "Unknown time";

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Unknown time";

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
function setText(el, value, fallback = "--") {
    if (!el) return;
    el.textContent = value ?? fallback;
}

function setWelcomeText(user) {
    if (!welcomeText) return;

    const role = (user?.role || "staff").toLowerCase();

    if (role === "cashier") {
        welcomeText.textContent = "Cashier Overview";
    } else {
        welcomeText.textContent = "Staff Overview";
    }
}

/* =========================
   CURRENT USER
========================= */
async function loadCurrentUser() {
    try {
        const user = await fetchJSON(`${getAPIURL()}/auth/me`);
        currentStaffUser = user;
        setWelcomeText(user);
        return user;
    } catch (error) {
        console.error("Failed to load current user:", error);
        return null;
    }
}

/* =========================
   ORDERS
========================= */
function renderOrders(orders = []) {
    if (!orderQueue) return;

    if (!Array.isArray(orders) || orders.length === 0) {
        orderQueue.innerHTML = `
            <div class="order-card">
                <div class="order-items">No active orders</div>
                <small style="color: var(--text-muted); font-weight: 600; display: block;">
                    New orders will appear here once available.
                </small>
            </div>
        `;
        setText(pendingOrdersCount, "00");
        setText(readyOrdersCount, "00");
        return;
    }

    const pendingCount = orders.filter(order =>
        ["pending", "unpaid"].includes((order.status || "").toLowerCase())
    ).length;

    const readyCount = orders.filter(order =>
        (order.status || "").toLowerCase() === "paid"
    ).length;

    setText(pendingOrdersCount, String(pendingCount).padStart(2, "0"));
    setText(readyOrdersCount, String(readyCount).padStart(2, "0"));

    orderQueue.innerHTML = orders.map(order => {
        const orderId = order.order_id;
        const displayId = order.display_id || `#${orderId}`;
        const createdAt = formatDateTimeAgo(order.created_at);
        const customerName = order.customer_name || "Walk-in";
        const paymentMethod = order.payment_method || "N/A";
        const status = order.status || "pending";
        const itemsSummary = order.items_summary || "No items";

        let actionButton = "";

        if (status === "pending" || status === "unpaid") {
            actionButton = `
                <button class="complete-btn action-btn" data-action="pay" data-order-id="${orderId}">
                    <i class="fa-solid fa-money-bill"></i> Mark Paid
                </button>
            `;
        } else if (status === "paid") {
            actionButton = `
                <button class="complete-btn action-btn" data-action="complete" data-order-id="${orderId}">
                    <i class="fa-solid fa-check"></i> Mark Complete
                </button>
            `;
        } else {
            actionButton = `
                <button class="complete-btn" disabled style="opacity:0.6; cursor:not-allowed;">
                    <i class="fa-solid fa-circle-check"></i> ${escapeHTML(status)}
                </button>
            `;
        }

        return `
            <div class="order-card">
                <span class="order-id">
                    <span>${escapeHTML(displayId)}</span>
                    <span style="color: var(--warning);">
                        <i class="fa-regular fa-clock"></i> ${escapeHTML(createdAt)}
                    </span>
                </span>

                <div class="order-items">${escapeHTML(itemsSummary)}</div>

                <small style="color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 10px;">
                    Status: ${escapeHTML(status)}
                </small>

                <div class="order-meta">Customer: ${escapeHTML(customerName)}</div>
                <div class="order-meta">Payment: ${escapeHTML(paymentMethod)}</div>
                <div class="order-meta">Type: ${escapeHTML(order.order_type || "N/A")}</div>

                ${actionButton}
            </div>
        `;
    }).join("");

    attachOrderActionEvents();
    refreshOrderScrollButtonState();
}

async function loadOrders() {
    try {
        const data = await fetchJSON(`${getAPIURL()}/orders/?limit=20`);
        const orders = Array.isArray(data?.data) ? data.data : [];

        const filteredOrders = orders.filter(order =>
            !["completed", "cancelled"].includes((order.status || "").toLowerCase())
        );

        renderOrders(filteredOrders);
    } catch (error) {
        console.error("Failed to load orders:", error);
        renderOrders([]);
    }
}

function attachOrderActionEvents() {
    const buttons = document.querySelectorAll(".action-btn");

    buttons.forEach(button => {
        button.addEventListener("click", async () => {
            const orderId = button.dataset.orderId;
            const action = button.dataset.action;

            if (!orderId || !action) return;

            const originalHTML = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating...';

            try {
                if (action === "pay") {
                    await fetchJSON(`${getAPIURL()}/orders/${orderId}/pay-cash`, {
                        method: "POST"
                    });
                } else if (action === "complete") {
                    await fetchJSON(`${getAPIURL()}/orders/${orderId}/complete`, {
                        method: "POST"
                    });
                }

                await loadOrders();
            } catch (error) {
                console.error("Failed to update order:", error);
                alert(error.message || "Failed to update order.");
                button.disabled = false;
                button.innerHTML = originalHTML;
            }
        });
    });
}

/* =========================
   LOW STOCK
========================= */
function renderLowStock(items = []) {
    if (!lowStockList) return;

    if (!Array.isArray(items) || items.length === 0) {
        lowStockList.innerHTML = `
            <div class="alert-item alert-warning">
                <div>
                    <strong style="font-size:14px; color: var(--text-main);">No low stock alerts</strong><br>
                    <small style="font-weight: 700; color: var(--warning);">Inventory levels are currently okay</small>
                </div>
                <i class="fa-solid fa-box" style="color:var(--warning); font-size: 20px;"></i>
            </div>
        `;
        return;
    }

    lowStockList.innerHTML = items.map(item => {
        const quantity = Number(item.quantity ?? 0);
        const threshold = Number(item.alert_threshold ?? 10);
        const isCritical = quantity <= threshold / 2;

        return `
            <div class="alert-item ${isCritical ? "" : "alert-warning"}">
                <div>
                    <strong style="font-size:14px; color: var(--text-main);">
                        ${escapeHTML(item.name || "Inventory Item")}
                    </strong><br>
                    <small style="font-weight: 700; color: ${isCritical ? "var(--danger)" : "var(--warning)"};">
                        Remaining: ${escapeHTML(quantity)} ${escapeHTML(item.unit || "")}
                    </small>
                </div>
                <i class="fa-solid ${isCritical ? "fa-box-open" : "fa-hourglass-half"}"
                   style="color:${isCritical ? "var(--danger)" : "var(--warning)"}; font-size: 20px;"></i>
            </div>
        `;
    }).join("");
}

async function loadLowStock() {
    try {
        const data = await fetchJSON(`${getAPIURL()}/inventory/master?only_active=true&limit=200`);
        const items = Array.isArray(data?.data) ? data.data : [];

        const lowStockItems = items.filter(item =>
            Number(item.quantity) <= Number(item.alert_threshold)
        );

        renderLowStock(lowStockItems.slice(0, 5));
    } catch (error) {
        console.error("Failed to load low stock alerts:", error);
        renderLowStock([]);
    }
}

/* =========================
   ANNOUNCEMENTS
========================= */
function renderAnnouncements(items = []) {
    if (!announcementList) return;

    if (!Array.isArray(items) || items.length === 0) {
        announcementList.innerHTML = `
            <div class="announcement-item">
                <strong>No announcements available</strong>
                <p>Latest staff notices and operational reminders will appear here.</p>
                <div class="announcement-date">System notice</div>
            </div>
        `;
        return;
    }

    announcementList.innerHTML = items.map(item => `
        <div class="announcement-item">
            <strong>${escapeHTML(item.title || "Announcement")}</strong>
            <p>${escapeHTML(item.body || "No details available.")}</p>
            <div class="announcement-date">${escapeHTML(formatDateTimeAgo(item.publish_at || item.created_at))}</div>
        </div>
    `).join("");
}

async function loadAnnouncements() {
    try {
        let data = await fetchJSON(`${getAPIURL()}/announcements/public?limit=5`);
        let items = Array.isArray(data?.data) ? data.data : [];

        if (!items.length) {
            data = await fetchJSON(`${getAPIURL()}/announcements/?status=published&limit=5`);
            items = Array.isArray(data?.data) ? data.data : [];
        }

        renderAnnouncements(items);
    } catch (error) {
        console.error("Failed to load announcements:", error);
        renderAnnouncements([]);
    }
}

/* =========================
   ATTENDANCE
========================= */
function renderAttendance(data) {
    if (!data) {
        setText(attendanceStatus, "No Record");
        setText(attendanceTimeIn, "--:--");
        setText(attendanceHours, "0.0 hrs");
        return;
    }

    if (data.is_clocked_in) {
        setText(attendanceStatus, data.attendance_status || "Timed In");
        setText(attendanceTimeIn, formatTime(data.time_in), "--:--");

        const timeInDate = data.time_in ? parseServerDate(data.time_in) : null;
        if (timeInDate && !isNaN(timeInDate.getTime())) {
            const now = new Date();
            const diffHours = Math.max(0, (now - timeInDate) / 3600000);
            setText(attendanceHours, `${diffHours.toFixed(1)} hrs`);
        } else {
            setText(attendanceHours, "0.0 hrs");
        }
    } else {
        setText(attendanceStatus, "Not Timed In");
        setText(attendanceTimeIn, "--:--");
        setText(attendanceHours, "0.0 hrs");
    }
}

async function loadAttendanceToday() {
    try {
        if (!currentStaffUser?.user_id) {
            renderAttendance(null);
            return;
        }

        const data = await fetchJSON(`${getAPIURL()}/attendance/status/${currentStaffUser.user_id}`);
        renderAttendance(data);
    } catch (error) {
        console.error("Failed to load attendance:", error);
        renderAttendance(null);
    }
}

/* =========================
   POINTS INQUIRY
========================= */
function renderPointsResult(message, isError = false) {
    if (!pointsLookupResult) return;

    pointsLookupResult.innerHTML = `
        <div style="color:${isError ? "var(--danger)" : "var(--text-muted)"}; font-weight:700;">
            ${escapeHTML(message)}
        </div>
    `;
}

async function handlePointsLookup() {
    const query = pointsLookupInput?.value?.trim();

    if (!query) {
        renderPointsResult("Please enter email, wallet code, or user ID first.", true);
        return;
    }

    renderPointsResult("Searching customer account...");

    try {
        const data = await fetchJSON(`${getAPIURL()}/rewards/inquiry?q=${encodeURIComponent(query)}`);

        const fullName = data.full_name || "No name";
        const email = data.email || "No email";
        const walletCode = maskWalletCode(data.wallet_code);
        const rewardPoints = data.reward_points ?? 0;
        const walletBalance = Number(data.wallet_balance ?? 0).toFixed(2);
        const userId = data.user_id ?? "-";
        const status = data.is_active ? "Active" : "Inactive";

        pointsLookupResult.innerHTML = `
            <div style="text-align:left; color: var(--text-main); font-weight:700; line-height:1.7;">
                <div><strong>Name:</strong> ${escapeHTML(fullName)}</div>
                <div><strong>Email:</strong> ${escapeHTML(email)}</div>
                <div><strong>User ID:</strong> ${escapeHTML(userId)}</div>
                <div><strong>Wallet Code:</strong> ${escapeHTML(walletCode)}</div>
                <div><strong>Reward Points:</strong> ${escapeHTML(rewardPoints)}</div>
                <div><strong>Wallet Balance:</strong> ₱${escapeHTML(walletBalance)}</div>
                <div><strong>Status:</strong> ${escapeHTML(status)}</div>
            </div>
        `;
    } catch (error) {
        console.error("Points inquiry failed:", error);
        renderPointsResult(error.message || "Customer not found.", true);
    }
}

/* =========================
   ORDER SCROLL UX
========================= */
function refreshOrderScrollButtonState() {
    if (!orderQueue || !scrollOrdersTopBtn) return;

    if (orderQueue.scrollTop > 120) {
        scrollOrdersTopBtn.classList.add("show");
    } else {
        scrollOrdersTopBtn.classList.remove("show");
    }
}

function setupOrderQueueScroll() {
    if (!orderQueue || !scrollOrdersTopBtn) return;

    orderQueue.addEventListener("scroll", refreshOrderScrollButtonState);

    scrollOrdersTopBtn.addEventListener("click", () => {
        orderQueue.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    });

    refreshOrderScrollButtonState();
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
function startOrdersAutoRefresh() {
    if (ordersRefreshInterval) {
        clearInterval(ordersRefreshInterval);
    }

    ordersRefreshInterval = setInterval(() => {
        loadOrders();
    }, 15000);
}

/* =========================
   INIT
========================= */
function setupPointsLookup() {
    if (pointsLookupBtn) {
        pointsLookupBtn.addEventListener("click", handlePointsLookup);
    }

    if (pointsLookupInput) {
        pointsLookupInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                handlePointsLookup();
            }
        });
    }
}

async function initOverview() {
    await loadCurrentUser();

    await Promise.all([
        loadOrders(),
        loadLowStock(),
        loadAnnouncements(),
        loadAttendanceToday()
    ]);

    setupPointsLookup();
    setupLogout();
    setupOrderQueueScroll();
    startOrdersAutoRefresh();
}

document.addEventListener("DOMContentLoaded", initOverview);