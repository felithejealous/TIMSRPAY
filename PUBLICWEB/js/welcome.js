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

        const fullName =
            userData.full_name ||
            userData.name ||
            userData.username ||
            userData.email ||
            "User";

        const initials = getInitials(fullName);
        const points = await fetchRewardPoints().catch(() => 0);
        const walletBalance = await fetchWalletBalance().catch(() => 0);
        const tier = getTierData(points);

        document.querySelectorAll(".user-name").forEach(el => {
            el.textContent = fullName;
        });

        const cardNameEl = document.querySelector(".card-name.user-name");
        if (cardNameEl) {
            cardNameEl.textContent = fullName.toUpperCase();
        }

        const avatarCircle = document.querySelector(".avatar-circle:not(#panelUserInitials)");
        if (avatarCircle) avatarCircle.textContent = initials;

        const rawWalletCode = (userData.wallet_code || "").trim().toUpperCase();
        const formattedCard =
            rawWalletCode
                ? rawWalletCode.match(/.{1,3}/g)?.join(" ") || rawWalletCode
                : "------";

        const cardNumber = document.getElementById("cardNumber");
        if (cardNumber) cardNumber.textContent = formattedCard;

        const walletBalanceEl = document.getElementById("walletBalance");
        if (walletBalanceEl) walletBalanceEl.textContent = formatPeso(walletBalance);

        updateAccountPanelUI({
            fullName,
            tierLabel: tier.labelUpper,
            points,
            walletBalance
        });

        bindOrderFilter();
        bindReceiptModal();

        await loadWelcomeOrders();
        await loadAnnouncements();
        await loadMonthlyBestSellers();
    } catch (err) {
        console.error("Failed to initialize welcome page:", err);
    }
});
function resolveProductImageUrl(imageUrl, productName = "") {
    const cleanName = String(productName || "").trim().toLowerCase();

    const nameFallbackMap = {
        "classic mango bliss": "mango.png",
        "mango": "mango.png",
        "creamy buko slush": "buko2.png",
        "buko": "buko2.png",
        "strawberry dream": "berry2.png",
        "strawberry": "berry2.png",
        "ube macapuno slush": "ube2.png",
        "ube": "ube2.png",
        "lychee": "lychee.png",
        "avocado": "avocado.png"
    };

    const fallback = nameFallbackMap[cleanName] || "mango.png";

    if (!imageUrl) return fallback;

    const clean = String(imageUrl).trim();

    if (!clean) return fallback;

    if (clean.startsWith("http://") || clean.startsWith("https://")) {
        return clean;
    }

    if (clean.startsWith("/")) {
        return `http://127.0.0.1:8000${clean}`;
    }

    return clean;
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
        if (e.target === modal) {
            closeReceiptModal();
        }
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
        minute: "2-digit"
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

        const res = await fetch("http://127.0.0.1:8000/products/best-sellers/monthly?limit=4");
        const data = await res.json();

        if (!res.ok) {
            grid.innerHTML = `<div class="announcement-empty">Failed to load best sellers.</div>`;
            return;
        }

        const items = Array.isArray(data.data) ? data.data : [];

        if (title && data.month) {
            title.textContent = `Best Sellers • ${data.month}`;
        }

        if (items.length === 0) {
            grid.innerHTML = `<div class="announcement-empty">No best seller data available for this month yet.</div>`;
            return;
        }

        grid.innerHTML = items.map(item => {
            const imageSrc = resolveProductImageUrl(item.image_url, item.name);
            const productName = escapeHtml(item.name || "Product");
            const soldQty = Number(item.sold_qty || 0);
            const price = Number(item.price || 0).toFixed(2);

            return `
                <div class="bs-card" onclick="window.location.href='menu.html'">
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
        if (grid) {
            grid.innerHTML = `<div class="announcement-empty">Failed to load best sellers.</div>`;
        }
    }
}

async function loadWelcomeOrders() {
    try {
        const token = localStorage.getItem("token");
        const container = document.getElementById("reorderList");
        const filterEl = document.getElementById("orderHistoryFilter");

        if (!container) return;

        const selectedFilter = filterEl ? filterEl.value : "30";

        let endpoint = "http://127.0.0.1:8000/orders/my?limit=50&days=30";

        if (selectedFilter === "7") {
            endpoint = "http://127.0.0.1:8000/orders/my?limit=50&days=7";
        } else if (selectedFilter === "30") {
            endpoint = "http://127.0.0.1:8000/orders/my?limit=50&days=30";
        } else if (selectedFilter === "paid") {
            endpoint = "http://127.0.0.1:8000/orders/my?limit=50&days=30&status=paid";
        } else if (selectedFilter === "completed") {
            endpoint = "http://127.0.0.1:8000/orders/my?limit=50&days=30&status=completed";
        }

        const res = await fetch(endpoint, {
            headers: {
                Authorization: "Bearer " + token
            }
        });

        const data = await res.json();
        container.innerHTML = "";

        if (!res.ok) {
            container.innerHTML = `
                <div class="announcement-empty">Failed to load order history.</div>
            `;
            return;
        }

        if (!Array.isArray(data) || data.length === 0) {
            container.innerHTML = `
                <div class="announcement-empty">No orders found in the selected range.</div>
            `;
            return;
        }

        container.innerHTML = data.map(order => {
            const orderTitle = escapeHtml(order.items_summary || order.product_name || "Order Item");
            const orderPrice = Number(order.total_amount || order.price || 0).toFixed(2);
            const createdAt = formatDateTime(order.created_at);
            const orderType = escapeHtml((order.order_type || "order").toUpperCase());
            const orderStatus = escapeHtml((order.status || "pending").toUpperCase());
            const paymentMethod = escapeHtml((order.payment_method || "cash").toUpperCase());
            const displayId = escapeHtml(order.display_id || `#${order.order_id}`);

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
                        <div class="order-meta">
                            ${Number(order.earned_points || 0)} pts earned
                        </div>

                        <div class="order-actions">
                            <button class="order-action-btn" type="button" onclick="window.location.href='menu.html'">
                                Order Again
                            </button>
                            <button class="order-action-btn" type="button" onclick="viewReceipt(${Number(order.order_id)})">
                                View Receipt
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join("");
    } catch (err) {
        console.error("Failed to load orders:", err);

        const container = document.getElementById("reorderList");
        if (container) {
            container.innerHTML = `
                <div class="announcement-empty">Failed to load order history.</div>
            `;
        }
    }
}

async function loadAnnouncements() {
    try {
        const res = await fetch("http://127.0.0.1:8000/announcements/public");
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
                <div class="announcement-meta">
                    ${formatAnnouncementDate(item.publish_at || item.created_at)}
                </div>
                ${
                    item.image_url
                        ? `<img src="http://127.0.0.1:8000${item.image_url}" alt="${escapeHtml(item.title || "Announcement")}" style="width:100%; max-height:220px; object-fit:cover; border-radius:14px; margin-bottom:12px;">`
                        : ``
                }
                <div class="announcement-body">
                    ${escapeHtml(item.body || "")}
                </div>
            </div>
        `;

        const latest = announcements[0];
        preview.innerHTML = renderAnnouncementCard(latest);

        if (list) {
            list.innerHTML = announcements.map(renderAnnouncementCard).join("");
        }
    } catch (err) {
        console.error("Failed to load announcements:", err);

        const preview = document.getElementById("announcementPreview");
        const list = document.getElementById("announcementList");

        if (preview) {
            preview.innerHTML = `<div class="announcement-empty">Failed to load announcements.</div>`;
        }

        if (list) {
            list.innerHTML = `<div class="announcement-empty">Failed to load announcements.</div>`;
        }
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
        const res = await fetch(`http://127.0.0.1:8000/orders/${orderId}/receipt`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await res.json();

        if (!res.ok) {
            content.innerHTML = `<div class="announcement-empty">${escapeHtml(data.detail || "Failed to load receipt.")}</div>`;
            rewardSection.innerHTML = "";
            return;
        }

        title.textContent = data.display_id || `Receipt #${data.order_id}`;

        const itemsHtml = Array.isArray(data.items) && data.items.length
            ? data.items.map(item => {
                const addOnsText = Array.isArray(item.add_ons) && item.add_ons.length
                    ? item.add_ons.map(a => `${a.qty}x ${a.name}`).join(", ")
                    : "None";

                return `
                    <div class="manifest-row">
                        <span>${escapeHtml(`${item.qty}x ${item.name}`)}</span>
                        <span>${escapeHtml(formatPeso(item.line_total || 0))}</span>
                    </div>

                    <div class="manifest-row" style="border-bottom:none; padding-bottom:0;">
                        <span>Add-ons</span>
                        <span>${escapeHtml(addOnsText)}</span>
                    </div>

                    ${
                        item.notes && String(item.notes).trim()
                            ? `
                            <div class="manifest-row" style="border-bottom:none; padding-top:6px; color:#ff8c00;">
                                <span>Note</span>
                                <span style="max-width: 220px; text-align:right; white-space:normal; word-break:break-word;">
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
        const receivedAmount =
            data.amount_received !== null && data.amount_received !== undefined
                ? Number(data.amount_received)
                : (paymentMethod === "wallet" ? Number(data.total_amount || 0) : null);

        const changeAmount =
            data.change_amount !== null && data.change_amount !== undefined
                ? Number(data.change_amount)
                : (paymentMethod === "wallet" ? 0 : null);

        content.innerHTML = `
            <div class="manifest-row">
                <span>Display ID</span>
                <span>${escapeHtml(data.display_id || `#${data.order_id}`)}</span>
            </div>
            <div class="manifest-row">
                <span>Raw Order ID</span>
                <span>${escapeHtml(String(data.order_id || "-"))}</span>
            </div>
            <div class="manifest-row">
                <span>Customer</span>
                <span>${escapeHtml(data.customer_name || "Customer")}</span>
            </div>
            <div class="manifest-row">
                <span>Status</span>
                <span>${escapeHtml(String(data.status || "pending"))}</span>
            </div>
            <div class="manifest-row">
                <span>Order Type</span>
                <span>${escapeHtml(String(data.order_type || "-"))}</span>
            </div>
            <div class="manifest-row">
                <span>Payment</span>
                <span>${escapeHtml(paymentMethod === "wallet" ? "TeoPay" : (data.payment_method || "-"))}</span>
            </div>
            <div class="manifest-row">
                <span>Created At</span>
                <span>${escapeHtml(formatDateTime(data.created_at))}</span>
            </div>

            ${data.promo_code_text ? `
                <div class="manifest-row">
                    <span>Promo Code</span>
                    <span>${escapeHtml(data.promo_code_text)}</span>
                </div>
            ` : ""}

            <div class="receipt-divider"></div>

            ${itemsHtml}

            <div class="receipt-divider"></div>

            <div class="manifest-row">
                <span>Subtotal</span>
                <span>${escapeHtml(formatPeso(data.subtotal || 0))}</span>
            </div>
            <div class="manifest-row">
                <span>VAT</span>
                <span>${escapeHtml(formatPeso(data.vat_amount || 0))}</span>
            </div>
            <div class="manifest-row">
                <span>Discount</span>
                <span>${escapeHtml(formatPeso(data.discount_amount || 0))}</span>
            </div>
            <div class="manifest-row">
                <span>Total</span>
                <span>${escapeHtml(formatPeso(data.total_amount || 0))}</span>
            </div>
            <div class="manifest-row">
                <span>Received</span>
                <span>${receivedAmount === null ? "-" : escapeHtml(formatPeso(receivedAmount))}</span>
            </div>
            <div class="manifest-row">
                <span>Change</span>
                <span>${changeAmount === null ? "-" : escapeHtml(formatPeso(changeAmount))}</span>
            </div>

            ${data.is_refunded ? `
                <div class="receipt-divider"></div>
                <div class="manifest-row">
                    <span>Refunded</span>
                    <span>Yes</span>
                </div>
                <div class="manifest-row">
                    <span>Refund Count</span>
                    <span>${escapeHtml(String(data.refund_count || 0))}</span>
                </div>
                <div class="manifest-row">
                    <span>Refund Amount</span>
                    <span>${escapeHtml(formatPeso(data.refund_amount || 0))}</span>
                </div>
                <div class="manifest-row">
                    <span>Last Refund</span>
                    <span>${escapeHtml(formatDateTime(data.last_refund_at))}</span>
                </div>
            ` : ""}
        `;

        rewardSection.innerHTML = `
            <div class="reward-box">
                <div class="reward-title">Rewards / Points</div>

                <div class="reward-row">
                    <span>Earned Points</span>
                    <span>${escapeHtml(String(data.earned_points || 0))} pts</span>
                </div>

                <div class="reward-row">
                    <span>Potential Points</span>
                    <span>${escapeHtml(String(data.potential_points || 0))} pts</span>
                </div>

                <div class="reward-row">
                    <span>Points Status</span>
                    <span class="${data.points_synced ? "text-green" : "text-yellow"}">${escapeHtml(data.points_status || "none")}</span>
                </div>

                ${data.claim_message ? `
                    <div class="reward-row">
                        <span>Claim Note</span>
                        <span>${escapeHtml(data.claim_message)}</span>
                    </div>
                ` : ""}

                ${data.claim_expires_at ? `
                    <div class="reward-row">
                        <span>Claim Expires</span>
                        <span>${escapeHtml(formatDateTime(data.claim_expires_at))}</span>
                    </div>
                ` : ""}

                ${data.points_claim_method ? `
                    <div class="reward-row">
                        <span>Claim Method</span>
                        <span>${escapeHtml(data.points_claim_method)}</span>
                    </div>
                ` : ""}

                ${data.points_claimed_at ? `
                    <div class="reward-row">
                        <span>Claimed At</span>
                        <span>${escapeHtml(formatDateTime(data.points_claimed_at))}</span>
                    </div>
                ` : ""}
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

window.viewReceipt = viewReceipt;
window.closeReceiptModal = closeReceiptModal;