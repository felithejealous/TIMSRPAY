let inquiryCache = [];
let feedbackCache = [];
let faqCache = [];

let activeTab = "inquiriesTab";
let currentInquiryId = null;
let currentFeedbackId = null;
let currentFaqId = null;

/* =========================
   HELPERS
========================= */
function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function renderScrollableText(text, widthClass = "table-cell-medium") {
    return `
        <div class="${widthClass}">
            <div class="mini-text table-cell-scroll">${escapeHtml(text || "-")}</div>
        </div>
    `;
}

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
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

async function fetchJSONWithFallback(url, methods = [], bodyData = null) {
    let lastError = null;

    for (const method of methods) {
        try {
            const options = {
                method,
                headers: {
                    "Content-Type": "application/json"
                }
            };

            if (bodyData !== null && bodyData !== undefined) {
                options.body = JSON.stringify(bodyData);
            }

            return await fetchJSON(url, options);
        } catch (error) {
            lastError = error;

            const message = String(error?.message || "").toLowerCase();
            const isMethodError =
                message.includes("405") ||
                message.includes("method not allowed");

            if (!isMethodError) {
                throw error;
            }
        }
    }

    throw lastError || new Error("Request failed.");
}

function showToast(message) {
    alert(message);
}

function normalizeInquiryStatus(item) {
    if (Boolean(item?.is_visible) === false) return "hidden";

    const raw = String(item?.status || "").toLowerCase();

    if (raw === "replied" || raw === "resolved") return "replied";
    if (raw === "closed") return "closed";
    return "pending";
}

function normalizeFeedbackApproval(item) {
    if (Boolean(item?.is_visible) === false) return "hidden";
    if (Boolean(item?.is_featured)) return "featured";
    if (Boolean(item?.is_approved)) return "approved";
    return "pending";
}

function normalizeFaqStatus(item) {
    return Boolean(item?.is_active) ? "active" : "hidden";
}

function getStars(rating) {
    const safeRating = Math.max(1, Math.min(5, Number(rating || 0)));
    return `${"★".repeat(safeRating)}${"☆".repeat(5 - safeRating)}`;
}

function badgeHtml(type, text) {
    return `<span class="badge ${type}">${escapeHtml(text)}</span>`;
}

function getInquiryBadge(status) {
    if (status === "replied") return badgeHtml("badge-replied", "Replied");
    if (status === "closed") return badgeHtml("badge-hidden", "Closed");
    if (status === "hidden") return badgeHtml("badge-hidden", "Hidden");
    return badgeHtml("badge-pending", "Pending");
}

function getFeedbackApprovalBadge(item) {
    const status = normalizeFeedbackApproval(item);

    if (status === "featured") return badgeHtml("badge-featured", "Featured");
    if (status === "approved") return badgeHtml("badge-approved", "Approved");
    if (status === "hidden") return badgeHtml("badge-hidden", "Hidden");
    return badgeHtml("badge-pending", "Pending");
}

function getFaqStatusBadge(item) {
    return Boolean(item?.is_active)
        ? badgeHtml("badge-approved", "Active")
        : badgeHtml("badge-hidden", "Inactive");
}

function getPinnedBadge(item) {
    return Boolean(item?.is_pinned)
        ? badgeHtml("badge-featured", "Pinned")
        : `<span class="mini-text">No</span>`;
}

function renderActionButtons(buttons = []) {
    return `<div class="action-row">${buttons.join("")}</div>`;
}

function setActiveTab(tabId, triggerBtn = null) {
    activeTab = tabId;

    document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.add("hidden"));
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

    const tabPanel = $(tabId);
    if (tabPanel) tabPanel.classList.remove("hidden");

    if (triggerBtn) {
        triggerBtn.classList.add("active");
    } else {
        const matchingBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (matchingBtn) matchingBtn.classList.add("active");
    }

    const createBtn = $("openCreateModalBtn");
    if (createBtn) {
        createBtn.style.display = tabId === "faqTab" ? "" : "none";
    }

    renderActiveTab();
}

function getSearchValue() {
    return String($("engagementSearchInput")?.value || "").trim().toLowerCase();
}

function getStatusFilterValue() {
    return String($("engagementStatusFilter")?.value || "all").toLowerCase();
}

function getSortValue() {
    return String($("engagementSortFilter")?.value || "newest").toLowerCase();
}

function applySort(items, key = "created_at", mode = "newest") {
    const cloned = [...items];

    cloned.sort((a, b) => {
        if (mode === "rating_high") {
            return Number(b.rating || 0) - Number(a.rating || 0);
        }

        if (mode === "rating_low") {
            return Number(a.rating || 0) - Number(b.rating || 0);
        }

        const aDate = new Date(a[key] || a.updated_at || a.created_at || 0).getTime();
        const bDate = new Date(b[key] || b.updated_at || b.created_at || 0).getTime();

        if (mode === "oldest") return aDate - bDate;
        return bDate - aDate;
    });

    return cloned;
}

/* =========================
   LOADERS
========================= */
async function loadInquiries() {
    try {
        const result = await fetchJSON(`${API_URL}/inquiries`);
        inquiryCache = safeArray(result?.data ?? result);
    } catch (error) {
        console.error("loadInquiries error:", error);
        inquiryCache = [];
    }
}

async function loadFeedback() {
    try {
        const result = await fetchJSON(`${API_URL}/feedback`);
        feedbackCache = safeArray(result?.data ?? result);
    } catch (error) {
        console.error("loadFeedback error:", error);
        feedbackCache = [];
    }
}

async function loadFaq() {
    try {
        const result = await fetchJSON(`${API_URL}/faq`);
        faqCache = safeArray(result?.data ?? result);
    } catch (error) {
        console.error("loadFaq error:", error);
        faqCache = [];
    }
}

async function loadAllEngagementData() {
    await Promise.all([
        loadInquiries(),
        loadFeedback(),
        loadFaq()
    ]);

    updateStats();
    renderActiveTab();
}

/* =========================
   STATS
========================= */
function updateStats() {
    const pendingInquiries = inquiryCache.filter(item => normalizeInquiryStatus(item) === "pending").length;
    const approvedFeedback = feedbackCache.filter(item => Boolean(item?.is_approved)).length;
    const featuredFeedback = feedbackCache.filter(item => Boolean(item?.is_featured)).length;
    const activeFaq = faqCache.filter(item => Boolean(item?.is_active)).length;

    if ($("statPendingInquiries")) $("statPendingInquiries").textContent = pendingInquiries;
    if ($("statApprovedFeedback")) $("statApprovedFeedback").textContent = approvedFeedback;
    if ($("statFeaturedReviews")) $("statFeaturedReviews").textContent = featuredFeedback;
    if ($("statFaqCount")) $("statFaqCount").textContent = activeFaq;
}

/* =========================
   FILTERS
========================= */
function filterInquiries(items) {
    const search = getSearchValue();
    const status = getStatusFilterValue();

    let filtered = items.filter(item => {
        const searchable = [
            item.name,
            item.email,
            item.subject,
            item.message,
            item.admin_reply
        ].join(" ").toLowerCase();

        const searchMatch = !search || searchable.includes(search);
        const normalized = normalizeInquiryStatus(item);
        const statusMatch = status === "all" || normalized === status;

        return searchMatch && statusMatch;
    });

    filtered = applySort(filtered, "created_at", getSortValue());
    return filtered;
}

function filterFeedback(items, featuredOnly = false) {
    const search = getSearchValue();
    const status = getStatusFilterValue();

    let filtered = items.filter(item => {
        const searchable = [
            item.customer_name,
            item.email,
            item.product_name,
            item.title,
            item.comment,
            item.admin_reply
        ].join(" ").toLowerCase();

        const searchMatch = !search || searchable.includes(search);

        const normalized = normalizeFeedbackApproval(item);
        const statusMatch = status === "all" || normalized === status;
        const featuredMatch = !featuredOnly || Boolean(item?.is_featured);

        return searchMatch && statusMatch && featuredMatch;
    });

    filtered = applySort(filtered, "created_at", getSortValue());
    return filtered;
}

function filterFaq(items) {
    const search = getSearchValue();
    const status = getStatusFilterValue();

    let filtered = items.filter(item => {
        const searchable = [
            item.question,
            item.answer
        ].join(" ").toLowerCase();

        const searchMatch = !search || searchable.includes(search);

        let statusMatch = true;
        if (status !== "all") {
            if (status === "featured") {
                statusMatch = Boolean(item?.is_pinned);
            } else {
                statusMatch = normalizeFaqStatus(item) === status;
            }
        }

        return searchMatch && statusMatch;
    });

    filtered = applySort(filtered, "updated_at", getSortValue());
    return filtered;
}

/* =========================
   RENDERERS
========================= */
function renderInquiries() {
    const body = $("inquiryTableBody");
    if (!body) return;

    const rows = filterInquiries(inquiryCache);

    if (!rows.length) {
        body.innerHTML = `<tr><td colspan="7" class="empty-state">No inquiries found.</td></tr>`;
        return;
    }

    body.innerHTML = rows.map(item => {
        const status = normalizeInquiryStatus(item);

        return `
            <tr>
                <td><div class="font-bold">${escapeHtml(item.name || "-")}</div></td>
                <td><div class="mini-text">${escapeHtml(item.email || "-")}</div></td>
                <td>${renderScrollableText(item.subject || "-", "table-cell-tight")}</td>
                <td>${renderScrollableText(item.message || "-", "table-cell-medium")}</td>
                <td>${getInquiryBadge(status)}</td>
                <td><div class="mini-text">${escapeHtml(formatDateTime(item.created_at))}</div></td>
                <td>
                    ${renderActionButtons([
                        `<button class="action-btn primary" onclick="openInquiryModal(${Number(item.id)})">View</button>`,
                        `<button class="action-btn success" onclick="openInquiryModal(${Number(item.id)})">Reply</button>`,
                        `<button class="action-btn danger" onclick="toggleInquiryVisibility(${Number(item.id)}, ${Boolean(item.is_visible)})">${Boolean(item.is_visible) ? "Hide" : "Show"}</button>`
                    ])}
                </td>
            </tr>
        `;
    }).join("");
}

function renderFeedback() {
    const body = $("feedbackTableBody");
    if (!body) return;

    const rows = filterFeedback(feedbackCache, false);

    if (!rows.length) {
        body.innerHTML = `<tr><td colspan="8" class="empty-state">No feedback found.</td></tr>`;
        return;
    }

    body.innerHTML = rows.map(item => `
        <tr>
            <td><div class="font-bold">${escapeHtml(item.customer_name || "-")}</div></td>
            <td><div class="mini-text">${escapeHtml(item.product_name || "-")}</div></td>
            <td><span class="stars">${escapeHtml(getStars(item.rating))}</span></td>
            <td>${renderScrollableText(item.title || "-", "table-cell-tight")}</td>
            <td>${renderScrollableText(item.comment || "-", "table-cell-medium")}</td>
            <td>${getFeedbackApprovalBadge({ ...item, is_featured: false })}</td>
            <td>${Boolean(item.is_featured) ? badgeHtml("badge-featured", "Featured") : `<span class="mini-text">No</span>`}</td>
            <td>
                ${renderActionButtons([
                    `<button class="action-btn primary" onclick="openFeedbackModal(${Number(item.id)})">View</button>`,
                    `<button class="action-btn success" onclick="toggleFeedbackApproval(${Number(item.id)}, ${Boolean(item.is_approved)})">${Boolean(item.is_approved) ? "Unapprove" : "Approve"}</button>`,
                    `<button class="action-btn warning" onclick="toggleFeedbackFeatured(${Number(item.id)}, ${Boolean(item.is_featured)})">${Boolean(item.is_featured) ? "Unfeature" : "Feature"}</button>`
                ])}
            </td>
        </tr>
    `).join("");
}

function renderFaq() {
    const body = $("faqTableBody");
    if (!body) return;

    const rows = filterFaq(faqCache);

    if (!rows.length) {
        body.innerHTML = `<tr><td colspan="7" class="empty-state">No FAQs found.</td></tr>`;
        return;
    }

    body.innerHTML = rows.map(item => `
        <tr>
            <td>${Number(item.display_order || 0)}</td>
            <td>${renderScrollableText(item.question || "-", "table-cell-medium")}</td>
            <td>${renderScrollableText(item.answer || "-", "table-cell-wide")}</td>
            <td>${getPinnedBadge(item)}</td>
            <td>${getFaqStatusBadge(item)}</td>
            <td><div class="mini-text">${escapeHtml(formatDateTime(item.updated_at || item.created_at))}</div></td>
            <td>
                ${renderActionButtons([
                    `<button class="action-btn primary" onclick="openFaqModal(${Number(item.id)})">Edit</button>`,
                    `<button class="action-btn warning" onclick="toggleFaqPinned(${Number(item.id)}, ${Boolean(item.is_pinned)})">${Boolean(item.is_pinned) ? "Unpin" : "Pin"}</button>`,
                    `<button class="action-btn danger" onclick="toggleFaqActive(${Number(item.id)}, ${Boolean(item.is_active)})">${Boolean(item.is_active) ? "Disable" : "Enable"}</button>`
                ])}
            </td>
        </tr>
    `).join("");
}

function renderFeatured() {
    const body = $("featuredTableBody");
    if (!body) return;

    const rows = filterFeedback(feedbackCache, true);

    if (!rows.length) {
        body.innerHTML = `<tr><td colspan="7" class="empty-state">No featured reviews available.</td></tr>`;
        return;
    }

    body.innerHTML = rows.map(item => `
        <tr>
            <td><div class="font-bold">${escapeHtml(item.customer_name || "-")}</div></td>
            <td><div class="mini-text">${escapeHtml(item.product_name || "-")}</div></td>
            <td><span class="stars">${escapeHtml(getStars(item.rating))}</span></td>
            <td>
                <div class="font-bold">${escapeHtml(item.title || "-")}</div>
                ${renderScrollableText(item.comment || "-", "table-cell-medium")}
            </td>
            <td>${Boolean(item.is_visible) ? badgeHtml("badge-approved", "Visible") : badgeHtml("badge-hidden", "Hidden")}</td>
            <td><div class="mini-text">${escapeHtml(formatDateTime(item.created_at))}</div></td>
            <td>
                ${renderActionButtons([
                    `<button class="action-btn primary" onclick="openFeedbackModal(${Number(item.id)})">View</button>`,
                    `<button class="action-btn danger" onclick="toggleFeedbackFeatured(${Number(item.id)}, true)">Remove</button>`
                ])}
            </td>
        </tr>
    `).join("");
}

function renderActiveTab() {
    if (activeTab === "inquiriesTab") {
        renderInquiries();
        return;
    }

    if (activeTab === "feedbackTab") {
        renderFeedback();
        return;
    }

    if (activeTab === "faqTab") {
        renderFaq();
        return;
    }

    if (activeTab === "featuredTab") {
        renderFeatured();
    }
}

/* =========================
   MODAL
========================= */
function openEngagementModal(title, html) {
    const modal = $("engagementModal");
    const titleEl = $("engagementModalTitle");
    const contentEl = $("engagementModalContent");

    if (titleEl) titleEl.textContent = title;
    if (contentEl) contentEl.innerHTML = html;
    if (modal) modal.classList.add("open");
}

function closeEngagementModal() {
    const modal = $("engagementModal");
    if (modal) modal.classList.remove("open");

    currentInquiryId = null;
    currentFeedbackId = null;
    currentFaqId = null;
}

function openInquiryModal(id) {
    const item = inquiryCache.find(x => Number(x.id) === Number(id));
    if (!item) return;

    currentInquiryId = item.id;

    const normalizedStatus = normalizeInquiryStatus(item);
    const visibilityText = Boolean(item.is_visible) ? "Visible to customer" : "Hidden from customer";

    openEngagementModal("Inquiry Details", `
        <div class="two-col">
            <div class="field-group">
                <label>Name</label>
                <input type="text" value="${escapeHtml(item.name || "")}" readonly>
            </div>
            <div class="field-group">
                <label>Email</label>
                <input type="text" value="${escapeHtml(item.email || "")}" readonly>
            </div>
        </div>

        <div class="two-col">
            <div class="field-group">
                <label>Status</label>
                <input type="text" value="${escapeHtml(normalizedStatus.toUpperCase())}" readonly>
            </div>
            <div class="field-group">
                <label>Visibility</label>
                <input type="text" value="${escapeHtml(visibilityText)}" readonly>
            </div>
        </div>

        <div class="field-group">
            <label>Subject</label>
            <input type="text" value="${escapeHtml(item.subject || "")}" readonly>
        </div>

        <div class="field-group">
            <label>Message</label>
            <textarea rows="5" readonly>${escapeHtml(item.message || "")}</textarea>
        </div>

        ${item.admin_reply ? `
            <div class="reply-box">
                <strong>Admin Reply:</strong><br>${escapeHtml(item.admin_reply)}
            </div>
        ` : ""}

        <div class="field-group">
            <label>Reply</label>
            <textarea rows="4" id="inquiryReplyInput" placeholder="Type your reply here...">${escapeHtml(item.admin_reply || "")}</textarea>
        </div>

        <div class="modal-action-row">
            <button class="btn-primary" onclick="submitInquiryReply()">Send Reply</button>
            <button class="btn-danger" onclick="toggleInquiryVisibility(${Number(item.id)}, ${Boolean(item.is_visible)})">
                ${Boolean(item.is_visible) ? "Hide Inquiry" : "Show Inquiry"}
            </button>
        </div>
    `);
}

function openFeedbackModal(id) {
    const item = feedbackCache.find(x => Number(x.id) === Number(id));
    if (!item) return;

    currentFeedbackId = item.id;

    openEngagementModal("Feedback Details", `
        <div class="two-col">
            <div class="field-group">
                <label>Customer</label>
                <input type="text" value="${escapeHtml(item.customer_name || "")}" readonly>
            </div>
            <div class="field-group">
                <label>Product</label>
                <input type="text" value="${escapeHtml(item.product_name || "")}" readonly>
            </div>
        </div>

        <div class="two-col">
            <div class="field-group">
                <label>Rating</label>
                <input type="text" value="${escapeHtml(getStars(item.rating))}" readonly>
            </div>
            <div class="field-group">
                <label>Title</label>
                <input type="text" value="${escapeHtml(item.title || "")}" readonly>
            </div>
        </div>

        <div class="field-group">
            <label>Comment</label>
            <textarea rows="5" readonly>${escapeHtml(item.comment || "")}</textarea>
        </div>

        <div class="field-group">
            <label>Admin Reply</label>
            <textarea rows="4" id="feedbackReplyInput" placeholder="Optional reply to feedback...">${escapeHtml(item.admin_reply || "")}</textarea>
        </div>

        <div class="modal-action-row">
            <button class="btn-primary" onclick="saveFeedbackReply()">Save Reply</button>
            <button class="btn-secondary" onclick="toggleFeedbackApproval(${Number(item.id)}, ${Boolean(item.is_approved)})">
                ${Boolean(item.is_approved) ? "Unapprove" : "Approve Review"}
            </button>
            <button class="btn-secondary" onclick="toggleFeedbackFeatured(${Number(item.id)}, ${Boolean(item.is_featured)})">
                ${Boolean(item.is_featured) ? "Remove from Featured" : "Feature on Public Site"}
            </button>
        </div>
    `);
}

function openFaqModal(id = null) {
    const item = faqCache.find(x => Number(x.id) === Number(id));
    currentFaqId = item?.id || null;

    openEngagementModal(item ? "Edit FAQ" : "Create FAQ", `
        <div class="two-col">
            <div class="field-group">
                <label>Display Order</label>
                <input type="number" id="faqOrderInput" value="${Number(item?.display_order || 0)}" min="0" step="1">
            </div>
            <div class="field-group">
                <label>Status</label>
                <select id="faqStatusInput">
                    <option value="active" ${item?.is_active ? "selected" : ""}>Active</option>
                    <option value="inactive" ${item && !item.is_active ? "selected" : ""}>Inactive</option>
                </select>
            </div>
        </div>

        <div class="field-group">
            <label>Question</label>
            <input type="text" id="faqQuestionInput" value="${escapeHtml(item?.question || "")}" placeholder="Enter frequently asked question">
        </div>

        <div class="field-group">
            <label>Answer</label>
            <textarea rows="6" id="faqAnswerInput" placeholder="Enter answer">${escapeHtml(item?.answer || "")}</textarea>
        </div>

        <div class="field-group">
            <label>Pinned</label>
            <select id="faqPinnedInput">
                <option value="false" ${item?.is_pinned ? "" : "selected"}>No</option>
                <option value="true" ${item?.is_pinned ? "selected" : ""}>Yes</option>
            </select>
        </div>

        <div class="modal-action-row">
            <button class="btn-primary" onclick="saveFaq()">${item ? "Save Changes" : "Create FAQ"}</button>
            ${item ? `<button class="btn-danger" onclick="deleteFaq(${Number(item.id)})">Delete FAQ</button>` : ""}
        </div>
    `);
}

/* =========================
   ACTIONS - INQUIRIES
========================= */
async function submitInquiryReply() {
    if (!currentInquiryId) return;

    const reply = String($("inquiryReplyInput")?.value || "").trim();
    if (!reply) {
        showToast("Reply message is required.");
        return;
    }

    try {
        await fetchJSON(`${API_URL}/inquiries/${currentInquiryId}/reply`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                admin_reply: reply,
                status: "replied"
            })
        });

        showToast("Inquiry reply saved.");
        closeEngagementModal();
        await loadAllEngagementData();
    } catch (error) {
        console.error("submitInquiryReply error:", error);
        showToast(error.message || "Failed to reply to inquiry.");
    }
}

async function toggleInquiryVisibility(id, isVisible) {
    try {
        await fetchJSON(`${API_URL}/inquiries/${id}/visibility`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                is_visible: !Boolean(isVisible)
            })
        });

        showToast(`Inquiry ${isVisible ? "hidden" : "shown"} successfully.`);
        closeEngagementModal();
        await loadAllEngagementData();
    } catch (error) {
        console.error("toggleInquiryVisibility error:", error);
        showToast(error.message || "Failed to update inquiry visibility.");
    }
}

/* =========================
   ACTIONS - FEEDBACK
========================= */
async function saveFeedbackReply() {
    if (!currentFeedbackId) return;

    const reply = String($("feedbackReplyInput")?.value || "").trim();

    try {
        await fetchJSON(`${API_URL}/feedback/${currentFeedbackId}/reply`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                admin_reply: reply
            })
        });

        showToast("Feedback reply saved.");
        closeEngagementModal();
        await loadAllEngagementData();
    } catch (error) {
        console.error("saveFeedbackReply error:", error);
        showToast(error.message || "Failed to save feedback reply.");
    }
}

async function toggleFeedbackApproval(id, isApproved) {
    const item = feedbackCache.find(x => Number(x.id) === Number(id));
    if (!item) return;

    try {
        await fetchJSON(`${API_URL}/feedback/${id}/moderate`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                is_approved: !Boolean(isApproved),
                is_featured: Boolean(item.is_featured),
                is_visible: Boolean(item.is_visible)
            })
        });

        showToast(`Feedback ${isApproved ? "unapproved" : "approved"} successfully.`);
        closeEngagementModal();
        await loadAllEngagementData();
    } catch (error) {
        console.error("toggleFeedbackApproval error:", error);
        showToast(error.message || "Failed to update approval.");
    }
}

async function toggleFeedbackFeatured(id, isFeatured) {
    const item = feedbackCache.find(x => Number(x.id) === Number(id));
    if (!item) return;

    try {
        await fetchJSON(`${API_URL}/feedback/${id}/moderate`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                is_approved: Boolean(item.is_approved),
                is_featured: !Boolean(isFeatured),
                is_visible: Boolean(item.is_visible)
            })
        });

        showToast(`Feedback ${isFeatured ? "removed from featured" : "featured"} successfully.`);
        closeEngagementModal();
        await loadAllEngagementData();
    } catch (error) {
        console.error("toggleFeedbackFeatured error:", error);
        showToast(error.message || "Failed to update featured status.");
    }
}

/* =========================
   ACTIONS - FAQ
========================= */
async function saveFaq() {
    const question = String($("faqQuestionInput")?.value || "").trim();
    const answer = String($("faqAnswerInput")?.value || "").trim();
    const rawDisplayOrder = Number($("faqOrderInput")?.value || 0);
    const displayOrder = Math.max(0, rawDisplayOrder);
    const isActive = String($("faqStatusInput")?.value || "active") === "active";
    const isPinned = String($("faqPinnedInput")?.value || "false") === "true";

    if (!question || !answer) {
        showToast("Question and answer are required.");
        return;
    }

    const payload = {
        question,
        answer,
        display_order: displayOrder,
        is_active: isActive,
        is_pinned: isPinned
    };

    try {
        if (currentFaqId) {
            await fetchJSONWithFallback(
                `${API_URL}/faq/${currentFaqId}`,
                ["PATCH", "PUT"],
                payload
            );

            showToast("FAQ updated successfully.");
        } else {
            await fetchJSONWithFallback(
                `${API_URL}/faq`,
                ["POST"],
                payload
            );

            showToast("FAQ created successfully.");
        }

        closeEngagementModal();
        await loadAllEngagementData();
    } catch (error) {
        console.error("saveFaq error:", error);
        showToast(error.message || "Failed to save FAQ.");
    }
}

async function toggleFaqPinned(id, isPinned) {
    const item = faqCache.find(x => Number(x.id) === Number(id));
    if (!item) return;

    try {
        await fetchJSONWithFallback(
            `${API_URL}/faq/${id}`,
            ["PATCH", "PUT"],
            {
                question: item.question,
                answer: item.answer,
                display_order: Number(item.display_order || 0),
                is_active: Boolean(item.is_active),
                is_pinned: !Boolean(isPinned)
            }
        );

        showToast(`FAQ ${isPinned ? "unpinned" : "pinned"} successfully.`);
        await loadAllEngagementData();
    } catch (error) {
        console.error("toggleFaqPinned error:", error);
        showToast(error.message || "Failed to update FAQ pin.");
    }
}

async function toggleFaqActive(id, isActive) {
    const item = faqCache.find(x => Number(x.id) === Number(id));
    if (!item) return;

    try {
        await fetchJSONWithFallback(
            `${API_URL}/faq/${id}`,
            ["PATCH", "PUT"],
            {
                question: item.question,
                answer: item.answer,
                display_order: Number(item.display_order || 0),
                is_active: !Boolean(isActive),
                is_pinned: Boolean(item.is_pinned)
            }
        );

        showToast(`FAQ ${isActive ? "disabled" : "enabled"} successfully.`);
        await loadAllEngagementData();
    } catch (error) {
        console.error("toggleFaqActive error:", error);
        showToast(error.message || "Failed to update FAQ status.");
    }
}

async function deleteFaq(id) {
    const confirmed = confirm("Are you sure you want to delete this FAQ?");
    if (!confirmed) return;

    try {
        await fetchJSON(`${API_URL}/faq/${id}`, {
            method: "DELETE"
        });

        showToast("FAQ deleted successfully.");
        closeEngagementModal();
        await loadAllEngagementData();
    } catch (error) {
        console.error("deleteFaq error:", error);
        showToast(error.message || "Failed to delete FAQ.");
    }
}

/* =========================
   EVENTS
========================= */
function bindTabButtons() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            setActiveTab(btn.dataset.tab, btn);
        });
    });
}

function bindFilters() {
    $("engagementSearchInput")?.addEventListener("input", renderActiveTab);
    $("engagementStatusFilter")?.addEventListener("change", renderActiveTab);
    $("engagementSortFilter")?.addEventListener("change", renderActiveTab);
}

function bindCreateButton() {
    $("openCreateModalBtn")?.addEventListener("click", () => openFaqModal());
}

function bindModalOverlay() {
    $("engagementModal")?.addEventListener("click", event => {
        if (event.target.id === "engagementModal") {
            closeEngagementModal();
        }
    });
}

/* =========================
   INIT
========================= */
async function initEngagementPage() {
    try {
        bindTabButtons();
        bindFilters();
        bindCreateButton();
        bindModalOverlay();

        await loadAllEngagementData();
        setActiveTab("inquiriesTab");
    } catch (error) {
        console.error("initEngagementPage error:", error);
        showToast(error.message || "Failed to load engagement page.");
    }
}

window.openInquiryModal = openInquiryModal;
window.openFeedbackModal = openFeedbackModal;
window.openFaqModal = openFaqModal;
window.closeEngagementModal = closeEngagementModal;
window.submitInquiryReply = submitInquiryReply;
window.toggleInquiryVisibility = toggleInquiryVisibility;
window.saveFeedbackReply = saveFeedbackReply;
window.toggleFeedbackApproval = toggleFeedbackApproval;
window.toggleFeedbackFeatured = toggleFeedbackFeatured;
window.saveFaq = saveFaq;
window.toggleFaqPinned = toggleFaqPinned;
window.toggleFaqActive = toggleFaqActive;
window.deleteFaq = deleteFaq;

document.addEventListener("DOMContentLoaded", initEngagementPage);