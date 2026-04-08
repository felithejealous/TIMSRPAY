const body = document.body;
const pageTitle = document.getElementById("pageTitle");
const pageDesc = document.getElementById("pageDesc");

const totalItemsStat = document.getElementById("totalItemsStat");
const lowStockStat = document.getElementById("lowStockStat");
const refilledTodayStat = document.getElementById("refilledTodayStat");
const categoriesStat = document.getElementById("categoriesStat");

const inventoryTableBody = document.getElementById("inventoryTableBody");
const filterTabs = document.querySelectorAll(".tab");
const modal = document.getElementById("updateModal");
const categoryFilter = document.getElementById("categoryFilter");

const inventorySearchInput = document.getElementById("inventorySearchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const searchSuggestions = document.getElementById("searchSuggestions");

let inventoryItems = [];
let currentFilter = "all";
let currentCategory = "all";
let currentSearch = "";

/* =========================
   HELPERS
========================= */
function getAPIURL() {
    if (!window.API_URL) {
        throw new Error("API_URL is not defined. Make sure authGuard.js loads first.");
    }
    return window.API_URL;
}
async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        headers: getAuthHeaders(options.headers || {}),
        ...options
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

function formatNumber(value) {
    const num = Number(value || 0);
    return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

function isToday(dateValue) {
    if (!dateValue) return false;

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return false;

    const now = new Date();

    return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
    );
}

function getNormalizedCategory(value) {
    return String(value || "General").trim();
}

function normalizeSearchText(value) {
    return String(value || "").trim().toLowerCase();
}

function matchesSearch(item, query) {
    const search = normalizeSearchText(query);
    if (!search) return true;

    const name = normalizeSearchText(item?.name);
    const category = normalizeSearchText(item?.category);
    const unit = normalizeSearchText(item?.unit);

    return (
        name.includes(search) ||
        category.includes(search) ||
        unit.includes(search)
    );
}

function getStatusMeta(item) {
    const quantity = Number(item?.quantity || 0);
    const threshold = Number(item?.alert_threshold || 0);

    if (quantity <= threshold) {
        return {
            label: quantity <= 0 ? "Out" : "Low",
            className: "status-low",
            color: "var(--danger)"
        };
    }

    if (threshold > 0 && quantity <= threshold * 1.5) {
        return {
            label: "Warning",
            className: "status-warning",
            color: "var(--warning)"
        };
    }

    return {
        label: "Good",
        className: "status-good",
        color: "var(--success)"
    };
}

function isLowStock(item) {
    return Number(item?.quantity || 0) <= Number(item?.alert_threshold || 0);
}

function getProgressPercent(item) {
    const quantity = Number(item?.quantity || 0);
    const threshold = Number(item?.alert_threshold || 0);

    if (threshold <= 0) return 100;

    const percent = (quantity / (threshold * 2)) * 100;
    return Math.max(5, Math.min(100, percent));
}

function buildLoadingRow(message) {
    return `
        <tr class="loading-row">
            <td colspan="5">${escapeHTML(message)}</td>
        </tr>
    `;
}

function buildEmptyRow(message) {
    return `
        <tr class="empty-row">
            <td colspan="5">${escapeHTML(message)}</td>
        </tr>
    `;
}

function getFilteredInventoryItems() {
    let rows = [...inventoryItems];

    if (currentFilter === "low") {
        rows = rows.filter(isLowStock);
    }

    if (currentCategory !== "all") {
        rows = rows.filter(item => getNormalizedCategory(item.category) === currentCategory);
    }

    if (currentSearch) {
        rows = rows.filter(item => matchesSearch(item, currentSearch));
    }

    rows.sort((a, b) => {
        const categoryCompare = getNormalizedCategory(a.category).localeCompare(getNormalizedCategory(b.category));
        if (categoryCompare !== 0) return categoryCompare;
        return String(a.name || "").localeCompare(String(b.name || ""));
    });

    return rows;
}

/* =========================
   READ-ONLY STAFF MODE
========================= */
function applyStaffViewMode() {
    if (pageTitle) {
        pageTitle.textContent = "Inventory View";
    }

    if (pageDesc) {
        pageDesc.textContent = "Read-only access to stock levels.";
    }

    document.querySelectorAll(".admin-action").forEach(el => {
        el.style.display = "none";
    });
}

/* =========================
   FETCH INVENTORY
========================= */
async function loadInventory() {
    const data = await fetchJSON(`${getAPIURL()}/inventory/master?only_active=true&limit=500`);
    inventoryItems = Array.isArray(data?.data) ? data.data : [];
}

async function countRefilledToday() {
    let count = 0;

    await Promise.all(
        inventoryItems.map(async (item) => {
            try {
                const data = await fetchJSON(`${getAPIURL()}/inventory/master/${item.inventory_master_id}/movements?limit=50`);
                const rows = Array.isArray(data?.data) ? data.data : [];

                const hasPositiveMovementToday = rows.some(row =>
                    Number(row.change_qty || 0) > 0 && isToday(row.created_at)
                );

                if (hasPositiveMovementToday) {
                    count += 1;
                }
            } catch (error) {
                console.warn(`Failed to load movements for item ${item.inventory_master_id}:`, error.message);
            }
        })
    );

    return count;
}

/* =========================
   CATEGORY FILTER
========================= */
function renderCategoryOptions() {
    if (!categoryFilter) return;

    const categories = [...new Set(
        inventoryItems.map(item => getNormalizedCategory(item.category))
    )].sort((a, b) => a.localeCompare(b));

    categoryFilter.innerHTML = `
        <option value="all">All Categories</option>
        ${categories.map(category => `
            <option value="${escapeHTML(category)}">${escapeHTML(category)}</option>
        `).join("")}
    `;

    categoryFilter.value = currentCategory;
}

function setupCategoryFilter() {
    if (!categoryFilter) return;

    categoryFilter.addEventListener("change", () => {
        currentCategory = categoryFilter.value || "all";
        renderInventoryTable();
        renderSuggestions();
    });
}

/* =========================
   SEARCH
========================= */
function getSuggestionItems() {
    const query = normalizeSearchText(currentSearch);
    if (!query) return [];

    let rows = [...inventoryItems];

    if (currentFilter === "low") {
        rows = rows.filter(isLowStock);
    }

    if (currentCategory !== "all") {
        rows = rows.filter(item => getNormalizedCategory(item.category) === currentCategory);
    }

    rows = rows.filter(item => matchesSearch(item, query));

    rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    return rows.slice(0, 8);
}

function renderSuggestions() {
    if (!searchSuggestions || !inventorySearchInput) return;

    const query = normalizeSearchText(currentSearch);

    if (!query) {
        searchSuggestions.style.display = "none";
        searchSuggestions.innerHTML = "";
        return;
    }

    const suggestions = getSuggestionItems();

    if (!suggestions.length) {
        searchSuggestions.innerHTML = `
            <div class="search-suggestion-item">
                <div class="search-suggestion-title">No matching items found</div>
                <div class="search-suggestion-meta">Try another keyword</div>
            </div>
        `;
        searchSuggestions.style.display = "block";
        return;
    }

    searchSuggestions.innerHTML = suggestions.map(item => `
        <div class="search-suggestion-item" data-item-name="${escapeHTML(item.name || "")}">
            <div class="search-suggestion-title">${escapeHTML(item.name || "-")}</div>
            <div class="search-suggestion-meta">
                ${escapeHTML(getNormalizedCategory(item.category))} • ${escapeHTML(item.unit || "-")} • Qty: ${escapeHTML(formatNumber(item.quantity))}
            </div>
        </div>
    `).join("");

    searchSuggestions.style.display = "block";

    searchSuggestions.querySelectorAll(".search-suggestion-item[data-item-name]").forEach(item => {
        item.addEventListener("click", () => {
            const selectedName = item.dataset.itemName || "";
            inventorySearchInput.value = selectedName;
            currentSearch = selectedName;
            toggleClearSearchButton();
            renderInventoryTable();
            renderSuggestions();
        });
    });
}

function toggleClearSearchButton() {
    if (!clearSearchBtn) return;
    clearSearchBtn.style.display = currentSearch ? "grid" : "none";
}

function setupSearch() {
    if (!inventorySearchInput) return;

    inventorySearchInput.addEventListener("input", () => {
        currentSearch = inventorySearchInput.value || "";
        toggleClearSearchButton();
        renderInventoryTable();
        renderSuggestions();
    });

    inventorySearchInput.addEventListener("focus", () => {
        renderSuggestions();
    });

    clearSearchBtn?.addEventListener("click", () => {
        currentSearch = "";
        inventorySearchInput.value = "";
        toggleClearSearchButton();
        renderInventoryTable();
        renderSuggestions();
        inventorySearchInput.focus();
    });

    document.addEventListener("click", (event) => {
        if (
            searchSuggestions &&
            inventorySearchInput &&
            !searchSuggestions.contains(event.target) &&
            event.target !== inventorySearchInput &&
            event.target !== clearSearchBtn &&
            !clearSearchBtn?.contains(event.target)
        ) {
            searchSuggestions.style.display = "none";
        }
    });
}

/* =========================
   RENDER STATS
========================= */
async function renderStats() {
    const totalItems = inventoryItems.length;
    const lowStockItems = inventoryItems.filter(isLowStock).length;
    const categoryCount = new Set(
        inventoryItems.map(item => getNormalizedCategory(item.category))
    ).size;

    totalItemsStat.textContent = String(totalItems);
    lowStockStat.textContent = String(lowStockItems);
    categoriesStat.textContent = String(categoryCount);
    refilledTodayStat.textContent = "...";

    try {
        const refilledToday = await countRefilledToday();
        refilledTodayStat.textContent = String(refilledToday);
    } catch (error) {
        console.error("Failed to compute refilled today:", error);
        refilledTodayStat.textContent = "0";
    }
}

/* =========================
   RENDER TABLE
========================= */
function renderInventoryTable() {
    if (!inventoryTableBody) return;

    const rows = getFilteredInventoryItems();

    if (!rows.length) {
        let emptyMessage = "No inventory items found.";

        if (currentSearch && currentFilter === "low" && currentCategory !== "all") {
            emptyMessage = "No low-stock items matched your search in this category.";
        } else if (currentSearch && currentFilter === "low") {
            emptyMessage = "No low-stock items matched your search.";
        } else if (currentSearch && currentCategory !== "all") {
            emptyMessage = "No items matched your search in this category.";
        } else if (currentSearch) {
            emptyMessage = "No inventory items matched your search.";
        } else if (currentFilter === "low" && currentCategory !== "all") {
            emptyMessage = "No low-stock items found for this category.";
        } else if (currentFilter === "low") {
            emptyMessage = "No low-stock items found.";
        } else if (currentCategory !== "all") {
            emptyMessage = "No items found for this category.";
        }

        inventoryTableBody.innerHTML = buildEmptyRow(emptyMessage);
        return;
    }

    inventoryTableBody.innerHTML = rows.map(item => {
        const status = getStatusMeta(item);
        const progressPercent = getProgressPercent(item);

        return `
            <tr>
                <td>
                    <strong>${escapeHTML(item.name || "-")}</strong><br>
                    <small style="color: var(--text-muted);">${escapeHTML(item.unit || "-")}</small>
                </td>
                <td>${escapeHTML(item.category || "General")}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div>
                            <strong>${escapeHTML(formatNumber(item.quantity))}</strong>
                            <small style="color: var(--text-muted);"> / alert: ${escapeHTML(formatNumber(item.alert_threshold))}</small>
                            <div class="progress-wrapper">
                                <div class="progress-fill" style="width: ${progressPercent}%; background: ${status.color};"></div>
                            </div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="status-pill ${status.className}">
                        <i class="fa-solid fa-circle"></i> ${escapeHTML(status.label)}
                    </span>
                </td>
                <td class="admin-action" style="display:none;">
                    <button class="btn-edit" onclick="showModal('${escapeHTML(item.name).replaceAll("'", "\\'")}', '${escapeHTML(formatNumber(item.quantity)).replaceAll("'", "\\'")}')">
                        Update
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

/* =========================
   FILTERS
========================= */
function setupFilters() {
    filterTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            filterTabs.forEach(item => item.classList.remove("active"));
            tab.classList.add("active");
            currentFilter = tab.dataset.filter || "all";
            renderInventoryTable();
            renderSuggestions();
        });
    });
}

/* =========================
   MODAL
========================= */
window.showModal = function (name, qty) {
    document.getElementById("modalItemName").value = name;
    document.getElementById("modalQty").value = qty;
    modal.style.display = "grid";
};

window.hideModal = function () {
    modal.style.display = "none";
};

window.saveData = function () {
    alert("This page is read-only for staff monitoring.");
    hideModal();
};

window.onclick = function (event) {
    if (event.target === modal) {
        hideModal();
    }
};

/* =========================
   INIT
========================= */
async function initInventoryPage() {
    try {
        applyStaffViewMode();
        setupFilters();
        setupCategoryFilter();
        setupSearch();

        inventoryTableBody.innerHTML = buildLoadingRow("Loading inventory...");
        await loadInventory();

        renderCategoryOptions();
        renderInventoryTable();
        renderSuggestions();
        await renderStats();
    } catch (error) {
        console.error("initInventoryPage error:", error);
        inventoryTableBody.innerHTML = buildLoadingRow(`Failed to load inventory: ${error.message}`);
        totalItemsStat.textContent = "0";
        lowStockStat.textContent = "0";
        refilledTodayStat.textContent = "0";
        categoriesStat.textContent = "0";
    }
}

document.addEventListener("DOMContentLoaded", initInventoryPage);