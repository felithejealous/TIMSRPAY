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
        set_shop: "Shop Profile",
        set_shop_sub: "Update shop name, address, and contact",
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
        set_shop: "Profile ng Tindahan",
        set_shop_sub: "I-update ang pangalan, address, at contact",
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

const AVAILABLE_MODAL_IDS = new Set(["langModal"]);
const COMING_SOON_MODAL_IDS = new Set([
    "profileModal",
    "accountModal",
    "notifModal",
    "activityModal"
]);

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

function applySavedTheme() {
    const theme = localStorage.getItem("theme");
    const themeIcon = document.getElementById("themeIcon");

    if (theme === "light") {
        document.body.classList.add("light-theme");
        if (themeIcon) themeIcon.className = "fa-solid fa-moon";
        return;
    }

    document.body.classList.remove("light-theme");
    if (themeIcon) themeIcon.className = "fa-solid fa-sun";
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

function closeAllModals() {
    const overlay = document.getElementById("modalOverlay");
    if (!overlay) return;

    overlay.classList.remove("open");
    document.querySelectorAll(".modal-card").forEach((card) => {
        card.style.display = "none";
    });
}

function openModal(modalId) {
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
}

function handleSettingsSubmit(event, message = "Saved") {
    event.preventDefault();
    showToast(message);
    closeAllModals();
}

function bindSettingsEvents() {
    const overlay = document.getElementById("modalOverlay");
    const langSelect = document.getElementById("langSelect");

    if (overlay) {
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                closeAllModals();
            }
        });
    }

    if (langSelect) {
        langSelect.addEventListener("change", (event) => {
            changeLanguage(event.target.value);
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeAllModals();
        }
    });
}

function initializeSettingsPage() {
    const lang = localStorage.getItem("teoLang") || "en";
    applyLanguage(lang);
    applySavedTheme();
    bindSettingsEvents();
}

window.toggleTheme = toggleTheme;
window.openModal = openModal;
window.closeAllModals = closeAllModals;
window.changeLanguage = changeLanguage;
window.handleSettingsSubmit = handleSettingsSubmit;

window.onload = () => {
    initializeSettingsPage();
};