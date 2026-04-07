const rewardCatalogState = { rewards: [], filtered: [], products: [] };

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showSimpleAlert(message) {
  alert(message);
}
function formatRewardType(value) {
  const raw = String(value || "free_drink").replaceAll("_", " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function openRewardFormModal(mode = "create", reward = null) {
  const modal = document.getElementById("rewardFormModal");
  const title = document.getElementById("rewardFormModalTitle");
  const form = document.getElementById("rewardForm");
  const status = document.getElementById("rewardFormStatus");

  if (!modal || !form) return;

  form.reset();
  document.getElementById("rewardId").value = "";
  document.getElementById("rewardSortOrder").value = "0";
  document.getElementById("rewardType").value = "free_drink";
  document.getElementById("rewardIsActive").value = "true";
  if (status) {
    status.innerText = "";
    status.style.color = "";
  }

  if (mode === "edit" && reward) {
    title.innerText = "Edit Reward";
    document.getElementById("rewardId").value = reward.reward_id || "";
    document.getElementById("rewardName").value = reward.name || "";
    document.getElementById("rewardPointsRequired").value = reward.points_required || 2800;
    document.getElementById("rewardType").value = reward.reward_type || "free_drink";
    document.getElementById("rewardProductId").value = reward.product_id || "";
    document.getElementById("rewardSizeLabel").value = reward.size_label || "";
    document.getElementById("rewardSortOrder").value = reward.sort_order || 0;
    document.getElementById("rewardIsActive").value = String(Boolean(reward.is_active));
    document.getElementById("rewardImageUrl").value = reward.image_url || "";
    document.getElementById("rewardDescription").value = reward.description || "";
  } else {
    title.innerText = "Create Reward";
  }

  modal.classList.add("show");
}

function closeRewardFormModal() {
  const modal = document.getElementById("rewardFormModal");
  const status = document.getElementById("rewardFormStatus");
  if (modal) modal.classList.remove("show");
  if (status) {
    status.innerText = "";
    status.style.color = "";
  }
}

function updateRewardStats() {
  const rewards = rewardCatalogState.rewards || [];
  const total = rewards.length;
  const active = rewards.filter((item) => item.is_active).length;
  const inactive = rewards.filter((item) => !item.is_active).length;
  const linked = new Set(rewards.filter((item) => item.product_id).map((item) => item.product_id)).size;

  const totalEl = document.getElementById("totalRewardsCount");
  const activeEl = document.getElementById("activeRewardsCount");
  const inactiveEl = document.getElementById("inactiveRewardsCount");
  const linkedEl = document.getElementById("linkedProductsCount");

  if (totalEl) totalEl.innerText = total;
  if (activeEl) activeEl.innerText = active;
  if (inactiveEl) inactiveEl.innerText = inactive;
  if (linkedEl) linkedEl.innerText = linked;
}

function renderRewardTable() {
  const tbody = document.getElementById("rewardManagementTableBody");
  if (!tbody) return;

  const rows = rewardCatalogState.filtered || [];

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No rewards found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((item) => {
      const badgeClass = item.is_active ? "badge-active" : "badge-inactive";
      const badgeLabel = item.is_active ? "Active" : "Inactive";
      return `
        <tr>
       <td>
        <div class="reward-name-text">
            <div class="reward-title">${escapeHtml(item.name || "Reward")}</div>
            <div class="reward-sub">${escapeHtml(item.description || "No description")}</div>
            </div>
        </td>
          <td><strong>${Number(item.points_required || 0).toLocaleString()}</strong></td>
          <td>${escapeHtml(formatRewardType(item.reward_type))}</td>
          <td>${escapeHtml(item.product_name || "—")}</td>
          <td>${escapeHtml(item.size_label || "—")}</td>
          <td><span class="points-badge ${badgeClass}">${badgeLabel}</span></td>
          <td>${Number(item.sort_order || 0)}</td>
          <td>
            <div class="action-wrap">
              <button class="icon-btn edit-reward-btn" type="button" title="Edit reward" data-reward-id="${item.reward_id}"><i class="fa-solid fa-pen"></i></button>
              <button class="icon-btn toggle-reward-btn" type="button" title="Toggle active" data-reward-id="${item.reward_id}"><i class="fa-solid ${item.is_active ? "fa-toggle-on" : "fa-toggle-off"}"></i></button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function applyRewardSearch() {
  const search = String(document.getElementById("rewardSearchInput")?.value || "").trim().toLowerCase();
  const rewards = rewardCatalogState.rewards || [];

  if (!search) {
    rewardCatalogState.filtered = [...rewards];
    renderRewardTable();
    return;
  }

  rewardCatalogState.filtered = rewards.filter((item) => {
    return [
      item.name,
      item.description,
      item.reward_type,
      item.product_name,
      item.size_label,
      String(item.points_required || ""),
    ]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });

  renderRewardTable();
}

async function fetchProductsForRewardDropdown() {
  try {
    const res = await fetch(`${API_URL}/products?active_only=true&limit=500`, {
      method: "GET",
      credentials: "include",
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || "Failed to load products");

    rewardCatalogState.products = Array.isArray(data.data) ? data.data : [];
    populateProductDropdown();
  } catch (error) {
    console.error("Product dropdown fetch error:", error);
    rewardCatalogState.products = [];
    populateProductDropdown();
  }
}

function populateProductDropdown() {
  const select = document.getElementById("rewardProductId");
  if (!select) return;

  select.innerHTML = `<option value="">No linked product</option>` + rewardCatalogState.products
    .map((item) => `<option value="${item.product_id}">${escapeHtml(item.name || "Product")}</option>`)
    .join("");
}

async function fetchRewardCatalog() {
  const tbody = document.getElementById("rewardManagementTableBody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Loading rewards...</td></tr>`;

  try {
    const res = await fetch(`${API_URL}/rewards/admin/catalog`, {
      method: "GET",
      credentials: "include",
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || "Failed to load reward catalog");

    rewardCatalogState.rewards = Array.isArray(data.data) ? data.data : [];
    rewardCatalogState.filtered = [...rewardCatalogState.rewards];
    updateRewardStats();
    applyRewardSearch();
  } catch (error) {
    console.error("Reward catalog fetch error:", error);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Failed to load rewards.</td></tr>`;
  }
}

async function submitRewardForm(event) {
  event.preventDefault();

  const rewardId = String(document.getElementById("rewardId")?.value || "").trim();
  const status = document.getElementById("rewardFormStatus");
  const saveBtn = document.getElementById("saveRewardBtn");

  const payload = {
    name: document.getElementById("rewardName")?.value.trim(),
    description: document.getElementById("rewardDescription")?.value.trim() || null,
    image_url: document.getElementById("rewardImageUrl")?.value.trim() || null,
    points_required: Number(document.getElementById("rewardPointsRequired")?.value || 0),
    reward_type: document.getElementById("rewardType")?.value.trim() || "free_drink",
    product_id: document.getElementById("rewardProductId")?.value ? Number(document.getElementById("rewardProductId").value) : null,
    size_label: document.getElementById("rewardSizeLabel")?.value.trim() || null,
    is_active: document.getElementById("rewardIsActive")?.value === "true",
    sort_order: Number(document.getElementById("rewardSortOrder")?.value || 0),
  };

  if (!payload.name || payload.points_required < 1) {
    if (status) {
      status.style.color = "#ef4444";
      status.innerText = "Reward name and valid points are required.";
    }
    return;
  }

  try {
    if (saveBtn) saveBtn.disabled = true;
    if (status) {
      status.style.color = "";
      status.innerText = rewardId ? "Updating reward..." : "Creating reward...";
    }

    const isEdit = !!rewardId;
    const endpoint = isEdit ? `${API_URL}/rewards/admin/catalog/${rewardId}` : `${API_URL}/rewards/admin/catalog`;
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(endpoint, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || data.message || "Failed to save reward");

    if (status) {
      status.style.color = "#22c55e";
      status.innerText = data.message || "Reward saved successfully.";
    }

    await fetchRewardCatalog();

    setTimeout(() => {
      closeRewardFormModal();
    }, 800);
  } catch (error) {
    console.error("Reward form submit error:", error);
    if (status) {
      status.style.color = "#ef4444";
      status.innerText = error.message || "Failed to save reward.";
    }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function toggleRewardStatus(rewardId) {
  try {
    const res = await fetch(`${API_URL}/rewards/admin/catalog/${rewardId}/toggle`, {
      method: "PATCH",
      credentials: "include",
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || data.message || "Failed to update reward status");

    await fetchRewardCatalog();
  } catch (error) {
    console.error("Reward toggle error:", error);
    showSimpleAlert(error.message || "Failed to update reward status.");
  }
}

function bindRewardTableActions() {
  const tbody = document.getElementById("rewardManagementTableBody");
  if (!tbody) return;

  tbody.addEventListener("click", async (event) => {
    const editBtn = event.target.closest(".edit-reward-btn");
    const toggleBtn = event.target.closest(".toggle-reward-btn");

    if (editBtn) {
      const rewardId = Number(editBtn.dataset.rewardId || 0);
      const reward = rewardCatalogState.rewards.find((item) => Number(item.reward_id) === rewardId);
      if (!reward) return;
      openRewardFormModal("edit", reward);
      return;
    }

    if (toggleBtn) {
      const rewardId = Number(toggleBtn.dataset.rewardId || 0);
      if (!rewardId) return;
      await toggleRewardStatus(rewardId);
    }
  });
}

function bindRewardManagementEvents() {
  document.getElementById("rewardSearchInput")?.addEventListener("input", applyRewardSearch);
  document.getElementById("refreshRewardsBtn")?.addEventListener("click", fetchRewardCatalog);
  document.getElementById("openCreateRewardBtn")?.addEventListener("click", () => openRewardFormModal("create"));
  document.getElementById("closeRewardFormModalBtn")?.addEventListener("click", closeRewardFormModal);
  document.getElementById("cancelRewardFormBtn")?.addEventListener("click", closeRewardFormModal);
  document.getElementById("rewardForm")?.addEventListener("submit", submitRewardForm);

  const modal = document.getElementById("rewardFormModal");
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeRewardFormModal();
    });
  }

  bindRewardTableActions();
}

async function initializeRewardManagementPage() {
  bindRewardManagementEvents();
  await fetchProductsForRewardDropdown();
  await fetchRewardCatalog();
}

window.openRewardFormModal = openRewardFormModal;
window.closeRewardFormModal = closeRewardFormModal;

window.onload = () => {
  initializeRewardManagementPage();
};