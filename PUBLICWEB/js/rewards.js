const recentHistoryList = document.getElementById("recentHistoryList");
const fullHistoryList = document.getElementById("fullHistoryList");
const rewardsList = document.getElementById("rewardsList");

const redeemModal = document.getElementById("redeemModal");
const redeemRewardName = document.getElementById("redeemRewardName");
const redeemToken = document.getElementById("redeemToken");
const redeemExpiry = document.getElementById("redeemExpiry");
const redeemQrCanvas = document.getElementById("redeemQrCanvas");

let allTransactions = [];
let allRewards = [];
let currentPoints = 0;
function parseServerDate(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (raw.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(raw)) {
    const utcDate = new Date(raw);
    return Number.isNaN(utcDate.getTime()) ? null : utcDate;
  }

  const normalized = raw.replace(" ", "T");
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/
  );

  if (!match) {
    const fallbackDate = new Date(raw);
    return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
  }

  const [, year, month, day, hour, minute, second = "00"] = match;

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
}
function formatDateTime(dateStr) {
  if (!dateStr) return "--";

  const d = parseServerDate(dateStr);
  if (!d || Number.isNaN(d.getTime())) return dateStr;

  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function formatExpiry(dateStr, hasExpiry = true) {
  if (!hasExpiry || !dateStr) return "No Expiry";

  const date = parseServerDate(dateStr);
  if (!date || Number.isNaN(date.getTime())) return "No Expiry";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
function showEmptyHistory(target, message = "No transaction history yet.") {
  if (!target) return;

  target.innerHTML = `
        <div class="empty-history">
            <i class="fa-solid fa-receipt"></i>
            <h4>Nothing here yet</h4>
            <p>${message}</p>
        </div>
    `;
}

function normalizeTransaction(tx) {
  const rawType = String(
    tx.type || tx.transaction_type || "earn",
  ).toLowerCase();
  const points = Number(tx.amount || tx.points || tx.points_change || 0);

  return {
    id: tx.id || tx.order_id || tx.transaction_id || "N/A",
    title:
      tx.title ||
      tx.description ||
      tx.reward_name ||
      (rawType === "redeem" ? "Reward Redemption" : "Points Earned"),
    type: rawType,
    amount: points,
    date: tx.created_at || tx.date || tx.transaction_date || null,
    displayOrderId: tx.display_order_id || null,
  };
}

function renderHistory(list, target, limit = null) {
  if (!target) return;

  if (!Array.isArray(list) || list.length === 0) {
    showEmptyHistory(target, "No transaction history yet.");
    return;
  }

  const items = limit ? list.slice(0, limit) : list;

  target.innerHTML = items
    .map((raw) => {
      const tx = normalizeTransaction(raw);
      const isSpend = tx.type === "spend" || tx.type === "redeem";
      const sign = isSpend ? "-" : "+";
      const icon = isSpend ? "fa-gift" : "fa-star";
      const color = isSpend ? "#ef4444" : "#10b981";
      const subtitle = tx.displayOrderId
        ? `${formatDateTime(tx.date)} • ${tx.displayOrderId}`
        : formatDateTime(tx.date);

      return `
            <div class="ledger-item">
                <div class="ledger-left">
                    <div style="width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:var(--icon-bg);flex-shrink:0;">
                        <i class="fa-solid ${icon}"></i>
                    </div>

                    <div class="ledger-details">
                        <h4>${tx.title}</h4>
                        <p>${subtitle}</p>
                    </div>
                </div>

                <div style="font-size:15px;font-weight:900;color:${color};white-space:nowrap;">
                    ${sign}${Math.abs(tx.amount)} PTS
                </div>
            </div>
        `;
    })
    .join("");
}

function getRewardImageByName(name) {
  const clean = String(name || "").toLowerCase();

  if (clean.includes("mango")) return "mango.png";
  if (clean.includes("avocado")) return "avo2.png";
  return "mango.png";
}

function renderRewards(points, rewards = null) {
  if (!rewardsList) return;

  const rewardRows =
    Array.isArray(rewards) && rewards.length
      ? rewards
      : [
          {
            reward_id: 1,
            name: "Free Classic Teo D Mango",
            points_required: 2800,
            image_url: "mango.png",
            claimable: points >= 2800,
          },
          {
            reward_id: 2,
            name: "Free Avocado",
            points_required: 2800,
            image_url: "avo2.png",
            claimable: points >= 2800,
          },
        ];

  allRewards = rewardRows;

  rewardsList.innerHTML = rewardRows
    .map((reward) => {
      const requiredPoints = Number(reward.points_required || 2800);
      const canClaim =
        typeof reward.claimable === "boolean"
          ? reward.claimable
          : points >= requiredPoints;

      const image = reward.image_url || getRewardImageByName(reward.name);

      return `
            <div class="reward-item ${canClaim ? "" : "locked"}">
                <div class="ledger-left">
                    <img src="${image}" class="reward-img" alt="${reward.name}">
                    <div class="reward-info">
                        <h5>${reward.name}</h5>
                        <p>${requiredPoints.toLocaleString()} POINTS</p>
                    </div>
                </div>

                <button
                    class="btn-claim"
                    data-id="${Number(reward.reward_id)}"
                    data-name="${reward.name}"
                    ${canClaim ? "" : "disabled title='You need more points to unlock this reward.'"}
                    onclick="handleRedeem(this)"
                >
                    ${canClaim ? "Claim" : "Locked"}
                </button>
            </div>
        `;
    })
    .join("");
}

function updateRewardsPageUI({ points, tier }) {
  const pointsBalance = document.getElementById("pointsBalance");
  const memberStatus = document.getElementById("memberStatus");

  if (pointsBalance) {
    pointsBalance.textContent = Number(points || 0).toLocaleString();
  }

  if (memberStatus) {
    memberStatus.innerHTML = `<i class="fa-solid ${tier.icon}"></i> ${tier.labelUpper}`;
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
  document
    .querySelectorAll(".history-tab")
    .forEach((tab) => tab.classList.remove("active"));
  if (button) button.classList.add("active");

  if (type === "all") {
    renderHistory(allTransactions, fullHistoryList);
    return;
  }

  const filtered = allTransactions.filter((raw) => {
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

async function fetchRewardHistory() {
  const { res, data } = await apiGet("/rewards/points/history");

  if (!res.ok) {
    throw new Error(data.detail || "Unable to fetch reward history.");
  }

  return data;
}

async function fetchRewardCatalog() {
  const { res, data } = await apiGet("/rewards/catalog");

  if (!res.ok) {
    throw new Error(data.detail || "Unable to fetch rewards catalog.");
  }

  return data;
}

async function generateRewardQr(rewardId) {
  const res = await fetch(
    `${API_BASE_URL}/rewards/redeem-qr/generate?reward_id=${rewardId}`,
    {
      method: "POST",
      headers: getAuthHeaders(),
    },
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((err) => err.msg).join(", ")
          : "Failed to generate redeem QR.",
    );
  }

  return data;
}

async function loadRewardHistory() {
  try {
    const history = await fetchRewardHistory();

    allTransactions = Array.isArray(history?.history)
      ? history.history
      : Array.isArray(history)
        ? history
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

async function loadRewardsCatalog(points) {
  try {
    const catalog = await fetchRewardCatalog();

    const rewards = Array.isArray(catalog?.data) ? catalog.data : [];
    renderRewards(points, rewards);
  } catch (err) {
    console.error("Failed to load reward catalog", err);
    renderRewards(points, null);
  }
}

async function handleRedeem(button) {
  try {
    const rewardId = Number(button.dataset.id);
    const rewardName = button.dataset.name || "Reward";

    if (!rewardId || Number.isNaN(rewardId)) {
      throw new Error("Reward ID is missing or invalid.");
    }

    button.disabled = true;
    button.textContent = "Processing...";

    const result = await generateRewardQr(rewardId);

    const token =
      result.qr_token || result.token || result.redeem_token || "----";
    const expiresAt = result.expires_at || null;
    const hasExpiry = Boolean(result.has_expiry);

    if (redeemRewardName) redeemRewardName.textContent = rewardName;
    if (redeemToken) redeemToken.textContent = token;
    if (redeemExpiry)
      redeemExpiry.textContent = formatExpiry(expiresAt, hasExpiry);

    if (window.QRCode && redeemQrCanvas) {
      redeemQrCanvas
        .getContext("2d")
        .clearRect(0, 0, redeemQrCanvas.width, redeemQrCanvas.height);
      await QRCode.toCanvas(redeemQrCanvas, token, {
        width: 220,
        margin: 2,
      });
    }

    if (redeemModal) {
      redeemModal.classList.remove("hidden");
    }

    document.body.style.overflow = "hidden";
  } catch (err) {
    console.error("Redeem failed", err);
    alert(err.message || "Failed to generate redeem QR.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Claim";
    }
  }
}

function closeRedeemModal() {
  if (redeemModal) {
    redeemModal.classList.add("hidden");
  }
  document.body.style.overflow = "auto";
}

function closeAllPanels(event) {
  if (event) event.stopPropagation();

  document.getElementById("fullHistoryModal")?.classList.remove("active");
  document.getElementById("mainOverlay")?.classList.remove("active");
  document.getElementById("accountPanel")?.classList.remove("active");
  closeRedeemModal();
  document.body.style.overflow = "auto";
}

window.handleRedeem = handleRedeem;
window.openFullHistory = openFullHistory;
window.closeRedeemModal = closeRedeemModal;
window.filterLedger = filterLedger;
window.closeAllPanels = closeAllPanels;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const user = await fetchCurrentUser();
    const points = await fetchRewardPoints();
    const walletBalance = await fetchWalletBalance();
    const tier = getTierData(points);

    currentPoints = Number(points || 0);

    updateRewardsPageUI({ points: currentPoints, tier });

    if (typeof updateAccountPanelUI === "function") {
      updateAccountPanelUI({
        fullName:
          user.full_name || user.name || user.username || user.email || "User",
        tierLabel: tier.labelUpper,
        points: currentPoints,
        walletBalance,
      });
    }

    await loadRewardsCatalog(currentPoints);
    await loadRewardHistory();
  } catch (err) {
    console.error("Failed to initialize rewards page", err);
    showEmptyHistory(recentHistoryList, "No transaction history yet.");
    showEmptyHistory(fullHistoryList, "No transaction history yet.");
    renderRewards(0, null);
  }
});
