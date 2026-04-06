const MENU_STORAGE_KEY = "public_menu_cart";
const CHECKOUT_DRAFT_KEY = "public_online_order_draft";

let checkoutItems = [];
let currentPayment = "wallet";
let currentUser = null;
let lastOrderResponse = null;

let availablePromos = [];
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

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function prettifyText(value) {
  const clean = String(value || "").trim();
  if (!clean) return "-";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function normalizePromoCode(value) {
  return String(value || "").trim().toUpperCase();
}

function getSavedTheme() {
  return localStorage.getItem("publicweb-theme") || "dark";
}

function applyTheme(theme) {
  document.documentElement.classList.toggle("light-mode", theme === "light");

  const icon = document.querySelector("#themeToggle i");
  if (icon) {
    icon.classList.remove("fa-sun", "fa-moon");
    icon.classList.add(theme === "light" ? "fa-moon" : "fa-sun");
  }
}

function setupThemeToggle() {
  const toggleBtn = document.getElementById("themeToggle");
  if (!toggleBtn) return;

  applyTheme(getSavedTheme());

  toggleBtn.addEventListener("click", () => {
    const current = document.documentElement.classList.contains("light-mode")
      ? "light"
      : "dark";
    const next = current === "light" ? "dark" : "light";
    localStorage.setItem("publicweb-theme", next);
    applyTheme(next);
  });
}

function loadCheckoutItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(MENU_STORAGE_KEY) || "[]");
    checkoutItems = Array.isArray(saved) ? saved : [];
  } catch {
    checkoutItems = [];
  }
}

function saveCheckoutItems() {
  localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(checkoutItems));

  const payload = {
    order_type: "online",
    items: checkoutItems.map((item) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.qty),
      size: item.size,
      add_ons: Array.isArray(item.add_on_ids) ? item.add_on_ids : [],
      notes: item.notes || null,
    })),
    subtotal_preview: Number(getBaseTotal().toFixed(2)),
    promo_code: appliedPromo?.code || null,
  };

  localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(payload));
}

function clearCheckoutStorage() {
  localStorage.removeItem(MENU_STORAGE_KEY);
  localStorage.removeItem(CHECKOUT_DRAFT_KEY);
}

function getBaseTotal() {
  return checkoutItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
}

function getPointsToEarn() {
  return checkoutItems.reduce((sum, item) => {
    const pointsPerUnit = Number(item.points_per_unit || 0);
    return sum + pointsPerUnit * Number(item.qty || 0);
  }, 0);
}

function buildItemDescription(item) {
  const parts = [];

  if (item.size_label) parts.push(item.size_label);

  if (Array.isArray(item.add_ons) && item.add_ons.length) {
    parts.push(`+${item.add_ons.map((addon) => addon.name).join(", ")}`);
  }

  return parts.length ? parts.join(" • ") : "No customizations";
}

function getPromoStatusEl() {
  return document.getElementById("promoStatus");
}

function setPromoStatus(message, type = "neutral") {
  const status = getPromoStatusEl();
  if (!status) return;

  status.textContent = message || "";
  status.classList.remove("neutral", "success", "error");
  status.classList.add(type);
}

function getPromoInputValue() {
  return normalizePromoCode(
    document.getElementById("promoCodeInput")?.value || "",
  );
}

function setPromoInputValue(value) {
  const input = document.getElementById("promoCodeInput");
  if (input) input.value = normalizePromoCode(value);
}

function getPromoFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return normalizePromoCode(params.get("promo"));
}

function isPromoWithinDate(promo) {
  const now = new Date();
  const from = promo?.valid_from ? new Date(promo.valid_from) : null;
  const until = promo?.valid_until ? new Date(promo.valid_until) : null;

  if (from && !Number.isNaN(from.getTime()) && now < from) return false;
  if (until && !Number.isNaN(until.getTime()) && now > until) return false;
  return true;
}

function isPromoUsable(promo, subtotal) {
  if (!promo) return { ok: false, message: "Promo code not found." };
  if (!promo.is_active) return { ok: false, message: "This promo is inactive." };
  if (promo.already_used_by_me) {
    return { ok: false, message: "You already used this promo code." };
  }

  if (!isPromoWithinDate(promo)) {
    return { ok: false, message: "This promo is outside its valid schedule." };
  }

  const usageLimit = Number(promo.usage_limit || 0);
  const usageCount = Number(promo.usage_count || 0);
  if (usageLimit > 0 && usageCount >= usageLimit) {
    return { ok: false, message: "This promo has reached its usage limit." };
  }

  const minOrder = Number(promo.min_order_amount || 0);
  if (subtotal < minOrder) {
    return {
      ok: false,
      message: `Minimum order of ${formatPeso(minOrder)} is required.`,
    };
  }

  return { ok: true, message: "Promo applied successfully." };
}

function calculatePromoDiscount(promo, subtotal) {
  if (!promo) return 0;

  const discountType = String(promo.discount_type || "").toLowerCase();
  const discountValue = Number(promo.discount_value || 0);

  let discount = 0;

  if (discountType === "percent") {
    discount = subtotal * (discountValue / 100);
  } else {
    discount = discountValue;
  }

  if (discount > subtotal) discount = subtotal;
  return Number(discount.toFixed(2));
}

function renderPromoQuickList() {
  const container = document.getElementById("promoQuickList");
  if (!container) return;

  if (!availablePromos.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = availablePromos
    .filter((promo) => !promo.already_used_by_me && promo.is_active)
    .slice(0, 6)
    .map((promo) => {
      const code = escapeHtml(promo.code || "PROMO");
      return `
        <button type="button" class="promo-quick-chip" onclick="useQuickPromo('${code}')">
          ${code}
        </button>
      `;
    })
    .join("");
}

function getPreviewTotals() {
  const baseTotal = Number(getBaseTotal().toFixed(2));
  const discount = appliedPromo ? calculatePromoDiscount(appliedPromo, baseTotal) : 0;
  const grandTotal = Number(Math.max(0, baseTotal - discount).toFixed(2));
  const subtotal = Number((grandTotal / 1.12).toFixed(2));
  const vat = Number((grandTotal - subtotal).toFixed(2));

  return {
    baseTotal,
    discount,
    grandTotal,
    subtotal,
    vat,
    points: getPointsToEarn(),
  };
}

function updateSummary() {
  const totals = getPreviewTotals();

  const subtotalDisplay = document.getElementById("subtotalDisplay");
  const vatDisplay = document.getElementById("vatDisplay");
  const grandTotalDisplay = document.getElementById("grandTotalDisplay");
  const pointsDisplay = document.getElementById("pointsDisplay");
  const promoDiscountRow = document.getElementById("promoDiscountRow");
  const promoDiscountDisplay = document.getElementById("promoDiscountDisplay");

  if (subtotalDisplay) subtotalDisplay.textContent = formatPeso(totals.subtotal);
  if (vatDisplay) vatDisplay.textContent = formatPeso(totals.vat);
  if (grandTotalDisplay) grandTotalDisplay.textContent = formatPeso(totals.grandTotal);
  if (pointsDisplay) pointsDisplay.textContent = `+${totals.points} PTS`;

  if (promoDiscountRow && promoDiscountDisplay) {
    if (totals.discount > 0) {
      promoDiscountRow.style.display = "flex";
      promoDiscountDisplay.textContent = `- ${formatPeso(totals.discount)}`;
    } else {
      promoDiscountRow.style.display = "none";
      promoDiscountDisplay.textContent = "- ₱0.00";
    }
  }
}

function renderCart() {
  const container = document.getElementById("orderContainer");
  const emptyMsg = document.getElementById("emptyCartMessage");
  const btnConfirm = document.getElementById("btnConfirm");

  if (!container || !emptyMsg || !btnConfirm) return;

  container.innerHTML = "";

  if (!checkoutItems.length) {
    emptyMsg.style.display = "block";
    btnConfirm.disabled = true;
    updateSummary();
    return;
  }

  emptyMsg.style.display = "none";
  btnConfirm.disabled = false;

  container.innerHTML = checkoutItems
    .map((item, index) => {
      const notesHtml = item.notes
        ? `<p style="color: var(--mango);">Note: ${escapeHtml(item.notes)}</p>`
        : "";

      return `
        <div class="order-item">
          <div class="item-info">
            <h4>${Number(item.qty || 0)}x ${escapeHtml(item.title || "Item")}</h4>
            <p>${escapeHtml(buildItemDescription(item))}</p>
            ${notesHtml}
          </div>

          <div class="item-actions">
            <div class="qty-edit">
              <button type="button" onclick="updateQty(${index}, -1)">-</button>
              <span>${Number(item.qty || 0)}</span>
              <button type="button" onclick="updateQty(${index}, 1)">+</button>
            </div>

            <div class="item-price">${formatPeso(item.total || 0)}</div>

            <button class="btn-remove" type="button" onclick="removeItem(${index})" title="Remove item">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  updateSummary();
}

function updateQty(index, delta) {
  if (!checkoutItems[index]) return;

  const nextQty = Number(checkoutItems[index].qty || 0) + Number(delta || 0);
  checkoutItems[index].qty = nextQty < 1 ? 1 : nextQty;

  const unitPrice = Number(checkoutItems[index].unit_price || 0);
  checkoutItems[index].total = Number(
    (unitPrice * checkoutItems[index].qty).toFixed(2),
  );

  if (appliedPromo) {
    const stillValid = isPromoUsable(appliedPromo, getBaseTotal());
    if (!stillValid.ok) {
      appliedPromo = null;
      setPromoStatus("Promo was removed because the cart no longer qualifies.", "error");
    }
  }

  saveCheckoutItems();
  renderCart();
}

function removeItem(index) {
  checkoutItems.splice(index, 1);

  if (appliedPromo) {
    const stillValid = isPromoUsable(appliedPromo, getBaseTotal());
    if (!stillValid.ok) {
      appliedPromo = null;
      setPromoStatus("Promo was removed because the cart no longer qualifies.", "error");
    }
  }

  saveCheckoutItems();
  renderCart();
}

function selectPayment(element, type) {
  currentPayment = type;

  document
    .querySelectorAll(".method-item")
    .forEach((item) => item.classList.remove("active"));
  if (element) element.classList.add("active");

  const rpayForm = document.getElementById("rpayForm");
  const cashForm = document.getElementById("cashForm");
  const checkoutNote = document.getElementById("checkoutNote");

  if (type === "wallet") {
    rpayForm?.classList.add("active");
    cashForm?.classList.remove("active");
    if (checkoutNote) {
      checkoutNote.textContent =
        "Wallet payment will charge your TeoPay balance immediately.";
    }

    if (!appliedPromo) {
      if (availablePromos.length) {
        setPromoStatus("You can enter or tap an available promo code.", "neutral");
      } else {
        setPromoStatus("No available promo codes right now.", "neutral");
      }
    }
  } else {
    rpayForm?.classList.remove("active");
    cashForm?.classList.add("active");
    if (checkoutNote) {
      checkoutNote.textContent =
        "Cash payment will create a pending online order to be paid at pickup.";
    }

    if (appliedPromo) {
      setPromoStatus(
        `${appliedPromo.code} is still selected. Final validation will happen upon checkout.`,
        "neutral",
      );
    } else {
      setPromoStatus("Promo code is optional.", "neutral");
    }
  }
}

function buildOrderPayload() {
  return {
    payment_method: currentPayment,
    promo_code: appliedPromo?.code || null,
    items: checkoutItems.map((item) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.qty),
      size: item.size || "small",
      add_ons: Array.isArray(item.add_on_ids) ? item.add_on_ids : [],
      notes: item.notes || null,
    })),
    wallet_email:
      currentPayment === "wallet"
        ? (document.getElementById("rpayEmail")?.value || "").trim()
        : null,
    wallet_pin:
      currentPayment === "wallet"
        ? (document.getElementById("rpayPin")?.value || "").trim()
        : null,
  };
}

function validateBeforeSubmit(payload) {
  if (!checkoutItems.length) {
    throw new Error("Your cart is empty.");
  }

  if (payload.payment_method === "wallet") {
    if (!payload.wallet_email || !payload.wallet_email.includes("@")) {
      throw new Error("Please enter a valid registered email.");
    }

    if (
      !payload.wallet_pin ||
      payload.wallet_pin.length < 4 ||
      payload.wallet_pin.length > 6
    ) {
      throw new Error("Please enter a valid wallet PIN.");
    }
  }
}

async function loadCurrentUser() {
  try {
    const { res, data } = await apiGet("/auth/me");
    if (res.ok) {
      currentUser = data;
      const emailInput = document.getElementById("rpayEmail");
      if (emailInput && !emailInput.value && data?.email) {
        emailInput.value = data.email;
      }
    }
  } catch (error) {
    console.error("Failed to load auth/me:", error);
  }
}

async function loadAvailablePromos() {
  try {
    const { res, data } = await apiGet("/promo/available/me");
    if (!res.ok) {
      availablePromos = [];
      renderPromoQuickList();
      setPromoStatus("Promo lookup unavailable right now.", "neutral");
      return;
    }

    availablePromos = Array.isArray(data?.data) ? data.data : [];
    renderPromoQuickList();

    const promoFromQuery = getPromoFromQuery();
    if (promoFromQuery) {
      setPromoInputValue(promoFromQuery);
      applyPromoCode(true);
      return;
    }

    if (availablePromos.length) {
      setPromoStatus("You can enter or tap an available promo code.", "neutral");
    } else {
      setPromoStatus("No available promo codes right now.", "neutral");
    }
  } catch (error) {
    console.error("Failed to load available promos:", error);
    availablePromos = [];
    renderPromoQuickList();
    setPromoStatus("Failed to load promo codes.", "error");
  }
}

function applyPromoCode(silent = false) {
  const code = getPromoInputValue();

  if (!code) {
    appliedPromo = null;
    updateSummary();
    if (!silent) setPromoStatus("Please enter a promo code first.", "error");
    saveCheckoutItems();
    return;
  }

  const subtotal = getBaseTotal();
  const promo = availablePromos.find(
    (item) => normalizePromoCode(item.code) === code,
  );

  const check = isPromoUsable(promo, subtotal);
  if (!check.ok) {
    appliedPromo = null;
    updateSummary();
    if (!silent) setPromoStatus(check.message, "error");
    saveCheckoutItems();
    return;
  }

  appliedPromo = promo;
  const discount = calculatePromoDiscount(promo, subtotal);
  updateSummary();
  saveCheckoutItems();

  if (!silent) {
    setPromoStatus(
      `${code} applied successfully. You saved ${formatPeso(discount)}.`,
      "success",
    );
  } else {
    setPromoStatus(
      `${code} auto-applied. You saved ${formatPeso(discount)}.`,
      "success",
    );
  }
}

function useQuickPromo(code) {
  setPromoInputValue(code);
  applyPromoCode();
}

async function handleFinish() {
  const btn = document.getElementById("btnConfirm");

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;
    }

    const payload = buildOrderPayload();
    validateBeforeSubmit(payload);

    const { res, data } = await apiPost("/orders/online", payload);

    if (!res.ok) {
      throw new Error(data?.detail || "Failed to create online order.");
    }

    lastOrderResponse = data;

    showSuccessReceipt(data);
    clearCheckoutStorage();
    checkoutItems = [];
    appliedPromo = null;
    renderCart();
  } catch (error) {
    alert(error.message || "Failed to submit order.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Confirm Order";
    }
  }
}

function buildReceiptItemsHtml(sourceItems) {
  return sourceItems
    .map((item) => {
      const qty = Number(item.qty || 0);
      const name = item.title || item.name || "Item";
      const lineTotal = Number(item.total ?? item.line_total ?? 0);
      const description = buildItemDescription(item);
      const notes = item.notes ? ` • Note: ${item.notes}` : "";

      return `
        <div class="receipt-row">
          <span>${escapeHtml(`${qty}x ${name}`)}</span>
          <span>${escapeHtml(lineTotal.toFixed(2))}</span>
        </div>
        <div class="receipt-row-sub">
          <span>${escapeHtml(description + notes)}</span>
          <span></span>
        </div>
      `;
    })
    .join("");
}

function showReceiptNote(message = "") {
  const noteBox = document.getElementById("receiptNoteBox");
  if (!noteBox) return;

  if (!message) {
    noteBox.style.display = "none";
    noteBox.textContent = "";
    return;
  }

  noteBox.style.display = "block";
  noteBox.textContent = message;
}

function showSuccessReceipt(orderData) {
  const modal = document.getElementById("successReceiptModal");
  if (!modal) return;

  const subtotal = Number(orderData?.subtotal || 0);
  const vat = Number(orderData?.vat_amount || 0);
  const discount = Number(orderData?.discount_amount || 0);
  const total = Number(orderData?.total_amount || 0);
  const points = Number(orderData?.earned_points || 0);
  const paymentMethod = String(orderData?.payment_method || "cash").toLowerCase();
  const status = String(orderData?.status || "pending").toLowerCase();
  const customerName =
    orderData?.customer_name ||
    currentUser?.full_name ||
    currentUser?.name ||
    currentUser?.email ||
    "Customer";

  const receiptDateTime = document.getElementById("receiptDateTime");
  const receiptDisplayId = document.getElementById("receiptDisplayId");
  const receiptRawId = document.getElementById("receiptRawId");
  const receiptCustomerName = document.getElementById("receiptCustomerName");
  const receiptOrderType = document.getElementById("receiptOrderType");
  const receiptStatus = document.getElementById("receiptStatus");
  const receiptBody = document.getElementById("receiptBody");
  const receiptClaimBox = document.getElementById("receiptClaimBox");
  const receiptMethodLabel = document.getElementById("receiptMethodLabel");
  const receiptTendered = document.getElementById("receiptTendered");
  const receiptChange = document.getElementById("receiptChange");
  const pointsCustomerLabel = document.getElementById("pointsCustomerLabel");
  const pointsValueLabel = document.getElementById("pointsValueLabel");

  if (receiptDateTime) {
    receiptDateTime.textContent = formatDateTime(orderData?.created_at || new Date());
  }

  if (receiptDisplayId) {
    receiptDisplayId.textContent =
      orderData?.display_id || `#TM-${orderData?.order_id || "—"}`;
  }

  if (receiptRawId) {
    receiptRawId.textContent = orderData?.order_id || "-";
  }

  if (receiptCustomerName) {
    receiptCustomerName.textContent = customerName;
  }

  if (receiptOrderType) {
    receiptOrderType.textContent = prettifyText(orderData?.order_type || "online");
  }

  if (receiptStatus) {
    receiptStatus.textContent = prettifyText(status);
  }

  if (receiptClaimBox) {
    if (orderData?.claim_expires_at) {
      receiptClaimBox.style.display = "block";
      receiptClaimBox.textContent = `Rewards points can still be claimed for this order. Claim until: ${formatDateTime(orderData.claim_expires_at)}`;
    } else {
      receiptClaimBox.style.display = "none";
      receiptClaimBox.textContent = "";
    }
  }

  if (receiptBody) {
    let html = "";

    html += buildReceiptItemsHtml(checkoutItems);
    html += `<div class="receipt-divider"></div>`;
    html += `<div class="receipt-row"><span>Subtotal</span><span>${escapeHtml(subtotal.toFixed(2))}</span></div>`;
    html += `<div class="receipt-row"><span>VAT</span><span>${escapeHtml(vat.toFixed(2))}</span></div>`;

    if (discount > 0) {
      html += `<div class="receipt-row"><span>Discount</span><span>- ${escapeHtml(discount.toFixed(2))}</span></div>`;
    }

    html += `<div class="receipt-divider"></div>`;
    html += `
      <div class="receipt-row" style="font-size:1.3rem; font-weight:900;">
        <span>TOTAL</span>
        <span>${escapeHtml(formatPeso(total))}</span>
      </div>
    `;

    receiptBody.innerHTML = html;
  }

  if (receiptMethodLabel) {
    receiptMethodLabel.textContent = paymentMethod === "wallet" ? "TeoPay" : "Cash";
  }

  if (receiptTendered) {
    receiptTendered.textContent = formatPeso(total);
  }

  if (receiptChange) {
    receiptChange.textContent = paymentMethod === "wallet" ? "₱0.00" : "₱0.00";
  }

  if (pointsCustomerLabel) {
    pointsCustomerLabel.textContent = customerName;
  }

  if (pointsValueLabel) {
    pointsValueLabel.textContent = `${points} pts`;
  }

  showReceiptNote(
    paymentMethod === "wallet"
      ? "Your order has been paid successfully. Please present this receipt at the counter."
      : "Your online order was created successfully. Please pay at the store counter upon pickup."
  );

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function goBackToMenu() {
  const modal = document.getElementById("successReceiptModal");
  if (modal) modal.classList.remove("active");
  document.body.style.overflow = "auto";
  window.location.href = "menu.html";
}

function setupModalClose() {
  const modal = document.getElementById("successReceiptModal");
  if (!modal) return;

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("active");
      document.body.style.overflow = "auto";
    }
  });
}

function setupPromoInputEvents() {
  const input = document.getElementById("promoCodeInput");
  if (!input) return;

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyPromoCode();
    }
  });
}

async function initPaymentPage() {
  setupThemeToggle();
  setupModalClose();
  setupPromoInputEvents();
  loadCheckoutItems();
  renderCart();
  await loadCurrentUser();
  await loadAvailablePromos();

  const teopayCard = document.getElementById("paymentTeopayCard");
  selectPayment(teopayCard, "wallet");
}

window.updateQty = updateQty;
window.removeItem = removeItem;
window.selectPayment = selectPayment;
window.handleFinish = handleFinish;
window.goBackToMenu = goBackToMenu;
window.applyPromoCode = applyPromoCode;
window.useQuickPromo = useQuickPromo;

document.addEventListener("DOMContentLoaded", initPaymentPage);