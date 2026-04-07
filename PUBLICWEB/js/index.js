const API_BASE_URL = window.API_URL || "http://127.0.0.1:8000";

let allAnnouncementsCache = [];
let allMenuCache = [];
let allFaqCache = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatAnnouncementDate(value) {
  if (!value) return "Latest Update";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Latest Update";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getStars(rating) {
  const safe = Math.max(1, Math.min(5, Number(rating || 0)));
  return `${"★".repeat(safe)}${"☆".repeat(5 - safe)}`;
}

function resolveAnnouncementImage(imageUrl) {
  const clean = String(imageUrl || "").trim();
  if (!clean) return "";
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
  if (clean.startsWith("/")) return `${API_BASE}${clean}`;
  return clean;
}

function resolveBestSellerImage(imageUrl, productName = "") {
  const cleanName = String(productName || "").trim().toLowerCase();
  const noBgMap = {
    "classic teo d' mango": "mango2.png",
    "classic teo d mango": "mango2.png",
    "classic mango bliss": "mango2.png",
    "teo d' mango": "mango2.png",
    "teo d mango": "mango2.png",
    mango: "mango2.png",

    "creamy buko slush": "bukonobg.png",
    buko: "bukonobg.png",

    "strawberry dream": "STRAWBERRY.png",
    strawberry: "STRAWBERRY.png",

    "ube macapuno slush": "ubenobg.png",
    ube: "ubenobg.png",

    "summer lychee sunset": "lychee.png",
    lychee: "lycheenobg.png",

    avocado: "avocado.png",
    "avocado supreme": "avocado.png",
  };

  const fallback = noBgMap[cleanName] || "multilogo.png";
  const clean = String(imageUrl || "").trim();

  if (!clean) return fallback;
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
  if (clean.startsWith("/")) return `${API_BASE}${clean}`;
  return clean;
}

function resolveMenuImage(imageUrl, productName = "") {
  const cleanName = String(productName || "").trim().toLowerCase();
  const withBgMap = {
    "classic teo d' mango": "mango.png",
    "classic teo d mango": "mango.png",
    "classic mango bliss": "mango.png",
    "teo d' mango": "mango.png",
    "teo d mango": "mango.png",
    mango: "mango.png",

    "creamy buko slush": "buko2.png",
    buko: "buko2.png",

    "strawberry dream": "berry2.png",
    strawberry: "berry2.png",

    "ube macapuno slush": "ube2.png",
    ube: "ube2.png",

    "summer lychee sunset": "lychee.png",
    lychee: "lychee.png",

    avocado: "avo2.png",
    "avocado supreme": "avo2.png",
  };

  const fallback = withBgMap[cleanName] || "multilogo.png";
  const clean = String(imageUrl || "").trim();

  if (!clean) return fallback;
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
  if (clean.startsWith("/")) return `${API_BASE}${clean}`;
  return clean;
}

function lockBody() {
  document.body.style.overflow = "hidden";
}

function unlockBody() {
  document.body.style.overflow = "auto";
}

function openModal(title, date, bodyText) {
  const modal = document.getElementById("announcement-modal");
  document.getElementById("modal-title").innerText = title;
  document.getElementById("modal-date").innerText = date;
  document.getElementById("modal-body").innerText = bodyText;
  modal.classList.add("active");
  lockBody();
}

function closeModal() {
  document.getElementById("announcement-modal").classList.remove("active");
  unlockBody();
}

function openInquiryModal() {
  const modal = document.getElementById("inquiry-modal");
  const status = document.getElementById("inquiry-status");

  if (status) {
    status.innerText = "";
    status.style.color = "";
  }

  if (modal) {
    modal.classList.add("active");
    lockBody();
  }
}

function closeInquiryModal() {
  const modal = document.getElementById("inquiry-modal");
  const status = document.getElementById("inquiry-status");

  if (modal) {
    modal.classList.remove("active");
    unlockBody();
  }

  if (status) {
    status.innerText = "";
    status.style.color = "";
  }
}

function openAnnouncementListModal() {
  const modal = document.getElementById("announcement-list-modal");
  if (!modal) return;
  modal.classList.add("active");
  lockBody();
}

function closeAnnouncementListModal() {
  const modal = document.getElementById("announcement-list-modal");
  if (!modal) return;
  modal.classList.remove("active");
  unlockBody();
}

function openFaqModal() {
  const modal = document.getElementById("faq-modal");
  if (!modal) return;
  modal.classList.add("active");
  lockBody();
}

function closeFaqModal() {
  const modal = document.getElementById("faq-modal");
  if (!modal) return;
  modal.classList.remove("active");
  unlockBody();
}

function openMenuModal() {
  const modal = document.getElementById("menu-modal");
  if (!modal) return;
  modal.classList.add("active");
  lockBody();
}

function closeMenuModal() {
  const modal = document.getElementById("menu-modal");
  if (!modal) return;
  modal.classList.remove("active");
  unlockBody();
}

function renderAnnouncementListModal(items) {
  const body = document.getElementById("announcementListModalBody");
  if (!body) return;

  if (!items.length) {
    body.innerHTML = `<div class="empty-card">No announcements available right now.</div>`;
    return;
  }

  body.innerHTML = items
    .map((item) => {
      const title = escapeHtml(item.title || "Announcement");
      const content = escapeHtml(item.body || "");
      const displayDate = formatAnnouncementDate(item.publish_at || item.created_at);

      return `
        <div class="announcement-modal-card">
          <div class="announcement-date" style="margin-bottom:10px;">${displayDate}</div>
          <h4>${title}</h4>
          <p>${content}</p>
        </div>
      `;
    })
    .join("");
}

function renderFaqModal(items) {
  const body = document.getElementById("faqModalBody");
  if (!body) return;

  if (!items.length) {
    body.innerHTML = `<div class="empty-card">No FAQs available right now.</div>`;
    return;
  }

  body.innerHTML = items
    .map((item) => {
      const question = escapeHtml(item.question || "Question");
      const answer = escapeHtml(item.answer || "");
      const pinned = Boolean(item.is_pinned);

      return `
        <div class="faq-modal-card">
          <div class="faq-pin" style="margin-bottom:10px;">${pinned ? "Pinned FAQ" : "FAQ"}</div>
          <h4>${question}</h4>
          <p>${answer}</p>
        </div>
      `;
    })
    .join("");
}

function renderMenuModal(items) {
  const body = document.getElementById("menuModalBody");
  if (!body) return;

  if (!items.length) {
    body.innerHTML = `<div class="empty-card">No menu items available right now.</div>`;
    return;
  }

  body.innerHTML = items
    .map((item) => {
      const name = escapeHtml(item.name || "Product");
      const desc = escapeHtml(
        String(item.description || "").trim() ||
          "Freshly prepared and ready for your next craving."
      );
      const price = Number(item.price || 0).toFixed(2);
      const imageSrc = resolveMenuImage(item.image_url, item.name);

      return `
        <div class="menu-modal-card">
          <img src="${imageSrc}" alt="${name}">
          <div>
            <h4>${name}</h4>
            <p>${desc}</p>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:12px;">
            <div class="menu-modal-price">₱${price}</div>
            <button class="btn-outline" type="button" onclick="window.location.href='login.html'">Order Now</button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function loadPublicAnnouncements() {
  const grid = document.getElementById("announcementGrid");
  if (!grid) return;

  try {
    grid.innerHTML = `<div class="loading-card">Loading announcements...</div>`;

    const res = await fetch(`${API_BASE}/announcements/public`);
    const data = await res.json();

    if (!res.ok) {
      grid.innerHTML = `<div class="empty-card">Failed to load announcements.</div>`;
      return;
    }

    const announcements = Array.isArray(data.data) ? data.data : [];
    allAnnouncementsCache = announcements;
    renderAnnouncementListModal(allAnnouncementsCache);

    const previewItems = announcements.slice(0, 4);

    if (!previewItems.length) {
      grid.innerHTML = `<div class="empty-card">No announcements available right now.</div>`;
      return;
    }

    grid.innerHTML = previewItems
      .map((item) => {
        const title = escapeHtml(item.title || "Announcement");
        const body = escapeHtml(item.body || "");
        const shortBody = body.length > 180 ? `${body.slice(0, 180)}...` : body;
        const displayDate = formatAnnouncementDate(item.publish_at || item.created_at);
        const imageSrc = resolveAnnouncementImage(item.image_url);

        return `
          <div class="glass-bento announcement-card">
            ${imageSrc ? `<div class="announcement-image-wrap"><img src="${imageSrc}" alt="${title}"></div>` : ``}
            <span class="announcement-date">${displayDate}</span>
            <h3>${title}</h3>
            <p>${shortBody}</p>
            <button class="btn-outline" onclick="openModal('${title.replace(/'/g, "\\'")}', '${displayDate.replace(/'/g, "\\'")}', '${body.replace(/'/g, "\\'")}')">Read More</button>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    console.error("Failed to load announcements:", error);
    grid.innerHTML = `<div class="empty-card">Failed to load announcements.</div>`;
  }
}

async function loadPublicFaq() {
  const grid = document.getElementById("faqGrid");
  if (!grid) return;

  try {
    grid.innerHTML = `<div class="loading-card">Loading FAQs...</div>`;

    const res = await fetch(`${API_BASE}/faq/public`);
    const data = await res.json();

    if (!res.ok) {
      grid.innerHTML = `<div class="empty-card">Failed to load FAQs.</div>`;
      return;
    }

    const items = Array.isArray(data.data) ? data.data : [];
    allFaqCache = items;
    renderFaqModal(allFaqCache);

    const previewItems = items.slice(0, 4);

    if (!previewItems.length) {
      grid.innerHTML = `<div class="empty-card">No FAQs available right now.</div>`;
      return;
    }

    grid.innerHTML = previewItems
      .map((item) => {
        const question = escapeHtml(item.question || "Question");
        const answer = escapeHtml(item.answer || "");
        const shortAnswer = answer.length > 220 ? `${answer.slice(0, 220)}...` : answer;
        const pinned = Boolean(item.is_pinned);

        return `
          <div class="faq-card">
            <div class="faq-question-row">
              <div class="faq-question">${question}</div>
              ${pinned ? `<div class="faq-pin">Pinned</div>` : ``}
            </div>
            <div class="faq-answer">${shortAnswer}</div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    console.error("Failed to load FAQs:", error);
    grid.innerHTML = `<div class="empty-card">Failed to load FAQs.</div>`;
  }
}

async function loadBestSellers() {
  const grid = document.getElementById("bestSellerGrid");
  if (!grid) return;

  try {
    grid.innerHTML = `<div class="loading-card">Loading best sellers...</div>`;

    const res = await fetch(`${API_BASE}/products/best-sellers/monthly?limit=3`);
    const data = await res.json();

    if (!res.ok) {
      grid.innerHTML = `<div class="empty-card">Failed to load best sellers.</div>`;
      return;
    }

    const items = Array.isArray(data.data) ? data.data : [];

    if (!items.length) {
      grid.innerHTML = `<div class="empty-card">No best seller data available yet.</div>`;
      return;
    }

    const fallbackClasses = ["mango-card", "strawberry-card", "avocado-card"];

    grid.innerHTML = items
      .map((item, index) => {
        const cardClass = fallbackClasses[index % fallbackClasses.length];
        const name = escapeHtml(item.name || "Product");
        const price = Number(item.price || 0).toFixed(2);
        const soldQty = Number(item.sold_qty || 0);
        const imageSrc = resolveBestSellerImage(item.image_url, item.name);

        let priceColor = "var(--mango-dark)";
        if (index === 1) priceColor = "var(--strawberry)";
        if (index === 2) priceColor = "#10b981";

        return `
          <div class="variant-card ${cardClass}" onclick="window.location.href='login.html'">
            <div class="variant-img-wrapper">
              <img src="${imageSrc}" alt="${name}">
            </div>
            <h3>${name}</h3>
            <span style="color:${priceColor};">₱${price}</span>
            <div class="variant-meta">${soldQty} sold this month</div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    console.error("Failed to load best sellers:", error);
    grid.innerHTML = `<div class="empty-card">Failed to load best sellers.</div>`;
  }
}

async function loadPublicMenu() {
  const grid = document.getElementById("menuGrid");
  const productSelect = document.getElementById("feedbackProduct");

  if (!grid) return;

  try {
    grid.innerHTML = `<div class="loading-card">Loading menu...</div>`;

    const res = await fetch(`${API_BASE}/products/menu`);
    const data = await res.json();

    if (!res.ok) {
      grid.innerHTML = `<div class="empty-card">Failed to load menu.</div>`;
      return;
    }

    const items = Array.isArray(data.data) ? data.data : [];
    allMenuCache = items;
    renderMenuModal(allMenuCache);

    if (productSelect) {
      productSelect.innerHTML =
        `<option value="">Select Product</option>` +
        items
          .map(
            (item) =>
              `<option value="${escapeHtml(item.name || "")}">${escapeHtml(item.name || "Product")}</option>`
          )
          .join("");
    }

    const previewItems = items.slice(0, 6);

    if (!previewItems.length) {
      grid.innerHTML = `<div class="empty-card">No menu available right now.</div>`;
      return;
    }

    grid.innerHTML = previewItems
      .map((item) => {
        const name = escapeHtml(item.name || "Product");
        const desc = escapeHtml(
          String(item.description || item.desc || "").trim() ||
            "Freshly prepared and ready for your next craving."
        );
        const price = Number(item.price || 0).toFixed(2);
        const imageSrc = resolveMenuImage(item.image_url, item.name);
        const category = escapeHtml(item.category_name || "Menu Item");

        return `
          <div class="menu-card">
            <div class="menu-image-wrap">
              <img src="${imageSrc}" alt="${name}">
            </div>
            <div class="menu-body">
              <div class="menu-name-row">
                <h3>${name}</h3>
                <div class="menu-price">₱${price}</div>
              </div>
              <div class="menu-desc">${desc}</div>
              <div class="menu-footer">
                <span class="menu-category">${category}</span>
                <button class="btn-outline" type="button" onclick="window.location.href='login.html'">Order Now</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    console.error("Failed to load menu:", error);
    grid.innerHTML = `<div class="empty-card">Failed to load menu.</div>`;
  }
}

async function loadPublicFeedback() {
  const container = document.getElementById("publicFeedbackList");
  if (!container) return;

  try {
    container.innerHTML = `<div class="loading-card">Loading feedback...</div>`;

    const res = await fetch(`${API_BASE}/feedback/public?limit=20`);
    const data = await res.json();

    if (!res.ok) {
      container.innerHTML = `<div class="empty-card">Failed to load feedback.</div>`;
      return;
    }

    const items = Array.isArray(data.data) ? data.data : [];

    if (!items.length) {
      container.innerHTML = `<div class="empty-card">No approved feedback yet.</div>`;
      return;
    }

    container.innerHTML = items
      .map(
        (item) => `
        <div class="feedback-card">
          <div class="feedback-stars">${escapeHtml(getStars(item.rating))}</div>
          <div class="feedback-title">${escapeHtml(item.title || "Customer Feedback")}</div>
          <p>"${escapeHtml(item.comment || "")}"</p>
          <span class="feedback-author">${escapeHtml(item.customer_name || "Anonymous Customer")}</span>
          <span class="feedback-product">${escapeHtml(item.product_name || "Teo D' Mango Product")}</span>
        </div>
      `
      )
      .join("");
  } catch (error) {
    console.error("Failed to load public feedback:", error);
    container.innerHTML = `<div class="empty-card">Failed to load feedback.</div>`;
  }
}

function bindInquiryModal() {
  const modal = document.getElementById("inquiry-modal");
  const form = document.getElementById("inquiryForm");
  const status = document.getElementById("inquiry-status");

  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeInquiryModal();
    });
  }

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      name: document.getElementById("inq_name")?.value.trim(),
      email: document.getElementById("inq_email")?.value.trim(),
      subject: document.getElementById("inq_subject")?.value.trim(),
      message: document.getElementById("inq_message")?.value.trim(),
    };

    if (!payload.name || !payload.email || !payload.message) {
      if (status) {
        status.style.color = "#ff4d6d";
        status.innerText = "Please complete all required fields.";
      }
      return;
    }

    try {
      if (status) {
        status.style.color = "var(--text-muted)";
        status.innerText = "Sending inquiry...";
      }

      const res = await fetch(`${API_BASE}/inquiries/public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (status) {
          status.style.color = "#ff4d6d";
          status.innerText = data.detail || data.message || "Failed to send inquiry.";
        }
        return;
      }

      if (status) {
        status.style.color = "#10b981";
        status.innerText = "Inquiry sent successfully!";
      }

      form.reset();

      setTimeout(() => {
        closeInquiryModal();
      }, 1500);
    } catch (err) {
      console.error("Inquiry submit error:", err);

      if (status) {
        status.style.color = "#ff4d6d";
        status.innerText = "Server error. Please try again.";
      }
    }
  });
}

function bindPublicFeedbackForm() {
  const form = document.getElementById("publicFeedbackForm");
  const status = document.getElementById("feedbackStatus");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      customer_name: document.getElementById("feedbackName")?.value.trim(),
      email: document.getElementById("feedbackEmail")?.value.trim() || null,
      product_name: document.getElementById("feedbackProduct")?.value.trim() || null,
      rating: Number(document.getElementById("feedbackRating")?.value || 0),
      title: document.getElementById("feedbackTitle")?.value.trim() || null,
      comment: document.getElementById("feedbackComment")?.value.trim(),
    };

    if (!payload.customer_name || !payload.rating || !payload.comment) {
      if (status) {
        status.style.color = "#ff4d6d";
        status.innerText = "Please complete the required feedback fields.";
      }
      return;
    }

    try {
      if (status) {
        status.style.color = "var(--text-muted)";
        status.innerText = "Submitting feedback...";
      }

      const res = await fetch(`${API_BASE}/feedback/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (status) {
          status.style.color = "#ff4d6d";
          status.innerText = data.detail || data.message || "Failed to submit feedback.";
        }
        return;
      }

      if (status) {
        status.style.color = "#10b981";
        status.innerText =
          "Feedback submitted successfully! It will appear once approved by admin.";
      }

      form.reset();
    } catch (err) {
      console.error("Public feedback submit error:", err);
      if (status) {
        status.style.color = "#ff4d6d";
        status.innerText = "Server error. Please try again.";
      }
    }
  });
}

function bindGeneralModals() {
  const announcementModal = document.getElementById("announcement-modal");
  const announcementListModal = document.getElementById("announcement-list-modal");
  const faqModal = document.getElementById("faq-modal");
  const menuModal = document.getElementById("menu-modal");

  if (announcementModal) {
    announcementModal.addEventListener("click", function (e) {
      if (e.target === announcementModal) closeModal();
    });
  }

  if (announcementListModal) {
    announcementListModal.addEventListener("click", function (e) {
      if (e.target === announcementListModal) closeAnnouncementListModal();
    });
  }

  if (faqModal) {
    faqModal.addEventListener("click", function (e) {
      if (e.target === faqModal) closeFaqModal();
    });
  }

  if (menuModal) {
    menuModal.addEventListener("click", function (e) {
      if (e.target === menuModal) closeMenuModal();
    });
  }
}

window.addEventListener("scroll", function () {
  const fade = document.getElementById("hero-fade");
  const img = document.getElementById("hero-img");
  const scroll = window.scrollY;

  if (fade) fade.style.opacity = 1 - scroll / 600;
  if (img) img.style.transform = `translateY(${scroll * 0.2}px)`;
});
function resolvePromoImage(imageUrl) {
  const clean = String(imageUrl || "").trim();
  if (!clean) return "";
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
  if (clean.startsWith("/")) return `${API_BASE}${clean}`;
  return clean;
}
function buildPromoRedirectUrl(code = "") {
  const cleanCode = String(code || "").trim();

  if (cleanCode) {
    return `login.html?promo=${encodeURIComponent(cleanCode)}&redirect=menu.html`;
  }

  return `login.html?redirect=menu.html`;
}

function getPromoButtonLabel() {
  return "Log In to Use Promo";
}
function formatPromoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function updatePromoDots() {
  const viewport = document.getElementById("promoBannerViewport");
  const slides = document.querySelectorAll(".promo-banner-slide");
  const dots = document.querySelectorAll(".promo-banner-dot");

  if (!viewport || !slides.length || !dots.length) return;

  const slideWidth = slides[0].offsetWidth + 18;
  const activeIndex = Math.round(viewport.scrollLeft / slideWidth);

  dots.forEach((dot, index) => {
    dot.classList.toggle("active", index === activeIndex);
  });
}

function scrollPromoBanner(direction = 1) {
  const viewport = document.getElementById("promoBannerViewport");
  if (!viewport) return;

  const amount = viewport.clientWidth + 18;
  viewport.scrollBy({
    left: direction * amount,
    behavior: "smooth",
  });
}

function bindPromoBannerControls(count) {
  const prevBtn = document.getElementById("promoBannerPrevBtn");
  const nextBtn = document.getElementById("promoBannerNextBtn");
  const viewport = document.getElementById("promoBannerViewport");
  const dots = document.querySelectorAll(".promo-banner-dot");

  if (prevBtn) {
    prevBtn.onclick = () => scrollPromoBanner(-1);
  }

  if (nextBtn) {
    nextBtn.onclick = () => scrollPromoBanner(1);
  }

  if (viewport) {
    viewport.addEventListener("scroll", updatePromoDots, { passive: true });
  }

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      if (!viewport) return;
      viewport.scrollTo({
        left: index * viewport.clientWidth,
        behavior: "smooth",
      });
    });
  });

  if (count > 0) updatePromoDots();
}

async function loadPublicPromos() {
  const bannerTrack = document.getElementById("promoBannerTrack");
  const bannerDots = document.getElementById("promoBannerDots");
  const codeList = document.getElementById("promoCodeList");

  if (!bannerTrack || !bannerDots || !codeList) return;

  try {
    bannerTrack.innerHTML = `<div class="loading-card" style="min-width:100%;">Loading promos...</div>`;
    bannerDots.innerHTML = "";
    codeList.innerHTML = `<div class="loading-card">Loading promo codes...</div>`;

    const res = await fetch(`${API_BASE}/promo/public/featured`);
    const data = await res.json();

    if (!res.ok) {
      bannerTrack.innerHTML = `<div class="empty-card" style="min-width:100%;">Failed to load promo banners.</div>`;
      codeList.innerHTML = `<div class="empty-card">Failed to load promo codes.</div>`;
      return;
    }

    const banners = Array.isArray(data.banners) ? data.banners : [];
    const codes = Array.isArray(data.codes) ? data.codes : [];

    if (!banners.length) {
      bannerTrack.innerHTML = `
        <div class="promo-banner-slide">
          <div class="promo-banner-content">
            <div class="promo-banner-label"><i class="fa-solid fa-bullhorn"></i> No Active Banner</div>
            <h4>Fresh promos are coming soon.</h4>
            <p>Please check back later for the latest campaign banners and featured offers.</p>
          </div>
        </div>
      `;
      bannerDots.innerHTML = `<span class="promo-banner-dot active"></span>`;
    } else {
      bannerTrack.innerHTML = banners.map((item) => {
        const title = escapeHtml(item.title || "Featured Promo");
        const imageSrc = resolvePromoImage(item.image_url);
        const bannerPromoCode = codes[0]?.code || "";
return `
  <div class="promo-banner-slide">
    ${imageSrc ? `<img src="${imageSrc}" alt="${title}">` : ``}
    <div class="promo-banner-content">
      <div class="promo-banner-label">
        <i class="fa-solid fa-bolt"></i> Promo Banner
      </div>

      <h4>${title}</h4>

      <p>
        Discover today’s featured campaign and special promotional highlights from Teo D' Mango.
      </p>
      <a href="${buildPromoRedirectUrl(bannerPromoCode)}" class="promo-banner-link">
        ${getPromoButtonLabel()}
    </a>
    </div>
  </div>
`;
      }).join("");

      bannerDots.innerHTML = banners.map((_, index) => {
        return `<span class="promo-banner-dot ${index === 0 ? "active" : ""}"></span>`;
      }).join("");
    }

    if (!codes.length) {
      codeList.innerHTML = `<div class="empty-card">No active promo codes available right now.</div>`;
    } else {
      codeList.innerHTML = codes.map((item) => {
        const title = escapeHtml(item.title || item.code || "Promo Code");
        const description = escapeHtml(
          item.description || "Use this promo code during checkout to enjoy special savings."
        );
        const code = escapeHtml(item.code || "PROMO");
        const valueLabel = escapeHtml(item.value_label || "");
        const minOrder = Number(item.min_order_amount || 0).toFixed(2);
        const validUntil = formatPromoDate(item.valid_until);
return `
  <div class="promo-code-card-item">
    <div class="promo-code-top">
      <div>
        <div class="promo-code-title">${title}</div>
        <div class="promo-code-value">${valueLabel}</div>
      </div>
      <a href="${buildPromoRedirectUrl(code)}" class="promo-code-chip" style="text-decoration:none;">
        ${code}
      </a>
    </div>

    <div class="promo-code-desc">${description}</div>

    <div class="promo-code-meta">
      <span>Min. Order ₱${minOrder}</span>
      ${item.per_user_limit ? `<span>${escapeHtml(String(item.per_user_limit))} Per User</span>` : ``}
      ${validUntil ? `<span>Until ${escapeHtml(validUntil)}</span>` : `<span>Limited Time</span>`}
    </div>
  </div>
`;
      }).join("");
    }

    bindPromoBannerControls(banners.length || 1);
  } catch (error) {
    console.error("Failed to load public promos:", error);
    bannerTrack.innerHTML = `<div class="empty-card" style="min-width:100%;">Failed to load promo banners.</div>`;
    codeList.innerHTML = `<div class="empty-card">Failed to load promo codes.</div>`;
  }
}

document.addEventListener("mousemove", (e) => {
  const img = document.getElementById("hero-img");
  if (!img) return;

  const x = (window.innerWidth / 2 - e.pageX) / 50;
  const y = (window.innerHeight / 2 - e.pageY) / 50;
  img.style.transform += ` rotateX(${y}deg) rotateY(${x}deg)`;
});

document.addEventListener("DOMContentLoaded", async () => {
  bindInquiryModal();
  bindPublicFeedbackForm();
  bindGeneralModals();

  await Promise.all([
    loadBestSellers(),
    loadPublicMenu(),
    loadPublicFaq(),
    loadPublicAnnouncements(),
    loadPublicFeedback(),
    loadPublicPromos(),
  ]);
});

window.openModal = openModal;
window.closeModal = closeModal;
window.openInquiryModal = openInquiryModal;
window.closeInquiryModal = closeInquiryModal;
window.openAnnouncementListModal = openAnnouncementListModal;
window.closeAnnouncementListModal = closeAnnouncementListModal;
window.openFaqModal = openFaqModal;
window.closeFaqModal = closeFaqModal;
window.openMenuModal = openMenuModal;
window.closeMenuModal = closeMenuModal;
