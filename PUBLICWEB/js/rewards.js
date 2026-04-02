function updateRewardsPageUI({ user, points, walletBalance, tier }) {
    const pointsBalance = document.getElementById("pointsBalance");
    const memberStatus = document.getElementById("memberStatus");

    if (pointsBalance) {
        pointsBalance.textContent = Number(points || 0).toLocaleString();
    }

    if (memberStatus) {
        memberStatus.innerHTML = `<i class="fa-solid ${tier.icon}"></i> ${tier.labelUpper}`;
    }
}

const recentHistoryList = document.getElementById("recentHistoryList");
const fullHistoryList = document.getElementById("fullHistoryList");
const redeemModal = document.getElementById("redeemModal");
const redeemRewardName = document.getElementById("redeemRewardName");
const redeemToken = document.getElementById("redeemToken");
const redeemExpiry = document.getElementById("redeemExpiry");
const redeemQrCanvas = document.getElementById("redeemQrCanvas");

let allTransactions = [];

/* =========================
   HELPERS
========================= */
function formatDateTime(dateStr) {
    if (!dateStr) return "--";
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;

    return d.toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function showEmptyHistory(target, message = "No transaction history yet.") {
    if (!target) return;

    target.innerHTML = `
        <div style="
            padding: 18px;
            border: 1px dashed var(--card-border);
            border-radius: 16px;
            text-align: center;
            color: var(--text-muted);
            font-weight: 700;
        ">
            ${message}
        </div>
    `;
}

function normalizeTransaction(tx) {
    return {
        id: tx.id || tx.order_id || tx.transaction_id || "N/A",
        title:
            tx.title ||
            tx.description ||
            tx.reward_name ||
            tx.product_name ||
            "Transaction",
        type: (tx.type || tx.transaction_type || "earn").toLowerCase(),
        amount: Number(tx.amount || tx.points || tx.point_change || 0),
        date: tx.created_at || tx.date || tx.transaction_date || null
    };
}

function renderHistory(list, target, limit = null) {
    if (!target) return;

    if (!Array.isArray(list) || list.length === 0) {
        showEmptyHistory(target, "No transaction history yet.");
        return;
    }

    const items = limit ? list.slice(0, limit) : list;

    target.innerHTML = items.map(raw => {
        const tx = normalizeTransaction(raw);
        const isSpend = tx.type === "spend" || tx.type === "redeem";
        const sign = isSpend ? "-" : "+";
        const icon = isSpend ? "fa-gift" : "fa-star";
        const color = isSpend ? "#ef4444" : "#10b981";

        return `
            <div class="ledger-item" style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:12px;
                padding:14px 0;
                border-bottom:1px solid var(--card-border);
            ">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="
                        width:42px;
                        height:42px;
                        border-radius:50%;
                        display:grid;
                        place-items:center;
                        background:var(--icon-bg);
                        flex-shrink:0;
                    ">
                        <i class="fa-solid ${icon}"></i>
                    </div>

                    <div>
                        <h4 style="
                            margin:0;
                            font-size:15px;
                            font-weight:800;
                            color:var(--text-main);
                        ">
                            ${tx.title}
                        </h4>
                        <p style="
                            margin:4px 0 0;
                            font-size:12px;
                            color:var(--text-muted);
                        ">
                            ${formatDateTime(tx.date)}
                        </p>
                    </div>
                </div>

                <div style="
                    font-size:15px;
                    font-weight:900;
                    color:${color};
                    white-space:nowrap;
                ">
                    ${sign}${Math.abs(tx.amount)} PTS
                </div>
            </div>
        `;
    }).join("");
}

/* =========================
   HISTORY
========================= */
async function loadRewardHistory() {
    try {
        const history = await fetchRewardHistory();

        allTransactions = Array.isArray(history)
            ? history
            : Array.isArray(history?.items)
            ? history.items
            : Array.isArray(history?.data)
            ? history.data
            : [];

        renderHistory(allTransactions, recentHistoryList, 3);
        renderHistory(allTransactions, fullHistoryList);
    } catch (err) {
        console.error("Failed to load reward history", err);
        allTransactions = [];
        showEmptyHistory(recentHistoryList, "No transaction history yet.");
        showEmptyHistory(fullHistoryList, "No transaction history yet.");
    }
}

function openFullHistory() {
    const modal = document.getElementById("fullHistoryModal");
    if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }
}

function filterLedger(type, button) {
    document.querySelectorAll(".history-tab").forEach(tab => {
        tab.classList.remove("active");
    });

    if (button) button.classList.add("active");

    if (type === "all") {
        renderHistory(allTransactions, fullHistoryList);
        return;
    }

    const filtered = allTransactions.filter(raw => {
        const tx = normalizeTransaction(raw);
        if (type === "earn") {
            return tx.type === "earn";
        }
        if (type === "spend") {
            return tx.type === "spend" || tx.type === "redeem";
        }
        return true;
    });

    renderHistory(filtered, fullHistoryList);
}

/* =========================
   REDEEM
========================= */
async function handleRedeem(button) {
    try {
        const rewardId = Number(button.dataset.id);
        const rewardName = button.dataset.name || "Reward";

        console.log("BUTTON:", button);
        console.log("BUTTON DATASET:", button.dataset);
        console.log("REWARD ID:", rewardId);

        if (!rewardId || Number.isNaN(rewardId)) {
            throw new Error("Reward ID is missing or invalid.");
        }

        button.disabled = true;
        button.textContent = "PROCESSING...";

        const result = await generateRewardQr(rewardId);

        const token = result.qr_token || result.token || result.redeem_token || "----";
        const expiresAt = result.expires_at || result.expiry || result.valid_until || "--";

        document.getElementById("redeemRewardName").textContent = rewardName;
        document.getElementById("redeemToken").textContent = token;
        document.getElementById("redeemExpiry").textContent = formatExpiry(expiresAt);

        const canvas = document.getElementById("redeemQrCanvas");
        if (window.QRCode && canvas) {
            await QRCode.toCanvas(canvas, token, {
                width: 220,
                margin: 2
            });
        }

        const redeemModal = document.getElementById("redeemModal");
        if (redeemModal) {
            redeemModal.classList.remove("hidden");
            redeemModal.classList.add("active");
        }

        document.body.style.overflow = "hidden";
    } catch (err) {
        console.error("Redeem failed", err);
        alert(err.message || "Failed to generate redeem QR.");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "CLAIM";
        }
    }
}
function closeRedeemModal() {
    if (redeemModal) {
        redeemModal.classList.remove("active");
        redeemModal.classList.add("hidden");
    }
    document.body.style.overflow = "auto";
}

function formatExpiry(dateStr) {
    const date = new Date(dateStr);

    return date.toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    });
}

/* =========================
   API HELPERS
========================= */
async function fetchRewardHistory() {
    console.log("HISTORY TOKEN:", getToken());
    console.log("HISTORY HEADERS:", getAuthHeaders());

    const { res, data } = await apiGet("/rewards/points/history");

    console.log("HISTORY STATUS:", res.status);
    console.log("HISTORY RESPONSE:", data);

    if (!res.ok) {
        throw new Error(data.detail || "Unable to fetch reward history.");
    }

    return data;
}

async function generateRewardQr(rewardId) {
    console.log("TOKEN FROM getToken():", getToken());
    console.log("AUTH HEADERS:", getAuthHeaders());
    console.log("REWARD ID SENT:", rewardId);

    const res = await fetch(`${API_BASE_URL}/rewards/redeem-qr/generate?reward_id=${rewardId}`, {
        method: "POST",
        headers: getAuthHeaders()
    });

    const data = await res.json().catch(() => ({}));

    console.log("REDEEM STATUS:", res.status);
    console.log("REDEEM RESPONSE:", data);

    if (!res.ok) {
        throw new Error(
            typeof data.detail === "string"
                ? data.detail
                : Array.isArray(data.detail)
                ? data.detail.map(err => err.msg).join(", ")
                : JSON.stringify(data.detail || data)
        );
    }

    return data;
}

/* =========================
   EXPOSE TO HTML onclick
========================= */
window.handleRedeem = handleRedeem;
window.openFullHistory = openFullHistory;
window.closeRedeemModal = closeRedeemModal;
window.filterLedger = filterLedger;

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const user = await fetchCurrentUser();
        const points = await fetchRewardPoints();
        const walletBalance = await fetchWalletBalance();
        const tier = getTierData(points);

        updateRewardsPageUI({ user, points, walletBalance, tier });

        updateAccountPanelUI({
            fullName:
                user.full_name ||
                user.name ||
                user.username ||
                user.email ||
                "User",
            tierLabel: tier.labelUpper,
            points,
            walletBalance
        });

        await loadRewardHistory();
    } catch (err) {
        console.error("Failed to initialize rewards page", err);
        showEmptyHistory(recentHistoryList, "No transaction history yet.");
        showEmptyHistory(fullHistoryList, "No transaction history yet.");
    }
});

function updateRewardsPageUI({ user, points, walletBalance, tier }) {
    const pointsBalance = document.getElementById("pointsBalance");
    const memberStatus = document.getElementById("memberStatus");

    if (pointsBalance) {
        pointsBalance.textContent = Number(points || 0).toLocaleString();
    }

    if (memberStatus) {
        memberStatus.innerHTML = `<i class="fa-solid ${tier.icon}"></i> ${tier.labelUpper}`;
    }

    const claimButtons = document.querySelectorAll(".btn-claim");

    claimButtons.forEach((btn) => {
        const rewardId = Number(btn.dataset.id);

        let requiredPoints = 0;

        if (rewardId === 1) requiredPoints = 2800;
        if (rewardId === 2) requiredPoints = 1000;

        const canClaim = points >= requiredPoints;

        btn.disabled = !canClaim;

        if (canClaim) {
            btn.textContent = "Claim";
            btn.classList.remove("locked");
            btn.title = "";
        } else {
            btn.textContent = "Locked";
            btn.classList.add("locked");
            btn.title = `You need ${requiredPoints.toLocaleString()} points to claim this reward.`;
        }
    });
}