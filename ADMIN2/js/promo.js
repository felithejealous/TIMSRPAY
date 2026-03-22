let promoCodesCache = [];
let promoBannersCache = [];
let editingPromoId = null;

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.innerText = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

function toggleTheme() {
    document.body.classList.toggle("light-theme");
    const isLight = document.body.classList.contains("light-theme");
    localStorage.setItem("theme", isLight ? "light" : "dark");

    const themeIcon = document.getElementById("themeIcon");
    if (themeIcon) {
        themeIcon.className = isLight ? "fa-solid fa-moon" : "fa-solid fa-sun";
    }
}

function applySavedTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
        document.body.classList.add("light-theme");
        const themeIcon = document.getElementById("themeIcon");
        if (themeIcon) {
            themeIcon.className = "fa-solid fa-moon";
        }
    }
}

function resetPromoForm() {
    editingPromoId = null;
    document.getElementById("editingPromoId").value = "";
    document.getElementById("promoModalTitle").innerText = "Deploy Voucher";
    document.getElementById("promoTitle").value = "";
    document.getElementById("promoDescription").value = "";
    document.getElementById("promoCodeName").value = "";
    document.getElementById("promoDiscount").value = "";
    document.getElementById("promoType").value = "percent";
    document.getElementById("promoMinOrder").value = "";
    document.getElementById("promoUsageLimit").value = "";
    document.getElementById("promoPerUserLimit").value = "";
    document.getElementById("promoValidFrom").value = "";
    document.getElementById("promoValidUntil").value = "";
}

function openPromoModal() {
    resetPromoForm();
    document.getElementById("promoModalOverlay")?.classList.add("open");
}

function closePromoModal() {
    document.getElementById("promoModalOverlay")?.classList.remove("open");
    setTimeout(() => resetPromoForm(), 150);
}

window.onclick = (e) => {
    const modal = document.getElementById("promoModalOverlay");
    if (e.target === modal) {
        closePromoModal();
    }
};

function toDatetimeLocalValue(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchPromoSummary() {
    try {
        const response = await fetch(`${API_URL}/promo/summary`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`Promo summary fetch failed: ${response.status}`);
        }

        const result = await response.json();
        document.getElementById("activeBannersCount").innerText = result.active_banners || 0;
        document.getElementById("activeCodesCount").innerText = result.active_codes || 0;
        document.getElementById("usageRateValue").innerText = `${result.usage_rate || 0}%`;
    } catch (error) {
        console.error("Promo summary error:", error);
    }
}

async function fetchPromoCodes() {
    try {
        const response = await fetch(`${API_URL}/promo/codes`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`Promo codes fetch failed: ${response.status}`);
        }

        const result = await response.json();
        promoCodesCache = result.data || [];
        renderPromoTable();
    } catch (error) {
        console.error("Promo codes error:", error);
        promoCodesCache = [];
        renderPromoTable();
    }
}

async function fetchPromoBanners() {
    try {
        const response = await fetch(`${API_URL}/promo/banners`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`Promo banners fetch failed: ${response.status}`);
        }

        const result = await response.json();
        promoBannersCache = result.data || [];
        renderBannerList();
    } catch (error) {
        console.error("Promo banners error:", error);
        promoBannersCache = [];
        renderBannerList();
    }
}

function renderPromoTable() {
    const tbody = document.getElementById("promoTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!promoCodesCache.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="opacity-60">No promo codes found.</td>
            </tr>
        `;
        return;
    }

    promoCodesCache.forEach(item => {
        tbody.innerHTML += `
            <tr>
                <td class="font-mono text-xs font-black text-yellow-400">
                    ${escapeHtml(item.code)}
                    <div class="text-[10px] opacity-50 mt-1">${escapeHtml(item.title || "-")}</div>
                </td>
                <td class="text-xs font-bold">
                    ${escapeHtml(item.value_label)}
                    <div class="text-[10px] opacity-50 mt-1">
                        Min: ₱${Number(item.min_order_amount || 0).toFixed(2)}
                    </div>
                    <div class="text-[10px] opacity-50 mt-1">
                        ${item.usage_limit ? `Total Limit: ${item.usage_limit}` : "Total Limit: Unlimited"}
                    </div>
                    <div class="text-[10px] opacity-50 mt-1">
                        ${item.per_user_limit ? `Per User: ${item.per_user_limit}` : "Per User: Unlimited"}
                    </div>
                    <div class="text-[10px] opacity-50 mt-1">
                        Used: ${Number(item.usage_count || 0)}
                    </div>
                    <div class="text-[10px] opacity-50 mt-1">
                        ${item.valid_from ? `From: ${escapeHtml(item.valid_from)}` : "From: -"}
                    </div>
                    <div class="text-[10px] opacity-50 mt-1">
                        ${item.valid_until ? `Until: ${escapeHtml(item.valid_until)}` : "Until: -"}
                    </div>
                </td>
                <td>
                    <label class="switch">
                        <input type="checkbox" ${item.is_active ? "checked" : ""} onchange="togglePromoCode(${item.promo_id})">
                        <span class="slider"></span>
                    </label>
                </td>
                <td>
                    <div class="flex flex-col gap-2 items-start">
                        <button class="text-yellow-400 text-[10px] font-extrabold uppercase tracking-wider bg-transparent border-none cursor-pointer"
                            onclick="editPromoCode(${item.promo_id})">
                            Edit
                        </button>
                        <button class="btn-danger-text" onclick="deletePromoCode(${item.promo_id})">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function renderBannerList() {
    const list = document.getElementById("bannerList");
    if (!list) return;

    list.innerHTML = "";

    if (!promoBannersCache.length) {
        list.innerHTML = `
            <div class="opacity-60 text-sm">No banners uploaded yet.</div>
        `;
        return;
    }

    promoBannersCache.forEach(item => {
        list.innerHTML += `
            <div class="banner-card">
                <img src="${item.image_url}" class="banner-thumb" alt="Banner">
                <div class="flex items-center justify-between gap-4 mb-2">
                    <div class="min-w-0">
                        <p class="font-black text-sm truncate">${escapeHtml(item.title || "Campaign Banner")}</p>
                        <p class="text-[11px] opacity-60 truncate">${escapeHtml(item.link_url || "-")}</p>
                    </div>
                    <label class="switch">
                        <input type="checkbox" ${item.is_active ? "checked" : ""} onchange="toggleBanner(${item.banner_id})">
                        <span class="slider"></span>
                    </label>
                </div>
                <button class="btn-danger-text" onclick="deleteBanner(${item.banner_id})">Delete</button>
            </div>
        `;
    });
}

function previewBanner(input) {
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById("bannerPreview");
        const placeholder = document.getElementById("bannerPlaceholder");
        preview.src = e.target.result;
        preview.style.display = "block";
        placeholder.style.display = "none";
    };
    reader.readAsDataURL(file);
}

function editPromoCode(promoId) {
    const item = promoCodesCache.find(p => Number(p.promo_id) === Number(promoId));
    if (!item) {
        alert("Promo not found.");
        return;
    }

    editingPromoId = item.promo_id;
    document.getElementById("editingPromoId").value = item.promo_id;
    document.getElementById("promoModalTitle").innerText = "Edit Voucher";
    document.getElementById("promoTitle").value = item.title || "";
    document.getElementById("promoDescription").value = item.description || "";
    document.getElementById("promoCodeName").value = item.code || "";
    document.getElementById("promoDiscount").value = item.discount_value ?? "";
    document.getElementById("promoType").value = item.discount_type || "percent";
    document.getElementById("promoMinOrder").value = item.min_order_amount ?? 0;
    document.getElementById("promoUsageLimit").value = item.usage_limit ?? "";
    document.getElementById("promoPerUserLimit").value = item.per_user_limit ?? "";
    document.getElementById("promoValidFrom").value = toDatetimeLocalValue(item.valid_from);
    document.getElementById("promoValidUntil").value = toDatetimeLocalValue(item.valid_until);

    document.getElementById("promoModalOverlay")?.classList.add("open");
}

async function addBanner() {
    const fileInput = document.getElementById("bannerInput");
    const linkInput = document.getElementById("bannerLink");

    const file = fileInput?.files?.[0];
    const link = (linkInput?.value || "").trim();

    if (!file) {
        alert("Please select a banner image first.");
        return;
    }

    try {
        const formData = new FormData();
        formData.append("image", file);
        formData.append("title", "Campaign Banner");
        formData.append("link_url", link);

        const response = await fetch(`${API_URL}/promo/banners`, {
            method: "POST",
            credentials: "include",
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Create banner failed: ${response.status}`);
        }

        fileInput.value = "";
        linkInput.value = "";

        const preview = document.getElementById("bannerPreview");
        const placeholder = document.getElementById("bannerPlaceholder");
        preview.src = "";
        preview.style.display = "none";
        placeholder.style.display = "block";

        await refreshPromoData();
        showToast("Banner published");
    } catch (error) {
        console.error("Add banner error:", error);
        alert(error.message || "Failed to publish banner.");
    }
}

async function savePromo() {
    const promoId = document.getElementById("editingPromoId")?.value || "";
    const title = (document.getElementById("promoTitle")?.value || "").trim();
    const description = (document.getElementById("promoDescription")?.value || "").trim();
    const code = (document.getElementById("promoCodeName")?.value || "").trim().toUpperCase();
    const discountValue = document.getElementById("promoDiscount")?.value || "";
    const discountType = document.getElementById("promoType")?.value || "percent";
    const minOrderAmount = document.getElementById("promoMinOrder")?.value || "0";
    const usageLimit = document.getElementById("promoUsageLimit")?.value || "";
    const perUserLimit = document.getElementById("promoPerUserLimit")?.value || "";
    const validFrom = document.getElementById("promoValidFrom")?.value || "";
    const validUntil = document.getElementById("promoValidUntil")?.value || "";

    if (!code) {
        alert("Promo code is required.");
        return;
    }

    if (!discountValue || Number(discountValue) <= 0) {
        alert("Enter a valid discount value.");
        return;
    }

    if (validFrom && validUntil && new Date(validUntil) < new Date(validFrom)) {
        alert("Valid until must be later than valid from.");
        return;
    }

    try {
        let response;
        let result;

        if (promoId) {
            response = await fetch(`${API_URL}/promo/codes/${promoId}`, {
                method: "PATCH",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    title: title || null,
                    description: description || null,
                    code: code,
                    discount_type: discountType,
                    discount_value: Number(discountValue),
                    min_order_amount: Number(minOrderAmount || 0),
                    usage_limit: usageLimit ? Number(usageLimit) : null,
                    per_user_limit: perUserLimit ? Number(perUserLimit) : null,
                    valid_from: validFrom || null,
                    valid_until: validUntil || null
                })
            });

            result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || `Update promo failed: ${response.status}`);
            }

            closePromoModal();
            await refreshPromoData();
            showToast("Promo code updated");
            return;
        }

        const formData = new FormData();
        formData.append("title", title);
        formData.append("description", description);
        formData.append("code", code);
        formData.append("discount_type", discountType);
        formData.append("discount_value", discountValue);
        formData.append("min_order_amount", minOrderAmount);
        if (usageLimit) formData.append("usage_limit", usageLimit);
        if (perUserLimit) formData.append("per_user_limit", perUserLimit);
        if (validFrom) formData.append("valid_from", validFrom);
        if (validUntil) formData.append("valid_until", validUntil);

        response = await fetch(`${API_URL}/promo/codes`, {
            method: "POST",
            credentials: "include",
            body: formData
        });

        result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Create promo failed: ${response.status}`);
        }

        closePromoModal();
        await refreshPromoData();
        showToast("Promo code created");
    } catch (error) {
        console.error("Save promo error:", error);
        alert(error.message || "Failed to save promo code.");
    }
}

async function togglePromoCode(promoId) {
    try {
        const response = await fetch(`${API_URL}/promo/codes/${promoId}/toggle`, {
            method: "PATCH",
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Toggle promo failed: ${response.status}`);
        }

        await refreshPromoData();
        showToast("Promo status updated");
    } catch (error) {
        console.error("Toggle promo error:", error);
        alert(error.message || "Failed to update promo.");
    }
}

async function deletePromoCode(promoId) {
    const confirmed = confirm("Delete this promo code?");
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_URL}/promo/codes/${promoId}`, {
            method: "DELETE",
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Delete promo failed: ${response.status}`);
        }

        await refreshPromoData();
        showToast("Promo code deleted");
    } catch (error) {
        console.error("Delete promo error:", error);
        alert(error.message || "Failed to delete promo code.");
    }
}

async function toggleBanner(bannerId) {
    try {
        const response = await fetch(`${API_URL}/promo/banners/${bannerId}/toggle`, {
            method: "PATCH",
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Toggle banner failed: ${response.status}`);
        }

        await refreshPromoData();
        showToast("Banner status updated");
    } catch (error) {
        console.error("Toggle banner error:", error);
        alert(error.message || "Failed to update banner.");
    }
}

async function deleteBanner(bannerId) {
    const confirmed = confirm("Delete this banner?");
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_URL}/promo/banners/${bannerId}`, {
            method: "DELETE",
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Delete banner failed: ${response.status}`);
        }

        await refreshPromoData();
        showToast("Banner deleted");
    } catch (error) {
        console.error("Delete banner error:", error);
        alert(error.message || "Failed to delete banner.");
    }
}

async function refreshPromoData() {
    await Promise.all([
        fetchPromoSummary(),
        fetchPromoCodes(),
        fetchPromoBanners()
    ]);
}

async function initializePromoPage() {
    applySavedTheme();
    await refreshPromoData();
}

window.toggleTheme = toggleTheme;
window.openPromoModal = openPromoModal;
window.closePromoModal = closePromoModal;
window.previewBanner = previewBanner;
window.addBanner = addBanner;
window.savePromo = savePromo;
window.editPromoCode = editPromoCode;
window.togglePromoCode = togglePromoCode;
window.deletePromoCode = deletePromoCode;
window.toggleBanner = toggleBanner;
window.deleteBanner = deleteBanner;

window.onload = () => {
    initializePromoPage();
};