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
const PH_TIMEZONE = "Asia/Manila";

function parseServerDate(value) {
    if (!value) return null;

    const raw = String(value).trim();
    if (!raw) return null;

    if (/[zZ]$|[+\-]\d{2}:\d{2}$/.test(raw)) {
        const zonedDate = new Date(raw);
        return Number.isNaN(zonedDate.getTime()) ? null : zonedDate;
    }

    const normalized = raw.replace(" ", "T");

    const match = normalized.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/
    );

    if (match) {
        const [, year, month, day, hour, minute, second = "00"] = match;

        return new Date(Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second)
        ));
    }

    const fallbackDate = new Date(normalized);
    return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
}

function formatDate(value) {
    if (!value) return "-";

    const raw = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [year, month, day] = raw.split("-");
        const safeDate = new Date(Number(year), Number(month) - 1, Number(day));
        return safeDate.toLocaleDateString("en-PH", {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    const date = parseServerDate(raw);
    if (!date) return "-";

    return date.toLocaleDateString("en-PH", {
        timeZone: PH_TIMEZONE,
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function formatDateTime(value) {
    if (!value) return "-";

    const date = parseServerDate(value);
    if (!date) return "-";

    return date.toLocaleString("en-PH", {
        timeZone: PH_TIMEZONE,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
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
function formatPeso(value) {
    return `₱${Number(value || 0).toFixed(2)}`;
}
function normalizeUnit(unit) {
    return String(unit || "").trim().toLowerCase();
}
function convertPurchaseToInventoryQty(purchaseQty, purchaseUnit, inventoryUnit, equivalentInventoryQty = 0) {
    const qty = Number(purchaseQty || 0);
    const from = normalizeUnit(purchaseUnit);
    const to = normalizeUnit(inventoryUnit);
    const equivalentQty = Number(equivalentInventoryQty || 0);

    if (qty <= 0) return 0;

    if (from === to) return qty;

    if (from === "kg" && (to === "grams" || to === "gram" || to === "g")) {
        return qty * 1000;
    }

    if ((from === "grams" || from === "gram" || from === "g") && to === "kg") {
        return qty / 1000;
    }

    if ((from === "liters" || from === "liter" || from === "l") && (to === "ml" || to === "milliliters" || to === "milliliter")) {
        return qty * 1000;
    }

    if ((from === "ml" || from === "milliliters" || from === "milliliter") && (to === "liters" || to === "liter" || to === "l")) {
        return qty / 1000;
    }

    /*
        For non-fixed conversions like:
        kg mango -> pcs mango
        pack straw -> pcs straw
        pack cups -> pcs cups

        The admin enters the total equivalent inventory quantity.
        Example:
        1 kg mango = 4 pcs
        2 packs straw = 200 pcs
    */
    if (equivalentQty > 0) {
        return equivalentQty;
    }

    return 0;
}

function computeAutoInventoryCost() {
    const purchaseQtyEl = document.getElementById("purchaseQty");
    const purchaseUnitEl = document.getElementById("purchaseUnit");
    const totalPurchaseCostEl = document.getElementById("totalPurchaseCost");
    const unitsPerPackageEl = document.getElementById("unitsPerPackage");
    const newItemQtyEl = document.getElementById("newItemQty");
    const newItemUnitEl = document.getElementById("newItemUnit");
    const newItemUnitCostEl = document.getElementById("newItemUnitCost");
    const previewEl = document.getElementById("autoCostPreview");

    if (!purchaseQtyEl || !purchaseUnitEl || !totalPurchaseCostEl || !newItemQtyEl || !newItemUnitEl || !newItemUnitCostEl) {
        return;
    }

    const purchaseQty = Number(purchaseQtyEl.value || 0);
    const purchaseUnit = purchaseUnitEl.value;
    const totalCost = Number(totalPurchaseCostEl.value || 0);
    const unitsPerPackage = Number(unitsPerPackageEl?.value || 0);
    const inventoryUnit = newItemUnitEl.value;

    const convertedQty = convertPurchaseToInventoryQty(
        purchaseQty,
        purchaseUnit,
        inventoryUnit,
        unitsPerPackage
    );

    const costPerUnit = convertedQty > 0 ? totalCost / convertedQty : 0;

    newItemQtyEl.value = convertedQty > 0 ? convertedQty.toFixed(2) : "";
    newItemUnitCostEl.value = costPerUnit > 0 ? costPerUnit.toFixed(4) : "";

    if (previewEl) {
        if (!purchaseQty || !totalCost) {
            previewEl.innerText = "Enter purchase details to auto-compute inventory quantity and cost per unit.";
            return;
        }
        if (convertedQty <= 0) {
            previewEl.innerText = `Cannot directly convert ${purchaseUnit} to ${inventoryUnit}. If this is like kg mango to pcs, enter the total Equivalent Inventory Qty.`;
            return;
        }

        previewEl.innerText = `${purchaseQty} ${purchaseUnit} = ${convertedQty.toFixed(2)} ${inventoryUnit}. Cost per ${inventoryUnit}: ₱${costPerUnit.toFixed(4)}`;
        }
}

function setupAutoInventoryCostListeners() {
    ["purchaseQty", "purchaseUnit", "totalPurchaseCost", "unitsPerPackage", "newItemUnit"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", computeAutoInventoryCost);
            el.addEventListener("change", computeAutoInventoryCost);
        }
    });
}
function computeRestockPreview() {
    if (!currentId) return;

    const item = items.find(i => Number(i.id) === Number(currentId));
    if (!item) return;

    const purchaseQtyEl = document.getElementById("restockPurchaseQty");
    const purchaseUnitEl = document.getElementById("restockPurchaseUnit");
    const totalCostEl = document.getElementById("restockTotalPurchaseCost");
    const equivalentQtyEl = document.getElementById("restockEquivalentQty");
    const previewEl = document.getElementById("restockPreview");

    if (!purchaseQtyEl || !purchaseUnitEl || !totalCostEl || !equivalentQtyEl || !previewEl) return;

    const purchaseQty = Number(purchaseQtyEl.value || 0);
    const purchaseUnit = purchaseUnitEl.value;
    const totalCost = Number(totalCostEl.value || 0);
    const equivalentQty = Number(equivalentQtyEl.value || 0);

    if (!purchaseQty && !totalCost && !equivalentQty) {
        previewEl.innerText = "Fill this section only when adding new stock.";
        return;
    }

    const addedQty = convertPurchaseToInventoryQty(
        purchaseQty,
        purchaseUnit,
        item.unit,
        equivalentQty
    );

    if (purchaseQty <= 0 || totalCost < 0) {
        previewEl.innerText = "Enter valid purchased quantity and total purchase cost.";
        return;
    }

    if (addedQty <= 0) {
        previewEl.innerText = `Cannot directly convert ${purchaseUnit} to ${item.unit}. Enter Equivalent Inventory Qty.`;
        return;
    }

    const oldQty = Number(item.qty || 0);
    const oldUnitCost = Number(item.unit_cost || 0);
    const oldValue = oldQty * oldUnitCost;
    const newValue = Number(totalCost || 0);
    const finalQty = oldQty + addedQty;
    const weightedUnitCost = finalQty > 0 ? (oldValue + newValue) / finalQty : 0;

    previewEl.innerText =
        `Add ${addedQty.toFixed(2)} ${item.unit}. New stock: ${finalQty.toFixed(2)} ${item.unit}. New average cost: ₱${weightedUnitCost.toFixed(4)} / ${item.unit}`;
}

function setupRestockPreviewListeners() {
    ["restockPurchaseQty", "restockPurchaseUnit", "restockTotalPurchaseCost", "restockEquivalentQty"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", computeRestockPreview);
            el.addEventListener("change", computeRestockPreview);
        }
    });
}

function resetRestockFields() {
    const restockPurchaseQty = document.getElementById("restockPurchaseQty");
    const restockPurchaseUnit = document.getElementById("restockPurchaseUnit");
    const restockTotalPurchaseCost = document.getElementById("restockTotalPurchaseCost");
    const restockEquivalentQty = document.getElementById("restockEquivalentQty");
    const restockPreview = document.getElementById("restockPreview");

    if (restockPurchaseQty) restockPurchaseQty.value = "";
    if (restockPurchaseUnit) restockPurchaseUnit.value = "kg";
    if (restockTotalPurchaseCost) restockTotalPurchaseCost.value = "";
    if (restockEquivalentQty) restockEquivalentQty.value = "";
    if (restockPreview) restockPreview.innerText = "Fill this section only when adding new stock.";
}

function hasRestockInput() {
    const purchaseQty = document.getElementById("restockPurchaseQty")?.value || "";
    const totalCost = document.getElementById("restockTotalPurchaseCost")?.value || "";
    const equivalentQty = document.getElementById("restockEquivalentQty")?.value || "";

    return purchaseQty !== "" || totalCost !== "" || equivalentQty !== "";
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
        const response = await fetch(`${API_URL}/inventory/master?only_active=false`, {
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
            unit_cost: Number(row.unit_cost || 0),
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
        const response = await fetch(`${API_URL}/inventory/movements`, {
            method: "GET",
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error("Failed to fetch movements");
        }

        const result = await response.json();

        historyCache = (result.data || []).map(log => ({
            item_name: log.item_name,
            item_category: log.category,
            item_is_active: log.is_active,
            created_at: log.created_at,
            change_qty: Number(log.change_qty || 0),
            reason: log.reason || "-"
        }));

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
                <div class="text-xs opacity-60 mb-2">Cost: ${formatPeso(item.unit_cost)} / ${item.unit}</div>
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
                <td>${formatPeso(item.unit_cost)} / ${item.unit}</td>
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
                <td colspan="7" class="text-center opacity-60">No inventory items found.</td>
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

    const purchaseQty = document.getElementById("purchaseQty");
    const purchaseUnit = document.getElementById("purchaseUnit");
    const totalPurchaseCost = document.getElementById("totalPurchaseCost");
    const unitsPerPackage = document.getElementById("unitsPerPackage");
    const autoCostPreview = document.getElementById("autoCostPreview");

    if (purchaseQty) purchaseQty.value = "";
    if (purchaseUnit) purchaseUnit.value = "kg";
    if (totalPurchaseCost) totalPurchaseCost.value = "";
    if (unitsPerPackage) unitsPerPackage.value = "";

    document.getElementById("newItemQty").value = "";
    document.getElementById("newItemUnit").value = "grams";
    document.getElementById("newItemExp").value = "";
    document.getElementById("alertThreshold").value = "10";
    document.getElementById("newItemUnitCost").value = "";

    if (autoCostPreview) {
        autoCostPreview.innerText = "Enter purchase details to auto-compute inventory quantity and cost per unit.";
    }

    applyDateMinimums();
}
async function addNewItem() {
    computeAutoInventoryCost();

    const name = document.getElementById("newItemName").value.trim();
    const category = document.getElementById("newItemCategory").value;
    const qty = document.getElementById("newItemQty").value;
    const unit = document.getElementById("newItemUnit").value;
    const unitCost = document.getElementById("newItemUnitCost").value;
    const exp = document.getElementById("newItemExp").value;
    const threshold = document.getElementById("alertThreshold").value;

    const purchaseQty = document.getElementById("purchaseQty")?.value || "";
    const purchaseUnit = document.getElementById("purchaseUnit")?.value || "";
    const totalPurchaseCost = document.getElementById("totalPurchaseCost")?.value || "";
    const unitsPerPackage = document.getElementById("unitsPerPackage")?.value || "";
    const canDirectlyConvert = convertPurchaseToInventoryQty(
    purchaseQty,
    purchaseUnit,
    unit,
    unitsPerPackage
    );

    if (!name || purchaseQty === "" || totalPurchaseCost === "" || qty === "" || unitCost === "") {
        alert("Required fields missing. Please complete purchase details so the system can auto-compute quantity and cost per unit.");
        return;
    }

    if (Number(purchaseQty) <= 0) {
        alert("Purchased quantity must be greater than zero.");
        return;
    }

    if (Number(totalPurchaseCost) < 0) {
        alert("Total purchase cost cannot be negative.");
        return;
    }



    if (Number(canDirectlyConvert || 0) <= 0) {
        alert("Cannot convert purchase unit to inventory unit. If this is like kg mango to pcs, enter the total Equivalent Inventory Qty.");
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

    if (Number(unitCost || 0) < 0) {
        alert("Cost per unit cannot be negative.");
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
                unit_cost: Number(unitCost || 0),
                alert_threshold: Number(threshold || 10),
                expiration_date: exp ? `${exp}T00:00:00` : null,
                is_active: true,

                purchase_quantity: Number(purchaseQty),
                purchase_unit: purchaseUnit,
                total_purchase_cost: Number(totalPurchaseCost),
                units_per_package: unitsPerPackage === "" ? null : Number(unitsPerPackage)
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
    document.getElementById("adjustUnitCostInput").value = item.unit_cost || 0;
    document.getElementById("adjustExpInput").value = item.exp ? item.exp.slice(0, 10) : "";
    document.getElementById("adjustReasonInput").value = "";
    applyDateMinimums();
    resetRestockFields();

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
    const unitCostValue = document.getElementById("adjustUnitCostInput").value;
    const unitCostChanged = Number(unitCostValue || 0) !== Number(item.unit_cost || 0);

    if (expValue && isPastDate(expValue)) {
        alert("Expiration date cannot be in the past.");
        return;
    }

    try {
        if (hasRestockInput()) {
            const restockPurchaseQty = document.getElementById("restockPurchaseQty")?.value || "";
            const restockPurchaseUnit = document.getElementById("restockPurchaseUnit")?.value || "";
            const restockTotalPurchaseCost = document.getElementById("restockTotalPurchaseCost")?.value || "";
            const restockEquivalentQty = document.getElementById("restockEquivalentQty")?.value || "";

            const addedQty = convertPurchaseToInventoryQty(
                restockPurchaseQty,
                restockPurchaseUnit,
                item.unit,
                restockEquivalentQty
            );

            if (restockPurchaseQty === "" || restockTotalPurchaseCost === "") {
                alert("Purchased quantity and total purchase cost are required for restock.");
                return;
            }

            if (Number(restockPurchaseQty) <= 0) {
                alert("Purchased quantity must be greater than zero.");
                return;
            }

            if (Number(restockTotalPurchaseCost) < 0) {
                alert("Total purchase cost cannot be negative.");
                return;
            }

            if (Number(addedQty || 0) <= 0) {
                alert("Cannot convert restock purchase unit to inventory unit. Enter Equivalent Inventory Qty if needed.");
                return;
            }

            const response = await fetch(`${API_URL}/inventory/master/${currentId}/restock`, {
                method: "POST",
                headers: getAuthHeaders({
                    "Content-Type": "application/json"
                }),
                body: JSON.stringify({
                    qty_added: Number(addedQty),
                    reason: reason || "restock",
                    purchase_quantity: Number(restockPurchaseQty),
                    purchase_unit: restockPurchaseUnit,
                    total_purchase_cost: Number(restockTotalPurchaseCost),
                    units_per_package: restockEquivalentQty === "" ? null : Number(restockEquivalentQty),
                    expiration_date: expValue ? `${expValue}T00:00:00` : null,
                    category: selectedCategory
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || `Restock inventory failed: ${response.status}`);
            }

            await fetchInventory();
            await fetchAllHistory();
            renderItems();
            closeModal("adjustModal");
            return;
        }

        if (newQtyValue === "") {
            alert("New quantity is required.");
            return;
        }

        if (Number(unitCostValue || 0) < 0) {
            alert("Cost per unit cannot be negative.");
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

        if (changeQty !== 0) {
            const response = await fetch(`${API_URL}/inventory/master/${currentId}/adjust`, {
                method: "POST",
                headers: getAuthHeaders({
                    "Content-Type": "application/json"
                }),
                body: JSON.stringify({
                    change_qty: changeQty,
                    reason,
                    category: selectedCategory,
                    unit_cost: Number(unitCostValue || 0),
                    expiration_date: expValue ? `${expValue}T00:00:00` : null
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || `Adjust inventory failed: ${response.status}`);
            }
        } else if (categoryChanged || unitCostChanged || expValue !== (item.exp ? item.exp.slice(0, 10) : "")) {
            const response = await fetch(`${API_URL}/inventory/master/${currentId}`, {
                method: "PATCH",
                headers: getAuthHeaders({
                    "Content-Type": "application/json"
                }),
                body: JSON.stringify({
                    category: selectedCategory,
                    expiration_date: expValue ? `${expValue}T00:00:00` : null,
                    unit_cost: Number(unitCostValue || 0),
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
        const response = await fetch(`${API_URL}/inventory/master/${id}/active`, {
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
    setupAutoInventoryCostListeners();
    setupRestockPreviewListeners();

    const searchInput = document.getElementById("searchInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const statusFilter = document.getElementById("statusFilter");

    if (searchInput) searchInput.value = "";
    if (categoryFilter) categoryFilter.value = "all";
    if (statusFilter) statusFilter.value = "all";

    setView("grid");

    await fetchInventory();
    await fetchAllHistory();

    populateCategoryFilter();

    if (categoryFilter) categoryFilter.value = "all";
    if (statusFilter) statusFilter.value = "all";

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

document.addEventListener("DOMContentLoaded", () => {
    initializeInventoryPage();
});