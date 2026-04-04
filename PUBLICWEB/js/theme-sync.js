(function () {
  const STORAGE_KEY = "publicweb-theme";

  function getSavedTheme() {
    return localStorage.getItem(STORAGE_KEY) || "dark";
  }

  function updateThemeIcon(theme) {
    const toggleBtn = document.getElementById("themeToggle");
    if (!toggleBtn) return;

    const icon = toggleBtn.querySelector("i");
    if (!icon) return;

    icon.classList.remove("fa-sun", "fa-moon");
    icon.classList.add(theme === "light" ? "fa-moon" : "fa-sun");
  }

  function applyTheme(theme) {
    const body = document.body;
    if (!body) return;

    document.documentElement.classList.toggle("light-mode", theme === "light");
    updateThemeIcon(theme);
  }

  function saveTheme(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
  }

  function toggleTheme() {
    const current = document.documentElement.classList.contains("light-mode")
      ? "light"
      : "dark";
    const next = current === "light" ? "dark" : "light";

    applyTheme(next);
    saveTheme(next);
  }

  function initTheme() {
    applyTheme(getSavedTheme());

    const toggleBtn = document.getElementById("themeToggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", toggleTheme);
    }

    window.addEventListener("storage", function (e) {
      if (e.key === STORAGE_KEY) {
        applyTheme(e.newValue || "dark");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
  } else {
    initTheme();
  }
})();
