let productsCache = [];
let addonsCache = [];
let sizesCache = [];
let inventoryCache = [];
let categoriesCache = [];
let tempProductImage = "";
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
const EMPTY_IMAGE =
    "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function switchTab(tab, btn) {
    document.querySelectorAll(".tab-content").forEach(content => {
        content.classList.remove("active");
    });

    document.querySelectorAll(".tab-btn").forEach(button => {
        button.classList.remove("active");
    });

    const targetTab = document.getElementById(`${tab}Tab`);
    if (targetTab) {
        targetTab.classList.add("active");
    }

    if (btn) {
        btn.classList.add("active");
    }
}

function openModal(modalId) {
    const overlay = document.getElementById("modalOverlay");
    if (!overlay) return;

    overlay.classList.add("open");

    document.querySelectorAll(".modal-card").forEach(card => {
        card.style.display = "none";
    });

    const target = document.getElementById(modalId);
    if (target) {
        target.style.display = "block";
    }
}

function closeModals() {
    const overlay = document.getElementById("modalOverlay");
    if (!overlay) return;

    overlay.classList.remove("open");

    document.querySelectorAll(".modal-card").forEach(card => {
        card.style.display = "none";
    });
}
function getCategoryLabel(categoryId) {
    const found = categoriesCache.find(
        cat => Number(cat.category_id ?? cat.id) === Number(categoryId)
    );
    return found ? found.name : `Category #${categoryId ?? "-"}`;
}
function buildImagePlaceholder(name) {
    const initial = (name || "P").trim().charAt(0).toUpperCase() || "P";
    return `
        <div class="w-[45px] h-[45px] rounded-xl border-2 border-white/10 flex items-center justify-center font-black text-sm bg-white/5">
            ${escapeHtml(initial)}
        </div>
    `;
}

function previewImage(input) {
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        tempProductImage = e.target.result || "";
        const imgPreview = document.getElementById("imgPreview");
        if (imgPreview) {
            imgPreview.src = tempProductImage || EMPTY_IMAGE;
        }
    };
    reader.readAsDataURL(file);
}

async function fetchCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/products/categories/`, {
            method: "GET",
            headers: getAuthHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Categories fetch failed: ${response.status}`);
        }

        const result = await response.json();
        categoriesCache = result.data || [];
    } catch (error) {
        console.error("Categories fetch error:", error);
        categoriesCache = [];
    }
}

async function fetchProducts() {
    try {
        const response = await fetch(`${API_BASE_URL}/products/?limit=500/`, {
            method: "GET",
            headers: getAuthHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Products fetch failed: ${response.status}`);
        }

        const result = await response.json();
        productsCache = result.data || [];
    } catch (error) {
        console.error("Products fetch error:", error);
        productsCache = [];
    }
}
async function fetchAddons() {
    try {
        const [addonsResponse, sizesResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/addons/?active_only=false&addon_type=ADDON/`, {
                method: "GET",
                headers: getAuthHeaders(),
            }),
            fetch(`${API_BASE_URL}/addons/?active_only=false&addon_type=SIZE/`, {
                method: "GET",
                headers: getAuthHeaders(),
            })
        ]);

        const addonsResult = addonsResponse.ok ? await addonsResponse.json() : { data: [] };
        const sizesResult = sizesResponse.ok ? await sizesResponse.json() : { data: [] };

        addonsCache = addonsResult.data || [];
        sizesCache = sizesResult.data || [];
    } catch (error) {
        console.error("Add-ons fetch error:", error);
        addonsCache = [];
        sizesCache = [];
    }
}
async function fetchInventoryReference() {
    try {
        const response = await fetch(`${API_BASE_URL}/inventory/master/?only_active=true&limit=500/`, {
            method: "GET",
            headers: getAuthHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Inventory fetch failed: ${response.status}`);
        }

        const result = await response.json();
        inventoryCache = result.data || [];
    } catch (error) {
        console.error("Inventory reference fetch error:", error);
        inventoryCache = [];
    }
}
function populateCategorySelect() {
    const select = document.getElementById("prodCategory");
    if (!select) return;

    const currentValue = select.value || "";

    if (!categoriesCache.length) {
        select.innerHTML = `<option value="">No categories found</option>`;
        return;
    }

    select.innerHTML = categoriesCache
        .map(cat => {
            const value = cat.category_id ?? cat.id;
            return `<option value="${value}">${escapeHtml(cat.name)}</option>`;
        })
        .join("");

    const exists = categoriesCache.some(
        cat => String(cat.category_id ?? cat.id) === String(currentValue)
    );

    if (exists) {
        select.value = currentValue;
    } else {
        select.value = String(categoriesCache[0].category_id ?? categoriesCache[0].id);
    }
}

function populateRecipeProductSelect() {
    const select = document.getElementById("recipeProductSelect");
    if (!select) return;

    const currentValue = select.value || "";
    select.innerHTML = `<option value="">-- Select Product --</option>`;

    productsCache.forEach(product => {
        select.innerHTML += `
            <option value="${product.product_id}">
                ${escapeHtml(product.name)}
            </option>
        `;
    });

    const exists = productsCache.some(
        product => String(product.product_id) === String(currentValue)
    );

    select.value = exists ? currentValue : "";
}

function renderProducts() {
    const tbody = document.getElementById("productTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!productsCache.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="opacity-60">No products found.</td>
            </tr>
        `;
        populateRecipeProductSelect();
        return;
    }

    productsCache.forEach(product => {
        const isActive = Boolean(product.is_active);
        const imageCell = buildImagePlaceholder(product.name);

        tbody.innerHTML += `
            <tr class="hover:bg-white/5 transition">
                <td>${imageCell}</td>
                <td class="font-black text-xs uppercase tracking-wider">${escapeHtml(product.name)}</td>
                <td class="text-xs opacity-60">${escapeHtml(product.category_name || getCategoryLabel(product.category_id))}</td>
                <td class="font-bold text-yellow-400">₱${Number(product.price || 0).toFixed(2)}</td>
                <td>
                    <label class="switch">
                        <input
                            type="checkbox"
                            ${isActive ? "checked" : ""}
                            onchange="toggleProduct(${product.product_id}, ${isActive})"
                        >
                        <span class="slider"></span>
                    </label>
                </td>
                <td>
                    <button class="text-xs font-bold text-sub hover:text-white mr-4" onclick="editProduct(${product.product_id})">EDIT</button>
                    <button class="text-xs font-bold text-red-500/50 hover:text-red-500" onclick="deleteProduct(${product.product_id})">DEL</button>
                </td>
            </tr>
        `;
    });

    populateRecipeProductSelect();
}

function renderOptions() {
    const addonTbody = document.getElementById("addonTableBody");
    const sizeTbody = document.getElementById("sizeTableBody");

    if (addonTbody) addonTbody.innerHTML = "";
    if (sizeTbody) sizeTbody.innerHTML = "";

    if (addonTbody) {
        if (!addonsCache.length) {
            addonTbody.innerHTML = `
                <tr>
                    <td colspan="4" class="opacity-60">No add-ons found.</td>
                </tr>
            `;
        } else {
            addonsCache.forEach(item => {
                addonTbody.innerHTML += `
                    <tr class="hover:bg-white/5 transition">
                        <td class="font-black text-xs uppercase tracking-wider">${escapeHtml(item.name)}</td>
                        <td class="font-bold text-yellow-400">₱${Number(item.price || 0).toFixed(2)}</td>
                        <td>${item.is_active ? "ACTIVE" : "INACTIVE"}</td>
                        <td>
                            <button class="text-xs font-bold text-sub hover:text-white mr-4" onclick="editOption(${item.id}, 'addon')">EDIT</button>
                            <button class="text-xs font-bold text-red-500/50 hover:text-red-500" onclick="deleteOption(${item.id}, 'addon')">DEL</button>
                        </td>
                    </tr>
                `;
            });
        }
    }

    if (sizeTbody) {
        if (!sizesCache.length) {
            sizeTbody.innerHTML = `
                <tr>
                    <td colspan="4" class="opacity-60">No sizes found.</td>
                </tr>
            `;
        } else {
            sizesCache.forEach(item => {
                sizeTbody.innerHTML += `
                    <tr class="hover:bg-white/5 transition">
                        <td class="font-black text-xs uppercase tracking-wider">${escapeHtml(item.name)}</td>
                        <td class="font-bold text-yellow-400">₱${Number(item.price || 0).toFixed(2)}</td>
                        <td>${item.is_active ? "ACTIVE" : "INACTIVE"}</td>
                        <td>
                            <button class="text-xs font-bold text-sub hover:text-white mr-4" onclick="editOption(${item.id}, 'size')">EDIT</button>
                            <button class="text-xs font-bold text-red-500/50 hover:text-red-500" onclick="deleteOption(${item.id}, 'size')">DEL</button>
                        </td>
                    </tr>
                `;
            });
        }
    }
}

function openProductModal() {
    document.getElementById("productModalTitle").innerText = "New Product";
    document.getElementById("prodId").value = "";
    document.getElementById("prodName").value = "";
    document.getElementById("prodPrice").value = "";
    document.getElementById("prodPoints").value = "";
    document.getElementById("imgPreview").src = EMPTY_IMAGE;
    document.getElementById("prodImgInput").value = "";
    tempProductImage = "";
    populateCategorySelect();
    openModal("productModal");
}

function editProduct(productId) {
    const product = productsCache.find(
        item => Number(item.product_id) === Number(productId)
    );
    if (!product) return;

    document.getElementById("productModalTitle").innerText = "Edit Product";
    document.getElementById("prodId").value = product.product_id;
    document.getElementById("prodName").value = product.name || "";
    document.getElementById("prodPrice").value = Number(product.price || 0);
    document.getElementById("prodPoints").value = Number(product.points_per_unit || 0);
    document.getElementById("imgPreview").src = EMPTY_IMAGE;
    document.getElementById("prodImgInput").value = "";
    tempProductImage = "";

    populateCategorySelect();
    document.getElementById("prodCategory").value = String(product.category_id || "");

    openModal("productModal");
}

async function saveProduct() {
    const productId = document.getElementById("prodId").value;
    const name = document.getElementById("prodName").value.trim();
    const price = Number(document.getElementById("prodPrice").value);
    const points = Number(document.getElementById("prodPoints").value || 0);
    const categoryId = Number(document.getElementById("prodCategory").value);

    if (!name) {
        alert("Product name is required.");
        return;
    }

    if (Number.isNaN(price) || price < 0) {
        alert("Valid product price is required.");
        return;
    }

    if (Number.isNaN(points) || points < 0) {
        alert("Points must be 0 or higher.");
        return;
    }

    if (Number.isNaN(categoryId) || !categoryId) {
        alert("Category is required.");
        return;
    }

    const payload = {
        name,
        price,
        points_per_unit: points,
        category_id: categoryId,
        is_active: true,
        is_available: true
    };

    try {
        let response;

        if (productId) {
            response = await fetch(`${API_BASE_URL}/products/${productId}`, {
                method: "PATCH",
                headers: getAuthHeaders({
                    "Content-Type": "application/json"
                }),
                body: JSON.stringify(payload)
            });
        } else {
            response = await fetch(`${API_BASE_URL}/products/`, {
                method: "POST",
                headers: getAuthHeaders({
                    "Content-Type": "application/json"
                }),
                body: JSON.stringify(payload)
            });
        }

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Save product failed: ${response.status}`);
        }

        await fetchProducts();
        renderProducts();
        populateRecipeProductSelect();
        closeModals();

        if (tempProductImage) {
            alert("Note: product image preview is UI-only for now because your backend products table still has no image field.");
        }
    } catch (error) {
        console.error("Save product error:", error);
        alert(error.message || "Failed to save product.");
    }
}

async function toggleProduct(productId, currentActive) {
    try {
        const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
            method: "PATCH",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({
                is_active: !currentActive,
                is_available: !currentActive
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Toggle product failed: ${response.status}`);
        }

        await fetchProducts();
        renderProducts();
        populateRecipeProductSelect();
    } catch (error) {
        console.error("Toggle product error:", error);
        alert(error.message || "Failed to update product status.");
    }
}

async function deleteProduct(productId) {
    const confirmed = confirm("This will deactivate the product. Continue?");
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
            method: "PATCH",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({
                is_active: false,
                is_available: false
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Deactivate product failed: ${response.status}`);
        }

        await fetchProducts();
        renderProducts();
        populateRecipeProductSelect();
    } catch (error) {
        console.error("Delete product error:", error);
        alert(error.message || "Failed to deactivate product.");
    }
}

async function loadRecipe() {
    const productId = document.getElementById("recipeProductSelect")?.value;
    const recipeDisplay = document.getElementById("recipeDisplay");
    const bulkRecipeInput = document.getElementById("bulkRecipeInput");
    const currentRecipeView = document.getElementById("currentRecipeView");

    if (!productId) {
        if (currentRecipeView) currentRecipeView.classList.add("hidden");
        if (recipeDisplay) recipeDisplay.innerText = "";
        if (bulkRecipeInput) bulkRecipeInput.value = "";
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/products/${productId}/recipe`, {
            method: "GET",
            headers: getAuthHeaders(),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Recipe fetch failed: ${response.status}`);
        }

        const lines = (result.data || []).map(item =>
            `${item.ingredient_name}: ${item.qty_used}`
        );

        const displayText = lines.length ? lines.join("\n") : "No recipe assigned yet.";

        if (currentRecipeView) currentRecipeView.classList.remove("hidden");
        if (recipeDisplay) recipeDisplay.innerText = displayText;
        if (bulkRecipeInput) bulkRecipeInput.value = lines.join("\n");
    } catch (error) {
        console.error("Load recipe error:", error);
        alert(error.message || "Failed to load recipe.");
    }
}

function parseRecipeText(text) {
    const lines = String(text || "")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

    if (!lines.length) {
        throw new Error("Recipe cannot be empty.");
    }

    return lines.map(line => {
        const parts = line.split(":");
        if (parts.length < 2) {
            throw new Error(`Invalid recipe line: ${line}`);
        }

        const ingredientName = parts[0].trim().toLowerCase();
        const qtyText = parts.slice(1).join(":").trim();

        const qtyMatch = qtyText.match(/-?\d+(\.\d+)?/);
        if (!qtyMatch) {
            throw new Error(`Missing quantity in line: ${line}`);
        }

        const qtyUsed = Number(qtyMatch[0]);
        if (Number.isNaN(qtyUsed) || qtyUsed <= 0) {
            throw new Error(`Invalid quantity in line: ${line}`);
        }

        const matchedInventory = inventoryCache.find(item =>
            String(item.name || "").trim().toLowerCase() === ingredientName
        );

        if (!matchedInventory) {
            throw new Error(`Inventory item not found: ${parts[0].trim()}`);
        }

        return {
            inventory_master_id: matchedInventory.inventory_master_id,
            qty_used: qtyUsed
        };
    });
}

async function saveBulkRecipe() {
    const productId = document.getElementById("recipeProductSelect")?.value;
    const recipeText = document.getElementById("bulkRecipeInput")?.value || "";

    if (!productId) {
        alert("Select a product first.");
        return;
    }

    try {
        const items = parseRecipeText(recipeText);

        const response = await fetch(`${API_BASE_URL}/products/${productId}/recipe`, {
            method: "PUT",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({ items })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Save recipe failed: ${response.status}`);
        }

        await loadRecipe();
        alert("Recipe saved successfully.");
    } catch (error) {
        console.error("Save recipe error:", error);
        alert(error.message || "Failed to save recipe.");
    }
}

function openAddonModal(type) {
    document.getElementById("addonId").value = "";
    document.getElementById("addonName").value = "";
    document.getElementById("addonPrice").value = "";
    document.getElementById("addonTypeField").value = type === "size" ? "SIZE" : "ADDON";
    document.getElementById("addonModalTitle").innerText =
        type === "size" ? "New Size" : "New Add-on";

    openModal("addonModal");
}

function editOption(id, type) {
    const source = type === "size" ? sizesCache : addonsCache;
    const item = source.find(opt => Number(opt.id) === Number(id));
    if (!item) return;

    document.getElementById("addonId").value = item.id;
    document.getElementById("addonName").value = item.name || "";
    document.getElementById("addonPrice").value = Number(item.price || 0);
    document.getElementById("addonTypeField").value =
        item.addon_type || (type === "size" ? "SIZE" : "ADDON");
    document.getElementById("addonModalTitle").innerText =
        type === "size" ? "Edit Size" : "Edit Add-on";

    openModal("addonModal");
}

function saveAddon() {
    alert("Add-on/Size save backend is not connected yet. Fetching works, but create/edit endpoint is still missing.");
}

function deleteOption() {
    alert("Add-on/Size delete backend is not connected yet. We need addon create/update/delete/toggle endpoints next.");
}

async function initializeMenuManager() {
    await Promise.all([
        fetchCategories(),
        fetchProducts(),
        fetchAddons(),
        fetchInventoryReference()
    ]);

    populateCategorySelect();
    renderProducts();
    renderOptions();
    populateRecipeProductSelect();
}
window.switchTab = switchTab;
window.openProductModal = openProductModal;
window.openAddonModal = openAddonModal;
window.closeModals = closeModals;
window.previewImage = previewImage;
window.saveProduct = saveProduct;
window.editProduct = editProduct;
window.toggleProduct = toggleProduct;
window.deleteProduct = deleteProduct;
window.loadRecipe = loadRecipe;
window.saveBulkRecipe = saveBulkRecipe;
window.editOption = editOption;
window.saveAddon = saveAddon;
window.deleteOption = deleteOption;

window.onload = () => {
    initializeMenuManager();
};