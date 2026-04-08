let rewardCustomersCache = [];
let rewardSearchTimer = null;
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
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.innerText = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}
function formatPoints(value) {
    return `${Number(value || 0).toLocaleString()} pts`;
}

async function fetchRewardsSummary() {
    try {
        const response = await fetch(`${API_URL}/rewards/admin/summary`, {
            method: "GET",
            headers: getAuthHeaders(),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Summary fetch failed: ${response.status}`);
        }

        const totalIssued = document.getElementById("totalIssued");
        const totalRedeemed = document.getElementById("totalRedeemed");
        const currentBalance = document.getElementById("currentBalance");
        const pendingClaims = document.getElementById("pendingClaims");

        if (totalIssued) totalIssued.innerText = formatPoints(result.total_issued || 0);
        if (totalRedeemed) totalRedeemed.innerText = formatPoints(result.total_redeemed || 0);
        if (currentBalance) currentBalance.innerText = formatPoints(result.current_balance || 0);
        if (pendingClaims) pendingClaims.innerText = Number(result.pending_claimable_orders || 0).toLocaleString();
    } catch (error) {
        console.error("Rewards summary error:", error);
    }
}

async function fetchRewardCustomers() {
    const q = (document.getElementById("searchInput")?.value || "").trim();

    try {
        const response = await fetch(`${API_URL}/rewards/admin/customers?q=${encodeURIComponent(q)}&limit=100`, {
            method: "GET",
            headers: getAuthHeaders()
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Rewards customers fetch failed: ${response.status}`);
        }

        rewardCustomersCache = result.data || [];
        renderRewardsTable();
    } catch (error) {
        console.error("Rewards customers error:", error);
        rewardCustomersCache = [];
        renderRewardsTable();
    }
}

function renderRewardsTable() {
    const tbody = document.getElementById("tableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!rewardCustomersCache.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="opacity-60">No rewards customers found.</td>
            </tr>
        `;
        return;
    }

    rewardCustomersCache.forEach((item) => {
        const customerName = item.full_name || item.email || `User #${item.user_id}`;
        const statusBadge = item.is_active
            ? `<span class="points-badge badge-active">Active</span>`
            : `<span class="points-badge badge-inactive">Inactive</span>`;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td class="font-bold">${escapeHtml(customerName)}</td>
            <td class="text-xs opacity-70">${escapeHtml(item.email || "-")}</td>
            <td>${statusBadge}</td>
            <td class="font-black text-yellow-400">${Number(item.total_points || 0).toLocaleString()}</td>
            <td class="font-black text-green-500">${Number(item.total_earned || 0).toLocaleString()}</td>
            <td class="font-black text-red-500">${Number(item.total_redeemed || 0).toLocaleString()}</td>
            <td style="text-align: right;">
                <button
                    class="text-yellow-400 mr-3 history-btn"
                    type="button"
                    title="View history"
                    data-user-id="${item.user_id}"
                    data-customer-name="${escapeHtml(customerName)}"
                    data-customer-email="${escapeHtml(item.email || "-")}"
                >
                    <i class="fas fa-clock-rotate-left"></i>
                </button>

                <button
                    class="text-green-400 mr-3 claim-btn"
                    type="button"
                    title="Manual claim"
                    data-email="${escapeHtml(item.email || "")}"
                >
                    <i class="fas fa-plus"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

function debouncedSearchCustomers() {
    clearTimeout(rewardSearchTimer);
    rewardSearchTimer = setTimeout(() => {
        fetchRewardCustomers();
    }, 350);
}

function openClaimModal() {
    const form = document.getElementById("claimForm");
    if (form) form.reset();

    const modal = document.getElementById("claimModal");
    if (modal) modal.classList.add("show");
}

function closeClaimModal() {
    const modal = document.getElementById("claimModal");
    if (modal) modal.classList.remove("show");
}

function openOtpModal() {
    const modal = document.getElementById("otpModal");
    if (modal) modal.classList.add("show");
}

function closeOtpModal() {
    const modal = document.getElementById("otpModal");
    if (modal) modal.classList.remove("show");
}

function openHistoryOnly() {
    const modal = document.getElementById("historyModal");
    if (modal) modal.classList.add("show");
}

function closeHistoryModal() {
    const modal = document.getElementById("historyModal");
    if (modal) modal.classList.remove("show");
}

function quickClaim(email) {
    const emailInput = document.getElementById("claimEmail");
    const orderInput = document.getElementById("claimOrderReference");

    if (emailInput) emailInput.value = email || "";
    if (orderInput) orderInput.value = "";

    openClaimModal();
}

async function submitClaimForm(event) {
    event.preventDefault();

    const email = (document.getElementById("claimEmail")?.value || "").trim();
    const orderReference = (document.getElementById("claimOrderReference")?.value || "").trim();

    if (!email || !orderReference) {
        alert("Customer email and order reference are required.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/rewards/manual/otp/request`, {
            method: "POST",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({
                email: email,
                order_reference: orderReference
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `OTP request failed: ${response.status}`);
        }

        closeClaimModal();

        const otpEmail = document.getElementById("otpEmail");
        const otpOrderReference = document.getElementById("otpOrderReference");
        const otpCode = document.getElementById("otpCode");

        if (otpEmail) otpEmail.value = email;
        if (otpOrderReference) otpOrderReference.value = result.display_id || result.order_id || orderReference;
        if (otpCode) otpCode.value = "";

        openOtpModal();

        if (result.otp_dev) {
            alert(`DEV MODE OTP: ${result.otp_dev}`);
        }

        showToast("OTP sent");
    } catch (error) {
        console.error("OTP request error:", error);
        alert(error.message || "Failed to send OTP.");
    }
}

async function submitOtpForm(event) {
    event.preventDefault();

    const email = (document.getElementById("otpEmail")?.value || "").trim();
    const orderReference = (document.getElementById("otpOrderReference")?.value || "").trim();
    const otp = (document.getElementById("otpCode")?.value || "").trim();

    if (!email || !orderReference || !otp) {
        alert("Complete the OTP form first.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/rewards/manual/otp/confirm`, {
            method: "POST",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({
                email: email,
                order_reference: orderReference,
                otp: otp
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `OTP confirm failed: ${response.status}`);
        }

        closeOtpModal();
        await refreshRewardsPage();
        showToast("Points synced");
    } catch (error) {
        console.error("OTP confirm error:", error);
        alert(error.message || "Failed to confirm OTP.");
    }
}

async function openHistoryModal(userId, customerName, customerEmail) {
    const historyTitle = document.getElementById("historyTitle");
    const historySubtitle = document.getElementById("historySubtitle");
    const historyList = document.getElementById("historyList");

    if (historyTitle) historyTitle.innerText = customerName || "Reward History";
    if (historySubtitle) historySubtitle.innerText = customerEmail || "-";
    if (historyList) historyList.innerHTML = `<div class="opacity-60">Loading history...</div>`;

    openHistoryOnly();

    try {
        const response = await fetch(`${API_URL}/rewards/admin/customer/${userId}/history`, {
            method: "GET",
            headers: getAuthHeaders()
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `History fetch failed: ${response.status}`);
        }

        const history = result.history || [];

        if (!historyList) return;

        if (!history.length) {
            historyList.innerHTML = `<div class="opacity-60">No reward history found.</div>`;
            return;
        }

        historyList.innerHTML = "";

        history.forEach((item) => {
            const isEarn = String(item.type || "").toUpperCase() === "EARN";
            const displayOrderId = item.display_order_id || item.order_id || "-";
            const pointsValue = Number(item.points_change || 0);

            const card = document.createElement("div");
            card.className = "history-item";
            card.innerHTML = `
                <div class="flex items-center justify-between gap-3 mb-2">
                    <span class="points-badge ${isEarn ? "badge-issued" : "badge-redeemed"}">
                        ${escapeHtml(item.type || "-")}
                    </span>
                    <span class="font-black ${isEarn ? "text-green-500" : "text-red-500"}">
                        ${pointsValue > 0 ? "+" : ""}${pointsValue}
                    </span>
                </div>
                <div class="text-sm opacity-80">Order Ref: ${escapeHtml(displayOrderId)}</div>
                <div class="text-xs opacity-50 mt-1">${escapeHtml(item.created_at || "-")}</div>
            `;
            historyList.appendChild(card);
        });
    } catch (error) {
        console.error("History error:", error);
        if (historyList) {
            historyList.innerHTML = `<div class="opacity-60">Failed to load history.</div>`;
        }
    }
}

async function refreshRewardsPage() {
    await Promise.all([
        fetchRewardsSummary(),
        fetchRewardCustomers()
    ]);
}

function bindRewardsTableActions() {
    const tbody = document.getElementById("tableBody");
    if (!tbody) return;

    tbody.addEventListener("click", async (event) => {
        const historyBtn = event.target.closest(".history-btn");
        const claimBtn = event.target.closest(".claim-btn");

        if (historyBtn) {
            const userId = Number(historyBtn.dataset.userId || 0);
            const customerName = historyBtn.dataset.customerName || "Reward History";
            const customerEmail = historyBtn.dataset.customerEmail || "-";

            if (!userId) {
                alert("Invalid customer history target.");
                return;
            }

            await openHistoryModal(userId, customerName, customerEmail);
            return;
        }

        if (claimBtn) {
            const email = claimBtn.dataset.email || "";
            quickClaim(email);
        }
    });
}

function bindRewardsEvents() {
    document.getElementById("searchInput")?.addEventListener("input", debouncedSearchCustomers);
    document.getElementById("claimForm")?.addEventListener("submit", submitClaimForm);
    document.getElementById("otpForm")?.addEventListener("submit", submitOtpForm);

    bindRewardsTableActions();
}

async function initializeRewardsPage() {
    bindRewardsEvents();
    await refreshRewardsPage();
}
window.openClaimModal = openClaimModal;
window.closeClaimModal = closeClaimModal;
window.closeOtpModal = closeOtpModal;
window.closeHistoryModal = closeHistoryModal;

window.onload = () => {
    initializeRewardsPage();
};