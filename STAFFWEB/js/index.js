const body = document.body;
const themeToggle = document.getElementById("themeToggle");
const themeToggleMobile = document.getElementById("themeToggleMobile");

const announcementBtn = document.getElementById("announcementBtn");
const announcementModal = document.getElementById("announcementModal");
const announcementCloseBtn = document.getElementById("announcementCloseBtn");
const announcementOkayBtn = document.getElementById("announcementOkayBtn");

const STAFF_INDEX_THEME_KEY = "staff-index-theme";

function applySavedTheme() {
    const savedTheme = localStorage.getItem(STAFF_INDEX_THEME_KEY);

    if (savedTheme === "dark") {
        body.classList.add("dark-mode");
    } else {
        body.classList.remove("dark-mode");
    }

    updateThemeIcons();
}

function updateThemeIcons() {
    const isDark = body.classList.contains("dark-mode");
    const iconHTML = isDark
        ? '<i class="fa-solid fa-sun"></i>'
        : '<i class="fa-solid fa-moon"></i>';

    if (themeToggle) {
        themeToggle.innerHTML = iconHTML;
    }

    if (themeToggleMobile) {
        themeToggleMobile.innerHTML = iconHTML;
    }
}

function toggleTheme() {
    body.classList.toggle("dark-mode");

    const isDark = body.classList.contains("dark-mode");
    localStorage.setItem(STAFF_INDEX_THEME_KEY, isDark ? "dark" : "light");

    updateThemeIcons();
}

function openAnnouncementModal() {
    if (!announcementModal) return;

    announcementModal.classList.add("show");
    body.style.overflow = "hidden";
}

function closeAnnouncementModal() {
    if (!announcementModal) return;

    announcementModal.classList.remove("show");
    body.style.overflow = "";
}

function setupThemeToggle() {
    themeToggle?.addEventListener("click", toggleTheme);
    themeToggleMobile?.addEventListener("click", toggleTheme);
}

function setupAnnouncementModal() {
    announcementBtn?.addEventListener("click", (event) => {
        event.preventDefault();
        openAnnouncementModal();
    });

    announcementCloseBtn?.addEventListener("click", closeAnnouncementModal);
    announcementOkayBtn?.addEventListener("click", closeAnnouncementModal);

    announcementModal?.addEventListener("click", (event) => {
        if (event.target === announcementModal) {
            closeAnnouncementModal();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && announcementModal?.classList.contains("show")) {
            closeAnnouncementModal();
        }
    });
}

function initStaffIndexPage() {
    applySavedTheme();
    setupThemeToggle();
    setupAnnouncementModal();
}

document.addEventListener("DOMContentLoaded", initStaffIndexPage);