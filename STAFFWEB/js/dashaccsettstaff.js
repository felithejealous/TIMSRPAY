let currentStaffProfile = null;

function getAPIURL() {
    if (!window.API_URL) {
        throw new Error("API_URL is not defined. Make sure authGuard.js loads first.");
    }
    return window.API_URL;
}

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

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        ...options,
        headers: getAuthHeaders(options.headers || {})
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

/* =========================
   HELPERS
========================= */
function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getInitials(name, email) {
    const base = String(name || "").trim();

    if (base) {
        const parts = base.split(/\s+/).filter(Boolean);
        if (parts.length === 1) {
            return parts[0].slice(0, 2).toUpperCase();
        }
        return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
    }

    const fallback = String(email || "").trim();
    return fallback ? fallback.slice(0, 2).toUpperCase() : "--";
}

function prettifyRole(role) {
    const normalized = String(role || "").trim().toLowerCase();

    if (normalized === "cashier") return "Store Cashier";
    if (normalized === "staff") return "Staff";
    if (normalized === "admin") return "Administrator";
    return normalized ? normalized.toUpperCase() : "Unknown";
}

function setAccessBadge(role) {
    const badge = document.getElementById("accessBadge");
    if (!badge) return;

    const normalized = String(role || "").trim().toLowerCase();

    badge.className = "";
    if (normalized === "admin") {
        badge.classList.add("badge-info");
        badge.textContent = "ADMINISTRATOR";
    } else if (normalized === "cashier") {
        badge.classList.add("badge-warning");
        badge.textContent = "RESTRICTED";
    } else {
        badge.classList.add("badge-success");
        badge.textContent = "STAFF";
    }
}

function setAccountStatus(isActive) {
    const badge = document.getElementById("accountStatusBadge");
    if (!badge) return;

    badge.className = "";
    badge.classList.add(isActive ? "badge-success" : "badge-warning");
    badge.textContent = isActive ? "ACTIVE" : "INACTIVE";
}

function setButtonLoading(button, isLoading, defaultHTML, loadingHTML) {
    if (!button) return;

    if (isLoading) {
        button.disabled = true;
        button.innerHTML = loadingHTML;
    } else {
        button.disabled = false;
        button.innerHTML = defaultHTML;
    }
}

function renderAvatar(name, email, profilePicture) {
    const avatarBox = document.getElementById("avatarBox");
    const avatarImage = document.getElementById("avatarImage");

    if (!avatarBox || !avatarImage) return;

    const initials = getInitials(name, email);
    const imageUrl = String(profilePicture || "").trim();

    avatarBox.textContent = initials;

    if (!imageUrl) {
        avatarImage.style.display = "none";
        avatarImage.removeAttribute("src");
        avatarBox.style.display = "grid";
        return;
    }

    avatarImage.onerror = () => {
        avatarImage.style.display = "none";
        avatarImage.removeAttribute("src");
        avatarBox.style.display = "grid";
    };

    avatarImage.onload = () => {
        avatarImage.style.display = "block";
        avatarBox.style.display = "none";
    };

    avatarImage.src = imageUrl;
}

/* =========================
   FETCH PROFILE
========================= */
async function loadStaffProfile() {
    const result = await fetchJSON(`${getAPIURL()}/staff/me`);
    currentStaffProfile = result;

    const fullName = result.full_name || "No Name";
    const email = result.email || "-";
    const role = result.role || "staff";
    const position = result.position || prettifyRole(role);
    const staffCode = result.staff_code || `USER-${result.user_id || ""}`;
    const profilePicture = result.profile_picture || "";

    const profileNameHeading = document.getElementById("profileNameHeading");
    const roleDisplay = document.getElementById("roleDisplay");
    const fullNameInput = document.getElementById("fullNameInput");
    const staffCodeInput = document.getElementById("staffCodeInput");
    const emailInput = document.getElementById("emailInput");
    const profilePictureInput = document.getElementById("profilePictureInput");
    const positionSummary = document.getElementById("positionSummary");
    const summaryEmail = document.getElementById("summaryEmail");

    renderAvatar(fullName, email, profilePicture);

    if (profileNameHeading) profileNameHeading.textContent = fullName;
    if (roleDisplay) roleDisplay.textContent = position.toUpperCase();
    if (fullNameInput) fullNameInput.value = fullName;
    if (staffCodeInput) staffCodeInput.value = staffCode;
    if (emailInput) emailInput.value = email;
    if (profilePictureInput) profilePictureInput.value = profilePicture;
    if (positionSummary) positionSummary.textContent = position;
    if (summaryEmail) summaryEmail.textContent = email;

    setAccessBadge(role);
    setAccountStatus(Boolean(result.is_active));
}

/* =========================
   UPDATE PROFILE
========================= */
async function handleProfileUpdate(event) {
    event.preventDefault();

    const fullNameInput = document.getElementById("fullNameInput");
    const emailInput = document.getElementById("emailInput");
    const profilePictureInput = document.getElementById("profilePictureInput");
    const updateProfileBtn = document.getElementById("updateProfileBtn");

    const fullName = String(fullNameInput?.value || "").trim();
    const email = String(emailInput?.value || "").trim();
    const profilePicture = String(profilePictureInput?.value || "").trim();

    if (!fullName) {
        alert("Full name is required.");
        return;
    }

    if (!email) {
        alert("Email is required.");
        return;
    }

    try {
        setButtonLoading(
            updateProfileBtn,
            true,
            '<i class="fa-solid fa-floppy-disk"></i> Update Profile',
            '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating...'
        );

        const result = await fetchJSON(`${getAPIURL()}/staff/me`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                full_name: fullName,
                email: email,
                profile_picture: profilePicture
            })
        });

        alert(result.message || "Profile updated successfully.");
        await loadStaffProfile();
    } catch (error) {
        console.error("Profile update error:", error);
        alert(error.message || "Failed to update profile.");
    } finally {
        setButtonLoading(
            updateProfileBtn,
            false,
            '<i class="fa-solid fa-floppy-disk"></i> Update Profile',
            '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating...'
        );
    }
}

/* =========================
   CHANGE PASSWORD
========================= */
async function handlePasswordChange(event) {
    event.preventDefault();

    const currentPasswordInput = document.getElementById("currentPasswordInput");
    const newPasswordInput = document.getElementById("newPasswordInput");
    const confirmPasswordInput = document.getElementById("confirmPasswordInput");
    const changePasswordBtn = document.getElementById("changePasswordBtn");

    const currentPassword = String(currentPasswordInput?.value || "").trim();
    const newPassword = String(newPasswordInput?.value || "").trim();
    const confirmPassword = String(confirmPasswordInput?.value || "").trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
        alert("Please complete all password fields.");
        return;
    }

    if (newPassword !== confirmPassword) {
        alert("New password and confirm password do not match.");
        return;
    }

    if (currentPassword === newPassword) {
        alert("New password must be different from current password.");
        return;
    }

    try {
        setButtonLoading(
            changePasswordBtn,
            true,
            '<i class="fa-solid fa-lock"></i> Secure Account',
            '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating Password...'
        );

        const result = await fetchJSON(`${getAPIURL()}/auth/change-password`, {
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

        alert(result.message || "Password updated successfully.");

        if (currentPasswordInput) currentPasswordInput.value = "";
        if (newPasswordInput) newPasswordInput.value = "";
        if (confirmPasswordInput) confirmPasswordInput.value = "";
    } catch (error) {
        console.error("Password change error:", error);
        alert(error.message || "Failed to update password.");
    } finally {
        setButtonLoading(
            changePasswordBtn,
            false,
            '<i class="fa-solid fa-lock"></i> Secure Account',
            '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating Password...'
        );
    }
}

/* =========================
   LIVE PREVIEW
========================= */
function setupProfilePicturePreview() {
    const profilePictureInput = document.getElementById("profilePictureInput");
    const fullNameInput = document.getElementById("fullNameInput");
    const emailInput = document.getElementById("emailInput");

    if (!profilePictureInput) return;

    profilePictureInput.addEventListener("input", () => {
        renderAvatar(
            String(fullNameInput?.value || "").trim(),
            String(emailInput?.value || "").trim(),
            String(profilePictureInput.value || "").trim()
        );
    });

    fullNameInput?.addEventListener("input", () => {
        renderAvatar(
            String(fullNameInput.value || "").trim(),
            String(emailInput?.value || "").trim(),
            String(profilePictureInput.value || "").trim()
        );
    });

    emailInput?.addEventListener("input", () => {
        renderAvatar(
            String(fullNameInput?.value || "").trim(),
            String(emailInput.value || "").trim(),
            String(profilePictureInput.value || "").trim()
        );
    });
}

/* =========================
   BIND
========================= */
function bindEvents() {
    document.getElementById("profileForm")?.addEventListener("submit", handleProfileUpdate);
    document.getElementById("passwordForm")?.addEventListener("submit", handlePasswordChange);
    setupProfilePicturePreview();
}

/* =========================
   INIT
========================= */
async function initStaffSettingsPage() {
    try {
        bindEvents();
        await loadStaffProfile();
    } catch (error) {
        console.error("Staff settings init error:", error);
        alert(error.message || "Failed to load account settings.");
    }
}

document.addEventListener("DOMContentLoaded", initStaffSettingsPage);