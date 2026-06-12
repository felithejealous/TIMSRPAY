let rewardsMembersCache = [];
let filteredMembersCache = [];
let memberSearchTimer = null;
let selectedRedeemCustomer = null;
let rewardsCatalogCache = [];

let currentMemberFilter = "all";
let currentMemberSort = "highest_points";
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
/* =========================
   HELPERS
========================= */
function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function formatPoints(value) {
    const points = Number(value || 0);
    return `${points.toLocaleString()} ${points === 1 ? "pt" : "pts"}`;
}
function getActiveRewardsCatalog() {
    return Array.isArray(rewardsCatalogCache)
        ? rewardsCatalogCache.filter(reward => reward.is_active !== false)
        : [];
}

function getLowestActiveRewardPoints() {
    const activeRewards = getActiveRewardsCatalog();
    const pointValues = activeRewards
        .map(reward => Number(reward.points_required || 0))
        .filter(value => Number.isFinite(value) && value > 0);

    if (!pointValues.length) return 0;
    return Math.min(...pointValues);
}

function getClaimableRewards(points) {
    const customerPoints = Number(points || 0);

    return getActiveRewardsCatalog().filter(reward => {
        const required = Number(reward.points_required || 0);
        return Number.isFinite(required) && required > 0 && customerPoints >= required;
    });
}

function getProgressPercent(points) {
    const value = Number(points || 0);
    const baseRequired = getLowestActiveRewardPoints();

    if (!baseRequired || baseRequired <= 0) return "0.00";

    const pct = Math.max(0, Math.min(100, (value / baseRequired) * 100));
    return pct.toFixed(2);
}
function getMemberStatus(points) {
    const claimableRewards = getClaimableRewards(points);

    return claimableRewards.length > 0
        ? {
            label: "Ready",
            className: "eligible"
        }
        : {
            label: "Collecting",
            className: "not-eligible"
        };
}
function getMemberDisplayName(member) {
    return member.full_name || member.email || `User #${member.user_id}`;
}
function getMemberInitials(nameOrEmail) {
    const raw = String(nameOrEmail || "").trim();

    if (!raw) return "U";

    const namePart = raw.includes("@") ? raw.split("@")[0] : raw;
    const parts = namePart.split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    return namePart.slice(0, 2).toUpperCase();
}
function memberMatchesFilter(member) {
    const points = Number(member.total_points || 0);
    const claimableRewards = getClaimableRewards(points);

    if (currentMemberFilter === "with_points") {
        return points > 0;
    }

    if (currentMemberFilter === "no_points") {
        return points === 0;
    }

    if (currentMemberFilter === "claimable") {
        return claimableRewards.length > 0;
    }

    return true;
}

function getMemberCreatedValue(member) {
    const rawDate =
        member.created_at ||
        member.registered_at ||
        member.joined_at ||
        member.user_id ||
        0;

    if (rawDate && !Number.isNaN(Date.parse(rawDate))) {
        return new Date(rawDate).getTime();
    }

    return Number(member.user_id || 0);
}

function sortMembers(members) {
    const sorted = [...members];

    sorted.sort((a, b) => {
        const aPoints = Number(a.total_points || 0);
        const bPoints = Number(b.total_points || 0);
        const aName = getMemberDisplayName(a).toLowerCase();
        const bName = getMemberDisplayName(b).toLowerCase();
        const aCreated = getMemberCreatedValue(a);
        const bCreated = getMemberCreatedValue(b);

        if (currentMemberSort === "lowest_points") {
            return aPoints - bPoints;
        }

        if (currentMemberSort === "az") {
            return aName.localeCompare(bName);
        }

        if (currentMemberSort === "za") {
            return bName.localeCompare(aName);
        }

        if (currentMemberSort === "newest") {
            return bCreated - aCreated;
        }

        if (currentMemberSort === "oldest") {
            return aCreated - bCreated;
        }

        return bPoints - aPoints;
    });

    return sorted;
}

function applyMemberFiltersAndSort() {
    filteredMembersCache = sortMembers(
        rewardsMembersCache.filter(member => memberMatchesFilter(member))
    );

    renderMembersTable();
}
function showInlineMessage(container, html, color = "") {
    if (!container) return;
    container.innerHTML = html;
    container.style.color = color || "";
}

function updateRedeemInfoBox(html, color = "") {
    const redeemInfo = document.getElementById("redeemTokenInfo");
    showInlineMessage(redeemInfo, html, color);
}
async function loadRewardsCatalogForStaff() {
    const response = await fetchJSON(
        `${getAPIURL()}/rewards/admin/catalog?active_only=true`
    );

    rewardsCatalogCache = Array.isArray(response?.data) ? response.data : [];
}
/* =========================
   MEMBERS TABLE
========================= */
async function loadMembers(searchValue = "") {
    const q = String(searchValue || "").trim();

    const response = await fetchJSON(
        `${getAPIURL()}/rewards/admin/customers?q=${encodeURIComponent(q)}&limit=200`
    );

rewardsMembersCache = Array.isArray(response?.data) ? response.data : [];
applyMemberFiltersAndSort();
}
function renderMembersTable() {
    const container = document.getElementById("membersTableBody");
    if (!container) return;

    if (!filteredMembersCache.length) {
        container.innerHTML = `
            <div class="member-empty-state">No members found.</div>
        `;
        return;
    }

    container.innerHTML = filteredMembersCache.map(member => {
        const points = Number(member.total_points || 0);
        const status = getMemberStatus(points);
        const displayName = getMemberDisplayName(member);
        const initials = getMemberInitials(displayName);
        const progressPercent = getProgressPercent(points);
        const canRedeem = getClaimableRewards(points).length > 0;

        return `
            <div class="member-row-card">
                <div class="member-identity">
                    <div class="member-avatar">${escapeHTML(initials)}</div>

                    <div class="member-meta">
                        <span class="member-name">${escapeHTML(displayName)}</span>
                        <span class="member-sub">
                            ${escapeHTML(member.email || "-")} · User ID #${escapeHTML(member.user_id)}
                        </span>
                    </div>
                </div>

                <div class="member-points">
                    <strong>${escapeHTML(Number(points).toLocaleString())}</strong>
                    <span>Points</span>
                </div>

                <div class="progress-info">
                    <div class="progress-percent">${escapeHTML(progressPercent)}%</div>
                    <div class="points-bar">
                        <div class="points-fill" style="width: ${progressPercent}%"></div>
                    </div>
                </div>

                <div>
                    <span class="promo-badge ${status.className}">
                        ${escapeHTML(status.label)}
                    </span>
                </div>

                <div>
                    <button
                        class="inline-action-btn redeem-btn"
                        data-email="${escapeHTML(member.email || "")}"
                        data-user-id="${escapeHTML(member.user_id)}"
                        data-points="${escapeHTML(points)}"
                        data-name="${escapeHTML(displayName)}"
                        ${canRedeem ? "" : "disabled"}
                    >
                        Redeem
                    </button>
                </div>
            </div>
        `;
    }).join("");
}
function setupMemberSearch() {
    const memberSearchInput = document.getElementById("memberSearchInput");
    if (!memberSearchInput) return;

    memberSearchInput.addEventListener("input", () => {
        clearTimeout(memberSearchTimer);

        memberSearchTimer = setTimeout(async () => {
            try {
                await loadMembers(memberSearchInput.value);
            } catch (error) {
                console.error("Member search failed:", error);
            }
        }, 300);
    });
}
function setupMemberFiltersAndSort() {
    const filterButtons = document.querySelectorAll(".member-filter-btn");
    const sortSelect = document.getElementById("memberSortSelect");

    filterButtons.forEach(button => {
        button.addEventListener("click", () => {
            filterButtons.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");

            currentMemberFilter = button.dataset.memberFilter || "all";
            applyMemberFiltersAndSort();
        });
    });

    if (sortSelect) {
        sortSelect.value = currentMemberSort;

        sortSelect.addEventListener("change", () => {
            currentMemberSort = sortSelect.value || "highest_points";
            applyMemberFiltersAndSort();
        });
    }
}

function setupMembersTableActions() {
    const tbody = document.getElementById("membersTableBody");
    if (!tbody) return;

    tbody.addEventListener("click", async (event) => {
        const redeemBtn = event.target.closest(".redeem-btn");
        if (!redeemBtn || redeemBtn.disabled) return;

        const email = redeemBtn.dataset.email || "";
        const userId = redeemBtn.dataset.userId || "";
        const points = Number(redeemBtn.dataset.points || 0);
        const name = redeemBtn.dataset.name || `User #${userId}`;

        selectedRedeemCustomer = {
            email,
            userId,
            points,
            name
        };

        const inquiryInput = document.getElementById("inquiryInput");
        const tokenInput = document.getElementById("tokenInput");

        if (inquiryInput) {
            inquiryInput.value = email || userId;
            await handleCustomerInquiry();
        }

        updateRedeemInfoBox(`
            <div style="display:grid; gap:8px;">
                <div><strong>Selected Customer:</strong> ${escapeHTML(name)}</div>
                <div><strong>Email:</strong> ${escapeHTML(email || "-")}</div>
                <div><strong>User ID:</strong> ${escapeHTML(userId || "-")}</div>
                <div><strong>Current Points:</strong> <span style="color: var(--mango); font-weight: 900;">${escapeHTML(points.toLocaleString())}</span></div>
                <div style="color: var(--success); font-weight: 800;">
                    "Use this for customers who have already generated a redeem token. Reward tokens do not expire, but once consumed, they cannot be reused."
                </div>
            </div>
        `, "var(--text-main)");

        tokenInput?.focus();
    });
}

/* =========================
   CUSTOMER INQUIRY
========================= */
async function handleCustomerInquiry() {
    const inquiryInput = document.getElementById("inquiryInput");
    const inquiryResult = document.getElementById("inquiryResult");

    const q = String(inquiryInput?.value || "").trim();

    if (!q) {
        showInlineMessage(
            inquiryResult,
            "Enter customer email, wallet code, or user id first.",
            "var(--warning)"
        );
        return;
    }

    try {
        showInlineMessage(inquiryResult, "Searching customer...", "var(--text-muted)");

        const result = await fetchJSON(
            `${getAPIURL()}/rewards/inquiry?q=${encodeURIComponent(q)}`
        );

        const statusText = result.is_active ? "Active" : "Inactive";
        const points = Number(result.reward_points || 0);
        const balance = Number(result.wallet_balance || 0);
        const ready = points >= 2800;

        inquiryResult.innerHTML = `
            <div style="display:grid; gap:8px;">
                <div><strong>Name:</strong> ${escapeHTML(result.full_name || "-")}</div>
                <div><strong>Email:</strong> ${escapeHTML(result.email || "-")}</div>
                <div><strong>User ID:</strong> ${escapeHTML(result.user_id || "-")}</div>
                <div><strong>Wallet Code:</strong> ${escapeHTML(result.wallet_code || "-")}</div>
                <div><strong>Reward Points:</strong> <span style="color: var(--mango); font-weight: 900;">${escapeHTML(points.toLocaleString())}</span></div>
                <div><strong>Wallet Balance:</strong> ₱${escapeHTML(balance.toFixed(2))}</div>
                <div><strong>Status:</strong> ${escapeHTML(statusText)}</div>
                <div><strong>Reward Eligibility:</strong> ${
                    ready
                        ? '<span style="color: var(--success); font-weight: 900;">Ready for free drink</span>'
                        : '<span style="color: var(--text-muted); font-weight: 900;">Still collecting points</span>'
                }</div>
                <div><strong>Active Redeem Token:</strong> ${
                    result.has_active_redeem_token
                        ? '<span style="color: var(--success); font-weight: 900;">Yes</span>'
                        : '<span style="color: var(--text-muted); font-weight: 900;">None</span>'
                }</div>
            </div>
        `;
        inquiryResult.style.color = "var(--text-main)";
    } catch (error) {
        console.error("Inquiry failed:", error);
        showInlineMessage(
            inquiryResult,
            escapeHTML(error.message || "Customer inquiry failed."),
            "var(--danger)"
        );
    }
}

function setupInquiryActions() {
    const searchCustomerBtn = document.getElementById("searchCustomerBtn");
    const inquiryInput = document.getElementById("inquiryInput");

    searchCustomerBtn?.addEventListener("click", handleCustomerInquiry);

    inquiryInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            handleCustomerInquiry();
        }
    });
}

/* =========================
   TOKEN CONSUME
========================= */
async function handleConsumeToken() {
    const tokenInput = document.getElementById("tokenInput");
    const token = String(tokenInput?.value || "").trim();

    if (!token) {
        alert("Please enter or scan a reward token first.");
        return;
    }

    const confirmed = confirm(`Consume this token?\n\n${token}`);
    if (!confirmed) return;

    const consumeBtn = document.getElementById("consumeTokenBtn");

    try {
        if (consumeBtn) consumeBtn.disabled = true;

        const result = await fetchJSON(
            `${getAPIURL()}/rewards/redeem-qr/consume?qr_token=${encodeURIComponent(token)}`,
            {
                method: "POST"
            }
        );

const redeemedRewardName = result.reward_name || "Reward";
const redeemedProductName = result.product_name || "No linked product";
const redeemedSizeLabel = result.size_label || "Standard";
const consumedPoints = Number(result.required_points || 0);
const remainingPoints = Number(result.remaining_points || 0);

updateRedeemInfoBox(`
    <div style="display:grid; gap:8px;">
        <div style="color: var(--success); font-weight: 900;">Reward redeemed successfully.</div>
        <div><strong>User ID:</strong> ${escapeHTML(result.user_id)}</div>
        <div><strong>Reward:</strong> ${escapeHTML(redeemedRewardName)}</div>
        <div><strong>Drink to Prepare:</strong> ${escapeHTML(redeemedProductName)}</div>
        <div><strong>Size:</strong> ${escapeHTML(redeemedSizeLabel)}</div>
        <div><strong>Points Deducted:</strong> ${escapeHTML(formatPoints(consumedPoints))}</div>
        <div><strong>Remaining Points:</strong> ${escapeHTML(formatPoints(remainingPoints))}</div>
        <div>This token is now consumed and cannot be reused.</div>
    </div>
`, "var(--text-main)");

alert(
    `${result.message || "Reward redeemed successfully."}\n\n` +
    `User ID: ${result.user_id}\n` +
    `Reward: ${result.reward_name || "Reward"}\n` +
    `Drink: ${result.product_name || "No linked product"}\n` +
    `Size: ${result.size_label || "Standard"}\n` +
    `Remaining Points: ${formatPoints(result.remaining_points || 0)}`
);

        if (tokenInput) tokenInput.value = "";
        selectedRedeemCustomer = null;
        await refreshRewardsStaffPage();
    } catch (error) {
        console.error("Consume token failed:", error);
        alert(error.message || "Failed to consume token.");
    } finally {
        if (consumeBtn) consumeBtn.disabled = false;
    }
}

function setupTokenActions() {
    const consumeTokenBtn = document.getElementById("consumeTokenBtn");
    const tokenInput = document.getElementById("tokenInput");

    consumeTokenBtn?.addEventListener("click", handleConsumeToken);

    tokenInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            handleConsumeToken();
        }
    });
}

/* =========================
   MANUAL ADD POINTS
========================= */
async function handleRequestManualOTP() {
    const emailInput = document.getElementById("manualEmailInput");
    const orderReferenceInput = document.getElementById("manualOrderReferenceInput");

    const email = String(emailInput?.value || "").trim();
    const orderReference = String(orderReferenceInput?.value || "").trim();

    if (!email) {
        alert("Enter customer email first.");
        return;
    }

    if (!orderReference) {
        alert("Enter order reference first.");
        return;
    }

    const requestBtn = document.getElementById("requestManualOtpBtn");

    try {
        if (requestBtn) requestBtn.disabled = true;

        const result = await fetchJSON(`${getAPIURL()}/rewards/manual/otp/request`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email,
                order_reference: orderReference
            })
        });

        if (result?.otp_dev) {
            alert(`DEV MODE OTP: ${result.otp_dev}`);
        } else {
            alert("OTP request sent successfully.");
        }
    } catch (error) {
        console.error("Manual OTP request failed:", error);
        alert(error.message || "Failed to request OTP.");
    } finally {
        if (requestBtn) requestBtn.disabled = false;
    }
}
async function handleConfirmManualAdd() {
    const emailInput = document.getElementById("manualEmailInput");
    const orderReferenceInput = document.getElementById("manualOrderReferenceInput");
    const otpInput = document.getElementById("manualOtpInput");

    const email = String(emailInput?.value || "").trim();
    const orderReference = String(orderReferenceInput?.value || "").trim();
    const otp = String(otpInput?.value || "").trim();

    if (!email) {
        alert("Enter customer email first.");
        return;
    }

    if (!orderReference) {
        alert("Enter order reference first.");
        return;
    }

    if (!otp) {
        alert("Enter the received OTP first.");
        return;
    }

    const confirmBtn = document.getElementById("confirmManualAddBtn");

    try {
        if (confirmBtn) confirmBtn.disabled = true;

        const result = await fetchJSON(`${getAPIURL()}/rewards/manual/otp/confirm`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email,
                order_reference: orderReference,
                otp: otp
            })
        });

        alert(
            `${result.message || "Points synced successfully."}\n\nAdded Points: ${Number(result.added_points || 0).toLocaleString()}\nTotal Points: ${Number(result.total_points || 0).toLocaleString()}`
        );

        if (orderReferenceInput) orderReferenceInput.value = "";
        if (otpInput) otpInput.value = "";

        await refreshRewardsStaffPage();
    } catch (error) {
        console.error("Manual claim confirm failed:", error);
        alert(error.message || "Failed to confirm reward claim.");
    } finally {
        if (confirmBtn) confirmBtn.disabled = false;
    }
}

function setupManualAddActions() {
    const requestBtn = document.getElementById("requestManualOtpBtn");
    const confirmBtn = document.getElementById("confirmManualAddBtn");

    requestBtn?.addEventListener("click", handleRequestManualOTP);
    confirmBtn?.addEventListener("click", handleConfirmManualAdd);
}

/* =========================
   REFRESH
========================= */
async function refreshRewardsStaffPage() {
    const memberSearchInput = document.getElementById("memberSearchInput");
    await loadMembers(memberSearchInput?.value || "");

    const inquiryInput = document.getElementById("inquiryInput");
    if (String(inquiryInput?.value || "").trim()) {
        await handleCustomerInquiry();
    }
}

/* =========================
   INIT
========================= */
async function initRewardsStaffPage() {
    try {
      
        setupInquiryActions();
        setupTokenActions();
        setupManualAddActions();
        setupMemberSearch();
        setupMemberFiltersAndSort();
        setupMembersTableActions();

        updateRedeemInfoBox(
            "Use this for customers who already generated a redeem token. Free drink token does not expire, but once consumed it cannot be reused.",
            "var(--text-muted)"
        );
        await loadRewardsCatalogForStaff();
        await loadMembers("");
    } catch (error) {
        console.error("rewardsstaff init error:", error);

        const tbody = document.getElementById("membersTableBody");
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="color: var(--danger);">
                        Failed to load rewards staff page: ${escapeHTML(error.message || "Unknown error")}
                    </td>
                </tr>
            `;
        }
    }
}

document.addEventListener("DOMContentLoaded", initRewardsStaffPage);