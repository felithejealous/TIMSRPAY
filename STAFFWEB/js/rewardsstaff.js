let rewardsMembersCache = [];
let filteredMembersCache = [];
let memberSearchTimer = null;
let selectedRedeemCustomer = null;
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
    return `${Number(value || 0).toLocaleString()} pts`;
}

function getProgressPercent(points) {
    const value = Number(points || 0);
    const max = 2800;
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    return pct.toFixed(2);
}

function getMemberStatus(points) {
    return Number(points || 0) >= 2800
        ? {
            label: "Ready",
            className: "eligible"
        }
        : {
            label: "Collecting",
            className: "not-eligible"
        };
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
/* =========================
   MEMBERS TABLE
========================= */
async function loadMembers(searchValue = "") {
    const q = String(searchValue || "").trim();

    const response = await fetchJSON(
        `${getAPIURL()}/rewards/admin/customers?q=${encodeURIComponent(q)}&limit=200`
    );

    rewardsMembersCache = Array.isArray(response?.data) ? response.data : [];
    filteredMembersCache = [...rewardsMembersCache];
    renderMembersTable();
}

function renderMembersTable() {
    const tbody = document.getElementById("membersTableBody");
    if (!tbody) return;

    if (!filteredMembersCache.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="color: var(--text-muted);">No members found.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredMembersCache.map(member => {
        const points = Number(member.total_points || 0);
        const status = getMemberStatus(points);
        const displayName = member.full_name || member.email || `User #${member.user_id}`;
        const progressPercent = getProgressPercent(points);

        return `
            <tr>
                <td>
                    <div class="member-meta">
                        <span class="member-name">${escapeHTML(displayName)}</span>
                        <span class="member-sub">
                            ${escapeHTML(member.email || "-")} · User ID #${escapeHTML(member.user_id)}
                        </span>
                    </div>
                </td>
                <td>${escapeHTML(formatPoints(points))}</td>
                <td>
                    <div>${escapeHTML(progressPercent)}%</div>
                    <div class="points-bar">
                        <div class="points-fill" style="width: ${progressPercent}%"></div>
                    </div>
                </td>
                <td>
                    <span class="promo-badge ${status.className}">
                        ${escapeHTML(status.label)}
                    </span>
                </td>
                <td>
                    <button
                        class="inline-action-btn redeem-btn"
                        data-email="${escapeHTML(member.email || "")}"
                        data-user-id="${escapeHTML(member.user_id)}"
                        data-points="${escapeHTML(points)}"
                        data-name="${escapeHTML(displayName)}"
                        ${points < 2800 ? "disabled" : ""}
                    >
                        Redeem
                    </button>
                </td>
            </tr>
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
                    This customer is ready for free drink redemption. Ask the customer to show the QR/token, then consume it here.
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

        updateRedeemInfoBox(`
            <div style="display:grid; gap:8px;">
                <div style="color: var(--success); font-weight: 900;">Reward redeemed successfully.</div>
                <div><strong>User ID:</strong> ${escapeHTML(result.user_id)}</div>
                <div><strong>Remaining Points:</strong> ${escapeHTML(Number(result.remaining_points || 0).toLocaleString())}</div>
                <div>This token is now consumed and cannot be reused.</div>
            </div>
        `, "var(--text-main)");

        alert(
            `${result.message || "Reward redeemed successfully."}\n\nUser ID: ${result.user_id}\nRemaining Points: ${Number(result.remaining_points || 0).toLocaleString()}`
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
        setupMembersTableActions();

        updateRedeemInfoBox(
            "Use this for customers who already generated a redeem token. Free drink token does not expire, but once consumed it cannot be reused.",
            "var(--text-muted)"
        );

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