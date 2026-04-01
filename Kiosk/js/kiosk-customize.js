const API_URL = window.API_URL || "http://127.0.0.1:8000";

let currentProduct = null;
let quantity = 1;
let editIndex = null;
let publicAddons = [];

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

const kb = document.getElementById("kb");
const mainNotes = document.getElementById("orderNotes");
const floatingNotes = document.getElementById("floatingNotes");
const noteOverlay = document.getElementById("noteOverlay");
const productImg = document.getElementById("productImg");
const productTitle = document.getElementById("productTitle");
const productDesc = document.getElementById("productDesc");
const qtyDisplay = document.getElementById("qtyDisplay");
const totalDisplay = document.getElementById("totalDisplay");
const addToCartBtn = document.getElementById("addToCartBtn");
const backBtn = document.getElementById("backBtn");
const addonsGroup = document.getElementById("addonsGroup");

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

function getFallbackImage(productName) {
    return PRODUCT_IMAGE_MAP[normalizeName(productName)] || "../Images/mangga.png";
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

function getTray() {
    try {
        return JSON.parse(localStorage.getItem("teo_tray")) || [];
    } catch {
        return [];
    }
}

function saveTray(tray) {
    localStorage.setItem("teo_tray", JSON.stringify(tray));
}

function buildKeyboard() {
    kb.innerHTML = "";

    "QWERTYUIOPASDFGHJKLZXCVBNM".split("").forEach(char => {
        const key = document.createElement("div");
        key.className = "key";
        key.innerText = char;
        key.onclick = () => {
            floatingNotes.value += char;
        };
        kb.appendChild(key);
    });

    const del = document.createElement("div");
    del.className = "key wide";
    del.innerText = "DEL";
    del.onclick = () => {
        floatingNotes.value = floatingNotes.value.slice(0, -1);
    };
    kb.appendChild(del);

    const space = document.createElement("div");
    space.className = "key space";
    space.innerText = "SPACE";
    space.onclick = () => {
        floatingNotes.value += " ";
    };
    kb.appendChild(space);

    const done = document.createElement("div");
    done.className = "key close";
    done.innerText = "DONE";
    done.onclick = closeNoteFocus;
    kb.appendChild(done);
}

function openNoteFocus() {
    document.body.classList.add("is-typing");
    noteOverlay.classList.add("active");
    floatingNotes.value = mainNotes.value;
    kb.classList.add("show");
}

function closeNoteFocus() {
    document.body.classList.remove("is-typing");
    noteOverlay.classList.remove("active");
    mainNotes.value = floatingNotes.value;
    kb.classList.remove("show");
}

function setupNoteInput() {
    mainNotes?.addEventListener("click", openNoteFocus);
}

function setActiveButton(groupSelector, clickedButton) {
    const group = document.querySelector(groupSelector);
    if (!group) return;

    group.querySelectorAll(".pill-btn").forEach(btn => btn.classList.remove("active"));
    clickedButton.classList.add("active");
}

function setupSizeButtons() {
    document.querySelectorAll("#sizeGroup .pill-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            setActiveButton("#sizeGroup", btn);
            updatePrice();
        });
    });
}

function setupAddonCheckboxes() {
    document.querySelectorAll("#addonsGroup input").forEach(input => {
        input.addEventListener("change", function () {
            this.parentElement.classList.toggle("active", this.checked);
            updatePrice();
        });
    });
}

function adjustQty(delta) {
    quantity = Math.max(1, quantity + delta);
    qtyDisplay.innerText = quantity;
    updatePrice();
}

function setupQtyButtons() {
    document.getElementById("qtyMinusBtn")?.addEventListener("click", () => adjustQty(-1));
    document.getElementById("qtyPlusBtn")?.addEventListener("click", () => adjustQty(1));
}

function renderAddons(selectedAddonIds = []) {
    if (!addonsGroup) return;

    if (!publicAddons.length) {
        addonsGroup.innerHTML = `
            <div style="grid-column: 1 / -1; color:#5d4037; opacity:0.7; font-weight:700; text-align:center; padding:10px 0;">
                No add-ons available
            </div>
        `;
        return;
    }

    addonsGroup.innerHTML = publicAddons.map(addon => {
        const isChecked = selectedAddonIds.includes(Number(addon.add_on_id));
        return `
            <label class="check-pill ${isChecked ? "active" : ""}">
                <span>${escapeHTML(addon.name)}</span>
                <span>+₱${Number(addon.price || 0).toFixed(0)}</span>
                <input
                    type="checkbox"
                    data-id="${Number(addon.add_on_id)}"
                    data-val="${escapeHTML(addon.name)}"
                    data-price="${Number(addon.price || 0)}"
                    ${isChecked ? "checked" : ""}
                >
            </label>
        `;
    }).join("");

    setupAddonCheckboxes();
}

function updatePrice() {
    if (!currentProduct) return;

    const activeSize = document.querySelector("#sizeGroup .pill-btn.active");
    const sizePrice = parseInt(activeSize?.dataset.price || "0", 10);

    let total = Number(currentProduct.price || 0) + sizePrice;

    document.querySelectorAll("#addonsGroup input:checked").forEach(addon => {
        total += parseInt(addon.dataset.price || "0", 10);
    });

    totalDisplay.innerText = `₱${(total * quantity).toFixed(2)}`;
}

async function fetchPublicAddons() {
    const response = await fetchJSON(`${API_URL}/products/add-ons/public`);
    publicAddons = Array.isArray(response?.data) ? response.data : [];
}

async function fetchProductDetail(productId) {
    const response = await fetchJSON(`${API_URL}/products/${productId}`);

    currentProduct = {
        id: Number(response.product_id),
        name: response.name || "Unnamed Product",
        price: Number(response.price || 0),
        desc: response.description || "Tailor your mango experience below.",
        img: response.image_url || getFallbackImage(response.name),
        add_ons: Array.isArray(response.add_ons) ? response.add_ons : []
    };
}

function applyProductToUI() {
    if (!currentProduct) return;

    productTitle.innerText = currentProduct.name || "Unnamed Product";
    productDesc.innerText = currentProduct.desc || "Tailor your mango experience below.";
    productImg.src = currentProduct.img || "";
    productImg.alt = currentProduct.name || "Drink";
}

function loadEditState(itemToEdit) {
    if (!itemToEdit) return;

    addToCartBtn.innerText = "Update Tray";
    quantity = Number(itemToEdit.qty || 1);
    qtyDisplay.innerText = quantity;
    mainNotes.value = itemToEdit.notes || "";

    document.querySelectorAll("#sizeGroup .pill-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.val === itemToEdit.size);
    });

    renderAddons(Array.isArray(itemToEdit.addOnIds) ? itemToEdit.addOnIds : []);
    updatePrice();
}

async function loadProductData() {
    const urlParams = new URLSearchParams(window.location.search);
    const tray = getTray();
    const productId = Number(urlParams.get("id"));
    const editIdxParam = urlParams.get("editIndex");

    if (!productId) {
        alert("No product selected.");
        window.location.href = "menu.html";
        return;
    }

    if (editIdxParam !== null) {
        editIndex = parseInt(editIdxParam, 10);
    }

    await fetchPublicAddons();
    await fetchProductDetail(productId);

    applyProductToUI();

    if (editIndex !== null && tray[editIndex]) {
        loadEditState(tray[editIndex]);
    } else {
        renderAddons([]);
        updatePrice();
    }
}

function buildTrayItem(tray) {
    const activeSize = document.querySelector("#sizeGroup .pill-btn.active");
    const size = activeSize?.dataset.val || "Small";

    const selectedAddonInputs = Array.from(document.querySelectorAll("#addonsGroup input:checked"));
    const toppings = selectedAddonInputs.map(input => input.dataset.val);
    const addOnIds = selectedAddonInputs.map(input => Number(input.dataset.id));

    let unitPrice = Number(currentProduct.price || 0)
        + parseInt(activeSize?.dataset.price || "0", 10);

    selectedAddonInputs.forEach(input => {
        unitPrice += parseInt(input.dataset.price || "0", 10);
    });

    return {
        id: editIndex !== null && tray[editIndex] ? tray[editIndex].id : Date.now(),
        productId: currentProduct.id,
        name: currentProduct.name,
        img: currentProduct.img,
        desc: currentProduct.desc || "",
        basePrice: Number(currentProduct.price || 0),
        price: unitPrice,
        qty: quantity,
        size: size,
        toppings: toppings,
        addOnIds: addOnIds,
        notes: String(mainNotes.value || "").trim().slice(0, 500)
    };
}

function handleAddToTray() {
    const tray = getTray();
    const newItem = buildTrayItem(tray);

    if (editIndex !== null && tray[editIndex]) {
        tray[editIndex] = newItem;
    } else {
        tray.push(newItem);
    }

    saveTray(tray);
    window.location.href = "menu.html";
}

function setupButtons() {
    addToCartBtn?.addEventListener("click", handleAddToTray);
    backBtn?.addEventListener("click", () => {
        window.location.href = "menu.html";
    });
}

async function initCustomizePage() {
    try {
        buildKeyboard();
        setupNoteInput();
        setupSizeButtons();
        setupQtyButtons();
        setupButtons();
        await loadProductData();
    } catch (error) {
        console.error("Failed to initialize customize page:", error);
        alert(error.message || "Failed to load product customization.");
        window.location.href = "menu.html";
    }
}

window.addEventListener("DOMContentLoaded", initCustomizePage);