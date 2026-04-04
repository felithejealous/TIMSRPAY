(function () {
  const STORAGE_KEY = "publicweb-theme";
  const PAGE_TRANSITION_MS = 380;

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

  function shouldHandleAsInternalPageLink(anchor) {
    if (!anchor) return false;

    const href = (anchor.getAttribute("href") || "").trim();
    if (!href) return false;
    if (href.startsWith("javascript:")) return false;
    if (href.startsWith("mailto:")) return false;
    if (href.startsWith("tel:")) return false;
    if (href.startsWith("#")) return false;
    if (anchor.hasAttribute("download")) return false;
    if (anchor.target && anchor.target !== "_self") return false;

    try {
      const url = new URL(anchor.href, window.location.href);
      const isSameOrigin = url.origin === window.location.origin;
      const looksLikeHtml =
        url.pathname.endsWith(".html") ||
        url.pathname === window.location.pathname ||
        !url.pathname.split("/").pop().includes(".");

      return isSameOrigin && looksLikeHtml;
    } catch {
      return false;
    }
  }

  function handleTopLinks() {
    document.querySelectorAll('a[href="#"]').forEach((link) => {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  function handlePageTransitions() {
    document.querySelectorAll("a[href]").forEach((link) => {
      link.addEventListener("click", function (e) {
        if (!shouldHandleAsInternalPageLink(link)) return;

        const href = link.href;
        if (!href) return;

        e.preventDefault();

        window.scrollTo({ top: 0, behavior: "smooth" });
        document.body.classList.add("page-leave");

        setTimeout(() => {
          window.location.href = href;
        }, PAGE_TRANSITION_MS);
      });
    });
  }

  function handlePageEnter() {
    document.body.classList.add("page-enter");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.remove("page-enter");
      });
    });
  }

  function forceTopOnLoad() {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
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

    forceTopOnLoad();
    handlePageEnter();
    handleTopLinks();
    handlePageTransitions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
  } else {
    initTheme();
  }
})();