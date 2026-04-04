const MENU_STORAGE_KEY = "public_menu_cart";
const CHECKOUT_DRAFT_KEY = "public_online_order_draft";

let checkoutItems = [];
let currentPayment = "wallet";
let currentUser = null;
let lastOrderResponse = null;

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
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
    subtotal_preview: Number(getSubtotal().toFixed(2)),
  };

  localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(payload));
}

function clearCheckoutStorage() {
  localStorage.removeItem(MENU_STORAGE_KEY);
  localStorage.removeItem(CHECKOUT_DRAFT_KEY);
}

function getSubtotal() {
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

function updateSummary() {
  const subtotal = getSubtotal();
  const points = getPointsToEarn();

  const subtotalDisplay = document.getElementById("subtotalDisplay");
  const grandTotalDisplay = document.getElementById("grandTotalDisplay");
  const pointsDisplay = document.getElementById("pointsDisplay");

  if (subtotalDisplay) subtotalDisplay.textContent = formatPeso(subtotal);
  if (grandTotalDisplay) grandTotalDisplay.textContent = formatPeso(subtotal);
  if (pointsDisplay) pointsDisplay.textContent = `+${points} PTS`;
}

function updateQty(index, delta) {
  if (!checkoutItems[index]) return;

  const nextQty = Number(checkoutItems[index].qty || 0) + Number(delta || 0);
  checkoutItems[index].qty = nextQty < 1 ? 1 : nextQty;

  const unitPrice = Number(checkoutItems[index].unit_price || 0);
  checkoutItems[index].total = Number(
    (unitPrice * checkoutItems[index].qty).toFixed(2),
  );

  saveCheckoutItems();
  renderCart();
}

function removeItem(index) {
  checkoutItems.splice(index, 1);
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
  } else {
    rpayForm?.classList.remove("active");
    cashForm?.classList.add("active");
    if (checkoutNote) {
      checkoutNote.textContent =
        "Cash payment will create a pending online order to be paid at pickup.";
    }
  }
}

function buildOrderPayload() {
  return {
    payment_method: currentPayment,
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

function showSuccessReceipt(orderData) {
  const modal = document.getElementById("successReceiptModal");
  if (!modal) return;

  const subtotal = Number(orderData?.subtotal || 0);
  const vat = Number(orderData?.vat_amount || 0);
  const discount = Number(orderData?.discount_amount || 0);
  const total = Number(orderData?.total_amount || 0);
  const points = Number(orderData?.earned_points || 0);
  const paymentMethod = String(
    orderData?.payment_method || "cash",
  ).toLowerCase();
  const status = String(orderData?.status || "pending").toLowerCase();

  const printDate = document.getElementById("printDate");
  const printOrderNum = document.getElementById("printOrderNum");
  const printItemsList = document.getElementById("printItemsList");
  const printSubtotal = document.getElementById("printSubtotal");
  const printVat = document.getElementById("printVat");
  const printDiscount = document.getElementById("printDiscount");
  const printMethod = document.getElementById("printMethod");
  const printStatus = document.getElementById("printStatus");
  const printTotal = document.getElementById("printTotal");
  const printPoints = document.getElementById("printPoints");
  const printFooterNote = document.getElementById("printFooterNote");

  if (printDate) printDate.textContent = formatDateTime(new Date());
  if (printOrderNum) {
    printOrderNum.textContent =
      orderData?.display_id || `#${orderData?.order_id || "—"}`;
  }

  if (printItemsList) {
    printItemsList.innerHTML = checkoutItems
      .map(
        (item) => `
            <div class="print-item-row">
                <span>${escapeHtml(`${item.qty}x ${item.title}`)}</span>
                <span>${formatPeso(item.total)}</span>
            </div>
            <div class="print-item-sub">
                ${escapeHtml(buildItemDescription(item))}
                ${item.notes ? ` • Note: ${escapeHtml(item.notes)}` : ""}
            </div>
        `,
      )
      .join("");
  }

  if (printSubtotal) printSubtotal.textContent = formatPeso(subtotal);
  if (printVat) printVat.textContent = formatPeso(vat);
  if (printDiscount) printDiscount.textContent = formatPeso(discount);
  if (printMethod)
    printMethod.textContent = paymentMethod === "wallet" ? "Teo Pay" : "Cash";
  if (printStatus) printStatus.textContent = status;
  if (printTotal) printTotal.textContent = formatPeso(total);
  if (printPoints) printPoints.textContent = `+${points} PTS`;

  if (printFooterNote) {
    printFooterNote.textContent =
      paymentMethod === "wallet"
        ? "Your order has been paid successfully. Please present this receipt at the counter."
        : "Your online order was created successfully. Please pay at the store counter upon pickup.";
  }

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

async function initPaymentPage() {
  setupThemeToggle();
  setupModalClose();
  loadCheckoutItems();
  renderCart();
  await loadCurrentUser();

  const teopayCard = document.getElementById("paymentTeopayCard");
  selectPayment(teopayCard, "wallet");
}

window.updateQty = updateQty;
window.removeItem = removeItem;
window.selectPayment = selectPayment;
window.handleFinish = handleFinish;
window.goBackToMenu = goBackToMenu;

document.addEventListener("DOMContentLoaded", initPaymentPage);
