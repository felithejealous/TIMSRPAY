const MENU_STORAGE_KEY = "public_menu_cart";
const CHECKOUT_DRAFT_KEY = "public_online_order_draft";

const SIZE_OPTIONS = {
  small: { label: "Small", addPrice: 0 },
  medium: { label: "Medium", addPrice: 10 },
  large: { label: "Large", addPrice: 20 },
};

const MENU_IMAGE_MAP = {
  "classic teo d' mango": "mango.png",
  "classic teo d mango": "mango.png",
  "classic mango bliss": "mango.png",
  "teo d' mango": "mango.png",
  "teo d mango": "mango.png",
  mango: "mango.png",

  "creamy buko slush": "buko2.png",
  buko: "buko2.png",

  "strawberry dream": "berry2.png",
  strawberry: "berry2.png",

  "ube macapuno slush": "ube2.png",
  ube: "ube2.png",

  "summer lychee sunset": "lychee.png",
  lychee: "lychee.png",

  avocado: "avo2.png",
  "avocado supreme": "avo2.png",
};

let activeCategory = "all";
let allProducts = [];
let currentProduct = null;
let cart = [];
let qty = 1;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPeso(value) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

function normalizeCategory(value) {
  return String(value || "others")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function normalizeProductName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getSafeDescription(value) {
  const clean = String(value || "").trim();
  return clean || "Freshly prepared and ready for your next craving.";
}

function resolveUploadedImage(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";

  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return `${API_BASE_URL}${raw}`;
  return raw;
}

function getMenuFallbackImage(productName = "") {
  const normalized = normalizeProductName(productName);
  return MENU_IMAGE_MAP[normalized] || "multilogo.png";
}

function getProductImage(product) {
  const uploaded = resolveUploadedImage(product?.image_url);
  if (uploaded) return uploaded;
  return getMenuFallbackImage(product?.name);
}

function getSelectedSizeValue() {
  return document.querySelector('input[name="size"]:checked')?.value || "small";
}

function getSelectedAddOns() {
  return Array.from(document.querySelectorAll(".addon-check:checked")).map(
    (input) => ({
      add_on_id: Number(input.dataset.addonId),
      name: input.dataset.name,
      price: Number(input.dataset.price || 0),
    }),
  );
}

function saveCart() {
  localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(cart));
  syncCheckoutDraft();
}

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(MENU_STORAGE_KEY) || "[]");
    cart = Array.isArray(saved) ? saved : [];
  } catch {
    cart = [];
  }
}

function syncCheckoutDraft() {
  const payload = {
    order_type: "online",
    items: cart.map((item) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.qty),
      size: item.size,
      add_ons: Array.isArray(item.add_on_ids) ? item.add_on_ids : [],
      notes: item.notes || null,
    })),
    subtotal_preview: Number(
      cart.reduce((sum, item) => sum + Number(item.total || 0), 0).toFixed(2),
    ),
  };

  localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(payload));
}

function updateCartBadge() {
  const badge = document.getElementById("cartCount");
  const btn = document.getElementById("btnGoCheckout");

  const count = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  if (badge) {
    badge.textContent = String(count);
  }

  if (btn) {
    if (count > 0) {
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    } else {
      btn.style.opacity = "0.5";
      btn.style.pointerEvents = "none";
    }
  }
}

function buildFilterChips(products) {
  const filterChips = document.getElementById("filterChips");
  if (!filterChips) return;

  const categories = [
    ...new Set(
      products.map((p) => (p.category_name || "Others").trim()).filter(Boolean),
    ),
  ];

  filterChips.innerHTML = `
        <button class="chip active" type="button" data-category="all">All Items</button>
        ${categories
          .map(
            (cat) => `
            <button class="chip" type="button" data-category="${escapeHtml(normalizeCategory(cat))}">
                ${escapeHtml(cat)}
            </button>
        `,
          )
          .join("")}
    `;

  filterChips.querySelectorAll(".chip").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category || "all";
      filterChips
        .querySelectorAll(".chip")
        .forEach((chip) => chip.classList.remove("active"));
      button.classList.add("active");
      applyFilters();
    });
  });
}

function renderProducts(products) {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  const searchQuery = (document.getElementById("searchInput")?.value || "")
    .trim()
    .toLowerCase();

  const filtered = products.filter((product) => {
    const title = String(product.name || "").toLowerCase();
    const description = String(product.description || "").toLowerCase();
    const categorySlug = normalizeCategory(product.category_name || "others");

    const matchesSearch =
      title.includes(searchQuery) || description.includes(searchQuery);

    const matchesCategory =
      activeCategory === "all" || categorySlug === activeCategory;

    return matchesSearch && matchesCategory;
  });

  const cardsHtml = filtered
    .map((product) => {
      const image = getProductImage(product);
      const categorySlug = normalizeCategory(product.category_name || "others");
      const safeDescription = getSafeDescription(product.description);

      return `
            <div class="product-card" data-category="${escapeHtml(categorySlug)}" data-title="${escapeHtml((product.name || "").toLowerCase())}" onclick="openProductById(${Number(product.product_id)})">
                <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" class="product-img">
                <div class="product-info">
                    <h3>${escapeHtml(product.name)}</h3>
                    <p>${escapeHtml(safeDescription)}</p>
                </div>
                <div class="product-footer">
                    <span class="price">${formatPeso(product.price)}</span>
                    <button class="add-btn" type="button" onclick="event.stopPropagation(); openProductById(${Number(product.product_id)})">Select</button>
                </div>
            </div>
        `;
    })
    .join("");

  grid.innerHTML =
    cardsHtml +
    `
        <div class="empty-state" id="emptyState" style="display:${filtered.length === 0 ? "block" : "none"};">
            <i class="fa-solid fa-mug-hot"></i>
            <h3>No Drinks Found</h3>
            <p>Try searching for a different flavor or changing your category filter.</p>
        </div>
    `;
}

function applyFilters() {
  renderProducts(allProducts);
}

function searchMenu() {
  applyFilters();
}

function filterMenu(category, btnElement) {
  activeCategory = category || "all";

  document
    .querySelectorAll(".chip")
    .forEach((chip) => chip.classList.remove("active"));
  if (btnElement) {
    btnElement.classList.add("active");
  }

  applyFilters();
}

async function loadMenuProducts() {
  const grid = document.getElementById("productGrid");
  if (grid) {
    grid.innerHTML = `
    <div class="empty-state" id="emptyState" style="display:block;">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <h3>Loading Menu</h3>
        <p>Please wait while we fetch available products.</p>
    </div>
`;
  }

  try {
    const { res, data } = await apiGet("/products/menu");

    if (!res.ok) {
      throw new Error(data?.detail || "Failed to load menu.");
    }

    const rows = Array.isArray(data?.data) ? data.data : [];
    allProducts = rows;

    buildFilterChips(allProducts);
    renderProducts(allProducts);
  } catch (error) {
    console.error("loadMenuProducts error:", error);

    if (grid) {
      grid.innerHTML = `
                <div class="empty-state" style="display:block;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <h3>Failed to Load Menu</h3>
                    <p>${escapeHtml(error.message || "Something went wrong.")}</p>
                </div>
            `;
    }
  }
}

function renderModalAddOns(addOns) {
  const container = document.getElementById("modalAddonList");
  if (!container) return;

  if (!Array.isArray(addOns) || addOns.length === 0) {
    container.innerHTML = `
            <p style="font-size:13px; color:var(--text-muted);">No add-ons available for this item.</p>
        `;
    return;
  }

  container.innerHTML = addOns
    .map(
      (addOn) => `
        <label>
            <input
                type="checkbox"
                class="addon-check"
                data-addon-id="${Number(addOn.add_on_id)}"
                data-name="${escapeHtml(addOn.name)}"
                data-price="${Number(addOn.price || 0)}"
                onchange="updateModalPrice()"
            >
            <div class="addon-item">
                <span>${escapeHtml(addOn.name)}</span>
                <small>+${formatPeso(addOn.price)}</small>
            </div>
        </label>
    `,
    )
    .join("");
}

function openProductById(productId) {
  const product = allProducts.find(
    (item) => Number(item.product_id) === Number(productId),
  );
  if (!product) return;

  currentProduct = product;
  qty = 1;

  const titleEl = document.getElementById("modalTitle");
  const descEl = document.getElementById("modalDesc");
  const imgEl = document.getElementById("modalImg");
  const qtyEl = document.getElementById("modalQty");
  const notesEl = document.getElementById("modalNotes");

  if (titleEl) titleEl.textContent = product.name || "Product";
  if (descEl) descEl.textContent = getSafeDescription(product.description);
  if (imgEl) imgEl.src = getProductImage(product);
  if (qtyEl) qtyEl.textContent = "1";
  if (notesEl) notesEl.value = "";

  const sizeSmall = document.querySelector('input[name="size"][value="small"]');
  if (sizeSmall) sizeSmall.checked = true;

  renderModalAddOns(product.add_ons || []);
  updateModalPrice();

  document.getElementById("mainOverlay")?.classList.add("active");
  document.getElementById("cartPanel")?.classList.remove("active");
  document.getElementById("accountPanel")?.classList.remove("active");
  document.getElementById("productModal")?.classList.add("active");
  document.body.style.overflow = "hidden";
}

function changeQty(amount) {
  qty += Number(amount || 0);
  if (qty < 1) qty = 1;

  const qtyEl = document.getElementById("modalQty");
  if (qtyEl) qtyEl.textContent = String(qty);

  updateModalPrice();
}

function updateModalPrice() {
  if (!currentProduct) return;

  const sizeValue = getSelectedSizeValue();
  const sizeMeta = SIZE_OPTIONS[sizeValue] || SIZE_OPTIONS.small;
  const selectedAddOns = getSelectedAddOns();

  const addOnsTotal = selectedAddOns.reduce(
    (sum, item) => sum + Number(item.price || 0),
    0,
  );
  const unitPrice =
    Number(currentProduct.price || 0) +
    Number(sizeMeta.addPrice || 0) +
    addOnsTotal;
  const total = unitPrice * qty;

  const totalEl = document.getElementById("modalTotal");
  if (totalEl) {
    totalEl.textContent = formatPeso(total);
  }
}

function addToCartExecute() {
  if (!currentProduct) return;

  const sizeValue = getSelectedSizeValue();
  const sizeMeta = SIZE_OPTIONS[sizeValue] || SIZE_OPTIONS.small;
  const selectedAddOns = getSelectedAddOns();
  const notes = (document.getElementById("modalNotes")?.value || "").trim();

  const addOnsTotal = selectedAddOns.reduce(
    (sum, item) => sum + Number(item.price || 0),
    0,
  );
  const unitPrice =
    Number(currentProduct.price || 0) +
    Number(sizeMeta.addPrice || 0) +
    addOnsTotal;
  const total = unitPrice * qty;

  cart.push({
    cart_item_id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    product_id: Number(currentProduct.product_id),
    title: currentProduct.name,
    image_url: getProductImage(currentProduct),
    base_price: Number(currentProduct.price || 0),
    size: sizeValue,
    size_label: sizeMeta.label,
    size_price: Number(sizeMeta.addPrice || 0),
    add_ons: selectedAddOns,
    add_on_ids: selectedAddOns.map((item) => Number(item.add_on_id)),
    notes,
    qty: Number(qty),
    unit_price: Number(unitPrice.toFixed(2)),
    total: Number(total.toFixed(2)),
  });

  saveCart();
  updateCartBadge();
  renderCart();
  closeAll();

  setTimeout(() => {
    openCart();
  }, 180);
}

function removeCartItem(cartItemId) {
  cart = cart.filter((item) => item.cart_item_id !== cartItemId);
  saveCart();
  updateCartBadge();
  renderCart();
}

function renderCart() {
  const list = document.getElementById("cartItemsList");
  const grandTotalEl = document.getElementById("cartGrandTotal");
  if (!list || !grandTotalEl) return;

  if (!cart.length) {
    list.innerHTML = `<p style="text-align:center; color:var(--text-muted); margin-top:50px;">Your cart is empty.</p>`;
    grandTotalEl.textContent = "₱0.00";
    return;
  }

  let grandTotal = 0;

  list.innerHTML = cart
    .map((item) => {
      grandTotal += Number(item.total || 0);

      const addOnsText =
        Array.isArray(item.add_ons) && item.add_ons.length
          ? ` • +${item.add_ons.map((addon) => addon.name).join(", ")}`
          : "";

      const notesText = item.notes
        ? `<p style="margin-top:6px; color:var(--mango);">Note: ${escapeHtml(item.notes)}</p>`
        : "";

      return `
            <div class="cart-item">
                <div style="max-width:75%;">
                    <h4>${Number(item.qty)}x ${escapeHtml(item.title)}</h4>
                    <p>${escapeHtml(item.size_label)}${escapeHtml(addOnsText)}</p>
                    ${notesText}
                    <button
                        type="button"
                        onclick="removeCartItem('${escapeHtml(item.cart_item_id)}')"
                        style="margin-top:10px; background:none; border:none; color:var(--danger); font-size:12px; font-weight:800; cursor:pointer; padding:0;"
                    >
                        Remove
                    </button>
                </div>
                <div class="cart-item-price">${formatPeso(item.total)}</div>
            </div>
        `;
    })
    .join("");

  grandTotalEl.textContent = formatPeso(grandTotal);
}

function openCart() {
  document.getElementById("mainOverlay")?.classList.add("active");
  document.getElementById("productModal")?.classList.remove("active");
  document.getElementById("accountPanel")?.classList.remove("active");
  document.getElementById("cartPanel")?.classList.add("active");
  document.body.style.overflow = "hidden";
  renderCart();
}

function closeAll() {
  document.getElementById("productModal")?.classList.remove("active");
  document.getElementById("cartPanel")?.classList.remove("active");
  document.getElementById("mainOverlay")?.classList.remove("active");
  document.body.style.overflow = "auto";
}

function proceedToCheckout() {
  if (!cart.length) return;

  syncCheckoutDraft();
  window.location.href = "payment.html";
}

function closeAllPanels() {
  document.getElementById("productModal")?.classList.remove("active");
  document.getElementById("cartPanel")?.classList.remove("active");
  document.getElementById("accountPanel")?.classList.remove("active");
  document.getElementById("mainOverlay")?.classList.remove("active");
  document.body.style.overflow = "auto";
}

async function initMenuPage() {
  const isAuthed = await checkCustomerAuth();
  if (!isAuthed) return;

  loadCart();
  updateCartBadge();
  renderCart();
  syncCheckoutDraft();
  await loadMenuProducts();
}

window.searchMenu = searchMenu;
window.filterMenu = filterMenu;
window.openProductById = openProductById;
window.changeQty = changeQty;
window.updateModalPrice = updateModalPrice;
window.addToCartExecute = addToCartExecute;
window.openCart = openCart;
window.closeAll = closeAll;
window.closeAllPanels = closeAllPanels;
window.proceedToCheckout = proceedToCheckout;
window.removeCartItem = removeCartItem;

document.addEventListener("DOMContentLoaded", initMenuPage);