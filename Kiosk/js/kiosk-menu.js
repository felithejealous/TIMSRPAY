const API_URL = window.API_URL || "http://127.0.0.1:8000";
let tray = JSON.parse(localStorage.getItem("teo_tray")) || [];
let products = [];

const PRODUCT_IMAGE_MAP = {
    "classic mango": "../Images/mangga.png",
    "strawberry": "../Images/strawberry.png",
    "ube overload": "../Images/ube.png",
    "ube": "../Images/ube.png",
    "creamy avocado": "../Images/avocado.png",
    "avocado": "../Images/avocado.png",
    "buko pandan": "../Images/Buko.png",
    "buko": "../Images/Buko.png",
    "sweet lychee": "../Images/lychee.png",
    "lychee": "../Images/lychee.png"
};

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function normalizeName(value) {
    return String(value || "").trim().toLowerCase();
}

function getProductImage(product) {
    const normalizedName = normalizeName(product.name);
    return PRODUCT_IMAGE_MAP[normalizedName] || "../Images/mangga.png";
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

async function loadMenuProducts() {
    const response = await fetchJSON(`${API_URL}/products/menu`);
    const rows = Array.isArray(response?.data) ? response.data : [];

    products = rows.map((item) => ({
        id: Number(item.product_id),
        name: item.name || "Unnamed Product",
        price: Number(item.price || 0),
        desc: item.category_name
            ? `${item.category_name} mango drink selection.`
            : "Fresh mango drink selection.",
        img: getProductImage(item),
        category_name: item.category_name || null,
        points_per_unit: Number(item.points_per_unit || 0),
        is_available: Boolean(item.is_available)
    }));

    localStorage.setItem("teo_kiosk_products_cache", JSON.stringify(products));
}

function renderProducts() {
    const grid = document.getElementById("productGrid");
    if (!grid) return;

    if (!products.length) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align:center; padding:60px 20px; color:#5d4037; font-weight:800; text-transform:uppercase; letter-spacing:2px;">
                No available products right now
            </div>
        `;
        return;
    }

    grid.innerHTML = products.map((p) => `
        <div class="product-card" onclick="goToCustomize(${p.id})">
            <div class="img-wrapper"><img src="${escapeHTML(p.img)}" alt="${escapeHTML(p.name)}"></div>
            <div class="product-info">
                <h3>${escapeHTML(p.name)}</h3>
                <p>${escapeHTML(p.desc)}</p>
                <div class="price-row">
                    <div class="price-tag">₱${Number(p.price).toFixed(2)}</div>
                    <button class="add-btn" type="button">Select</button>
                </div>
            </div>
        </div>
    `).join("");
}

function renderTray() {
    const container = document.getElementById("cartItemsContainer");
    const floatingBar = document.getElementById("floatingBar");

    if (!container || !floatingBar) return;

    if (!tray.length) {
        container.innerHTML = `
            <div style="text-align:center; padding-top:100px; color:#999; font-weight:800; text-transform:uppercase; letter-spacing:2px;">
                Your tray is empty
            </div>
        `;
        floatingBar.style.display = "none";
        updateTotals(0);
        return;
    }

    floatingBar.style.display = "flex";
    container.innerHTML = "";

    let total = 0;

    tray.forEach((item, index) => {
        const qty = Number(item.qty || 0);
        const unitPrice = Number(item.price || 0);
        const subtotal = unitPrice * qty;
        total += subtotal;

        const toppings = Array.isArray(item.toppings) ? item.toppings : [];
        const addonsHtml = toppings.length
            ? toppings.map((t) => `<span class="detail-tag">+ ${escapeHTML(t)}</span>`).join("")
            : "";

        container.innerHTML += `
            <div class="cart-item">
                <div class="item-main-row">
                    <div class="item-thumb"><img src="${escapeHTML(item.img || "../Images/mangga.png")}" alt="${escapeHTML(item.name || "Product")}"></div>
                    <div style="flex:1">
                        <h4 style="font-weight:800; font-size:1.1rem; color:var(--text-dark);">${escapeHTML(item.name || "Unnamed Product")}</h4>
                        <div class="item-details-grid">
                            <span class="detail-tag">${escapeHTML(item.size || "Small")}</span>
                            ${addonsHtml}
                        </div>
                        ${item.notes ? `<div class="item-note">"${escapeHTML(item.notes)}"</div>` : ""}
                    </div>
                    <div style="text-align:right">
                        <div style="font-weight:900; font-size:1.3rem; color:var(--text-dark);">₱${subtotal.toFixed(2)}</div>
                        <div style="font-size:0.7rem; opacity:0.5; font-weight:700;">₱${unitPrice.toFixed(2)} / ea</div>
                    </div>
                </div>
                
                <div class="qty-controls">
                    <button class="qty-btn" onclick="updateQty(${index}, -1, event)">-</button>
                    <span style="font-weight:900; font-size:1.2rem;">${qty}</span>
                    <button class="qty-btn plus" onclick="updateQty(${index}, 1, event)">+</button>
                    <div style="flex:1"></div>
                    <button onclick="updateQty(${index}, -${qty}, event)" style="background:none; border:none; color:#ff4444; font-weight:800; font-size:0.7rem; text-transform:uppercase; cursor:pointer;">Remove</button>
                </div>
            </div>
        `;
    });

    updateTotals(total);
}

function updateQty(index, delta, event) {
    if (event) event.stopPropagation();

    if (!tray[index]) return;

    tray[index].qty = Number(tray[index].qty || 0) + Number(delta || 0);

    if (tray[index].qty <= 0) {
        tray.splice(index, 1);
    }

    localStorage.setItem("teo_tray", JSON.stringify(tray));
    renderTray();
}

function updateTotals(total) {
    const txt = `₱ ${Number(total || 0).toFixed(2)}`;
    const barTotal = document.getElementById("barTotal");
    const popupTotal = document.getElementById("popupTotal");

    if (barTotal) barTotal.innerText = txt;
    if (popupTotal) popupTotal.innerText = txt;
}

function toggleCart() {
    const panel = document.getElementById("cartPanel");
    const overlay = document.getElementById("overlay");
    if (!panel || !overlay) return;

    const isActive = panel.classList.toggle("active");
    overlay.style.display = isActive ? "block" : "none";
}

function goToCustomize(productId) {
    const selectedProduct = products.find((p) => Number(p.id) === Number(productId));
    if (selectedProduct) {
        localStorage.setItem("teo_selected_product", JSON.stringify(selectedProduct));
    }
    window.location.href = `customize.html?id=${encodeURIComponent(productId)}`;
}

async function initKioskMenuPage() {
    try {
        await loadMenuProducts();
        renderProducts();
        renderTray();
    } catch (error) {
        console.error("Failed to load kiosk menu:", error);

        const grid = document.getElementById("productGrid");
        if (grid) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align:center; padding:60px 20px; color:#b91c1c; font-weight:800; text-transform:uppercase; letter-spacing:2px;">
                    Failed to load menu
                </div>
            `;
        }

        renderTray();
    }
}

window.updateQty = updateQty;
window.toggleCart = toggleCart;
window.goToCustomize = goToCustomize;

window.addEventListener("DOMContentLoaded", initKioskMenuPage);