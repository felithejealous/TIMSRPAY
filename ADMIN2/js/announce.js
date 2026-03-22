let announcementsCache = [];
let currentEditingAnnouncement = null;
let selectedImageFile = null;

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

function formatDateTime(dateString) {
    if (!dateString) return "No schedule";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;

    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function toDatetimeLocalValue(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";

    const pad = (n) => String(n).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getNowLocalInputValue() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");

    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function setScheduleMin() {
    const annSchedule = document.getElementById("annSchedule");
    if (!annSchedule) return;

    annSchedule.min = getNowLocalInputValue();
}

function getStatusMeta(item) {
    const status = String(item?.status || "draft").toLowerCase();
    const publishAt = item?.publish_at ? new Date(item.publish_at) : null;
    const now = new Date();

    if (status === "published" && publishAt && publishAt > now) {
        return {
            label: "Scheduled",
            badgeClass: "badge-scheduled",
            actionLabel: "Unpublish",
            actionIcon: "fa-eye-slash"
        };
    }

    if (status === "published") {
        return {
            label: "Published",
            badgeClass: "badge-published",
            actionLabel: "Unpublish",
            actionIcon: "fa-eye-slash"
        };
    }

    if (status === "archived") {
        return {
            label: "Archived",
            badgeClass: "badge-archived",
            actionLabel: "Publish",
            actionIcon: "fa-eye"
        };
    }

    return {
        label: "Draft",
        badgeClass: "badge-draft",
        actionLabel: "Publish",
        actionIcon: "fa-eye"
    };
}

function getAnnouncementById(id) {
    return announcementsCache.find(item => Number(item.id) === Number(id)) || null;
}

function getModalElement() {
    return document.getElementById("announceModal");
}

function getPreviewElement() {
    return document.getElementById("imagePreview");
}

function clearImagePreview() {
    const preview = getPreviewElement();
    if (!preview) return;

    preview.src = "";
    preview.style.display = "none";
}

function showImagePreview(src) {
    const preview = getPreviewElement();
    if (!preview) return;

    if (!src) {
        clearImagePreview();
        return;
    }

    preview.src = src;
    preview.style.display = "block";
}

async function fetchAnnouncements() {
    try {
        const response = await fetch(`${API_URL}/announcements?limit=100`, {
            method: "GET",
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Announcements fetch failed: ${response.status}`);
        }

        announcementsCache = Array.isArray(result.data) ? result.data : [];
        renderAnnouncements();
    } catch (error) {
        console.error("Announcements fetch error:", error);
        announcementsCache = [];
        renderAnnouncements(true);
    }
}

function renderAnnouncements(hasError = false) {
    const feedBody = document.getElementById("feedBody");
    if (!feedBody) return;

    feedBody.innerHTML = "";

    if (hasError) {
        feedBody.innerHTML = `<div class="empty-state glass">Failed to load announcements.</div>`;
        return;
    }

    if (!announcementsCache.length) {
        feedBody.innerHTML = `<div class="empty-state glass">No announcements yet.</div>`;
        return;
    }

    announcementsCache.forEach(item => {
        const meta = getStatusMeta(item);
        const isPinned = Boolean(item.is_pinned);

        const imageBlock = item.image_url
            ? `<img src="${escapeHtml(item.image_url)}" class="post-image" alt="Announcement image">`
            : "";

        const publishLine = item.publish_at
            ? `<div class="mt-2 text-[11px] opacity-60">Publish: ${escapeHtml(formatDateTime(item.publish_at))}</div>`
            : "";

        const expireLine = item.expire_at
            ? `<div class="text-[11px] opacity-60">Expire: ${escapeHtml(formatDateTime(item.expire_at))}</div>`
            : "";

        const card = document.createElement("div");
        card.className = `post-card glass ${isPinned ? "pinned-post" : ""}`;
        card.dataset.id = item.id;

        card.innerHTML = `
            <div class="flex justify-between items-start gap-4">
                <div class="flex gap-4">
                    <div class="post-avatar">
                        <i class="fas ${isPinned ? "fa-thumbtack" : "fa-bullhorn"}"></i>
                    </div>
                    <div>
                        <h2 class="post-title">${escapeHtml(item.title || "Untitled")}</h2>
                        <div class="meta-line">
                            Admin • ${escapeHtml(formatDateTime(item.created_at))}
                            <span class="status-badge ${meta.badgeClass}">${escapeHtml(meta.label)}</span>
                        </div>
                        ${publishLine}
                        ${expireLine}
                    </div>
                </div>
            </div>

            <div class="post-body">${escapeHtml(item.body || "")}</div>

            ${imageBlock}

            <div class="flex justify-end gap-3 pt-4 mt-6 border-t border-white/5 flex-wrap">
                <button class="btn-action pin-btn" type="button" data-id="${item.id}">
                    <i class="fas fa-thumbtack mr-2"></i>${isPinned ? "Unpin" : "Pin"}
                </button>

                <button class="btn-action status-btn" type="button" data-id="${item.id}">
                    <i class="fas ${meta.actionIcon} mr-2"></i>${meta.actionLabel}
                </button>

                <button class="btn-action edit-btn" type="button" data-id="${item.id}">
                    <i class="fas fa-edit mr-2"></i>Edit
                </button>

                <button class="btn-action btn-delete delete-btn" type="button" data-id="${item.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        feedBody.appendChild(card);
    });
}

function resetAnnouncementForm() {
    const form = document.getElementById("announceForm");
    if (form) form.reset();

    currentEditingAnnouncement = null;
    selectedImageFile = null;

    const announcementId = document.getElementById("announcementId");
    const modalTitle = document.getElementById("modalTitle");
    const submitBtn = document.getElementById("submitBtn");
    const annStatus = document.getElementById("annStatus");
    const annPinned = document.getElementById("annPinned");
    const annImage = document.getElementById("annImage");
    const annSchedule = document.getElementById("annSchedule");
    const annExpire = document.getElementById("annExpire");

    if (announcementId) announcementId.value = "";
    if (modalTitle) modalTitle.innerText = "Broadcast Message";
    if (submitBtn) submitBtn.innerText = "Deploy Post";
    if (annStatus) annStatus.value = "draft";
    if (annPinned) annPinned.checked = false;
    if (annImage) annImage.value = "";
    if (annSchedule) annSchedule.value = "";
    if (annExpire) annExpire.value = "";

    clearImagePreview();
    setScheduleMin();
}

function openModal() {
    resetAnnouncementForm();
    getModalElement()?.classList.add("show");
}

function closeModal() {
    getModalElement()?.classList.remove("show");
}

function previewSelectedImage(file) {
    if (!file) {
        clearImagePreview();
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        showImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
}

function populateEditForm(item) {
    currentEditingAnnouncement = item;
    selectedImageFile = null;

    const modalTitle = document.getElementById("modalTitle");
    const submitBtn = document.getElementById("submitBtn");
    const announcementId = document.getElementById("announcementId");
    const annTitle = document.getElementById("annTitle");
    const annContent = document.getElementById("annContent");
    const annStatus = document.getElementById("annStatus");
    const annSchedule = document.getElementById("annSchedule");
    const annExpire = document.getElementById("annExpire");
    const annPinned = document.getElementById("annPinned");
    const annImage = document.getElementById("annImage");

    if (modalTitle) modalTitle.innerText = "Update Broadcast";
    if (submitBtn) submitBtn.innerText = "Save Changes";
    if (announcementId) announcementId.value = item.id;
    if (annTitle) annTitle.value = item.title || "";
    if (annContent) annContent.value = item.body || "";
    if (annStatus) annStatus.value = String(item.status || "draft").toLowerCase();
    if (annSchedule) annSchedule.value = toDatetimeLocalValue(item.publish_at);
    if (annExpire) annExpire.value = toDatetimeLocalValue(item.expire_at);
    if (annPinned) annPinned.checked = Boolean(item.is_pinned);
    if (annImage) annImage.value = "";

    setScheduleMin();

    if (item.image_url) {
        showImagePreview(item.image_url);
    } else {
        clearImagePreview();
    }

    getModalElement()?.classList.add("show");
}

function validateAnnouncementFormData({ publishAt, expireAt }) {
    const now = new Date();

    if (publishAt) {
        const publishDate = new Date(publishAt);

        if (Number.isNaN(publishDate.getTime())) {
            alert("Invalid publish date.");
            return false;
        }

        if (publishDate < now) {
            alert("Publish date cannot be in the past.");
            return false;
        }
    }

    if (expireAt) {
        const expireDate = new Date(expireAt);

        if (Number.isNaN(expireDate.getTime())) {
            alert("Invalid expiry date.");
            return false;
        }
    }

    if (publishAt && expireAt) {
        const publishDate = new Date(publishAt);
        const expireDate = new Date(expireAt);

        if (expireDate <= publishDate) {
            alert("Expire date must be after publish date.");
            return false;
        }
    }

    return true;
}

function buildAnnouncementFormData({
    title,
    body,
    status,
    isPinned,
    publishAt,
    expireAt,
    imageFile
}) {
    const formData = new FormData();

    formData.append("title", title);
    formData.append("body", body);
    formData.append("status", status);
    formData.append("is_pinned", String(isPinned));

    if (publishAt) formData.append("publish_at", publishAt);
    if (expireAt) formData.append("expire_at", expireAt);
    if (imageFile) formData.append("image", imageFile);

    return formData;
}

async function submitAnnouncementForm(event) {
    event.preventDefault();

    const announcementId = (document.getElementById("announcementId")?.value || "").trim();
    const title = (document.getElementById("annTitle")?.value || "").trim();
    const body = (document.getElementById("annContent")?.value || "").trim();
    const status = (document.getElementById("annStatus")?.value || "draft").trim().toLowerCase();
    const publishAt = (document.getElementById("annSchedule")?.value || "").trim();
    const expireAt = (document.getElementById("annExpire")?.value || "").trim();
    const isPinned = Boolean(document.getElementById("annPinned")?.checked);

    if (!title || !body) {
        alert("Title and content are required.");
        return;
    }

    if (!validateAnnouncementFormData({ publishAt, expireAt })) {
        return;
    }

    try {
        const formData = buildAnnouncementFormData({
            title,
            body,
            status,
            isPinned,
            publishAt,
            expireAt,
            imageFile: selectedImageFile
        });

        const url = announcementId
            ? `${API_URL}/announcements/${announcementId}`
            : `${API_URL}/announcements`;

        const method = announcementId ? "PATCH" : "POST";

        const response = await fetch(url, {
            method,
            credentials: "include",
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `${announcementId ? "Update" : "Create"} failed: ${response.status}`);
        }

        closeModal();
        await fetchAnnouncements();
        showToast(announcementId ? "Announcement updated" : "Announcement created");
    } catch (error) {
        console.error("Announcement submit error:", error);
        alert(error.message || "Failed to save announcement.");
    }
}

async function deleteAnnouncement(id) {
    const confirmed = confirm("Permanently delete this announcement?");
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_URL}/announcements/${id}`, {
            method: "DELETE",
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Delete failed: ${response.status}`);
        }

        showToast("Announcement deleted");
        await fetchAnnouncements();
    } catch (error) {
        console.error("Delete announcement error:", error);
        alert(error.message || "Failed to delete announcement.");
    }
}

async function patchAnnouncement(id, payload, successMessage) {
    try {
        const item = getAnnouncementById(id);
        if (!item) {
            throw new Error("Announcement not found.");
        }

        const currentStatus = String(item.status || "draft").toLowerCase();
        const nextStatus = payload.status ?? currentStatus;

        const publishAtValue =
            payload.publish_at !== undefined
                ? payload.publish_at
                : (item.publish_at ? toDatetimeLocalValue(item.publish_at) : "");

        const expireAtValue =
            payload.expire_at !== undefined
                ? payload.expire_at
                : (item.expire_at ? toDatetimeLocalValue(item.expire_at) : "");

        if (
            (payload.publish_at !== undefined || payload.expire_at !== undefined || payload.status !== undefined) &&
            !validateAnnouncementFormData({
                publishAt: publishAtValue,
                expireAt: expireAtValue
            })
        ) {
            return;
        }

        const formData = new FormData();

        if (payload.title !== undefined) formData.append("title", payload.title);
        if (payload.body !== undefined) formData.append("body", payload.body);
        if (payload.status !== undefined) formData.append("status", nextStatus);
        if (payload.is_pinned !== undefined) formData.append("is_pinned", String(payload.is_pinned));
        if (payload.publish_at !== undefined && payload.publish_at) formData.append("publish_at", payload.publish_at);
        if (payload.expire_at !== undefined && payload.expire_at) formData.append("expire_at", payload.expire_at);

        const response = await fetch(`${API_URL}/announcements/${id}`, {
            method: "PATCH",
            credentials: "include",
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Patch failed: ${response.status}`);
        }

        showToast(successMessage);
        await fetchAnnouncements();
    } catch (error) {
        console.error("Patch announcement error:", error);
        alert(error.message || "Failed to update announcement.");
    }
}

async function handleFeedActions(event) {
    const editBtn = event.target.closest(".edit-btn");
    const deleteBtn = event.target.closest(".delete-btn");
    const pinBtn = event.target.closest(".pin-btn");
    const statusBtn = event.target.closest(".status-btn");

    if (!editBtn && !deleteBtn && !pinBtn && !statusBtn) return;

    const id = Number(
        editBtn?.dataset.id ||
        deleteBtn?.dataset.id ||
        pinBtn?.dataset.id ||
        statusBtn?.dataset.id ||
        0
    );

    if (!id) {
        alert("Invalid announcement target.");
        return;
    }

    const item = getAnnouncementById(id);
    if (!item) {
        alert("Announcement not found in current list.");
        return;
    }

    if (editBtn) {
        populateEditForm(item);
        return;
    }

    if (deleteBtn) {
        await deleteAnnouncement(id);
        return;
    }

    if (pinBtn) {
        await patchAnnouncement(
            id,
            { is_pinned: !Boolean(item.is_pinned) },
            Boolean(item.is_pinned) ? "Announcement unpinned" : "Announcement pinned"
        );
        return;
    }

    if (statusBtn) {
        const currentStatus = String(item.status || "draft").toLowerCase();
        const nextStatus = currentStatus === "published" ? "draft" : "published";

        await patchAnnouncement(
            id,
            { status: nextStatus },
            nextStatus === "published" ? "Announcement published" : "Announcement unpublished"
        );
    }
}

function bindAnnouncementEvents() {
    document.getElementById("announceForm")?.addEventListener("submit", submitAnnouncementForm);
    document.getElementById("feedBody")?.addEventListener("click", handleFeedActions);

    document.getElementById("annImage")?.addEventListener("change", (event) => {
        const file = event.target.files?.[0] || null;
        selectedImageFile = file;
        previewSelectedImage(file);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeModal();
        }
    });
}

async function initializeAnnouncementsPage() {
    applySavedTheme();
    bindAnnouncementEvents();
    setScheduleMin();
    await fetchAnnouncements();
}

window.toggleTheme = toggleTheme;
window.openModal = openModal;
window.closeModal = closeModal;

window.onload = () => {
    initializeAnnouncementsPage();
};