const body = document.body;
const walletSearchInput = document.getElementById("walletSearchInput");
const walletGrid = document.getElementById("walletGrid");

let walletResultsCache = [];
let walletSearchDebounce = null;
let lastSearchValue = "";

function getAPIURL() {
    if (!window.API_URL) {
        throw new Error("API_URL is not defined. Make sure authGuard.js loads first.");
    }
    return window.API_URL;
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
    const raw = String(code || "").trim();
    if (!raw) return "-";
    if (raw.length <= 2) return raw;
    return `${raw.slice(0, 2)}****`;
}

function buildInitialAvatar(name) {
    const safeName = (name || "U").trim();
    const initial = safeName.charAt(0).toUpperCase() || "U";

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
            <rect width="100%" height="100%" rx="100" ry="100" fill="#ffc244"/>
            <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
                font-family="Arial, sans-serif" font-size="88" font-weight="700" fill="#111111">
                ${initial}
            </text>
        </svg>
    `.trim();

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function updateSummaryCards() {
    const walletCount = walletResultsCache.length;
    const visibleBalance = walletResultsCache.reduce((sum, item) => sum + Number(item.balance || 0), 0);
    const activeWalletUsers = walletResultsCache.filter(item => Boolean(item.is_active)).length;

    const walletCountEl = document.getElementById("walletCount");
    const visibleBalanceEl = document.getElementById("visibleBalance");
    const activeWalletUsersEl = document.getElementById("activeWalletUsers");

    if (walletCountEl) walletCountEl.textContent = walletCount;
    if (visibleBalanceEl) visibleBalanceEl.textContent = formatMoney(visibleBalance);
    if (activeWalletUsersEl) activeWalletUsersEl.textContent = activeWalletUsers;
}

function redirectToTopup(user) {
    const params = new URLSearchParams({
        user_id: String(user.user_id || ""),
        full_name: String(user.full_name || ""),
        email: String(user.email || ""),
        wallet_code: String(user.wallet_code || ""),
        balance: String(user.balance || 0),
        is_active: String(Boolean(user.is_active))
    });

    window.location.href = `topupstaff.html?${params.toString()}`;
}

function renderWalletGrid() {
    if (!walletGrid) return;

    walletGrid.innerHTML = "";

    if (!lastSearchValue.trim()) {
        walletGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                Search for a customer wallet to begin.
            </div>
        `;
        updateSummaryCards();
        return;
    }

    if (!walletResultsCache.length) {
        walletGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                No wallet results found.
            </div>
        `;
        updateSummaryCards();
        return;
    }

    walletResultsCache.forEach(item => {
        const displayName = item.full_name || item.email || `User #${item.user_id}`;
        const badgeClass = item.is_active ? "wallet-badge wallet-badge-active" : "wallet-badge wallet-badge-inactive";
        const badgeText = item.is_active ? "Active" : "Inactive";

        const card = document.createElement("div");
        card.className = "wallet-card";
        card.addEventListener("click", () => redirectToTopup(item));

        card.innerHTML = `
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:20px;">
                <div style="display:flex; align-items:center; gap:14px; min-width:0;">
                    <img src="${buildInitialAvatar(displayName)}" class="staff-avatar" alt="User Avatar">
                    <div style="min-width:0;">
                        <h3 style="font-size: 20px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(displayName)}</h3>
                        <p style="font-size:10px; opacity:.45; font-weight:800; margin-top:4px;">USER ID #${escapeHTML(item.user_id)}</p>
                    </div>
                </div>
                <span class="${badgeClass}">${badgeText}</span>
            </div>

            <div style="display:flex; flex-direction:column; gap:14px;">
                <div style="display:flex; justify-content:space-between; gap:12px;">
                    <span style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); font-weight:800;">Email</span>
                    <span style="font-size:13px; font-weight:700; text-align:right; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(item.email || "-")}</span>
                </div>

                <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
                    <span style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); font-weight:800;">Wallet Code</span>
                    <span class="wallet-code-chip">${escapeHTML(maskWalletCode(item.wallet_code))}</span>
                </div>

                <div style="display:flex; justify-content:space-between; gap:12px;">
                    <span style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); font-weight:800;">Balance</span>
                    <span style="font-size:20px; font-weight:900; color:var(--mango);">${formatMoney(item.balance || 0)}</span>
                </div>
            </div>
        `;

        walletGrid.appendChild(card);
    });

    updateSummaryCards();
}

async function searchWallets(forceValue = null) {
    const q = String(forceValue ?? walletSearchInput?.value ?? "").trim();
    lastSearchValue = q;

    if (!q) {
        walletResultsCache = [];
        renderWalletGrid();
        return;
    }

    try {
        const response = await fetch(`${getAPIURL()}/wallet/lookup?q=${encodeURIComponent(q)}&limit=50`, {
            method: "GET",
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Wallet lookup failed: ${response.status}`);
        }

        walletResultsCache = Array.isArray(result?.data) ? result.data : [];
        renderWalletGrid();
    } catch (error) {
        console.error("walletstaff search error:", error);
        walletResultsCache = [];
        renderWalletGrid();
    }
}

function handleWalletSearch(event) {
    const value = event?.target?.value ?? "";
    clearTimeout(walletSearchDebounce);

    walletSearchDebounce = setTimeout(() => {
        searchWallets(value);
    }, 300);
}

function initWalletStaffPage() {
    try {
       
        updateSummaryCards();
        renderWalletGrid();

        walletSearchInput?.addEventListener("input", handleWalletSearch);
    } catch (error) {
        console.error("walletstaff init error:", error);
    }
}

document.addEventListener("DOMContentLoaded", initWalletStaffPage);