(function () {
    const THEME_KEY = "staff-theme";

    function getSavedTheme() {
        try {
            return localStorage.getItem(THEME_KEY) || "dark";
        } catch (e) {
            return "dark";
        }
    }

    function applyTheme(theme) {
        const isLight = theme === "light";

        document.body.classList.toggle("light-mode", isLight);
        document.documentElement.classList.toggle("preload-light", isLight);

        const themeToggle = document.getElementById("themeToggle");
        if (themeToggle) {
            themeToggle.innerHTML = isLight
                ? '<i class="fa-solid fa-moon"></i>'
                : '<i class="fa-solid fa-sun"></i>';
        }
    }

    function saveTheme(theme) {
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (e) {}
    }

    function toggleTheme() {
        const isCurrentlyLight = document.body.classList.contains("light-mode");
        const nextTheme = isCurrentlyLight ? "dark" : "light";
        applyTheme(nextTheme);
        saveTheme(nextTheme);
    }

    document.addEventListener("DOMContentLoaded", function () {
        applyTheme(getSavedTheme());

        const themeToggle = document.getElementById("themeToggle");
        if (themeToggle) {
            themeToggle.addEventListener("click", toggleTheme);
        }
    });
})();