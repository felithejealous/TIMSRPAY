const menuGrid = document.getElementById("menuGrid");
const selectedItemDisplay = document.getElementById("selectedItemDisplay");
const sizeOptions = document.getElementById("sizeOptions");
const addonOptions = document.getElementById("addonOptions");
const addToCartBtn = document.getElementById("addToCartBtn");
const cartList = document.getElementById("cartList");
const totalPrice = document.getElementById("totalPrice");
const checkoutBtn = document.getElementById("checkoutBtn");
const customerNameInput = document.getElementById("customerNameInput");
const customerAccountInput = document.getElementById("customerAccountInput");
const customerLookupStatus = document.getElementById("customerLookupStatus");
const promoCodeInput = document.getElementById("promoCodeInput");
const quantityInput = document.getElementById("quantityInput");
const qtyMinusBtn = document.getElementById("qtyMinusBtn");
const qtyPlusBtn = document.getElementById("qtyPlusBtn");

let products = [];
let addons = [];
let sizeAddons = [];
let inventoryItems = [];
let recipeMap = new Map();

let linkedCustomer = null;
let customerLookupDebounce = null;

let currentItem = null;
let selectedAddons = [];
let selectedSize = "small";
let selectedQuantity = 1;

let cart = [];
let total = 0;

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

function formatPeso(value) {
    return `₱${Number(value || 0).toFixed(2)}`;
}

function normalizeCategoryName(value) {
    return String(value || "Menu Item").trim();
}

function normalizeSizeName(value) {
    return String(value || "").trim().toLowerCase();
}

function prettifySize(value) {
    const clean = normalizeSizeName(value);
    if (!clean) return "Small";
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function clampQuantity(value) {
    const qty = Number(value);
    if (!Number.isFinite(qty) || qty < 1) return 1;
    return Math.floor(qty);
}

function normalizePromoCode(value) {
    return String(value || "").trim().toUpperCase();
}

function hasPromoInput() {
    return !!normalizePromoCode(promoCodeInput?.value || "");
}

function setCustomerLookupStatus(message = "", type = "") {
    if (!customerLookupStatus) return;

    customerLookupStatus.textContent = message || "";
    customerLookupStatus.style.color = "";

    if (type === "success") {
        customerLookupStatus.style.color = "#10b981";
    } else if (type === "error") {
        customerLookupStatus.style.color = "#ef4444";
    } else if (type === "warning") {
        customerLookupStatus.style.color = "#f59e0b";
    }
}

function updateLinkedCustomerUX() {
    const promoCode = normalizePromoCode(promoCodeInput?.value || "");

    if (promoCode && !linkedCustomer) {
        setCustomerLookupStatus(
            "Promo code entered. Link the correct TIMSRPAY customer account first.",
            "warning"
        );
        return;
    }

    if (linkedCustomer) {
        const displayName = linkedCustomer.full_name || linkedCustomer.email || `User #${linkedCustomer.user_id}`;
        const extra = linkedCustomer.wallet_code ? ` • Wallet: ${maskWalletCode(linkedCustomer.wallet_code)}` : "";
        const promoLabel = promoCode ? ` • Promo owner locked` : "";
        setCustomerLookupStatus(
            `Linked to ${displayName}${extra}${promoLabel}`,
            "success"
        );
        return;
    }

    setCustomerLookupStatus("");
}

function setSelectedQuantity(value) {
    selectedQuantity = clampQuantity(value);

    if (quantityInput) {
        quantityInput.value = String(selectedQuantity);
    }

    if (currentItem) {
        updateSelectedItemDisplay();
    }

    renderProducts(products);
}

function getProductImageByName(name) {
    const clean = String(name || "").toLowerCase();

    if (clean.includes("mango")) return "mango.png";
    if (clean.includes("lychee")) return "lychee.png";
    if (clean.includes("ube")) return "ube2.png";
    if (clean.includes("avocado")) return "avo2.png";
    if (clean.includes("buko")) return "buko2.png";
    if (clean.includes("strawberry")) return "berry2.png";

    return "mango.png";
}

function showMenuMessage(message) {
    if (!menuGrid) return;
    menuGrid.innerHTML = `<div class="loading-box">${escapeHTML(message)}</div>`;
}

function showAddonMessage(message) {
    if (!addonOptions) return;
    addonOptions.innerHTML = `<div class="option-chip disabled">${escapeHTML(message)}</div>`;
}

function showSizeMessage(message) {
    if (!sizeOptions) return;
    sizeOptions.innerHTML = `<div class="option-chip disabled">${escapeHTML(message)}</div>`;
}

function findInventoryByName(name) {
    const target = String(name || "").trim().toLowerCase();
    return inventoryItems.find(item => String(item.name || "").trim().toLowerCase() === target) || null;
}

function getInventoryQuantity(name) {
    const item = findInventoryByName(name);
    return Number(item?.quantity || 0);
}

function hasEnoughInventory(name, requiredQty) {
    return getInventoryQuantity(name) >= Number(requiredQty || 0);
}

function getCupInventoryName(sizeName) {
    const clean = normalizeSizeName(sizeName);
    if (clean === "medium") return "Cup-medium";
    if (clean === "large") return "Cup-large";
    return "Cup-small";
}

function getSizeUpcharge(sizeName) {
    const match = sizeAddons.find(item => normalizeSizeName(item.name) === normalizeSizeName(sizeName));
    return Number(match?.price || 0);
}

function cartSignature(productId, size, addonIds) {
    const cleanAddons = [...addonIds].map(Number).sort((a, b) => a - b).join(",");
    return `${Number(productId)}|${normalizeSizeName(size)}|${cleanAddons}`;
}

function getCartItemUnitPrice(item) {
    return Number(item.unit_price || 0);
}

function recomputeCartItemDisplayPrice(item) {
    item.display_price = Number((getCartItemUnitPrice(item) * Number(item.quantity || 1)).toFixed(2));
}

function syncCustomerNameFromLinkedAccount() {
    if (!customerNameInput) return;
    if (customerNameInput.value?.trim()) return;
    if (!linkedCustomer) return;

    const displayName = linkedCustomer.full_name || linkedCustomer.email || "";
    if (displayName) {
        customerNameInput.value = displayName;
    }
}

/* =========================
   LOGOUT
========================= */
function setupLogout() {
    const logoutLink = document.querySelector(".logout-link");
    if (!logoutLink) return;

    logoutLink.addEventListener("click", async (event) => {
        event.preventDefault();

        try {
            await fetch(`${getAPIURL()}/auth/logout`, {
                method: "POST",
                credentials: "include"
            });
        } catch (error) {
            console.error("Logout failed:", error);
        } finally {
            window.location.href = "loginstaff.html";
        }
    });
}

/* =========================
   FETCH BASE DATA
========================= */
async function loadMenuProducts() {
    try {
        showMenuMessage("Loading menu...");

        let data = null;

        try {
            data = await fetchJSON(`${getAPIURL()}/products/menu`);
        } catch (menuError) {
            console.warn("/products/menu failed, trying /products/?active_only=true", menuError);
            data = await fetchJSON(`${getAPIURL()}/products/?active_only=true&limit=200`);
        }

        products = Array.isArray(data?.data) ? data.data : [];
    } catch (error) {
        console.error("Failed to load products:", error);
        products = [];
        showMenuMessage(`Failed to load menu: ${error.message}`);
    }
}

async function loadAllAddOns() {
    try {
        showAddonMessage("Loading...");
        showSizeMessage("Loading sizes...");

        const data = await fetchJSON(`${getAPIURL()}/addons/`);
        const allRows = Array.isArray(data) ? data.filter(item => item.is_active !== false) : [];

        addons = allRows.filter(item => (item.addon_type || "").toUpperCase() === "ADDON");
        sizeAddons = allRows.filter(item => (item.addon_type || "").toUpperCase() === "SIZE");

        if (!sizeAddons.length) {
            sizeAddons = [
                { id: "small", name: "Small", addon_type: "SIZE", price: 0, is_active: true },
                { id: "medium", name: "Medium", addon_type: "SIZE", price: 10, is_active: true },
                { id: "large", name: "Large", addon_type: "SIZE", price: 20, is_active: true }
            ];
        }

        const hasSmall = sizeAddons.some(item => normalizeSizeName(item.name) === "small");
        if (!hasSmall) {
            sizeAddons.unshift({ id: "small-fallback", name: "Small", addon_type: "SIZE", price: 0, is_active: true });
        }

        renderSizeOptions(sizeAddons);
        renderAddOns(addons);
    } catch (error) {
        console.error("Failed to load add-ons:", error);
        addons = [];
        sizeAddons = [
            { id: "small", name: "Small", addon_type: "SIZE", price: 0, is_active: true },
            { id: "medium", name: "Medium", addon_type: "SIZE", price: 10, is_active: true },
            { id: "large", name: "Large", addon_type: "SIZE", price: 20, is_active: true }
        ];
        renderSizeOptions(sizeAddons);
        showAddonMessage(`Failed: ${error.message}`);
    }
}

async function loadInventoryMaster() {
    try {
        const data = await fetchJSON(`${getAPIURL()}/inventory/master?only_active=true&limit=500`);
        inventoryItems = Array.isArray(data?.data) ? data.data : [];
    } catch (error) {
        console.error("Failed to load inventory master:", error);
        inventoryItems = [];
    }
}

async function loadProductRecipes() {
    recipeMap = new Map();

    const activeProducts = products.filter(product => product.is_active !== false);

    await Promise.all(
        activeProducts.map(async (product) => {
            try {
                const data = await fetchJSON(`${getAPIURL()}/products/${product.product_id}/recipe`);
                const recipeItems = Array.isArray(data?.data) ? data.data : [];
                recipeMap.set(Number(product.product_id), recipeItems);
            } catch (error) {
                console.warn(`Recipe fetch failed for product ${product.product_id}:`, error.message);
                recipeMap.set(Number(product.product_id), []);
            }
        })
    );
}

/* =========================
   CUSTOMER LOOKUP
========================= */
async function resolveCustomerAccount(queryText) {
    const query = String(queryText || "").trim();

    if (!query) {
        linkedCustomer = null;
        updateLinkedCustomerUX();
        return null;
    }

    const result = await fetchJSON(
        `${getAPIURL()}/wallet/lookup?q=${encodeURIComponent(query)}&limit=20`
    );

    const rows = Array.isArray(result?.data) ? result.data : [];

    if (!rows.length) {
        linkedCustomer = null;
        setCustomerLookupStatus("No matching TIMSRPAY customer account found.", "error");
        return null;
    }

    const lowerQuery = query.toLowerCase();

    const exactEmailMatch = rows.find(item =>
        String(item.email || "").trim().toLowerCase() === lowerQuery
    );

    const exactWalletMatch = rows.find(item =>
        String(item.wallet_code || "").trim().toUpperCase() === query.toUpperCase()
    );

    const exactNameMatch = rows.find(item =>
        String(item.full_name || "").trim().toLowerCase() === lowerQuery
    );

    const selected = exactEmailMatch || exactWalletMatch || exactNameMatch || rows[0];

    linkedCustomer = {
        user_id: selected.user_id,
        email: selected.email,
        full_name: selected.full_name,
        wallet_code: selected.wallet_code,
        balance: selected.balance,
        is_active: selected.is_active
    };

    syncCustomerNameFromLinkedAccount();
    updateLinkedCustomerUX();

    return linkedCustomer;
}

function setupCustomerLookup() {
    if (!customerAccountInput) return;

    customerAccountInput.addEventListener("input", () => {
        clearTimeout(customerLookupDebounce);

        const value = customerAccountInput.value || "";

        customerLookupDebounce = setTimeout(async () => {
            const trimmed = String(value).trim();

            if (!trimmed) {
                linkedCustomer = null;
                updateLinkedCustomerUX();
                return;
            }

            try {
                await resolveCustomerAccount(trimmed);
            } catch (error) {
                console.error("Customer lookup failed:", error);
                linkedCustomer = null;
                setCustomerLookupStatus(error.message || "Customer lookup failed.", "error");
            }
        }, 300);
    });

    customerAccountInput.addEventListener("blur", async () => {
        const trimmed = String(customerAccountInput.value || "").trim();
        if (!trimmed) return;

        try {
            await resolveCustomerAccount(trimmed);
        } catch (error) {
            console.error("Customer lookup blur failed:", error);
        }
    });
}

function setupPromoWatcher() {
    if (!promoCodeInput) return;

    promoCodeInput.addEventListener("input", () => {
        const promoCode = normalizePromoCode(promoCodeInput.value);
        promoCodeInput.value = promoCode;

        updateLinkedCustomerUX();

        if (promoCode && !linkedCustomer) {
            setCustomerLookupStatus(
                "Promo code entered. Link the correct TIMSRPAY customer account first.",
                "warning"
            );
        }
    });
}

/* =========================
   STOCK CHECKING
========================= */
function getProductStockState(product, sizeName = "small", orderQty = 1) {
    if (!product) {
        return {
            available: false,
            label: "Out of Stock",
            note: "Invalid product"
        };
    }

    if (product.is_active === false) {
        return {
            available: false,
            label: "Out of Stock",
            note: "Inactive product"
        };
    }

    if (product.is_available === false) {
        return {
            available: false,
            label: "Out of Stock",
            note: "Marked unavailable"
        };
    }

    const qty = clampQuantity(orderQty);
    const cupName = getCupInventoryName(sizeName);

    if (!hasEnoughInventory(cupName, qty)) {
        return {
            available: false,
            label: "Out of Stock",
            note: `No ${cupName} stock`
        };
    }

    if (!hasEnoughInventory("Straw", qty)) {
        return {
            available: false,
            label: "Out of Stock",
            note: "No Straw stock"
        };
    }

    const recipeItems = recipeMap.get(Number(product.product_id)) || [];

    for (const recipeItem of recipeItems) {
        const ingredientName = recipeItem.ingredient_name;
        const qtyUsed = Number(recipeItem.qty_used || 0) * qty;

        if (!hasEnoughInventory(ingredientName, qtyUsed)) {
            return {
                available: false,
                label: "Out of Stock",
                note: `Missing ${ingredientName}`
            };
        }
    }

    return {
        available: true,
        label: "Available",
        note: ""
    };
}

/* =========================
   RENDER
========================= */
function renderProducts(items = []) {
    if (!menuGrid) return;

    if (!Array.isArray(items) || items.length === 0) {
        menuGrid.innerHTML = `<div class="empty-menu">No available menu items found.</div>`;
        return;
    }

    menuGrid.innerHTML = items.map(product => {
        const stockState = getProductStockState(product, selectedSize, selectedQuantity);
        const isOut = !stockState.available;
        const displayPrice = Number(product.price || 0) + getSizeUpcharge(selectedSize);

        return `
            <div class="product-card ${isOut ? "out-of-stock" : ""}" 
                 data-product-id="${product.product_id}"
                 data-disabled="${isOut ? "true" : "false"}">
                <div class="stock-badge ${isOut ? "out" : ""}">
                    ${escapeHTML(stockState.label)}
                </div>

                <img src="${escapeHTML(getProductImageByName(product.name))}" alt="${escapeHTML(product.name)}">
                <h4>${escapeHTML(product.name)}</h4>
                <div class="product-sub">${escapeHTML(normalizeCategoryName(product.category_name))}</div>
                <p class="product-price">${escapeHTML(formatPeso(displayPrice))}</p>
                <div class="stock-note">${escapeHTML(stockState.note || "")}</div>
            </div>
        `;
    }).join("");

    menuGrid.querySelectorAll(".product-card").forEach(card => {
        card.addEventListener("click", () => {
            if (card.dataset.disabled === "true") return;

            const productId = Number(card.dataset.productId);
            const product = products.find(item => Number(item.product_id) === productId);

            if (product) {
                selectItem(product);
            }
        });
    });
}

function renderSizeOptions(items = []) {
    if (!sizeOptions) return;

    if (!items.length) {
        sizeOptions.innerHTML = `<div class="option-chip disabled">No size options</div>`;
        return;
    }

    sizeOptions.innerHTML = items.map(item => {
        const cleanName = normalizeSizeName(item.name);
        const isActive = cleanName === normalizeSizeName(selectedSize);

        return `
            <div class="option-chip ${isActive ? "active" : ""}" data-size="${escapeHTML(cleanName)}">
                ${escapeHTML(prettifySize(cleanName))}
                ${Number(item.price || 0) > 0 ? `(+${escapeHTML(formatPeso(item.price))})` : ""}
            </div>
        `;
    }).join("");

    sizeOptions.querySelectorAll(".option-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            selectedSize = chip.dataset.size || "small";

            sizeOptions.querySelectorAll(".option-chip").forEach(item => {
                item.classList.remove("active");
            });

            chip.classList.add("active");
            renderProducts(products);

            if (currentItem) {
                const stockState = getProductStockState(currentItem, selectedSize, selectedQuantity);

                if (!stockState.available) {
                    currentItem = null;
                    selectedItemDisplay.innerHTML = `<i class="fa-solid fa-circle-info"></i> Select an item from the menu`;
                    document.querySelectorAll(".product-card").forEach(card => card.classList.remove("active"));
                } else {
                    updateSelectedItemDisplay();
                }
            }
        });
    });
}

function renderAddOns(items = []) {
    if (!addonOptions) return;

    if (!items.length) {
        addonOptions.innerHTML = `<div class="option-chip disabled">No add-ons</div>`;
        return;
    }

    addonOptions.innerHTML = items.map(addon => `
        <div class="option-chip" data-addon-id="${addon.id}">
            ${escapeHTML(addon.name)} (+${escapeHTML(formatPeso(addon.price))})
        </div>
    `).join("");

    addonOptions.querySelectorAll(".option-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const addonId = Number(chip.dataset.addonId);
            const addon = addons.find(item => Number(item.id) === addonId);
            if (addon) {
                toggleAddon(chip, addon);
            }
        });
    });
}
function maskWalletCode(walletCode) {
    const clean = String(walletCode || "").trim().toUpperCase();
    if (!clean) return "";
    if (clean.length <= 3) return clean;
    return `${clean.slice(0, 3)}***`;
}
function updateSelectedItemDisplay() {
    if (!currentItem || !selectedItemDisplay) return;

    const qty = clampQuantity(selectedQuantity);
    const basePrice = Number(currentItem.price || 0);
    const sizeUpcharge = getSizeUpcharge(selectedSize);
    const addonTotal = selectedAddons.reduce((sum, addon) => sum + Number(addon.price || 0), 0);
    const unitPrice = basePrice + sizeUpcharge + addonTotal;
    const finalPrice = unitPrice * qty;

    selectedItemDisplay.innerHTML = `
        <i class="fa-solid fa-check-circle" style="color:var(--success)"></i>
        ${escapeHTML(currentItem.name)} (${escapeHTML(prettifySize(selectedSize))}) x${escapeHTML(qty)} - ${escapeHTML(formatPeso(finalPrice))}
    `;
}

/* =========================
   PRODUCT / OPTIONS
========================= */
function selectItem(product) {
    const stockState = getProductStockState(product, selectedSize, selectedQuantity);

    if (!stockState.available) {
        alert(`${product.name} is currently out of stock for ${prettifySize(selectedSize)}.`);
        return;
    }

    currentItem = product;

    document.querySelectorAll(".product-card").forEach(card => {
        card.classList.remove("active");
    });

    const selectedCard = document.querySelector(`.product-card[data-product-id="${product.product_id}"]`);
    if (selectedCard) {
        selectedCard.classList.add("active");
    }

    updateSelectedItemDisplay();
}

function toggleAddon(el, addon) {
    el.classList.toggle("active");

    if (el.classList.contains("active")) {
        const exists = selectedAddons.some(item => Number(item.id) === Number(addon.id));
        if (!exists) {
            selectedAddons.push(addon);
        }
    } else {
        selectedAddons = selectedAddons.filter(item => Number(item.id) !== Number(addon.id));
    }

    if (currentItem) {
        updateSelectedItemDisplay();
    }
}

function resetSelection() {
    currentItem = null;
    selectedAddons = [];
    selectedSize = "small";
    selectedQuantity = 1;

    if (quantityInput) {
        quantityInput.value = "1";
    }

    selectedItemDisplay.innerHTML = `
        <i class="fa-solid fa-circle-info"></i> Select an item from the menu
    `;

    document.querySelectorAll(".product-card").forEach(card => {
        card.classList.remove("active");
    });

    addonOptions?.querySelectorAll(".option-chip").forEach(chip => {
        chip.classList.remove("active");
    });

    sizeOptions?.querySelectorAll(".option-chip").forEach(chip => {
        chip.classList.remove("active");
        if ((chip.dataset.size || "") === "small") {
            chip.classList.add("active");
        }
    });

    renderProducts(products);
}

/* =========================
   QUANTITY
========================= */
function setupQuantityControls() {
    qtyMinusBtn?.addEventListener("click", () => {
        setSelectedQuantity(selectedQuantity - 1);
    });

    qtyPlusBtn?.addEventListener("click", () => {
        setSelectedQuantity(selectedQuantity + 1);
    });

    quantityInput?.addEventListener("input", () => {
        setSelectedQuantity(quantityInput.value);
    });

    quantityInput?.addEventListener("blur", () => {
        setSelectedQuantity(quantityInput.value);
    });
}

/* =========================
   CART
========================= */
function addToCart() {
    if (!currentItem) {
        alert("Select a drink first.");
        return;
    }

    const qty = clampQuantity(selectedQuantity);
    const stockState = getProductStockState(currentItem, selectedSize, qty);

    if (!stockState.available) {
        alert(`${currentItem.name} is currently out of stock for ${prettifySize(selectedSize)}.`);
        return;
    }

    const basePrice = Number(currentItem.price || 0);
    const sizeUpcharge = getSizeUpcharge(selectedSize);
    const addonTotal = selectedAddons.reduce((sum, addon) => sum + Number(addon.price || 0), 0);
    const unitPrice = basePrice + sizeUpcharge + addonTotal;
    const lineTotal = unitPrice * qty;

    const addOnIds = selectedAddons.map(addon => Number(addon.id));
    const signature = cartSignature(currentItem.product_id, selectedSize, addOnIds);

    const existingIndex = cart.findIndex(item => item.signature === signature);

    if (existingIndex >= 0) {
        cart[existingIndex].quantity += qty;
        recomputeCartItemDisplayPrice(cart[existingIndex]);
    } else {
        cart.push({
            signature,
            product_id: Number(currentItem.product_id),
            quantity: qty,
            size: selectedSize || "small",
            add_ons: addOnIds,
            unit_price: Number(unitPrice.toFixed(2)),
            display_name: currentItem.name,
            display_price: Number(lineTotal.toFixed(2)),
            display_addons: selectedAddons.map(addon => addon.name),
            display_size: prettifySize(selectedSize)
        });
    }

    updateCartUI();
    resetSelection();
}

function removeCartItem(index) {
    cart.splice(index, 1);
    updateCartUI();
}

function updateCartItemQuantity(index, delta) {
    const item = cart[index];
    if (!item) return;

    const nextQty = clampQuantity(Number(item.quantity || 1) + Number(delta || 0));

    if (nextQty < 1) {
        removeCartItem(index);
        return;
    }

    item.quantity = nextQty;
    recomputeCartItemDisplayPrice(item);
    updateCartUI();
}

function setCartItemQuantity(index, value) {
    const item = cart[index];
    if (!item) return;

    item.quantity = clampQuantity(value);
    recomputeCartItemDisplayPrice(item);
    updateCartUI();
}

function updateCartUI() {
    if (!cartList || !totalPrice) return;

    total = cart.reduce((sum, item) => sum + Number(item.display_price || 0), 0);

    if (!cart.length) {
        cartList.innerHTML = `<div class="cart-empty">Cart is empty</div>`;
        totalPrice.textContent = formatPeso(0);
        return;
    }

    cartList.innerHTML = cart.map((item, index) => `
        <div class="cart-item">
            <div>
                <div class="cart-item-name">${escapeHTML(item.display_name)}</div>
                <div class="cart-item-meta">
                    Size: ${escapeHTML(item.display_size || "Small")}<br>
                    Add-ons: ${escapeHTML(item.display_addons.length ? item.display_addons.join(", ") : "No Add-ons")}
                </div>

                <div style="display:flex; align-items:center; gap:8px; margin-top:10px;">
                    <button type="button" class="cart-qty-btn" data-action="minus" data-index="${index}">-</button>
                    <input type="number" class="cart-qty-input" data-index="${index}" min="1" step="1" value="${escapeHTML(item.quantity)}" style="width:70px; text-align:center;">
                    <button type="button" class="cart-qty-btn" data-action="plus" data-index="${index}">+</button>
                </div>
            </div>

            <div style="display:flex; align-items:flex-start; gap:10px;">
                <div class="cart-item-price">${escapeHTML(formatPeso(item.display_price))}</div>
                <i class="fa-solid fa-xmark cart-delete" data-remove-index="${index}"></i>
            </div>
        </div>
    `).join("");

    totalPrice.textContent = formatPeso(total);

    cartList.querySelectorAll(".cart-delete").forEach(btn => {
        btn.addEventListener("click", () => {
            const index = Number(btn.dataset.removeIndex);
            removeCartItem(index);
        });
    });

    cartList.querySelectorAll(".cart-qty-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const index = Number(btn.dataset.index);
            const action = btn.dataset.action;
            updateCartItemQuantity(index, action === "plus" ? 1 : -1);
        });
    });

    cartList.querySelectorAll(".cart-qty-input").forEach(input => {
        input.addEventListener("input", () => {
            const index = Number(input.dataset.index);
            setCartItemQuantity(index, input.value);
        });

        input.addEventListener("blur", () => {
            const index = Number(input.dataset.index);
            setCartItemQuantity(index, input.value);
        });
    });
}

/* =========================
   CHECKOUT
========================= */
function buildCashierOrderPayload() {
    const promoCode = normalizePromoCode(promoCodeInput?.value || "");
    const customerName = customerNameInput?.value?.trim() || linkedCustomer?.full_name || "Walk-in Customer";

    if (promoCode && !linkedCustomer?.user_id) {
        throw new Error("Promo requires a linked TIMSRPAY customer account.");
    }

    return {
        customer_name: customerName,
        user_id: linkedCustomer?.user_id || null,
        payment_method: "cash",
        order_type: "cashier",
        promo_code: promoCode || null,
        items: cart.map(item => ({
            product_id: Number(item.product_id),
            quantity: Number(item.quantity || 1),
            size: normalizeSizeName(item.size || "small"),
            add_ons: Array.isArray(item.add_ons) ? item.add_ons : []
        }))
    };
}

async function proceedToPayment() {
    if (!cart.length) {
        alert("Cart is empty.");
        return;
    }

    checkoutBtn.disabled = true;
    checkoutBtn.textContent = "Processing...";

    try {
        const payload = buildCashierOrderPayload();

        const result = await fetchJSON(`${getAPIURL()}/orders/cashier`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        localStorage.setItem("staff_checkout_order", JSON.stringify({
            order_id: result.order_id,
            customer_name: payload.customer_name,
            user_id: payload.user_id,
            linked_customer_email: linkedCustomer?.email || null,
            linked_customer_name: linkedCustomer?.full_name || null,
            linked_customer_wallet_code: linkedCustomer?.wallet_code || null,
            promo_code: payload.promo_code,
            promo_locked_user_id: payload.promo_code ? linkedCustomer?.user_id || null : null,
            promo_locked_email: payload.promo_code ? linkedCustomer?.email || null : null,
            promo_locked_name: payload.promo_code ? linkedCustomer?.full_name || null : null,
            local_cart: cart,
            total_amount: result.total_amount,
            discount_amount: result.discount_amount || 0,
            promo_code_text: result.promo_code_text || null
        }));

        cart = [];
        updateCartUI();
        resetSelection();

        window.location.href = "paymentstaff.html";
    } catch (error) {
        console.error("Failed to create cashier order:", error);
        alert(error.message || "Failed to create order.");
    } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = "Proceed to Payment";
    }
}

/* =========================
   BUTTONS
========================= */
function setupButtons() {
    addToCartBtn?.addEventListener("click", addToCart);
    checkoutBtn?.addEventListener("click", proceedToPayment);
}

/* =========================
   INIT
========================= */
async function initMenuStaffPage() {
    try {
        setupLogout();
        setupButtons();
        setupQuantityControls();
        setupCustomerLookup();
        setupPromoWatcher();

        updateCartUI();
        setSelectedQuantity(1);

        await Promise.all([
            loadMenuProducts(),
            loadAllAddOns(),
            loadInventoryMaster()
        ]);

        await loadProductRecipes();
        renderProducts(products);
        updateLinkedCustomerUX();
    } catch (error) {
        console.error("initMenuStaffPage error:", error);
        showMenuMessage(`JS Error: ${error.message}`);
        showAddonMessage("JS Error");
        showSizeMessage("JS Error");
    }
}

document.addEventListener("DOMContentLoaded", initMenuStaffPage);