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

        // Hero / card
        document.querySelectorAll(".user-name").forEach(el => {
            el.textContent = fullName;
        });

        const avatarCircle = document.querySelector(".avatar-circle:not(#panelUserInitials)");
        if (avatarCircle) avatarCircle.textContent = initials;

        const walletId = String(userData.user_id || 0).padStart(6, "0");
        const formattedCard = walletId.match(/.{1,3}/g)?.join(" ") || "000 000";

        const cardNumber = document.getElementById("cardNumber");
        if (cardNumber) cardNumber.textContent = formattedCard;

        const walletBalanceEl = document.getElementById("walletBalance");
        if (walletBalanceEl) walletBalanceEl.textContent = formatPeso(walletBalance);

        // Shared side panel
        updateAccountPanelUI({
            fullName,
            tierLabel: tier.labelUpper,
            points,
            walletBalance
        });

        await loadWelcomeOrders(token);
        await loadAnnouncements();
    } catch (err) {
        console.error("Failed to initialize welcome page:", err);
    }
});

async function loadWelcomeOrders(token) {
    try {
        const res = await fetch("http://127.0.0.1:8000/orders/my", {
            headers: {
                Authorization: "Bearer " + token
            }
        });

        const data = await res.json();
        const container = document.getElementById("reorderList");
        if (!container) return;

        container.innerHTML = "";

        if (!Array.isArray(data) || data.length === 0) {
            container.innerHTML = `
                <div class="announcement-empty">No previous orders yet.</div>
            `;
            return;
        }

        data.slice(0, 5).forEach(order => {
            container.innerHTML += `
                <div class="reorder-item" onclick="window.location.href='menu.html'">
                    <div class="reorder-info">
                        <h4>${order.product_name || "Order Item"}</h4>
                        <p>Previous order</p>
                    </div>
                    <button class="btn-small">₱${Number(order.price || 0).toFixed(2)}</button>
                </div>
            `;
        });
    } catch (err) {
        console.error("Failed to load orders:", err);
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

        if (announcements.length === 0) {
            preview.innerHTML = `<div class="announcement-empty">No announcements available.</div>`;
            if (list) list.innerHTML = `<div class="announcement-empty">No announcements available.</div>`;
            return;
        }

        const latest = announcements[0];
        preview.innerHTML = `
            <div class="announcement-card">
                <div class="announcement-title">
                    ${latest.is_pinned ? `<i class="fa-solid fa-thumbtack"></i> ` : ``}
                    ${latest.title || "Announcement"}
                </div>
                <div class="announcement-meta">
                    ${latest.created_at ? new Date(latest.created_at).toLocaleString() : "Latest update"}
                </div>
                <div class="announcement-body">
                    ${latest.body || ""}
                </div>
            </div>
        `;

        if (list) {
            list.innerHTML = announcements.map(item => `
                <div class="announcement-card">
                    <div class="announcement-title">
                        ${item.is_pinned ? `<i class="fa-solid fa-thumbtack"></i> ` : ``}
                        ${item.title || "Announcement"}
                    </div>
                    <div class="announcement-meta">
                        ${item.created_at ? new Date(item.created_at).toLocaleString() : "Latest update"}
                    </div>
                    <div class="announcement-body">
                        ${item.body || ""}
                    </div>
                </div>
            `).join("");
        }
    } catch (err) {
        console.error("Failed to load announcements:", err);
    }
}