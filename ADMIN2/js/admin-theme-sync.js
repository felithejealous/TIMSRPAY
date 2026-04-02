(function () {
    const STORAGE_KEY = "admin-theme";
    const LIGHT_CLASS = "light-theme";
    const PRELOAD_CLASS = "preload-light";

    function getSavedTheme() {
        return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
    }

    function updateThemeUI(theme) {
        const isLight = theme === "light";

        const themeIcon = document.getElementById("themeIcon");
        if (themeIcon) {
            themeIcon.className = isLight ? "fa-solid fa-moon" : "fa-solid fa-sun";
        }

        const legacyToggle = document.getElementById("theme-toggle");
        if (legacyToggle) {
            const iconEl = legacyToggle.querySelector("i");
            const textEl = document.getElementById("theme-text");

            if (iconEl) {
                iconEl.className = isLight
                    ? "fas fa-moon mr-2"
                    : "fas fa-circle-half-stroke mr-2";
            }

            if (textEl) {
                textEl.textContent = isLight ? "Dark Mode" : "Light Mode";
            }
        }
    }

    function applyTheme(theme) {
        const isLight = theme === "light";

        document.documentElement.classList.toggle(PRELOAD_CLASS, isLight);
        document.body.classList.toggle(LIGHT_CLASS, isLight);

        updateThemeUI(theme);
    }

    function saveTheme(theme) {
        localStorage.setItem(STORAGE_KEY, theme);
    }

    function toggleTheme() {
        const isCurrentlyLight = document.body.classList.contains(LIGHT_CLASS);
        const nextTheme = isCurrentlyLight ? "dark" : "light";

        saveTheme(nextTheme);
        applyTheme(nextTheme);
    }

    function bindToggleButtons() {
        const possibleButtons = [
            document.querySelector(".theme-toggle-circle"),
            document.getElementById("themeToggle"),
            document.getElementById("theme-toggle")
        ].filter(Boolean);

        possibleButtons.forEach((btn) => {
            if (!btn.dataset.themeBound) {
                btn.addEventListener("click", function (e) {
                    e.preventDefault();
                    toggleTheme();
                });
                btn.dataset.themeBound = "true";
            }
        });
    }

    function initTheme() {
        const savedTheme = getSavedTheme();
        applyTheme(savedTheme);
        bindToggleButtons();

        window.toggleTheme = toggleTheme;

        requestAnimationFrame(() => {
            document.documentElement.classList.remove(PRELOAD_CLASS);
        });
    }

    document.addEventListener("DOMContentLoaded", initTheme);
})();