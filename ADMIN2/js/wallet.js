let walletResultsCache = [];
let currentWalletUser = null;
let walletSearchDebounce = null;
let lastSearchValue = "";
let walletSuggestionsCache = [];
const API_URL = window.API_URL || "";

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
            <rect width="100%" height="100%" rx="100" ry="100" fill="#fcdb05"/>
            <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
                font-family="Arial, sans-serif" font-size="88" font-weight="700" fill="#120f0a">
                ${initial}
            </text>
        </svg>
    `.trim();

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function applySavedTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
        document.body.classList.add("light-theme");
        const themeIcon = document.getElementById("themeIcon");
        if (themeIcon) {
            themeIcon.className = "fa-solid fa-moon";
        }
    }
}

function openModal(id) {
    document.getElementById(id)?.classList.add("open");
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove("open");
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

function updateSummaryCards() {
    const walletCount = walletResultsCache.length;
    const visibleBalance = walletResultsCache.reduce((sum, item) => {
        return sum + Number(item.balance || 0);
    }, 0);
    const activeWalletUsers = walletResultsCache.filter(item => Boolean(item.is_active)).length;

    const walletCountEl = document.getElementById("walletCount");
    const visibleBalanceEl = document.getElementById("visibleBalance");
    const activeWalletUsersEl = document.getElementById("activeWalletUsers");

    if (walletCountEl) walletCountEl.innerText = walletCount;
    if (visibleBalanceEl) visibleBalanceEl.innerText = formatMoney(visibleBalance);
    if (activeWalletUsersEl) activeWalletUsersEl.innerText = activeWalletUsers;
}

function renderWalletGrid() {
    const grid = document.getElementById("walletGrid");
    if (!grid) return;

    grid.innerHTML = "";

    if (!lastSearchValue.trim()) {
        grid.innerHTML = `
            <div class="glass rounded-3xl p-8 text-center opacity-60">
                Search for a customer wallet to begin.
            </div>
        `;
        updateSummaryCards();
        return;
    }

    if (!walletResultsCache.length) {
        grid.innerHTML = `
            <div class="glass rounded-3xl p-8 text-center opacity-60">
                No wallet results found.
            </div>
        `;
        updateSummaryCards();
        return;
    }

    walletResultsCache.forEach(item => {
        const displayName = item.full_name || item.email || `User #${item.user_id}`;
        const activeBadgeClass = item.is_active ? "wallet-badge-active" : "wallet-badge-inactive";
        const activeBadgeText = item.is_active ? "Active" : "Inactive";

        const card = document.createElement("div");
        card.className = "wallet-card glass";
        card.onclick = () => openWalletProfile(item.user_id);

        card.innerHTML = `
            <div class="flex items-start justify-between gap-4 mb-5">
                <div class="flex items-center gap-4 min-w-0">
                    <img src="${buildInitialAvatar(displayName)}" class="w-14 h-14 rounded-full border-2 border-yellow-400 object-cover">
                    <div class="min-w-0">
                        <h3 class="font-black text-lg truncate">${escapeHtml(displayName)}</h3>
                        <p class="text-[10px] opacity-40 font-bold">USER ID #${escapeHtml(item.user_id)}</p>
                    </div>
                </div>
                <span class="wallet-badge ${activeBadgeClass}">${activeBadgeText}</span>
            </div>

            <div class="space-y-3">
                <div class="flex items-center justify-between gap-4">
                    <span class="text-xs uppercase font-black opacity-50">Email</span>
                    <span class="text-sm truncate max-w-[180px] text-right">${escapeHtml(item.email || "-")}</span>
                </div>

                <div class="flex items-center justify-between gap-4">
                    <span class="text-xs uppercase font-black opacity-50">Wallet Code</span>
                    <span class="wallet-code-chip">${escapeHtml(maskWalletCode(item.wallet_code))}</span>
                </div>

                <div class="flex items-center justify-between gap-4">
                    <span class="text-xs uppercase font-black opacity-50">Balance</span>
                    <span class="text-lg font-black text-yellow-400">${formatMoney(item.balance || 0)}</span>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });

    updateSummaryCards();
}
function getSuggestionsBox() {
    return document.getElementById("walletSuggestions");
}

function hideWalletSuggestions() {
    const box = getSuggestionsBox();
    if (!box) return;
    box.classList.remove("show");
    box.innerHTML = "";
    walletSuggestionsCache = [];
}

function renderWalletSuggestions(items = []) {
    const box = getSuggestionsBox();
    if (!box) return;

    if (!items.length) {
        box.innerHTML = `<div class="wallet-suggestion-empty">No matching wallets found.</div>`;
        box.classList.add("show");
        return;
    }

    box.innerHTML = items.map(item => {
        const displayName = item.full_name || item.email || `User #${item.user_id}`;
        return `
            <div class="wallet-suggestion-item" data-user-id="${item.user_id}">
                <div class="wallet-suggestion-main">
                    <div class="wallet-suggestion-name">${escapeHtml(displayName)}</div>
                    <div class="wallet-suggestion-meta">
                        ${escapeHtml(item.email || "-")} • User ID #${escapeHtml(item.user_id)}
                    </div>
                </div>
                <div class="wallet-suggestion-code">${escapeHtml(maskWalletCode(item.wallet_code))}</div>
            </div>
        `;
    }).join("");

    box.classList.add("show");

    box.querySelectorAll(".wallet-suggestion-item").forEach(el => {
        el.addEventListener("click", () => {
            const userId = Number(el.dataset.userId);
            selectWalletSuggestion(userId);
        });
    });
}

async function fetchWalletSuggestions(q) {
    const search = String(q || "").trim();

    if (!search) {
        hideWalletSuggestions();
        return;
    }

    try {
        const response = await fetch(`${API_URL}/wallet/lookup?q=${encodeURIComponent(search)}&limit=8`, {
            method: "GET",
            headers: getAuthHeaders(),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Wallet lookup failed: ${response.status}`);
        }

        walletSuggestionsCache = Array.isArray(result.data) ? result.data : [];
        renderWalletSuggestions(walletSuggestionsCache);
    } catch (error) {
        console.error("fetchWalletSuggestions error:", error);
        hideWalletSuggestions();
    }
}

function selectWalletSuggestion(userId) {
    const selected = walletSuggestionsCache.find(item => Number(item.user_id) === Number(userId));
    const input = document.getElementById("walletSearchInput");

    if (!selected || !input) return;

    input.value = selected.full_name || selected.email || selected.wallet_code || "";
    hideWalletSuggestions();

    walletResultsCache = [selected];
    lastSearchValue = input.value;
    renderWalletGrid();

    openWalletProfile(selected.user_id);
}

async function searchWallets(forceValue = null) {
    const input = document.getElementById("walletSearchInput");
    const q = String(forceValue ?? input?.value ?? "").trim();

    lastSearchValue = q;

    if (!q) {
        walletResultsCache = [];
        renderWalletGrid();
        return;
    }

    try {
        const response = await fetch(`${API_URL}/wallet/lookup?q=${encodeURIComponent(q)}&limit=50`, {
            method: "GET",
            headers: getAuthHeaders(),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Wallet lookup failed: ${response.status}`);
        }

        walletResultsCache = result.data || [];
        renderWalletGrid();
    } catch (error) {
        console.error("Wallet lookup error:", error);
        walletResultsCache = [];
        renderWalletGrid();
    }
   
}

function handleWalletSearch(event) {
    const value = event?.target?.value ?? "";

    clearTimeout(walletSearchDebounce);

    walletSearchDebounce = setTimeout(async () => {
        const trimmed = String(value).trim();

        if (!trimmed) {
            lastSearchValue = "";
            walletResultsCache = [];
            renderWalletGrid();
            hideWalletSuggestions();
            return;
        }

        await fetchWalletSuggestions(trimmed);
        await searchWallets(trimmed);
    }, 250);
}

function openWalletProfile(userId) {
    const user = walletResultsCache.find(item => Number(item.user_id) === Number(userId));
    if (!user) return;

    currentWalletUser = user;

    const detailName = document.getElementById("walletDetailName");
    const detailEmail = document.getElementById("walletDetailEmail");
    const detailCode = document.getElementById("walletDetailCode");
    const detailBalance = document.getElementById("walletDetailBalance");
    const detailUserId = document.getElementById("walletDetailUserId");
    const detailStatus = document.getElementById("walletDetailStatus");

    if (detailName) detailName.innerText = user.full_name || user.email || `User #${user.user_id}`;
    if (detailEmail) detailEmail.innerText = user.email || "-";
    if (detailCode) detailCode.innerText = maskWalletCode(user.wallet_code || "-");
    if (detailBalance) detailBalance.innerText = formatMoney(user.balance || 0);
    if (detailUserId) detailUserId.innerText = user.user_id;

    if (detailStatus) {
        detailStatus.innerHTML = user.is_active
            ? `<span class="wallet-badge wallet-badge-active">Active</span>`
            : `<span class="wallet-badge wallet-badge-inactive">Inactive</span>`;
    }

    const topupUserId = document.getElementById("topupUserId");
    const topupTargetName = document.getElementById("topupTargetName");
    const topupWalletCode = document.getElementById("topupWalletCode");
    const topupAmount = document.getElementById("topupAmount");

    if (topupUserId) topupUserId.value = user.user_id;
    if (topupTargetName) topupTargetName.value = user.full_name || user.email || `User #${user.user_id}`;
    if (topupWalletCode) topupWalletCode.value = maskWalletCode(user.wallet_code || "-");
    if (topupAmount) topupAmount.value = "";

    openModal("walletProfileModal");
}

async function submitTopupForm(event) {
    event.preventDefault();

    const userId = Number(document.getElementById("topupUserId")?.value);
    const amount = Number(document.getElementById("topupAmount")?.value);

    if (!userId) {
        alert("No wallet selected.");
        return;
    }

    if (Number.isNaN(amount) || amount <= 0) {
        alert("Enter a valid top-up amount.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/wallet/topup`, {
            method: "POST",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({
                user_id: userId,
                amount: amount
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Top-up failed: ${response.status}`);
        }

        const target = walletResultsCache.find(item => Number(item.user_id) === userId);
        if (target) {
            target.balance = result.balance;
        }

        if (currentWalletUser && Number(currentWalletUser.user_id) === userId) {
            currentWalletUser.balance = result.balance;

            const detailBalance = document.getElementById("walletDetailBalance");
            if (detailBalance) {
                detailBalance.innerText = formatMoney(result.balance || 0);
            }
        }

        renderWalletGrid();
        showToast("Top-up successful");

        const topupAmountInput = document.getElementById("topupAmount");
        if (topupAmountInput) {
            topupAmountInput.value = "";
        }
    } catch (error) {
        console.error("Top-up error:", error);
        alert(error.message || "Failed to top up wallet.");
    }
}

function initializeWalletPage() {
    applySavedTheme();
    renderWalletGrid();

    document.getElementById("topupForm")?.addEventListener("submit", submitTopupForm);

    const searchInput = document.getElementById("walletSearchInput");
    if (searchInput) {
        searchInput.addEventListener("input", handleWalletSearch);

        searchInput.addEventListener("focus", () => {
            if (searchInput.value.trim()) {
                fetchWalletSuggestions(searchInput.value);
            }
        });

        searchInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                hideWalletSuggestions();
                searchWallets(searchInput.value);
            }
        });
    }

    document.addEventListener("click", (event) => {
        const searchContainer = document.querySelector(".search-container");
        if (!searchContainer) return;

        if (!searchContainer.contains(event.target)) {
            hideWalletSuggestions();
        }
    });
}

window.searchWallets = searchWallets;
window.handleWalletSearch = handleWalletSearch;
window.openWalletProfile = openWalletProfile;
window.openModal = openModal;
window.closeModal = closeModal;

window.onload = () => {
    initializeWalletPage();
};