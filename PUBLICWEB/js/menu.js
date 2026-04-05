const MENU_STORAGE_KEY = "public_menu_cart";
const CHECKOUT_DRAFT_KEY = "public_online_order_draft";
const APPLIED_PROMO_STORAGE_KEY = "public_applied_promo";
const PROMO_QUERY_PARAM = "promo";

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
let appliedPromo = null;

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

function getCartSubtotal() {
  return Number(
    cart.reduce((sum, item) => sum + Number(item.total || 0), 0).toFixed(2),
  );
}

function parseDateSafe(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPromoDateValid(promo) {
  const now = new Date();
  const validFrom = parseDateSafe(promo?.valid_from);
  const validUntil = parseDateSafe(promo?.valid_until);

  if (validFrom && now < validFrom) return false;
  if (validUntil && now > validUntil) return false;
  return true;
}

function calculatePromoDiscount(subtotal, promo) {
  const safeSubtotal = Number(subtotal || 0);
  if (!promo || safeSubtotal <= 0) return 0;

  const discountType = String(promo.discount_type || "").toLowerCase();
  const discountValue = Number(promo.discount_value || 0);

  let discount = 0;

  if (discountType === "percent") {
    discount = safeSubtotal * (discountValue / 100);
  } else if (discountType === "fixed") {
    discount = discountValue;
  }

  if (discount > safeSubtotal) discount = safeSubtotal;

  return Number(discount.toFixed(2));
}

function getFinalTotal() {
  const subtotal = getCartSubtotal();
  const discount = calculatePromoDiscount(subtotal, appliedPromo);
  return Number((subtotal - discount).toFixed(2));
}

function saveAppliedPromo() {
  if (!appliedPromo) {
    localStorage.removeItem(APPLIED_PROMO_STORAGE_KEY);
    return;
  }

  localStorage.setItem(APPLIED_PROMO_STORAGE_KEY, JSON.stringify(appliedPromo));
}

function loadAppliedPromo() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(APPLIED_PROMO_STORAGE_KEY) || "null",
    );
    appliedPromo = saved && typeof saved === "object" ? saved : null;
  } catch {
    appliedPromo = null;
  }
}

function setPromoStatus(message = "", type = "neutral") {
  const statusEl = document.getElementById("promoStatus");
  if (!statusEl) return;

  statusEl.textContent = message;

  if (type === "success") {
    statusEl.style.color = "#10b981";
  } else if (type === "error") {
    statusEl.style.color = "#ff4d6d";
  } else {
    statusEl.style.color = "var(--text-muted)";
  }
}

function updatePromoUI() {
  const input = document.getElementById("promoCodeInput");
  const badge = document.getElementById("appliedPromoBadge");
  const discountRow = document.getElementById("promoDiscountRow");
  const discountAmount = document.getElementById("promoDiscountAmount");
  const subtotalAmount = document.getElementById("cartSubtotalAmount");
  const grandTotalEl = document.getElementById("cartGrandTotal");

  const subtotal = getCartSubtotal();
  const discount = calculatePromoDiscount(subtotal, appliedPromo);
  const finalTotal = Number((subtotal - discount).toFixed(2));

  if (subtotalAmount) subtotalAmount.textContent = formatPeso(subtotal);
  if (grandTotalEl) grandTotalEl.textContent = formatPeso(finalTotal);

  if (discount > 0 && appliedPromo) {
    if (discountRow) discountRow.style.display = "flex";
    if (discountAmount) discountAmount.textContent = `- ${formatPeso(discount)}`;

    if (badge) {
      badge.textContent = appliedPromo.code || "PROMO";
      badge.classList.remove("hidden");
    }

    if (input && appliedPromo.code) {
      input.value = String(appliedPromo.code).toUpperCase();
    }
  } else {
    if (discountRow) discountRow.style.display = "none";
    if (discountAmount) discountAmount.textContent = "- ₱0.00";

    if (badge) {
      badge.textContent = "";
      badge.classList.add("hidden");
    }
  }

  saveAppliedPromo();
  syncCheckoutDraft();
}

function clearAppliedPromo({ clearInput = false, silent = false } = {}) {
  appliedPromo = null;
  saveAppliedPromo();
  updatePromoUI();

  if (clearInput) {
    const input = document.getElementById("promoCodeInput");
    if (input) input.value = "";
  }

  if (!silent) {
    setPromoStatus("Promo removed.", "neutral");
  }
}

function getPromoCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get(PROMO_QUERY_PARAM) || "")
    .trim()
    .toUpperCase();
}

function cleanPromoQueryFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PROMO_QUERY_PARAM)) return;
  url.searchParams.delete(PROMO_QUERY_PARAM);
  window.history.replaceState({}, "", url.toString());
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
  const subtotal = getCartSubtotal();
  const discount = calculatePromoDiscount(subtotal, appliedPromo);
  const finalTotal = Number((subtotal - discount).toFixed(2));

  const payload = {
    order_type: "online",
    items: cart.map((item) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.qty),
      size: item.size,
      add_ons: Array.isArray(item.add_on_ids) ? item.add_on_ids : [],
      notes: item.notes || null,
    })),
    promo_code: appliedPromo?.code || null,
    promo_meta: appliedPromo
      ? {
          promo_id: Number(appliedPromo.promo_id || 0),
          code: appliedPromo.code || null,
          title: appliedPromo.title || null,
          discount_type: appliedPromo.discount_type || null,
          discount_value: Number(appliedPromo.discount_value || 0),
          min_order_amount: Number(appliedPromo.min_order_amount || 0),
        }
      : null,
    subtotal_preview: subtotal,
    discount_preview: discount,
    total_preview: finalTotal,
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
            <div class="product-card" data-product-id="${Number(product.product_id)}" data-category="${escapeHtml(categorySlug)}" data-title="${escapeHtml((product.name || "").toLowerCase())}" onclick="openProductById(${Number(product.product_id)})">
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
    points_per_unit: Number(currentProduct.points_per_unit || 0),
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

    if (appliedPromo) {
      clearAppliedPromo({ silent: true });
    } else {
      updatePromoUI();
    }
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

  if (
    appliedPromo &&
    Number(appliedPromo.min_order_amount || 0) > getCartSubtotal()
  ) {
    const needed = Number(appliedPromo.min_order_amount || 0).toFixed(2);
    clearAppliedPromo({ silent: true });
    setPromoStatus(
      `Promo removed. Minimum order for this code is ₱${needed}.`,
      "error",
    );
  } else {
    updatePromoUI();
  }
}

async function applyPromoCode(autoCode = "") {
  const input = document.getElementById("promoCodeInput");
  const applyBtn = document.getElementById("applyPromoBtn");

  const code = String(autoCode || input?.value || "")
    .trim()
    .toUpperCase();

  if (!code) {
    clearAppliedPromo({ clearInput: false, silent: true });
    setPromoStatus("Enter a promo code first.", "error");
    return;
  }

  const subtotal = getCartSubtotal();
  if (subtotal <= 0) {
    setPromoStatus("Add at least one item before applying a promo code.", "error");
    return;
  }

  try {
    if (applyBtn) applyBtn.disabled = true;
    setPromoStatus("Checking promo code...", "neutral");

    const { res, data } = await apiGet("/promo/available/me");

    if (!res.ok) {
      throw new Error(data?.detail || "Failed to fetch available promos.");
    }

    const promos = Array.isArray(data?.data) ? data.data : [];
    const match = promos.find(
      (item) => String(item.code || "").trim().toUpperCase() === code,
    );

    if (!match) {
      clearAppliedPromo({ silent: true });
      setPromoStatus("Promo code not found or not available for your account.", "error");
      return;
    }

    if (!Boolean(match.is_active)) {
      clearAppliedPromo({ silent: true });
      setPromoStatus("This promo code is currently inactive.", "error");
      return;
    }

    if (Boolean(match.already_used_by_me)) {
      clearAppliedPromo({ silent: true });
      setPromoStatus("You already used this promo code.", "error");
      return;
    }

    if (!isPromoDateValid(match)) {
      clearAppliedPromo({ silent: true });
      setPromoStatus("This promo code is expired or not yet active.", "error");
      return;
    }

    const minOrderAmount = Number(match.min_order_amount || 0);
    if (subtotal < minOrderAmount) {
      clearAppliedPromo({ silent: true });
      setPromoStatus(
        `Minimum order for this promo is ${formatPeso(minOrderAmount)}.`,
        "error",
      );
      return;
    }

    appliedPromo = {
      promo_id: Number(match.promo_id || 0),
      title: match.title || match.code || "Promo",
      description: match.description || "",
      code: String(match.code || "").toUpperCase(),
      discount_type: match.discount_type || "",
      discount_value: Number(match.discount_value || 0),
      value_label: match.value_label || "",
      min_order_amount: minOrderAmount,
      usage_limit: match.usage_limit,
      usage_count: Number(match.usage_count || 0),
      per_user_limit: match.per_user_limit,
      valid_from: match.valid_from || null,
      valid_until: match.valid_until || null,
      created_at: match.created_at || null,
    };

    saveAppliedPromo();
    updatePromoUI();

    const discount = calculatePromoDiscount(subtotal, appliedPromo);
    setPromoStatus(
      `${appliedPromo.code} applied successfully. You saved ${formatPeso(discount)}.`,
      "success",
    );

    if (input) input.value = appliedPromo.code;
    cleanPromoQueryFromUrl();
  } catch (error) {
    console.error("applyPromoCode error:", error);
    clearAppliedPromo({ silent: true });
    setPromoStatus(
      error?.message || "Failed to validate promo code.",
      "error",
    );
  } finally {
    if (applyBtn) applyBtn.disabled = false;
  }
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

function bindPromoInputEvents() {
  const input = document.getElementById("promoCodeInput");
  if (!input) return;

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyPromoCode();
    }
  });

  input.addEventListener("input", () => {
    input.value = input.value.toUpperCase();
  });
}

async function initPromoState() {
  loadAppliedPromo();
  updatePromoUI();

  const input = document.getElementById("promoCodeInput");
  const codeFromUrl = getPromoCodeFromUrl();
  const storedCode = appliedPromo?.code || "";

  const initialCode = codeFromUrl || storedCode;

  if (input && initialCode) {
    input.value = initialCode.toUpperCase();
    await applyPromoCode(initialCode);
  } else {
    updatePromoUI();
  }
}

async function initMenuPage() {
  const isAuthed = await checkCustomerAuth();
  if (!isAuthed) return;

  loadCart();
  updateCartBadge();
  renderCart();
  bindPromoInputEvents();
  await initPromoState();
  await loadMenuProducts();
  focusProductFromUrl();
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
window.applyPromoCode = applyPromoCode;
function getProductIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("product");
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function focusProductFromUrl() {
  const productId = getProductIdFromUrl();
  if (!productId) return;

  const product = allProducts.find(
    (item) => Number(item.product_id) === Number(productId)
  );
  if (!product) return;

  const card = document.querySelector(
    `.product-card[data-product-id="${productId}"]`
  );

  if (card) {
    card.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    card.style.boxShadow = "0 0 0 3px #ffc244";

    setTimeout(() => {
      card.style.boxShadow = "";
    }, 1800);
  }

  setTimeout(() => {
    openProductById(productId);
  }, 450);
}
document.addEventListener("DOMContentLoaded", async () => {
  await initMenuPage();
  const params = new URLSearchParams(window.location.search);
  const productId = params.get("product");

  if (productId) {
    const pid = Number(productId);

    const target = document.querySelector(
      `.product-card[onclick*="${pid}"]`
    );

    if (target) {
      setTimeout(() => {
        target.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        // optional highlight
        target.style.boxShadow = "0 0 0 3px #ffc244";

        setTimeout(() => {
          target.style.boxShadow = "";
        }, 2000);

      }, 400);
    }

    // optional: auto open modal
    setTimeout(() => {
      openProductById(pid);
    }, 600);
  }
});