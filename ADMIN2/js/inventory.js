let items = [];
let currentView = "grid";
let currentId = null;
let historyCache = [];
const LOW_STOCK_THRESHOLD = 10;
const API_BASE_URL = window.API_URL || "";

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
function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function applyDateMinimums() {
    const today = getTodayDateString();

    const newItemExp = document.getElementById("newItemExp");
    const adjustExpInput = document.getElementById("adjustExpInput");

    if (newItemExp) newItemExp.min = today;
    if (adjustExpInput) adjustExpInput.min = today;
}

function isPastDate(dateValue) {
    if (!dateValue) return false;
    return dateValue < getTodayDateString();
}

function setView(view) {
    currentView = view;

    document.getElementById("gridContent").classList.toggle("active", view === "grid");
    document.getElementById("tableContent").classList.toggle("active", view === "table");
    document.getElementById("historyContent").classList.toggle("active", view === "history");

    document.getElementById("btnGrid").classList.toggle("active", view === "grid");
    document.getElementById("btnTable").classList.toggle("active", view === "table");
    document.getElementById("btnHistory").classList.toggle("active", view === "history");

    if (view === "history") {
        renderHistory();
    }
}

function openModal(id) {
    document.getElementById(id).classList.add("open");
}

function closeModal(id) {
    document.getElementById(id).classList.remove("open");
}

function formatQty(value) {
    const num = Number(value || 0);
    return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
}

function formatDateTime(value) {
    if (!value) return "-";
    const d = new Date(value);
    return isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function populateCategoryFilter() {
    const categoryFilter = document.getElementById("categoryFilter");
    if (!categoryFilter) return;

    const currentValue = categoryFilter.value || "all";

    const categories = [...new Set(
        items
            .map(item => (item.category || "").trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    categoryFilter.innerHTML = `<option value="all">All Categories</option>`;

    categories.forEach(category => {
        categoryFilter.innerHTML += `<option value="${category}">${category}</option>`;
    });

    const stillExists = categories.includes(currentValue) || currentValue === "all";
    categoryFilter.value = stillExists ? currentValue : "all";
}

function getFilteredItems() {
    const term = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
    const selectedCategory = (document.getElementById("categoryFilter")?.value || "all").toLowerCase();
    const selectedStatus = (document.getElementById("statusFilter")?.value || "all").toLowerCase();

    return items.filter(item => {
        const searchable = [
            item.name || "",
            item.unit || "",
            item.category || "",
            item.exp || ""
        ].join(" ").toLowerCase();

        const searchMatch = searchable.includes(term);
        const categoryMatch =
            selectedCategory === "all" ||
            (item.category || "").toLowerCase() === selectedCategory;

        const statusMatch =
            selectedStatus === "all" ||
            (selectedStatus === "active" && item.is_active) ||
            (selectedStatus === "inactive" && !item.is_active);

        return searchMatch && categoryMatch && statusMatch;
    });
}

async function fetchInventory() {
    try {
        const response = await fetch(`${API_URL}/inventory/master/?only_active=false`, {
            method: "GET",
           headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error(`Inventory fetch failed: ${response.status}`);
        }

        const result = await response.json();

        items = (result.data || []).map(row => ({
            id: row.inventory_master_id,
            name: row.name,
            category: row.category || "General",
            qty: Number(row.quantity || 0),
            unit: row.unit || "pcs",
            exp: row.expiration_date || null,
            threshold: Number(row.alert_threshold || LOW_STOCK_THRESHOLD),
            is_active: Boolean(row.is_active),
            updated_at: row.updated_at || null
        }));
    } catch (error) {
        console.error("Inventory fetch error:", error);
        items = [];
    }
}

async function fetchAllHistory() {
    try {
        const allLogs = [];

        for (const item of items) {
            const response = await fetch(`${API_BASE_URL}/inventory/master/${item.id}/movements/?limit=30`, {
                method: "GET",
                headers: getAuthHeaders()
            });

            if (!response.ok) continue;

            const result = await response.json();
            const rows = (result.data || []).map(log => ({
                item_name: item.name,
                item_category: item.category || "General",
                item_is_active: item.is_active,
                created_at: log.created_at,
                change_qty: Number(log.change_qty || 0),
                reason: log.reason || "-",
            }));

            allLogs.push(...rows);
        }

        historyCache = allLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (error) {
        console.error("History fetch error:", error);
        historyCache = [];
    }
}

function renderItems() {
    const grid = document.getElementById("gridContent");
    const tableBody = document.getElementById("tableBody");

    if (!grid || !tableBody) return;

    populateCategoryFilter();

    const filteredItems = getFilteredItems();

    grid.innerHTML = "";
    tableBody.innerHTML = "";

    filteredItems.forEach(item => {
        const isLow = item.is_active && Number(item.qty) <= Number(item.threshold);
        const barWidth = Math.min(100, (Number(item.qty) / (Number(item.threshold) * 2 || 1)) * 100);

        grid.innerHTML += `
            <div class="inv-card glass ${!item.is_active ? "inactive" : ""}">
                ${isLow ? '<div class="alert-ribbon">Low</div>' : ''}
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h4 class="font-black text-lg">${item.name}</h4>
                        <span class="text-[10px] uppercase font-bold opacity-40">${item.category}</span>
                    </div>
                    <i class="fas fa-box text-yellow-400"></i>
                </div>
                <div class="progress-bg">
                    <div class="progress-fill ${isLow ? 'bg-red-500' : 'bg-green-500'}" style="width:${barWidth}%"></div>
                </div>
                <div class="text-xs opacity-60 mb-2">Exp: ${formatDate(item.exp)}</div>
                <div class="text-xs mb-3 ${item.is_active ? 'text-green-400' : 'text-red-400'} font-black uppercase">
                    ${item.is_active ? "Active" : "Inactive"}
                </div>
                <div class="flex justify-between items-end">
                    <span class="text-2xl font-black">${formatQty(item.qty)}<span class="text-xs opacity-40 ml-1">${item.unit}</span></span>
                    <div class="flex gap-2">
                        <button onclick="prepareAdjust(${item.id})" class="text-[10px] font-black uppercase bg-yellow-400 text-black px-3 py-1 rounded-lg">Adjust</button>
                        <button onclick="toggleItemActive(${item.id}, ${item.is_active})" class="text-[10px] font-black uppercase px-3 py-1 rounded-lg ${item.is_active ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}">
                            ${item.is_active ? "Deactivate" : "Activate"}
                        </button>
                    </div>
                </div>
            </div>
        `;

        tableBody.innerHTML += `
            <tr>
                <td class="font-bold">${item.name}</td>
                <td class="opacity-50">${item.category}</td>
                <td class="${isLow ? 'text-red-500 font-black' : ''}">${formatQty(item.qty)} ${item.unit}</td>
                <td>${formatDate(item.exp)}</td>
                <td>${item.is_active ? '<span class="text-green-400 font-black">ACTIVE</span>' : '<span class="text-red-400 font-black">INACTIVE</span>'}</td>
                <td style="text-align:right">
                    <button onclick="prepareAdjust(${item.id})" class="mr-4 text-yellow-400 font-bold text-xs uppercase">Adjust</button>
                    <button onclick="toggleItemActive(${item.id}, ${item.is_active})" class="font-bold text-xs uppercase ${item.is_active ? 'text-red-500' : 'text-green-500'}">
                        ${item.is_active ? "Deactivate" : "Activate"}
                    </button>
                </td>
            </tr>
        `;
    });

    document.getElementById("lowStockCount").innerText =
        filteredItems.filter(item => item.is_active && Number(item.qty) <= Number(item.threshold)).length;

    document.getElementById("totalItemsCount").innerText = items.filter(item => item.is_active).length;

    if (!filteredItems.length) {
        grid.innerHTML = `
            <div class="col-span-full glass rounded-3xl p-8 text-center opacity-60">
                No inventory items found.
            </div>
        `;

        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center opacity-60">No inventory items found.</td>
            </tr>
        `;
    }

    if (currentView === "history") {
        renderHistory();
    }
}

function renderHistory() {
    const historyBody = document.getElementById("historyBody");
    if (!historyBody) return;

    const term = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
    const selectedCategory = (document.getElementById("categoryFilter")?.value || "all").toLowerCase();
    const selectedStatus = (document.getElementById("statusFilter")?.value || "all").toLowerCase();

    const filteredHistory = historyCache.filter(log => {
        const searchable = [
            log.item_name || "",
            log.item_category || "",
            log.reason || ""
        ].join(" ").toLowerCase();

        const searchMatch = searchable.includes(term);
        const categoryMatch =
            selectedCategory === "all" ||
            (log.item_category || "").toLowerCase() === selectedCategory;

        const statusMatch =
            selectedStatus === "all" ||
            (selectedStatus === "active" && log.item_is_active) ||
            (selectedStatus === "inactive" && !log.item_is_active);

        return searchMatch && categoryMatch && statusMatch;
    });

    historyBody.innerHTML = "";

    if (!filteredHistory.length) {
        historyBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center opacity-60">No inventory history found.</td>
            </tr>
        `;
        return;
    }

    filteredHistory.forEach(log => {
        historyBody.innerHTML += `
            <tr>
                <td>${formatDateTime(log.created_at)}</td>
                <td class="font-bold">${log.item_name}</td>
                <td class="${Number(log.change_qty) < 0 ? 'text-red-400' : 'text-green-400'} font-black">
                    ${Number(log.change_qty) > 0 ? '+' : ''}${formatQty(log.change_qty)}
                </td>
                <td>${log.reason}</td>
            </tr>
        `;
    });
}

function resetAddItemForm() {
    document.getElementById("newItemName").value = "";
    document.getElementById("newItemCategory").value = "Ingredients";
    document.getElementById("newItemQty").value = "";
    document.getElementById("newItemUnit").value = "kg";
    document.getElementById("newItemExp").value = "";
    document.getElementById("alertThreshold").value = "10";
    applyDateMinimums();
}

async function addNewItem() {
    const name = document.getElementById("newItemName").value.trim();
    const category = document.getElementById("newItemCategory").value;
    const qty = document.getElementById("newItemQty").value;
    const unit = document.getElementById("newItemUnit").value;
    const exp = document.getElementById("newItemExp").value;
    const threshold = document.getElementById("alertThreshold").value;

    if (!name || qty === "") {
        alert("Required fields missing");
        return;
    }

    if (Number(qty) < 0) {
        alert("Quantity cannot be negative.");
        return;
    }

    if (Number(threshold || 0) < 0) {
        alert("Alert threshold cannot be negative.");
        return;
    }

    if (exp && isPastDate(exp)) {
        alert("Expiration date cannot be in the past.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/inventory/master`, {
            method: "POST",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({
                name,
                category,
                unit,
                quantity: Number(qty),
                alert_threshold: Number(threshold || 10),
                expiration_date: exp ? `${exp}T00:00:00` : null,
                is_active: true
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Create inventory failed: ${response.status}`);
        }

        await fetchInventory();
        await fetchAllHistory();
        renderItems();
        resetAddItemForm();
        closeModal("addItemModal");
    } catch (error) {
        console.error("Add inventory error:", error);
        alert(error.message || "Failed to register supply.");
    }
}

function prepareAdjust(id) {
    currentId = id;

    const item = items.find(i => Number(i.id) === Number(id));
    if (!item) return;

    document.getElementById("adjustItemName").innerText = item.name;
    document.getElementById("adjustCategoryInput").value = item.category || "Other";
    document.getElementById("adjustQtyInput").value = item.qty;
    document.getElementById("adjustExpInput").value = item.exp ? item.exp.slice(0, 10) : "";
    document.getElementById("adjustReasonInput").value = "";
    applyDateMinimums();

    openModal("adjustModal");
}

async function commitAdjust() {
    if (!currentId) return;

    const item = items.find(i => Number(i.id) === Number(currentId));
    if (!item) return;

    const selectedCategory = document.getElementById("adjustCategoryInput").value;
    const newQtyValue = document.getElementById("adjustQtyInput").value;
    const reason = document.getElementById("adjustReasonInput").value.trim() || "adjustment";
    const expValue = document.getElementById("adjustExpInput").value;

    if (newQtyValue === "") {
        alert("New quantity is required.");
        return;
    }

    const newQty = Number(newQtyValue);
    const currentQty = Number(item.qty);
    const changeQty = newQty - currentQty;
    const categoryChanged = (selectedCategory || "") !== (item.category || "");

    if (newQty < 0) {
        alert("Quantity cannot be negative.");
        return;
    }

    if (expValue && isPastDate(expValue)) {
        alert("Expiration date cannot be in the past.");
        return;
    }

    try {
        if (changeQty !== 0) {
            const response = await fetch(`${API_BASE_URL}/inventory/master/${currentId}/adjust`, {
                method: "POST",
                headers: getAuthHeaders({
                    "Content-Type": "application/json"
                }),
                body: JSON.stringify({
                    change_qty: changeQty,
                    reason,
                    category: selectedCategory,
                    expiration_date: expValue ? `${expValue}T00:00:00` : null
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || `Adjust inventory failed: ${response.status}`);
            }
        } else if (categoryChanged || expValue !== (item.exp ? item.exp.slice(0, 10) : "")) {
            const response = await fetch(`${API_BASE_URL}/inventory/master/${currentId}`, {
                method: "PATCH",
                headers: getAuthHeaders({
                    "Content-Type": "application/json"
                }),
                body: JSON.stringify({
                    category: selectedCategory,
                    expiration_date: expValue ? `${expValue}T00:00:00` : null
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || `Update inventory failed: ${response.status}`);
            }
        } else {
            closeModal("adjustModal");
            return;
        }

        await fetchInventory();
        await fetchAllHistory();
        renderItems();
        closeModal("adjustModal");
    } catch (error) {
        console.error("Adjust inventory error:", error);
        alert(error.message || "Failed to adjust stock.");
    }
}

async function toggleItemActive(id, currentlyActive) {
    try {
        const response = await fetch(`${API_BASE_URL}/inventory/master/${id}/active`, {
            method: "PATCH",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({
                is_active: !currentlyActive
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Update status failed: ${response.status}`);
        }

        await fetchInventory();
        await fetchAllHistory();
        renderItems();
    } catch (error) {
        console.error("Toggle item active error:", error);
        alert(error.message || "Failed to update item status.");
    }
}

async function initializeInventoryPage() {
    applyDateMinimums();
    setView("grid");
    await fetchInventory();
    await fetchAllHistory();
    populateCategoryFilter();
    renderItems();

    const confirmAdjustBtn = document.getElementById("confirmAdjust");
    if (confirmAdjustBtn) {
        confirmAdjustBtn.onclick = commitAdjust;
    }
}
window.setView = setView;
window.openModal = openModal;
window.closeModal = closeModal;
window.renderItems = renderItems;
window.addNewItem = addNewItem;
window.prepareAdjust = prepareAdjust;
window.toggleItemActive = toggleItemActive;

window.onload = () => {
    initializeInventoryPage();
};