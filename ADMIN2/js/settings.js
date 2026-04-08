const translations = {
    en: {
        nav_dash: "Dashboard",
        nav_accounts: "Accounts",
        nav_inv: "Inventory",
        nav_menu: "Menu Manager",
        nav_promo: "Promos",
        nav_rewards: "Rewards",
        nav_ann: "Announce",
        nav_pay: "Reports",
        nav_set: "Settings",
        logout: "Log Out",
        set_sub: "System Preferences & Localization",
        set_lang: "Language",
        set_lang_sub: "Switch between English and Tagalog",
        set_sec: "Security",
        set_sec_sub: "Change admin password and privacy",
        set_notif: "Notifications",
        set_notif_sub: "System alerts and inventory warnings",
        set_log: "Activity Log",
        set_log_sub: "Recent system actions and logs"
    },
    tl: {
        nav_dash: "Dashbord",
        nav_accounts: "Mga Account",
        nav_inv: "Imbentaryo",
        nav_menu: "Tagapamahala ng Menu",
        nav_promo: "Mga Promo",
        nav_rewards: "Mga Gantimpala",
        nav_ann: "Anunsyo",
        nav_pay: "Mga Ulat",
        nav_set: "Settings",
        logout: "Mag-Log Out",
        set_sub: "Preperensya ng Sistema at Wika",
        set_lang: "Wika",
        set_lang_sub: "Magpalit sa English o Tagalog",
        set_sec: "Seguridad",
        set_sec_sub: "Palitan ang admin password at privacy",
        set_notif: "Abiso",
        set_notif_sub: "Mga alerto sa sistema at imbentaryo",
        set_log: "Listahan ng Aktibidad",
        set_log_sub: "Mga huling ginawa sa system"
    }
};

const AVAILABLE_MODAL_IDS = new Set(["langModal", "notifModal", "accountModal", "activityModal"]);
const COMING_SOON_MODAL_IDS = new Set([
    "profileModal"
]);
function getToken() {
return localStorage.getItem("token");
}

function getAuthHeaders(extra = {}) {
    const token = getToken();
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra
    };
}
function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function loadActivityLogs() {
    const listEl = document.getElementById("activityLogList");
    if (!listEl) return;

    try {
        listEl.innerHTML = `
            <div class="text-center opacity-60 py-8 font-bold">Loading activity logs...</div>
        `;

        const result = await fetchJSON(`${API_URL}/activity-logs/?limit=50`);
        const items = Array.isArray(result?.data) ? result.data : [];

        if (!items.length) {
            listEl.innerHTML = `
                <div class="text-center opacity-60 py-8 font-bold">No activity logs yet.</div>
            `;
            return;
        }

        listEl.innerHTML = items.map(item => `
            <div class="glass rounded-2xl p-4">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <div class="font-black text-sm mb-1">${escapeHTML(item.action || "-")}</div>
                        <div class="text-xs opacity-70 mb-1">
                            Module: <strong>${escapeHTML(item.module || "-")}</strong>
                        </div>
                        <div class="text-xs opacity-70 mb-1">
                            User: <strong>${escapeHTML(item.user_email || "Unknown")}</strong>
                        </div>
                        <div class="text-xs opacity-70 mb-1">
                            Role: <strong>${escapeHTML(item.role_name || "-")}</strong>
                        </div>
                        <div class="text-xs opacity-70 mb-1">
                            Target: <strong>${escapeHTML(item.target_type || "-")}</strong>
                            ${item.target_id ? `#${escapeHTML(item.target_id)}` : ""}
                        </div>
                        <div class="text-xs opacity-60 mt-2">
                            ${escapeHTML(item.details || "No additional details")}
                        </div>
                    </div>

                    <div class="text-[11px] opacity-50 whitespace-nowrap">
                        ${escapeHTML(formatDateTime(item.created_at))}
                    </div>
                </div>
            </div>
        `).join("");
    } catch (error) {
        console.error("loadActivityLogs error:", error);
        listEl.innerHTML = `
            <div class="text-center py-8 font-bold" style="color:#ef4444;">
                Failed to load activity logs.
            </div>
        `;
    }
}

function showToast(message, iconClass = "fa-circle-check") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
        headers: getAuthHeaders({
            "Content-Type": "application/json"
        }),
        ...options
    });

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        throw new Error(data?.detail || data?.message || `Request failed: ${response.status}`);
    }

    return data;
}

function applyLanguage(lang) {
    const selectedLang = translations[lang] ? lang : "en";

    document.querySelectorAll("[data-lang]").forEach((el) => {
        const key = el.getAttribute("data-lang");
        const text = translations[selectedLang][key];
        if (!text) return;

        const icon = el.querySelector("i");
        if (icon) {
            const iconClone = icon.cloneNode(true);
            el.innerHTML = "";
            el.appendChild(iconClone);
            el.append(" " + text);
        } else {
            el.textContent = text;
        }
    });

    const langSelect = document.getElementById("langSelect");
    if (langSelect) {
        langSelect.value = selectedLang;
    }
}

function changeLanguage(lang) {
    const selectedLang = translations[lang] ? lang : "en";
    localStorage.setItem("teoLang", selectedLang);
    applyLanguage(selectedLang);
    showToast(
        selectedLang === "en" ? "Language set to English" : "Language set to Tagalog"
    );
}

function closeAllModals() {
    const overlay = document.getElementById("modalOverlay");
    if (!overlay) return;

    overlay.classList.remove("open");
    document.querySelectorAll(".modal-card").forEach((card) => {
        card.style.display = "none";
    });

    clearPasswordForm();
}

async function openModal(modalId) {
    if (COMING_SOON_MODAL_IDS.has(modalId)) {
        showToast("Coming soon", "fa-hourglass-half");
        return;
    }

    if (!AVAILABLE_MODAL_IDS.has(modalId)) {
        showToast("Feature unavailable", "fa-circle-exclamation");
        return;
    }

    const overlay = document.getElementById("modalOverlay");
    const targetModal = document.getElementById(modalId);

    if (!overlay || !targetModal) {
        showToast("Modal not found", "fa-circle-exclamation");
        return;
    }

    overlay.classList.add("open");
    document.querySelectorAll(".modal-card").forEach((card) => {
        card.style.display = "none";
    });
    targetModal.style.display = "block";

    if (modalId === "notifModal") {
        await loadNotificationCenter();
    }

    if (modalId === "accountModal") {
        clearPasswordForm();
    }
    if (modalId === "activityModal") {
    await loadActivityLogs();
}
}


function handleSettingsSubmit(event, message = "Saved") {
    event.preventDefault();
    showToast(message);
    closeAllModals();
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function severityColor(severity) {
    return severity === "critical" ? "#ef4444" : "#f59e0b";
}

function setPasswordStatus(message = "", type = "") {
    const statusBox = document.getElementById("passwordStatus");
    if (!statusBox) return;

    if (!message) {
        statusBox.className = "status-box";
        statusBox.textContent = "";
        return;
    }

    statusBox.className = `status-box show ${type}`;
    statusBox.textContent = message;
}

function clearPasswordForm() {
    const currentPasswordInput = document.getElementById("currentPasswordInput");
    const newPasswordInput = document.getElementById("newPasswordInput");
    const confirmPasswordInput = document.getElementById("confirmPasswordInput");
    const changePasswordBtn = document.getElementById("changePasswordBtn");

    if (currentPasswordInput) currentPasswordInput.value = "";
    if (newPasswordInput) newPasswordInput.value = "";
    if (confirmPasswordInput) confirmPasswordInput.value = "";

    if (changePasswordBtn) {
        changePasswordBtn.disabled = false;
        changePasswordBtn.innerHTML = "Update Password";
    }

    setPasswordStatus("", "");
}

async function handleAdminPasswordChange(event) {
    event.preventDefault();

    const currentPasswordInput = document.getElementById("currentPasswordInput");
    const newPasswordInput = document.getElementById("newPasswordInput");
    const confirmPasswordInput = document.getElementById("confirmPasswordInput");
    const changePasswordBtn = document.getElementById("changePasswordBtn");

    const currentPassword = String(currentPasswordInput?.value || "").trim();
    const newPassword = String(newPasswordInput?.value || "").trim();
    const confirmPassword = String(confirmPasswordInput?.value || "").trim();

    setPasswordStatus("", "");

    if (!currentPassword || !newPassword || !confirmPassword) {
        setPasswordStatus("Please complete all password fields.", "error");
        return;
    }

    if (newPassword !== confirmPassword) {
        setPasswordStatus("New password and confirm password do not match.", "error");
        return;
    }

    if (currentPassword === newPassword) {
        setPasswordStatus("New password must be different from current password.", "error");
        return;
    }

    try {
        if (changePasswordBtn) {
            changePasswordBtn.disabled = true;
            changePasswordBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating...';
        }

        const result = await fetchJSON(`${API_URL}/auth/change-password`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            })
        });

        setPasswordStatus(result.message || "Password updated successfully.", "success");
        showToast("Password updated successfully");

        if (currentPasswordInput) currentPasswordInput.value = "";
        if (newPasswordInput) newPasswordInput.value = "";
        if (confirmPasswordInput) confirmPasswordInput.value = "";
    } catch (error) {
        console.error("handleAdminPasswordChange error:", error);
        setPasswordStatus(error.message || "Failed to update password.", "error");
    } finally {
        if (changePasswordBtn) {
            changePasswordBtn.disabled = false;
            changePasswordBtn.innerHTML = "Update Password";
        }
    }
}

async function loadNotificationCenter() {
    try {
        const result = await fetchJSON(`${API_URL}/inventory/alerts/low-stock?include_dismissed=true`);
        const items = Array.isArray(result?.data) ? result.data : [];

        const activeItems = items.filter(item => !item.is_dismissed);
        const dismissedItems = items.filter(item => item.is_dismissed);

        const activeCountEl = document.getElementById("notifActiveCount");
        const dismissedCountEl = document.getElementById("notifDismissedCount");
        const listEl = document.getElementById("notifList");

        if (activeCountEl) activeCountEl.textContent = activeItems.length;
        if (dismissedCountEl) dismissedCountEl.textContent = dismissedItems.length;

        if (!listEl) return;

        if (!items.length) {
            listEl.innerHTML = `
                <div class="text-center opacity-60 py-8 font-bold">
                    No low stock alerts right now.
                </div>
            `;
            return;
        }

        listEl.innerHTML = items.map(item => `
            <div class="glass rounded-2xl p-4 border" style="border-color: ${severityColor(item.severity)}33;">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2 flex-wrap">
                            <span class="font-black text-sm">${item.name}</span>
                            <span class="text-[10px] px-2 py-1 rounded-full font-black uppercase"
                                  style="background:${item.severity === "critical" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)"}; color:${severityColor(item.severity)};">
                                ${item.severity}
                            </span>
                            <span class="text-[10px] px-2 py-1 rounded-full font-black uppercase"
                                  style="background:${item.is_dismissed ? "rgba(107,114,128,0.18)" : "rgba(34,197,94,0.15)"}; color:${item.is_dismissed ? "#9ca3af" : "#22c55e"};">
                                ${item.is_dismissed ? "dismissed" : "active"}
                            </span>
                        </div>

                        <div class="text-xs opacity-70 mb-1">Category: ${item.category || "-"}</div>
                        <div class="text-xs opacity-70 mb-1">Stock: <strong>${item.quantity} ${item.unit}</strong></div>
                        <div class="text-xs opacity-70 mb-1">Threshold: <strong>${item.alert_threshold} ${item.unit}</strong></div>
                        <div class="text-xs opacity-50 mt-2">
                            Updated: ${formatDateTime(item.updated_at)}
                        </div>
                        ${item.dismissed_at ? `
                            <div class="text-xs opacity-50">
                                Dismissed: ${formatDateTime(item.dismissed_at)}
                            </div>
                        ` : ""}
                    </div>

                    <div class="flex flex-col gap-2">
                        <button class="btn-save" style="width:auto; padding:10px 14px;" onclick="window.location.href='inventory.html'">
                            View
                        </button>
                        ${
                            item.is_dismissed
                                ? `<button class="btn-save" style="width:auto; padding:10px 14px;" onclick="restoreNotification(${item.inventory_master_id})">Restore</button>`
                                : `<button class="btn-save" style="width:auto; padding:10px 14px;" onclick="dismissNotification(${item.inventory_master_id})">Dismiss</button>`
                        }
                    </div>
                </div>
            </div>
        `).join("");
    } catch (error) {
        console.error("loadNotificationCenter error:", error);
        showToast(error.message || "Failed to load notifications", "fa-circle-exclamation");
    }
}

async function dismissNotification(inventoryMasterId) {
    try {
        await fetchJSON(`${API_URL}/inventory/alerts/low-stock/${inventoryMasterId}/dismiss`, {
            method: "POST"
        });
        showToast("Notification dismissed");
        await loadNotificationCenter();
    } catch (error) {
        console.error("dismissNotification error:", error);
        showToast(error.message || "Failed to dismiss notification", "fa-circle-exclamation");
    }
}

async function restoreNotification(inventoryMasterId) {
    try {
        await fetchJSON(`${API_URL}/inventory/alerts/low-stock/${inventoryMasterId}/restore`, {
            method: "POST"
        });
        showToast("Notification restored");
        await loadNotificationCenter();
    } catch (error) {
        console.error("restoreNotification error:", error);
        showToast(error.message || "Failed to restore notification", "fa-circle-exclamation");
    }
}

function bindSettingsEvents() {
    const langSelect = document.getElementById("langSelect");
    const changePasswordForm = document.getElementById("changePasswordForm");

    if (langSelect) {
        langSelect.addEventListener("change", (event) => {
            changeLanguage(event.target.value);
        });
    }

    if (changePasswordForm) {
        changePasswordForm.addEventListener("submit", handleAdminPasswordChange);
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            // intentionally disabled para hindi magsara pag click or escape
            return;
        }
    });
}

function initializeSettingsPage() {
    const lang = localStorage.getItem("teoLang") || "en";
    applyLanguage(lang);
    bindSettingsEvents();
}
window.loadActivityLogs = loadActivityLogs;
window.openModal = openModal;
window.closeAllModals = closeAllModals;
window.changeLanguage = changeLanguage;
window.handleSettingsSubmit = handleSettingsSubmit;
window.loadNotificationCenter = loadNotificationCenter;
window.dismissNotification = dismissNotification;
window.restoreNotification = restoreNotification;

window.onload = () => {
    initializeSettingsPage();
};