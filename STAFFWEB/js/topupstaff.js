const body = document.body;
const memberSearchInput = document.getElementById("memberSearchInput");
const memberNameText = document.getElementById("memberNameText");
const memberCodeText = document.getElementById("memberCodeText");
const memberBalanceText = document.getElementById("memberBalanceText");
const memberEmailText = document.getElementById("memberEmailText");
const memberStatusText = document.getElementById("memberStatusText");

const reloadAmountInput = document.getElementById("reloadAmount");
const processReloadBtn = document.getElementById("processReloadBtn");
const summaryAmount = document.getElementById("summaryAmount");
const summaryCount = document.getElementById("summaryCount");
const historyTableBody = document.getElementById("historyTableBody");

let selectedMember = null;
let selectedPaymentMethod = "Cash";

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

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatMoney(value) {
    const num = Number(value || 0);
    return `₱${num.toFixed(2)}`;
}

function maskWalletCode(code) {
    const raw = String(code || "").trim().toUpperCase();
    if (!raw) return "-";
    if (raw.length <= 3) return raw;
    return `${raw.slice(0, 3)}***`;
}

function formatTimeOnly(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function showMessage(message) {
    alert(message);
}

function getQueryMemberUserId() {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get("user_id");

    if (!userId) return null;

    const parsed = Number(userId);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;

    return parsed;
}

function sanitizeMemberURL(userId) {
    if (!userId) return;
    const cleanUrl = `${window.location.pathname}?user_id=${encodeURIComponent(String(userId))}`;
    window.history.replaceState({}, "", cleanUrl);
}

async function fetchMemberByUserId(userId) {
    const response = await fetch(`${getAPIURL()}/wallet/member/${encodeURIComponent(userId)}`, {
        method: "GET",
        credentials: "include"
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.detail || `Failed to load wallet member: ${response.status}`);
    }

    return result;
}

function loadSelectedMember(member) {
    selectedMember = member;

    if (memberNameText) {
        memberNameText.textContent = member?.full_name || member?.email || "No member selected";
    }

    if (memberCodeText) {
        memberCodeText.textContent = maskWalletCode(member?.wallet_code || "------");
    }

    if (memberBalanceText) {
        memberBalanceText.textContent = formatMoney(member?.balance || 0);
    }

    if (memberEmailText) {
        memberEmailText.textContent = member?.email || "-";
    }

    if (memberStatusText) {
        memberStatusText.textContent = member?.is_active ? "Active" : "Inactive";
        memberStatusText.style.color = member?.is_active ? "var(--success)" : "var(--danger)";
    }

    if (memberSearchInput) {
        memberSearchInput.value = member
            ? (member.full_name || member.email || member.wallet_code || "")
            : "";
    }
}

async function quickSearchAndRedirect() {
    const q = String(memberSearchInput?.value || "").trim();
    if (!q) {
        showMessage("Enter member name, email, or wallet code.");
        return;
    }

    try {
        const response = await fetch(`${getAPIURL()}/wallet/lookup?q=${encodeURIComponent(q)}&limit=10`, {
            method: "GET",
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Wallet lookup failed: ${response.status}`);
        }

        const rows = Array.isArray(result?.data) ? result.data : [];

        if (!rows.length) {
            showMessage("No matching wallet found.");
            return;
        }

        if (rows.length === 1) {
            const user = rows[0];
            const params = new URLSearchParams({
                user_id: String(user.user_id || "")
            });

            window.location.href = `topupstaff.html?${params.toString()}`;
            return;
        }

        showMessage("Multiple matches found. Use the RPAY member list first.");
    } catch (error) {
        console.error("Quick search failed:", error);
        showMessage(error.message || "Failed to search wallet.");
    }
}

function setAmount(val) {
    if (reloadAmountInput) {
        reloadAmountInput.value = val;
    }
}

function setMethod(el, method) {
    selectedPaymentMethod = method;
    document.querySelectorAll("#methods .option-chip").forEach(chip => chip.classList.remove("active"));
    el?.classList.add("active");
}

function getSessionLogKey() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `staff_topup_logs_${yyyy}-${mm}-${dd}`;
}

function readSessionLogs() {
    try {
        const raw = localStorage.getItem(getSessionLogKey());
        const parsed = JSON.parse(raw || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeSessionLogs(logs) {
    localStorage.setItem(getSessionLogKey(), JSON.stringify(logs));
}

function renderSessionSummary() {
    const logs = readSessionLogs();
    const total = logs.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    if (summaryAmount) summaryAmount.textContent = formatMoney(total);
    if (summaryCount) summaryCount.textContent = `${logs.length} Top-up${logs.length === 1 ? "" : "s"}`;
}

function renderSessionHistory() {
    if (!historyTableBody) return;

    const logs = readSessionLogs().slice().reverse();

    if (!logs.length) {
        historyTableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; color: var(--text-muted); font-style: italic;">No top-up logs yet today.</td>
            </tr>
        `;
        return;
    }

    historyTableBody.innerHTML = logs.map(item => `
        <tr>
            <td>${escapeHTML(formatTimeOnly(item.created_at))}</td>
            <td>${escapeHTML(item.method || "Cash")}</td>
            <td style="color: var(--success); font-weight: 900;">+${escapeHTML(formatMoney(item.amount || 0))}</td>
            <td><span class="status-badge">Completed</span></td>
        </tr>
    `).join("");
}

function addSessionLog(entry) {
    const logs = readSessionLogs();
    logs.push(entry);
    writeSessionLogs(logs);
    renderSessionSummary();
    renderSessionHistory();
}

async function processReload() {
    if (!selectedMember?.user_id) {
        showMessage("Select a member first from the RPAY member list.");
        return;
    }

    const amount = Number(reloadAmountInput?.value || 0);

    if (Number.isNaN(amount) || amount <= 0) {
        showMessage("Enter a valid amount.");
        return;
    }

    if (!selectedMember?.is_active) {
        showMessage("Cannot top up an inactive wallet owner.");
        return;
    }

    try {
        if (processReloadBtn) processReloadBtn.disabled = true;

        const response = await fetch(`${getAPIURL()}/wallet/topup`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                user_id: selectedMember.user_id,
                amount: amount
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Top-up failed: ${response.status}`);
        }

        selectedMember.balance = Number(result.balance || 0);
        loadSelectedMember(selectedMember);

        addSessionLog({
            created_at: new Date().toISOString(),
            method: selectedPaymentMethod,
            amount: amount,
            user_id: selectedMember.user_id,
            full_name: selectedMember.full_name,
            email: selectedMember.email
        });

        if (reloadAmountInput) reloadAmountInput.value = "";
        showMessage(`Top-up successful for ${selectedMember.full_name || selectedMember.email}.`);
    } catch (error) {
        console.error("Top-up error:", error);
        showMessage(error.message || "Failed to process top-up.");
    } finally {
        if (processReloadBtn) processReloadBtn.disabled = false;
    }
}

function setupActions() {
    window.setAmount = setAmount;
    window.setMethod = setMethod;
    window.processReload = processReload;
    window.quickSearchAndRedirect = quickSearchAndRedirect;

    memberSearchInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            quickSearchAndRedirect();
        }
    });
}

async function initTopupStaffPage() {
    try {
        setupActions();

        const userId = getQueryMemberUserId();

        if (userId) {
            sanitizeMemberURL(userId);
            const member = await fetchMemberByUserId(userId);
            loadSelectedMember(member);
        } else {
            loadSelectedMember(null);
        }

        renderSessionSummary();
        renderSessionHistory();
    } catch (error) {
        console.error("topupstaff init error:", error);
        showMessage(error.message || "Failed to load member data.");
        loadSelectedMember(null);
    }
}

document.addEventListener("DOMContentLoaded", initTopupStaffPage);