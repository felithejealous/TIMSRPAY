<<<<<<< HEAD
function updateSettingsPageUI({ user, points, walletBalance, tier }) {
    const fullName =
        user.full_name ||
        user.name ||
        user.username ||
        user.email ||
        "User";

    const initials = getInitials(fullName);
    const { firstName, lastName } = splitName(fullName);

    const email = user.email || "";
    const memberSince = formatMemberSince(
        user.created_at ||
        user.date_created ||
        user.registered_at ||
        user.joined_at
    );

    const settingsAvatar = document.getElementById("settingsAvatar");
    const settingsFullName = document.getElementById("settingsFullName");
    const settingsMemberSince = document.getElementById("settingsMemberSince");
    const settingsTierName = document.getElementById("settingsTierName");
    const settingsTierIcon = document.getElementById("settingsTierIcon");
    const settingsPoints = document.getElementById("settingsPoints");
    const settingsFirstName = document.getElementById("settingsFirstName");
    const settingsLastName = document.getElementById("settingsLastName");
    const settingsEmail = document.getElementById("settingsEmail");
    const dangerZoneText = document.getElementById("dangerZoneText");

    if (settingsAvatar) settingsAvatar.textContent = initials;
    if (settingsFullName) settingsFullName.textContent = fullName;
    if (settingsMemberSince) settingsMemberSince.textContent = memberSince;
    if (settingsTierName) settingsTierName.textContent = tier.label;
    if (settingsTierIcon) settingsTierIcon.className = `fa-solid ${tier.icon}`;
    if (settingsPoints) settingsPoints.textContent = points.toLocaleString();
    if (settingsFirstName) settingsFirstName.value = firstName;
    if (settingsLastName) settingsLastName.value = lastName;
    if (settingsEmail) settingsEmail.value = email;

    if (dangerZoneText) {
        dangerZoneText.textContent =
            `Erasing your account will permanently wipe your data and forfeit your ${points.toLocaleString()} points and TIMS-RPAY balance.`;
    }
}

document.querySelectorAll(".toggle-password").forEach(icon => {
    icon.addEventListener("click", () => {

        const input = icon.previousElementSibling;

        if (input.type === "password") {
            input.type = "text";
            icon.classList.remove("fa-eye");
            icon.classList.add("fa-eye-slash");
        } else {
            input.type = "password";
            icon.classList.remove("fa-eye-slash");
            icon.classList.add("fa-eye");
        }

    });
});

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const user = await fetchCurrentUser();
        const points = await fetchRewardPoints();
        const walletBalance = await fetchWalletBalance();
        const tier = getTierData(points);

        updateSettingsPageUI({ user, points, walletBalance, tier });

        updateAccountPanelUI({
            fullName:
                user.full_name ||
                user.name ||
                user.username ||
                user.email ||
                "User",
            tierLabel: tier.labelUpper,
            points,
            walletBalance
        });
    } catch (err) {
        console.error("Failed to initialize settings page", err);
    }
});
=======
function splitNameFallback(fullName = "") {
  const clean = String(fullName || "").trim();
  if (!clean) return { firstName: "", lastName: "" };

  const parts = clean.split(/\s+/);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}
function updateSettingsPageUI({ user, points, walletBalance, tier }) {
  const rawFirstName = typeof user.first_name === "string" ? user.first_name : "";
  const rawLastName = typeof user.last_name === "string" ? user.last_name : "";
  const rawFullName = typeof user.full_name === "string" ? user.full_name.trim() : "";
  const email = user.email || "";

  const displayFullName = rawFullName || [rawFirstName, rawLastName].filter(Boolean).join(" ") || user.display_name || user.email || "User";

  const settingsAvatar = document.getElementById("settingsAvatar");
  const settingsFullName = document.getElementById("settingsFullName");
  const settingsTierName = document.getElementById("settingsTierName");
  const settingsTierIcon = document.getElementById("settingsTierIcon");
  const settingsPoints = document.getElementById("settingsPoints");
  const settingsFirstName = document.getElementById("settingsFirstName");
  const settingsLastName = document.getElementById("settingsLastName");
  const settingsEmail = document.getElementById("settingsEmail");
  const dangerZoneText = document.getElementById("dangerZoneText");

  if (settingsAvatar) {
    setAvatarDisplay(settingsAvatar, {
      fullName: displayFullName,
      profilePicture: user.profile_picture || "",
    });
  }

  if (settingsFullName) settingsFullName.textContent = displayFullName;
  if (settingsTierName) settingsTierName.textContent = tier.label;
  if (settingsTierIcon) settingsTierIcon.className = `fa-solid ${tier.icon}`;
  if (settingsPoints) settingsPoints.textContent = Number(points || 0).toLocaleString();

  if (settingsFirstName) settingsFirstName.value = rawFirstName;
  if (settingsLastName) settingsLastName.value = rawLastName;
  if (settingsEmail) settingsEmail.value = email;

  if (dangerZoneText) {
    dangerZoneText.textContent = "Deleting your account is currently handled through account deactivation. Please visit the nearest Teo D' Mango shop for assistance.";
  }
}

function applySettingsNameSizing(fullName = "") {
  const el = document.getElementById("settingsFullName");
  if (!el) return;

  const clean = String(fullName || "").trim();
  el.textContent = clean || "User";
  el.classList.remove("name-size-sm", "name-size-xs");

  if (clean.length > 18) el.classList.add("name-size-sm");
  if (clean.length > 28) el.classList.add("name-size-xs");
}

async function uploadProfilePicture(file) {
  const formData = new FormData();
  formData.append("file", file);

  const { res, data } = await apiPostForm("/auth/profile-picture", formData);

  if (!res.ok) {
    throw new Error(data?.detail || "Failed to upload profile picture");
  }

  return data;
}

async function removeProfilePicture() {
  const { res, data } = await apiDelete("/auth/profile-picture");

  if (!res.ok) {
    throw new Error(data?.detail || "Failed to remove profile picture");
  }

  return data;
}

async function refreshSettingsAndPanelUI() {
  const user = await fetchCurrentUser();
  const points = await fetchRewardPoints();
  const walletBalance = await fetchWalletBalance();
  const tier = getTierData(points);

  updateSettingsPageUI({ user, points, walletBalance, tier });

  updateAccountPanelUI({
    fullName: user.full_name || user.display_name || user.email || "User",
    tierLabel: tier.labelUpper,
    points,
    walletBalance,
    profilePicture: user.profile_picture || "",
  });
}

function bindPasswordToggles() {
  document.querySelectorAll(".toggle-password").forEach((icon) => {
    icon.addEventListener("click", () => {
      const input = icon.previousElementSibling;
      if (!input) return;

      if (input.type === "password") {
        input.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
      } else {
        input.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
      }
    });
  });
}
async function apiPostForm(path, formData, extraHeaders = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
            ...getAuthHeaders(extraHeaders)
        },
        body: formData
    });

    let data = null;
    const text = await res.text();
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = { detail: text || "Unexpected server response" };
    }

    return { res, data };
}
async function apiDelete(path, extraHeaders = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        method: "DELETE",
        headers: getAuthHeaders(extraHeaders)
    });

    let data = null;
    const text = await res.text();
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = { detail: text || "Unexpected server response" };
    }

    return { res, data };
}
async function saveProfileAndPassword() {
  const firstName = (document.getElementById("settingsFirstName")?.value || "").trim();
  const lastName = (document.getElementById("settingsLastName")?.value || "").trim();
  const currentPassword = (document.getElementById("settingsCurrentPassword")?.value || "").trim();
  const newPassword = (document.getElementById("settingsNewPassword")?.value || "").trim();

  try {
    if (!firstName) {
      alert("First name is required.");
      return;
    }

    const profileRes = await apiPut("/auth/profile", {
      first_name: firstName,
      last_name: lastName,
    });

    if (!profileRes.res.ok) {
      throw new Error(profileRes.data?.detail || "Failed to update profile");
    }

    if (currentPassword || newPassword) {
      if (!currentPassword || !newPassword) {
        alert("To change password, fill in both current and new password.");
        return;
      }

      const passRes = await apiPost("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: newPassword,
      });

      if (!passRes.res.ok) {
        throw new Error(passRes.data?.detail || "Failed to change password");
      }
    }

    const currentPasswordEl = document.getElementById("settingsCurrentPassword");
    const newPasswordEl = document.getElementById("settingsNewPassword");

    if (currentPasswordEl) currentPasswordEl.value = "";
    if (newPasswordEl) newPasswordEl.value = "";

    const user = await fetchCurrentUser();
    const points = await fetchRewardPoints();
    const walletBalance = await fetchWalletBalance();
    const tier = getTierData(points);

    updateSettingsPageUI({ user, points, walletBalance, tier });

    updateAccountPanelUI({
      fullName: user.full_name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.display_name || user.email || "User",
      tierLabel: tier.labelUpper,
      points,
      walletBalance,
      profilePicture: user.profile_picture || "",
    });

    alert("Profile updated successfully.");
  } catch (err) {
    console.error("Save settings error:", err);
    alert(err.message || "Failed to save changes.");
  }
}

function handleDeleteAccount() {
  alert(
    "Account deletion is currently handled as account deactivation. Please visit the nearest Teo D' Mango shop for assistance.",
  );
}
function bindProfilePhotoActions() {
  const uploadInput = document.getElementById("settingsProfileUpload");
  const changeBtn = document.getElementById("changeProfilePhotoBtn");
  const removeBtn = document.getElementById("removeProfilePhotoBtn");

  if (changeBtn && uploadInput) {
    changeBtn.addEventListener("click", () => {
      uploadInput.click();
    });
  }

  if (uploadInput) {
    uploadInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
      if (!allowed.includes(file.type)) {
        alert("Only JPG, PNG, and WEBP images are allowed.");
        uploadInput.value = "";
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert("Image must be 5MB or smaller.");
        uploadInput.value = "";
        return;
      }

      try {
        await uploadProfilePicture(file);
        await refreshSettingsAndPanelUI();
        alert("Profile picture updated successfully.");
      } catch (err) {
        console.error("Upload profile picture error:", err);
        alert(err.message || "Failed to upload profile picture.");
      } finally {
        uploadInput.value = "";
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", async () => {
      const sure = confirm("Remove your current profile picture?");
      if (!sure) return;

      try {
        await removeProfilePicture();
        await refreshSettingsAndPanelUI();
        alert("Profile picture removed successfully.");
      } catch (err) {
        console.error("Remove profile picture error:", err);
        alert(err.message || "Failed to remove profile picture.");
      }
    });
  }
}
document.addEventListener("DOMContentLoaded", async () => {
  try {
    bindPasswordToggles();
    bindProfilePhotoActions();

    const user = await fetchCurrentUser();
    const points = await fetchRewardPoints();
    const walletBalance = await fetchWalletBalance();
    const tier = getTierData(points);

    updateSettingsPageUI({ user, points, walletBalance, tier });

    updateAccountPanelUI({
      fullName: user.full_name || user.display_name || user.email || "User",
      tierLabel: tier.labelUpper,
      points,
      walletBalance,
      profilePicture: user.profile_picture || "",
    });

    const settingsForm = document.getElementById("settingsForm");
    if (settingsForm) {
      settingsForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await saveProfileAndPassword();
      });
    }

    const deleteBtn = document.querySelector(".btn-danger");
    if (deleteBtn) {
      deleteBtn.onclick = handleDeleteAccount;
    }
  } catch (err) {
    console.error("Failed to initialize settings page", err);
  }
});
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
