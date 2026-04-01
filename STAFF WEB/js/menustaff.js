const menuGrid = document.getElementById("menuGrid");
const selectedItemDisplay = document.getElementById("selectedItemDisplay");
const sizeOptions = document.getElementById("sizeOptions");
const addonOptions = document.getElementById("addonOptions");
const addToCartBtn = document.getElementById("addToCartBtn");
const cartList = document.getElementById("cartList");
const totalPrice = document.getElementById("totalPrice");
const checkoutBtn = document.getElementById("checkoutBtn");
const customerNameInput = document.getElementById("customerNameInput");
const promoCodeInput = document.getElementById("promoCodeInput");
const quantityInput = document.getElementById("quantityInput");
const qtyMinusBtn = document.getElementById("qtyMinusBtn");
const qtyPlusBtn = document.getElementById("qtyPlusBtn");

let products = [];
let addons = [];
let sizeAddons = [];
let inventoryItems = [];
let recipeMap = new Map();

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
    } catch (error) {
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

    addonOptions.querySelectorAll(".option-chip").forEach(chip => {
        chip.classList.remove("active");
    });

    if (sizeOptions) {
        sizeOptions.querySelectorAll(".option-chip").forEach(chip => {
            chip.classList.remove("active");
            if ((chip.dataset.size || "") === "small") {
                chip.classList.add("active");
            }
        });
    }

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
        cart[existingIndex].display_price = Number(cart[existingIndex].unit_price || 0) * Number(cart[existingIndex].quantity || 0);
    } else {
        const cartItem = {
            signature,
            product_id: Number(currentItem.product_id),
            quantity: qty,
            size: selectedSize || "small",
            add_ons: addOnIds,
            unit_price: unitPrice,
            display_name: currentItem.name,
            display_price: lineTotal,
            display_addons: selectedAddons.map(addon => addon.name),
            display_size: prettifySize(selectedSize)
        };

        cart.push(cartItem);
    }

    updateCartUI();
    resetSelection();
}

function removeCartItem(index) {
    cart.splice(index, 1);
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
                <div class="cart-item-name">${escapeHTML(item.display_name)} x${escapeHTML(item.quantity)}</div>
                <div class="cart-item-meta">
                    Size: ${escapeHTML(item.display_size || "Small")}<br>
                    Add-ons: ${escapeHTML(item.display_addons.length ? item.display_addons.join(", ") : "No Add-ons")}
                </div>
            </div>

            <div style="display:flex; align-items:flex-start;">
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
}

/* =========================
   CHECKOUT
========================= */
function buildCashierOrderPayload() {
    const customerName = customerNameInput?.value?.trim() || "Walk-in Customer";
    const promoCode = promoCodeInput?.value?.trim() || null;

    return {
        customer_name: customerName,
        payment_method: "cash",
        order_type: "cashier",
        promo_code: promoCode,
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
            promo_code: payload.promo_code,
            local_cart: cart,
            total_amount: result.total_amount
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
    if (addToCartBtn) {
        addToCartBtn.addEventListener("click", addToCart);
    }

    if (checkoutBtn) {
        checkoutBtn.addEventListener("click", proceedToPayment);
    }
}

/* =========================
   INIT
========================= */
async function initMenuStaffPage() {
    try {
       
        setupLogout();
        setupButtons();
        setupQuantityControls();
        updateCartUI();
        setSelectedQuantity(1);

        await Promise.all([
            loadMenuProducts(),
            loadAllAddOns(),
            loadInventoryMaster()
        ]);

        await loadProductRecipes();
        renderProducts(products);
    } catch (error) {
        console.error("initMenuStaffPage error:", error);
        showMenuMessage(`JS Error: ${error.message}`);
        showAddonMessage("JS Error");
        showSizeMessage("JS Error");
    }
}

document.addEventListener("DOMContentLoaded", initMenuStaffPage);