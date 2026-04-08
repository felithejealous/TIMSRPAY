let notificationCache = [];
let stickyNotification = null;
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "index.html";
      return;
    }

    const { res: userRes, data: userData } = await apiGet("/auth/me");
    if (!userRes.ok) {
      localStorage.removeItem("token");
      window.location.href = "index.html";
      return;
    }

    const fullName = userData.full_name || userData.display_name || userData.email || "User";
    const firstName = userData.first_name || fullName.split(/\s+/)[0] || "User";

    const points = await fetchRewardPoints().catch(() => 0);
    const walletBalance = await fetchWalletBalance().catch(() => 0);
    const tier = getTierData(points);

    document.querySelectorAll(".user-name").forEach((el) => {
      el.textContent = firstName;
    });

    const cardNameEl = document.querySelector(".card-name.user-name");
    if (cardNameEl) cardNameEl.textContent = fullName.toUpperCase();

    const rawWalletCode = (userData.wallet_code || "").trim().toUpperCase();
    bindWalletVisibilityToggle(rawWalletCode);

    const walletBalanceEl = document.getElementById("walletBalance");
    if (walletBalanceEl) walletBalanceEl.textContent = formatPeso(walletBalance);

    updateAccountPanelUI({
      fullName,
      tierLabel: tier.labelUpper,
      points,
      walletBalance,
      profilePicture: userData.profile_picture || "",
    });

    bindOrderFilter();
    bindReceiptModal();
    bindCustomerInquiryModal();
    bindAnnouncementModal();
    bindFeedbackModal();
    bindFooterInfoModal();

    await loadWelcomeOrders();
    await loadAnnouncements();
    await loadMonthlyBestSellers();
    await loadMyInquiries();
    await loadNotifications();
    await loadUnreadNotificationCount();
  } catch (err) {
    console.error("Failed to initialize welcome page:", err);
  }
});

function resolveProductImageUrl(imageUrl, productName = "") {
  const cleanName = String(productName || "").trim().toLowerCase();

  const nameFallbackMap = {
    "classic teo d' mango": "mango2.png",
    "classic teo d mango": "mango2.png",
    "classic mango bliss": "mango2.png",
    "teo d' mango": "mango2.png",
    "teo d mango": "mango2.png",
    mango: "mango2.png",
    "creamy buko slush": "buko2.png",
    buko: "buko2.png",
    "strawberry dream": "STRAWBERRY.png",
    strawberry: "STRAWBERRY.png",
    "ube macapuno slush": "ube2.png",
    ube: "ube2.png",
    lychee: "lycheenobg.png",
    avocado: "avocado.png",
  };

  const fallback = nameFallbackMap[cleanName] || "multilogo.png";
  if (!imageUrl) return fallback;

  const clean = String(imageUrl).trim();
  if (!clean) return fallback;
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
  if (clean.startsWith("/")) return `${API_URL}${clean}`;

  return clean;
}

function bindWalletVisibilityToggle(rawCode) {
  const btn = document.getElementById("walletToggleBtn");
  const number = document.getElementById("cardNumber");
  if (!btn || !number) return;

  let visible = false;

  const formatted = rawCode ? rawCode.match(/.{1,3}/g)?.join(" ") || rawCode : "------";
  const masked = rawCode ? rawCode.replace(/.(?=.{3})/g, "*").match(/.{1,3}/g)?.join(" ") || "******" : "------";

  number.textContent = masked;

  btn.addEventListener("click", () => {
    visible = !visible;
    number.textContent = visible ? formatted : masked;
    btn.innerHTML = visible ? `<i class="fa-solid fa-eye-slash"></i>` : `<i class="fa-solid fa-eye"></i>`;
  });
}

function bindOrderFilter() {
  const filterEl = document.getElementById("orderHistoryFilter");
  if (!filterEl) return;

  filterEl.addEventListener("change", async () => {
    await loadWelcomeOrders();
  });
}

function bindReceiptModal() {
  const modal = document.getElementById("receiptModal");
  if (!modal) return;

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeReceiptModal();
  });
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";

  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function loadMonthlyBestSellers() {
  try {
    const grid = document.getElementById("bestSellerGrid");
    const title = document.getElementById("bestSellerTitle");
    if (!grid) return;

    grid.innerHTML = `<div class="announcement-empty">Loading best sellers...</div>`;

    const res = await fetch(`${API_URL}/products/best-sellers/monthly?limit=4`);
    const data = await res.json();

    if (!res.ok) {
      grid.innerHTML = `<div class="announcement-empty">Failed to load best sellers.</div>`;
      return;
    }

    const items = Array.isArray(data.data) ? data.data : [];

    if (title && data.month) title.textContent = `Best Sellers • ${data.month}`;

    if (items.length === 0) {
      grid.innerHTML = `<div class="announcement-empty">No best seller data available for this month yet.</div>`;
      return;
    }

    grid.innerHTML = items.map((item) => {
      const imageSrc = resolveProductImageUrl(item.image_url, item.name);
      const productName = escapeHtml(item.name || "Product");
      const soldQty = Number(item.sold_qty || 0);
      const price = Number(item.price || 0).toFixed(2);

      return `
        <div class="bs-card" onclick="window.location.href='menu.html?product=${item.product_id}'">
          <div class="bs-img-wrapper">
            <img src="${imageSrc}" alt="${productName}">
          </div>
          <h4>${productName}</h4>
          <p>₱${price}</p>
          <div class="bs-meta">${soldQty} sold this month</div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error("Failed to load monthly best sellers:", err);
    const grid = document.getElementById("bestSellerGrid");
    if (grid) grid.innerHTML = `<div class="announcement-empty">Failed to load best sellers.</div>`;
  }
}

async function loadWelcomeOrders() {
  try {
    const token = localStorage.getItem("token");
    const container = document.getElementById("reorderList");
    const filterEl = document.getElementById("orderHistoryFilter");
    if (!container) return;

    const selectedFilter = filterEl ? filterEl.value : "30";

    let endpoint = `${API_URL}/orders/my?limit=50&days=30`;
    if (selectedFilter === "7") endpoint = `${API_URL}/orders/my?limit=50&days=7`;
    else if (selectedFilter === "paid") endpoint = `${API_URL}/orders/my?limit=50&days=30&status=paid`;
    else if (selectedFilter === "completed") endpoint = `${API_URL}/orders/my?limit=50&days=30&status=completed`;

    const res = await fetch(endpoint, {
      headers: { Authorization: "Bearer " + token },
    });

    const data = await res.json();
    container.innerHTML = "";

    if (!res.ok) {
      container.innerHTML = `<div class="announcement-empty">Failed to load order history.</div>`;
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = `<div class="announcement-empty">No orders found in the selected range.</div>`;
      return;
    }

    container.innerHTML = data.map((order) => {
      const orderTitle = escapeHtml(order.items_summary || order.product_name || "Order Item");
      const orderPrice = Number(order.total_amount || order.price || 0).toFixed(2);
      const createdAt = formatDateTime(order.created_at);
      const orderType = escapeHtml((order.order_type || "order").toUpperCase());
      const orderStatus = escapeHtml((order.status || "pending").toUpperCase());
      const paymentMethod = escapeHtml((order.payment_method || "cash").toUpperCase());
      const displayId = escapeHtml(order.display_id || `#${order.order_id}`);
      const safeOrderId = Number(order.order_id || 0);
      const safeProductName = escapeHtml(order.items_summary || order.product_name || "Order Item");

      return `
        <div class="reorder-item">
          <div class="reorder-top">
            <div class="reorder-info">
              <h4>${orderTitle}</h4>
              <p class="order-meta">${displayId} • ${createdAt}</p>
              <p>${orderType} • ${orderStatus} • ${paymentMethod}</p>
            </div>
            <div class="order-price-pill">₱${orderPrice}</div>
          </div>

          <div class="reorder-bottom">
            <div class="order-meta">${Number(order.earned_points || 0)} pts earned</div>

            <div class="order-actions">
              <button class="order-action-btn" type="button" onclick="window.location.href='menu.html'">
                Order Again
              </button>
              <button class="order-action-btn" type="button" onclick="viewReceipt(${safeOrderId})">
                View Receipt
              </button>

              ${
                order.has_feedback
                  ? `
                    <button class="order-action-btn feedback-sent-btn" type="button" disabled>
                      <i class="fa-solid fa-circle-check"></i> Feedback Sent
                    </button>
                  `
                  : `
                    <button class="order-action-btn leave-feedback-btn" type="button" data-order-id="${safeOrderId}" data-product-name="${safeProductName}">
                      <i class="fa-solid fa-star"></i> Leave Feedback
                    </button>
                  `
              }
            </div>
          </div>
        </div>
      `;
    }).join("");

    bindLeaveFeedbackButtons();
  } catch (err) {
    console.error("Failed to load orders:", err);
    const container = document.getElementById("reorderList");
    if (container) container.innerHTML = `<div class="announcement-empty">Failed to load order history.</div>`;
  }
}
async function loadAnnouncements() {
  try {
    const res = await fetch(`${API_URL}/announcements/public`);
    const data = await res.json();

    const preview = document.getElementById("announcementPreview");
    const list = document.getElementById("announcementList");
    const announcements = Array.isArray(data.data) ? data.data : [];

    if (!preview) return;

    if (!res.ok) {
      preview.innerHTML = `<div class="announcement-empty">Failed to load announcements.</div>`;
      if (list) list.innerHTML = `<div class="announcement-empty">Failed to load announcements.</div>`;
      return;
    }

    if (announcements.length === 0) {
      preview.innerHTML = `<div class="announcement-empty">No announcements available.</div>`;
      if (list) list.innerHTML = `<div class="announcement-empty">No announcements available.</div>`;
      return;
    }

    const formatAnnouncementDate = (value) => {
      if (!value) return "Latest update";
      const d = new Date(value);
      return isNaN(d.getTime()) ? "Latest update" : d.toLocaleString();
    };

    const renderAnnouncementCard = (item) => `
      <div class="announcement-card">
        <div class="announcement-title">
          ${item.is_pinned ? `<i class="fa-solid fa-thumbtack"></i> ` : ``}
          ${escapeHtml(item.title || "Announcement")}
        </div>
        <div class="announcement-meta">${formatAnnouncementDate(item.publish_at || item.created_at)}</div>
        ${
          item.image_url
            ? `<img src="${API_URL}${item.image_url}" alt="${escapeHtml(item.title || "Announcement")}" style="width:100%;max-height:220px;object-fit:cover;border-radius:14px;margin-bottom:12px;">`
            : ``
        }
        <div class="announcement-body">${escapeHtml(item.body || "")}</div>
      </div>
    `;

    preview.innerHTML = renderAnnouncementCard(announcements[0]);
    if (list) list.innerHTML = announcements.map(renderAnnouncementCard).join("");
  } catch (err) {
    console.error("Failed to load announcements:", err);

    const preview = document.getElementById("announcementPreview");
    const list = document.getElementById("announcementList");

    if (preview) preview.innerHTML = `<div class="announcement-empty">Failed to load announcements.</div>`;
    if (list) list.innerHTML = `<div class="announcement-empty">Failed to load announcements.</div>`;
  }
}

async function viewReceipt(orderId) {
  const modal = document.getElementById("receiptModal");
  const content = document.getElementById("receiptContent");
  const rewardSection = document.getElementById("receiptRewardSection");
  const title = document.getElementById("receiptTitle");
  const token = localStorage.getItem("token");

  if (!modal || !content || !title || !rewardSection) return;

  modal.classList.add("show");
  title.textContent = "Order Receipt";
  content.innerHTML = `<div class="announcement-empty">Loading receipt...</div>`;
  rewardSection.innerHTML = "";

  try {
    const res = await fetch(`${API_URL}/orders/${orderId}/receipt`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();

    if (!res.ok) {
      content.innerHTML = `<div class="announcement-empty">${escapeHtml(data.detail || "Failed to load receipt.")}</div>`;
      rewardSection.innerHTML = "";
      return;
    }

    title.textContent = data.display_id || `Receipt #${data.order_id}`;

    const itemsHtml = Array.isArray(data.items) && data.items.length
      ? data.items.map((item) => {
          const addOnsText = Array.isArray(item.add_ons) && item.add_ons.length
            ? item.add_ons.map((a) => `${a.qty}x ${a.name}`).join(", ")
            : "None";

          return `
            <div class="manifest-row">
              <span>${escapeHtml(`${item.qty}x ${item.name}`)}</span>
              <span>${escapeHtml(formatPeso(item.line_total || 0))}</span>
            </div>

            <div class="manifest-row" style="border-bottom:none;padding-bottom:0;">
              <span>Add-ons</span>
              <span>${escapeHtml(addOnsText)}</span>
            </div>

            ${
              item.notes && String(item.notes).trim()
                ? `
                  <div class="manifest-row" style="border-bottom:none;padding-top:6px;color:#ff8c00;">
                    <span>Note</span>
                    <span style="max-width:220px;text-align:right;white-space:normal;word-break:break-word;">
                      ${escapeHtml(item.notes)}
                    </span>
                  </div>
                `
                : ""
            }
          `;
        }).join("")
      : `<div class="announcement-empty">No receipt items found.</div>`;

    const paymentMethod = String(data.payment_method || "").toLowerCase();
    const receivedAmount = data.amount_received !== null && data.amount_received !== undefined
      ? Number(data.amount_received)
      : paymentMethod === "wallet"
        ? Number(data.total_amount || 0)
        : null;

    const changeAmount = data.change_amount !== null && data.change_amount !== undefined
      ? Number(data.change_amount)
      : paymentMethod === "wallet"
        ? 0
        : null;

    content.innerHTML = `
      <div class="manifest-row"><span>Display ID</span><span>${escapeHtml(data.display_id || `#${data.order_id}`)}</span></div>
      <div class="manifest-row"><span>Raw Order ID</span><span>${escapeHtml(String(data.order_id || "-"))}</span></div>
      <div class="manifest-row"><span>Customer</span><span>${escapeHtml(data.customer_name || "Customer")}</span></div>
      <div class="manifest-row"><span>Status</span><span>${escapeHtml(String(data.status || "pending"))}</span></div>
      <div class="manifest-row"><span>Order Type</span><span>${escapeHtml(String(data.order_type || "-"))}</span></div>
      <div class="manifest-row"><span>Payment</span><span>${escapeHtml(paymentMethod === "wallet" ? "TeoPay" : data.payment_method || "-")}</span></div>
      <div class="manifest-row"><span>Created At</span><span>${escapeHtml(formatDateTime(data.created_at))}</span></div>

      ${
        data.promo_code_text
          ? `<div class="manifest-row"><span>Promo Code</span><span>${escapeHtml(data.promo_code_text)}</span></div>`
          : ""
      }

      <div class="receipt-divider"></div>
      ${itemsHtml}
      <div class="receipt-divider"></div>

      <div class="manifest-row"><span>Subtotal</span><span>${escapeHtml(formatPeso(data.subtotal || 0))}</span></div>
      <div class="manifest-row"><span>VAT</span><span>${escapeHtml(formatPeso(data.vat_amount || 0))}</span></div>
      <div class="manifest-row"><span>Discount</span><span>${escapeHtml(formatPeso(data.discount_amount || 0))}</span></div>
      <div class="manifest-row"><span>Total</span><span>${escapeHtml(formatPeso(data.total_amount || 0))}</span></div>
      <div class="manifest-row"><span>Received</span><span>${receivedAmount === null ? "-" : escapeHtml(formatPeso(receivedAmount))}</span></div>
      <div class="manifest-row"><span>Change</span><span>${changeAmount === null ? "-" : escapeHtml(formatPeso(changeAmount))}</span></div>

      ${
        data.is_refunded
          ? `
            <div class="receipt-divider"></div>
            <div class="manifest-row"><span>Refunded</span><span>Yes</span></div>
            <div class="manifest-row"><span>Refund Count</span><span>${escapeHtml(String(data.refund_count || 0))}</span></div>
            <div class="manifest-row"><span>Refund Amount</span><span>${escapeHtml(formatPeso(data.refund_amount || 0))}</span></div>
            <div class="manifest-row"><span>Last Refund</span><span>${escapeHtml(formatDateTime(data.last_refund_at))}</span></div>
          `
          : ""
      }
    `;

    rewardSection.innerHTML = `
      <div class="reward-box">
        <div class="reward-title">Rewards / Points</div>
        <div class="reward-row"><span>Earned Points</span><span>${escapeHtml(String(data.earned_points || 0))} pts</span></div>
        <div class="reward-row"><span>Potential Points</span><span>${escapeHtml(String(data.potential_points || 0))} pts</span></div>
        <div class="reward-row"><span>Points Status</span><span class="${data.points_synced ? "text-green" : "text-yellow"}">${escapeHtml(data.points_status || "none")}</span></div>

        ${data.claim_message ? `<div class="reward-row"><span>Claim Note</span><span>${escapeHtml(data.claim_message)}</span></div>` : ""}
        ${data.claim_expires_at ? `<div class="reward-row"><span>Claim Expires</span><span>${escapeHtml(formatDateTime(data.claim_expires_at))}</span></div>` : ""}
        ${data.points_claim_method ? `<div class="reward-row"><span>Claim Method</span><span>${escapeHtml(data.points_claim_method)}</span></div>` : ""}
        ${data.points_claimed_at ? `<div class="reward-row"><span>Claimed At</span><span>${escapeHtml(formatDateTime(data.points_claimed_at))}</span></div>` : ""}
      </div>
    `;
  } catch (err) {
    console.error("Failed to load receipt:", err);
    content.innerHTML = `<div class="announcement-empty">Failed to load receipt.</div>`;
    rewardSection.innerHTML = "";
  }
}

function closeReceiptModal() {
  const modal = document.getElementById("receiptModal");
  if (modal) modal.classList.remove("show");
}

function formatInquiryStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "replied") return "Replied";
  if (value === "closed") return "Closed";
  return "Pending";
}

function openInquiryModal() {
  const modal = document.getElementById("customerInquiryModal");
  const status = document.getElementById("customerInquiryStatus");

  if (status) {
    status.innerText = "";
    status.style.color = "";
  }

  if (modal) {
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }
}

function closeInquiryModal() {
  const modal = document.getElementById("customerInquiryModal");
  const status = document.getElementById("customerInquiryStatus");

  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = "auto";
  }

  if (status) {
    status.innerText = "";
    status.style.color = "";
  }
}

function bindCustomerInquiryModal() {
  const modal = document.getElementById("customerInquiryModal");
  const form = document.getElementById("customerInquiryForm");
  const status = document.getElementById("customerInquiryStatus");

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeInquiryModal();
    });
  }

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const token = localStorage.getItem("token");
    const subject = document.getElementById("customerInquirySubject")?.value.trim() || "";
    const message = document.getElementById("customerInquiryMessage")?.value.trim() || "";

    if (!message) {
      if (status) {
        status.style.color = "#ff4d6d";
        status.innerText = "Message is required.";
      }
      return;
    }

    try {
      if (status) {
        status.style.color = "var(--text-muted)";
        status.innerText = "Sending inquiry...";
      }

      const res = await fetch(`${API_URL}/inquiries/me`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subject, message }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (status) {
          status.style.color = "#ff4d6d";
          status.innerText = data.detail || data.message || "Failed to send inquiry.";
        }
        return;
      }

      if (status) {
        status.style.color = "#10b981";
        status.innerText = "Inquiry sent successfully!";
      }

      form.reset();
      await loadMyInquiries();

      setTimeout(() => {
        closeInquiryModal();
      }, 1200);
    } catch (err) {
      console.error("Failed to submit logged-in inquiry:", err);

      if (status) {
        status.style.color = "#ff4d6d";
        status.innerText = "Server error. Please try again.";
      }
    }
  });
}

function openAnnouncementModal() {
  const modal = document.getElementById("announcementModal");
  if (!modal) return;

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeAnnouncementModal() {
  const modal = document.getElementById("announcementModal");
  if (!modal) return;

  modal.classList.remove("active");
  document.body.style.overflow = "auto";
}

function bindAnnouncementModal() {
  const modal = document.getElementById("announcementModal");
  if (!modal) return;

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeAnnouncementModal();
  });
}

function openFeedbackModal(orderId, productName = "") {
  const modal = document.getElementById("feedbackModal");
  const orderIdInput = document.getElementById("feedbackOrderId");
  const productNameInput = document.getElementById("feedbackProductName");
  const status = document.getElementById("feedbackStatus");
  const title = document.getElementById("feedbackTitle");
  const comment = document.getElementById("feedbackComment");
  const rating = document.getElementById("feedbackRating");

  if (!modal || !orderIdInput || !productNameInput) return;

  orderIdInput.value = orderId;
  productNameInput.value = productName;

  if (status) {
    status.innerText = "";
    status.style.color = "";
  }
  if (title) title.value = "";
  if (comment) comment.value = "";
  if (rating) rating.value = "5";

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeFeedbackModal() {
  const modal = document.getElementById("feedbackModal");
  const status = document.getElementById("feedbackStatus");

  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = "auto";
  }

  if (status) {
    status.innerText = "";
    status.style.color = "";
  }
}

function bindLeaveFeedbackButtons() {
  document.querySelectorAll(".leave-feedback-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openFeedbackModal(btn.dataset.orderId, btn.dataset.productName || "");
    });
  });
}

function bindFeedbackModal() {
  const modal = document.getElementById("feedbackModal");
  const form = document.getElementById("feedbackForm");
  const status = document.getElementById("feedbackStatus");

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeFeedbackModal();
    });
  }

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const order_id = document.getElementById("feedbackOrderId")?.value || "";
    const product_name = document.getElementById("feedbackProductName")?.value.trim() || "";
    const rating = Number(document.getElementById("feedbackRating")?.value || 0);
    const title = document.getElementById("feedbackTitle")?.value.trim() || null;
    const comment = document.getElementById("feedbackComment")?.value.trim() || "";

    if (!comment || !rating) {
      if (status) {
        status.style.color = "#ff4d6d";
        status.innerText = "Please complete the required feedback fields.";
      }
      return;
    }

    try {
      if (status) {
        status.style.color = "var(--text-muted)";
        status.innerText = "Submitting feedback...";
      }

      const { res: meRes, data: meData } = await apiGet("/auth/me");
      if (!meRes.ok) throw new Error("Failed to fetch user profile");

      const payload = {
        user_id: meData.user_id,
        order_id: Number(order_id),
        product_name,
        customer_name: meData.full_name || meData.display_name || meData.email || "Customer",
        email: meData.email || null,
        rating,
        title,
        comment,
      };

      let submitRes;
      let submitData;

      if (typeof apiPost === "function") {
        const result = await apiPost("/feedback", payload);
        submitRes = result.res;
        submitData = result.data;
      } else {
        const token = localStorage.getItem("token");
        submitRes = await fetch(`${API_URL}/feedback/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        submitData = await submitRes.json();
      }

      if (!submitRes.ok) {
        if (status) {
          status.style.color = "#ff4d6d";
          status.innerText = submitData?.detail || submitData?.message || "Failed to submit feedback.";
        }
        return;
      }

      if (status) {
        status.style.color = "#10b981";
        status.innerText = "Feedback submitted successfully!";
      }

      form.reset();

      setTimeout(() => {
        closeFeedbackModal();
      }, 1200);
    } catch (err) {
      console.error("Feedback submit failed:", err);

      if (status) {
        status.style.color = "#ff4d6d";
        status.innerText = "Failed to submit feedback.";
      }
    }
  });
}

async function loadMyInquiries() {
  const token = localStorage.getItem("token");
  const container = document.getElementById("myInquiryList");
  if (!container) return;

  try {
    container.innerHTML = `<div class="announcement-empty">Loading your inquiries...</div>`;

    const res = await fetch(`${API_URL}/inquiries/my?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();

    if (!res.ok) {
      container.innerHTML = `<div class="announcement-empty">Failed to load your inquiries.</div>`;
      return;
    }

    const items = Array.isArray(data.data) ? data.data : [];

    if (!items.length) {
      container.innerHTML = `<div class="announcement-empty">No inquiries yet. Send your first message to support.</div>`;
      return;
    }

    container.innerHTML = items.map((item) => `
      <div class="announcement-card" style="margin-bottom:14px;">
        <div class="announcement-title">${escapeHtml(item.subject || "No Subject")}</div>
        <div class="announcement-meta">${escapeHtml(formatInquiryStatus(item.status))} • ${escapeHtml(formatDateTime(item.created_at))}</div>
        <div class="announcement-body" style="margin-bottom:12px;">${escapeHtml(item.message || "")}</div>

        ${
          item.admin_reply
            ? `
              <div class="support-reply-box">
                <div class="support-reply-label">Admin Reply</div>
                <div class="support-reply-text">${escapeHtml(item.admin_reply)}</div>
              </div>
            `
            : ``
        }
      </div>
    `).join("");
  } catch (err) {
    console.error("Failed to load my inquiries:", err);
    container.innerHTML = `<div class="announcement-empty">Failed to load your inquiries.</div>`;
  }
}
function formatNotifType(type) {
  const value = String(type || "").toLowerCase();
  if (value === "wallet") return "Wallet";
  if (value === "reward") return "Reward";
  if (value === "order") return "Order";
  if (value === "tier") return "Tier";
  if (value === "announcement") return "Announcement";
  if (value === "inquiry") return "Inquiry";
  return "General";
}

async function loadUnreadNotificationCount() {
  try {
    const badge = document.getElementById("notifUnreadBadge");
    if (!badge) return;

    const { res, data } = await apiGet("/notifications/me/unread-count");
    if (!res.ok) {
      badge.classList.add("hidden");
      return;
    }

    const count = Number(data.unread_count || 0);
    badge.textContent = count > 99 ? "99+" : String(count);

    if (count > 0) badge.classList.remove("hidden");
    else badge.classList.add("hidden");
  } catch (err) {
    console.error("Failed to load unread notification count:", err);
  }
}

async function loadNotifications() {
  try {
    const { res, data } = await apiGet("/notifications/me?limit=20");
    const historyContainer = document.getElementById("notificationHistoryList");

    if (!historyContainer) return;

    if (!res.ok) {
      historyContainer.innerHTML = `<div class="announcement-empty">Failed to load notifications.</div>`;
      hideStickyNotification();
      return;
    }

    notificationCache = Array.isArray(data) ? data : [];
    renderNotificationHistory(notificationCache);

    const latestSticky = notificationCache.find(
      (item) => item.is_sticky && !item.is_dismissed
    );

    if (latestSticky) {
      stickyNotification = latestSticky;
      renderStickyNotification(latestSticky);

      if (!latestSticky.is_read) {
        await markNotificationRead(latestSticky.id);
      }
    } else {
      stickyNotification = null;
      hideStickyNotification();
    }
  } catch (err) {
    console.error("Failed to load notifications:", err);
    const historyContainer = document.getElementById("notificationHistoryList");
    if (historyContainer) {
      historyContainer.innerHTML = `<div class="announcement-empty">Failed to load notifications.</div>`;
    }
    hideStickyNotification();
  }
}
function renderStickyNotification(item) {
  const card = document.getElementById("stickyNotificationCard");
  const typeEl = document.getElementById("stickyNotifType");
  const titleEl = document.getElementById("stickyNotifTitle");
  const msgEl = document.getElementById("stickyNotifMessage");

  if (!card || !typeEl || !titleEl || !msgEl) return;

  typeEl.textContent = `${formatNotifType(item.notif_type)} Alert`;
  titleEl.textContent = item.title || "Notification";
  msgEl.textContent = item.message || "";

  card.classList.remove("hidden");
}
function hideStickyNotification() {
  const card = document.getElementById("stickyNotificationCard");
  if (card) card.classList.add("hidden");
}
function renderNotificationHistory(items) {
  const container = document.getElementById("notificationHistoryList");
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<div class="announcement-empty">No notifications for the last 30 days.</div>`;
    return;
  }

  container.innerHTML = items.map((item) => `
    <div class="notification-item ${item.is_read ? "" : "unread"}">
      <div class="notification-top">
        <div class="notification-title">${escapeHtml(item.title || "Notification")}</div>
        <div class="notification-meta">${escapeHtml(formatDateTime(item.created_at))}</div>
      </div>

      <div class="notification-message">${escapeHtml(item.message || "")}</div>
    </div>
  `).join("");
}

async function dismissStickyNotification() {
  if (!stickyNotification?.id) return;

  try {
    const { res } = await apiPatch(`/notifications/${stickyNotification.id}/dismiss`, {
      is_dismissed: true,
    });

    if (res.ok) {
      hideStickyNotification();
      stickyNotification = null;
      await loadNotifications();
      await loadUnreadNotificationCount();
    }
  } catch (err) {
    console.error("Failed to dismiss sticky notification:", err);
  }
}

async function markNotificationRead(notificationId) {
  try {
    await apiPatch(`/notifications/${notificationId}/read`, {
      is_read: true,
    });
    await loadUnreadNotificationCount();
  } catch (err) {
    console.error("Failed to mark notification as read:", err);
  }
}

function scrollToNotifications() {
  const section = document.getElementById("notificationHistorySection");
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}
const footerModalContentMap = {
  about: {
    title: "About Us",
    icon: "fa-solid fa-store",
    body: `
      <div class="info-section">
        <div class="info-section-title">Our Story</div>
        <p>
          Teo D' Mango Premium is a mango-based beverage shop focused on serving refreshing,
          fruit-forward drinks made for everyday cravings. Built around the idea of quick service,
          quality ingredients, and a satisfying customer experience, the brand continues to grow
          as a local favorite for students, families, and mango lovers in the community.
        </p>
      </div>

      <div class="info-section">
        <div class="info-section-title">What We Serve</div>
        <p>
          Our menu highlights signature mango drinks, seasonal flavors, creamy blends, add-ons,
          and customizable sizes designed to match different tastes and preferences. We aim to
          provide a consistent and enjoyable experience whether customers order in-store, through
          kiosk service, or online.
        </p>
      </div>

      <div class="info-section">
        <div class="info-section-title">Store Details</div>
        <ul>
          <li><strong>Business Name:</strong> Teo D' Mango Premium</li>
          <li><strong>Location:</strong> Lemery, Batangas</li>
          <li><strong>Business Hours:</strong> 10:00 AM - 10:00 PM</li>
          <li><strong>Email:</strong> teodmangolicious@gmail.com</li>
        </ul>
      </div>

      <p class="info-note">
        We continuously improve our service, products, and digital experience to better serve our customers.
      </p>
    `
  },

  privacy: {
    title: "Privacy Policy",
    icon: "fa-solid fa-shield-halved",
    body: `
      <div class="info-section">
        <div class="info-section-title">Information We Collect</div>
        <p>
          When you create an account, place an order, top up your wallet, submit inquiries, or
          leave feedback, we may collect basic customer information such as your name, email
          address, order details, wallet activity, and profile preferences.
        </p>
      </div>

      <div class="info-section">
        <div class="info-section-title">How We Use Your Information</div>
        <ul>
          <li>To process orders and payments securely</li>
          <li>To manage rewards points, wallet balance, and customer accounts</li>
          <li>To respond to inquiries, support requests, and service concerns</li>
          <li>To improve product offerings, announcements, and customer experience</li>
        </ul>
      </div>

      <div class="info-section">
        <div class="info-section-title">Data Protection</div>
        <p>
          We take reasonable steps to protect account and transaction information through access
          controls, authenticated account handling, and system-level safeguards. Only authorized
          personnel and approved platform functions should access customer data relevant to store operations.
        </p>
      </div>

      <div class="info-section">
        <div class="info-section-title">Customer Responsibility</div>
        <p>
          Customers are encouraged to keep login credentials private, review account activity
          regularly, and contact support immediately if they notice unauthorized access or unusual transactions.
        </p>
      </div>

      <p class="info-note">
        This policy may be updated from time to time to reflect operational improvements and service changes.
      </p>
    `
  },

  terms: {
    title: "Terms of Service",
    icon: "fa-solid fa-file-contract",
    body: `
      <div class="info-section">
        <div class="info-section-title">General Use</div>
        <p>
          By using the Teo D' Mango Premium website, ordering system, rewards features, and wallet services,
          you agree to use the platform responsibly and only for legitimate customer transactions and account activities.
        </p>
      </div>

      <div class="info-section">
        <div class="info-section-title">Orders and Payments</div>
        <ul>
          <li>All submitted orders are subject to store confirmation and product availability.</li>
          <li>Wallet payments are processed against the available balance in the linked customer account.</li>
          <li>Cash orders may remain pending until payment is completed at pickup or in-store processing.</li>
          <li>Promos, rewards, and announcements may have separate conditions depending on current store rules.</li>
        </ul>
      </div>

      <div class="info-section">
        <div class="info-section-title">Rewards and Account Features</div>
        <p>
          Points, wallet balances, and notifications displayed in the customer portal are intended to reflect the
          latest recorded transactions in the system. Store management reserves the right to validate suspicious,
          duplicate, incomplete, or incorrect activity before applying benefits or adjustments.
        </p>
      </div>

      <div class="info-section">
        <div class="info-section-title">Acceptable Use</div>
        <p>
          Users must not attempt to misuse the ordering system, manipulate rewards, interfere with account access,
          or submit false, abusive, or misleading information through the platform.
        </p>
      </div>

      <p class="info-note">
        Continued use of the platform means you understand and accept these service conditions.
      </p>
    `
  },

  support: {
    title: "Support",
    icon: "fa-solid fa-headset",
    body: `
      <div class="info-section">
        <div class="info-section-title">Customer Assistance</div>
        <p>
          Our support channel is available for order concerns, reward questions, wallet issues,
          account-related concerns, and general customer assistance. We aim to respond to submitted
          concerns as promptly as possible during store operating hours.
        </p>
      </div>

      <div class="info-section">
        <div class="info-section-title">Best Ways to Reach Us</div>
        <ul>
          <li>Use the in-page <strong>Send Inquiry</strong> feature inside your customer dashboard</li>
          <li>Email us at <strong>teodmangolicious@gmail.com</strong></li>
          <li>Message the official store social pages for general updates and announcements</li>
        </ul>
      </div>

      <div class="info-section">
        <div class="info-section-title">Common Concerns We Handle</div>
        <ul>
          <li>Order verification and follow-up</li>
          <li>Rewards points and redemption concerns</li>
          <li>TeoPay wallet balance or payment issues</li>
          <li>Profile account updates and access issues</li>
          <li>Store announcements and general customer concerns</li>
        </ul>
      </div>

      <div class="info-section">
        <div class="info-section-title">Response Window</div>
        <p>
          Response times may vary depending on the volume of inquiries, store activity, and the nature of the concern.
          For urgent payment or order-related issues, please provide complete details so the team can review them faster.
        </p>
      </div>

      <p class="info-note">
        Store support hours generally follow our business operations in Lemery, Batangas from 10:00 AM to 10:00 PM.
      </p>
    `
  }
};

function openFooterInfoModal(type) {
  const modal = document.getElementById("footerInfoModal");
  const titleEl = document.getElementById("footerInfoModalTitle");
  const bodyEl = document.getElementById("footerInfoModalBody");
  const iconWrap = document.getElementById("footerInfoModalIcon");

  if (!modal || !titleEl || !bodyEl || !iconWrap) return;

  const content = footerModalContentMap[type];
  if (!content) return;

  titleEl.textContent = content.title;
  iconWrap.innerHTML = `<i class="${content.icon}"></i>`;
  bodyEl.innerHTML = content.body;

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeFooterInfoModal() {
  const modal = document.getElementById("footerInfoModal");
  if (!modal) return;

  modal.classList.remove("active");
  document.body.style.overflow = "auto";
}

function bindFooterInfoModal() {
  const modal = document.getElementById("footerInfoModal");
  const closeBtn = document.getElementById("footerInfoModalClose");

  const aboutLink = document.getElementById("footerAboutLink");
  const privacyLink = document.getElementById("footerPrivacyLink");
  const termsLink = document.getElementById("footerTermsLink");
  const supportLink = document.getElementById("footerSupportLink");

  if (aboutLink) {
    aboutLink.addEventListener("click", (e) => {
      e.preventDefault();
      openFooterInfoModal("about");
    });
  }

  if (privacyLink) {
    privacyLink.addEventListener("click", (e) => {
      e.preventDefault();
      openFooterInfoModal("privacy");
    });
  }

  if (termsLink) {
    termsLink.addEventListener("click", (e) => {
      e.preventDefault();
      openFooterInfoModal("terms");
    });
  }

  if (supportLink) {
    supportLink.addEventListener("click", (e) => {
      e.preventDefault();
      openFooterInfoModal("support");
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", closeFooterInfoModal);
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeFooterInfoModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal?.classList.contains("active")) {
      closeFooterInfoModal();
    }
  });
}

window.dismissStickyNotification = dismissStickyNotification;
window.scrollToNotifications = scrollToNotifications;

window.openAnnouncementModal = openAnnouncementModal;
window.closeAnnouncementModal = closeAnnouncementModal;
window.openInquiryModal = openInquiryModal;
window.closeInquiryModal = closeInquiryModal;
window.openFeedbackModal = openFeedbackModal;
window.closeFeedbackModal = closeFeedbackModal;
window.viewReceipt = viewReceipt;
window.closeReceiptModal = closeReceiptModal;