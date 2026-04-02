let usersCache = [];
let staffCache = [];
let staffMap = {};
let currentViewingUserId = null;
let currentRoleFilter = "all";
let uploadedProfileImage = null;

function escapeXml(unsafe) {
    return String(unsafe || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
function formatMoney(value) {
    const num = Number(value || 0);
    return `₱${num.toFixed(2)}`;
}

function maskWalletCode(code) {
    const raw = String(code || "").trim();
    if (!raw) return "-";
    if (raw.length <= 2) return raw;
    return `${raw.slice(0, 2)}****`;
}

function buildInitialAvatar(name) {
    const safeName = (name || "U").trim();
    const initial = escapeXml(safeName.charAt(0).toUpperCase() || "U");

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
            <rect width="100%" height="100%" rx="100" ry="100" fill="#fcdb05"/>
            <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
                font-family="Arial, sans-serif" font-size="88" font-weight="700" fill="#120f0a">
                ${initial}
            </text>
        </svg>
    `.trim();

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function fetchUsers() {
    try {
        const response = await fetch(`${API_URL}/users?limit=500&include_balances=true`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`Users fetch failed: ${response.status}`);
        }

        const result = await response.json();
        usersCache = result.data || [];
    } catch (error) {
        console.error("Users fetch error:", error);
        usersCache = [];
    }
}

async function fetchStaffProfiles() {
    try {
        const response = await fetch(`${API_URL}/staff`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`Staff fetch failed: ${response.status}`);
        }

        const result = await response.json();
        staffCache = result.data || [];

        staffMap = {};
        staffCache.forEach(staff => {
            staffMap[Number(staff.user_id)] = staff;
        });
    } catch (error) {
        console.error("Staff fetch error:", error);
        staffCache = [];
        staffMap = {};
    }
}

function getRoleBadgeClass(roleName) {
    const role = (roleName || "").toLowerCase();

    if (role === "admin") return "role-admin";
    if (role === "cashier" || role === "staff") return "role-staff";
    return "role-kiosk";
}

function getRoleLabel(roleName) {
    const role = (roleName || "").toLowerCase();

    if (role === "admin") return "Admin";
    if (role === "cashier") return "Cashier";
    if (role === "staff") return "Staff";
    return "Customer";
}

function getDisplayName(user) {
    if (user?.full_name) return user.full_name;

    const matchedStaff = staffMap[Number(user.user_id)];
    if (matchedStaff?.full_name) return matchedStaff.full_name;

    if (user?.email) return user.email;
    return `User #${user.user_id}`;
}

function getUsernameFromEmail(email) {
    if (!email) return "no_username";
    return email.split("@")[0];
}

function getProfileImage(user) {
    if (user?.profile_picture) return user.profile_picture;
    return buildInitialAvatar(getDisplayName(user));
}

function canOpenAttendance(user) {
    const role = String(user?.role_name || "").toLowerCase();
    return role === "staff" || role === "cashier";
}

function goToAttendanceProfile() {
    if (!currentViewingUserId) return;
    window.location.href = `attendance.html?staff_id=${encodeURIComponent(currentViewingUserId)}`;
}

function getFilteredUsers() {
    const statusFilter = document.getElementById("statusFilter")?.value || "all";
    const searchValue = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();

    return usersCache.filter(user => {
        const role = (user.role_name || "").toLowerCase();
        const roleMatch = currentRoleFilter === "all" || role === currentRoleFilter;
        const isActive = Boolean(user.is_active);

        let statusMatch = true;
        if (statusFilter === "active") {
            statusMatch = isActive;
        } else if (statusFilter === "inactive") {
            statusMatch = !isActive;
        }

        if (!roleMatch || !statusMatch) return false;

        if (!searchValue) return true;

        const displayName = getDisplayName(user).toLowerCase();
        const username = getUsernameFromEmail(user.email).toLowerCase();
        const email = (user.email || "").toLowerCase();
        const userId = String(user.user_id || "").toLowerCase();
        const walletCode = String(user.wallet_code || "").toLowerCase();

        return (
            displayName.includes(searchValue) ||
            username.includes(searchValue) ||
            email.includes(searchValue) ||
            userId.includes(searchValue) ||
            walletCode.includes(searchValue)
        );
    });
}

function setRoleFilter(role) {
    currentRoleFilter = (role || "all").toLowerCase();

    document.querySelectorAll(".filter-btn").forEach(btn => {
        const btnRole = (btn.dataset.role || "").toLowerCase();
        btn.classList.toggle("active", btnRole === currentRoleFilter);
    });

    renderGrid();
    updateCounts();
}

function renderGrid() {
    const grid = document.getElementById("staffGrid");
    if (!grid) return;

    grid.innerHTML = "";

    const filteredUsers = getFilteredUsers();

    filteredUsers.forEach(user => {
        const roleName = getRoleLabel(user.role_name);
        const roleClass = getRoleBadgeClass(user.role_name);
        const displayName = getDisplayName(user);
        const inactive = !Boolean(user.is_active);

        const card = document.createElement("div");
        card.className = `staff-card glass ${inactive ? "inactive" : ""}`;
        card.onclick = () => viewProfile(user.user_id);

        card.innerHTML = `
            <img src="${getProfileImage(user)}" class="staff-img">
            <h3 class="font-black text-lg">${displayName}</h3>
            <p class="text-[10px] opacity-40 font-bold -mt-1 mb-2">#${user.user_id}</p>
            <span class="role-badge ${roleClass}">${roleName}</span>
            <div class="text-[10px] font-bold opacity-60 mt-2 flex items-center justify-center gap-2">
                <span class="w-2 h-2 rounded-full ${inactive ? 'bg-red-500' : 'bg-yellow-400 shadow-[0_0_8px_#fcdb05]'}"></span>
                ${inactive ? "INACTIVE" : "ACTIVE"}
            </div>
        `;

        grid.appendChild(card);
    });
}

function updateCounts() {
    const filteredUsers = getFilteredUsers();
    const total = filteredUsers.length;
    const active = filteredUsers.filter(u => Boolean(u.is_active)).length;

    document.getElementById("totalCount").innerText = total;
    document.getElementById("activeCount").innerText = active;
    document.getElementById("checkedInCount").innerText = 0;
}

function searchCards() {
    renderGrid();
    updateCounts();
}

function resetAccountForm() {
    const form = document.getElementById("accountForm");
    if (form) form.reset();

    uploadedProfileImage = null;

    document.getElementById("editCardId").value = "";
    document.getElementById("officialId").value = "Auto-generated";
    document.getElementById("modalTitle").innerText = "Create Profile";
    document.getElementById("profilePreview").src = buildInitialAvatar("U");
    document.getElementById("role").value = "Customer";
    updateIdLabel();
}

function openModal(id, preserveForm = false) {
    if (id === "formModal" && !preserveForm) {
        resetAccountForm();
    }
    document.getElementById(id).classList.add("open");
}

function closeModal(id) {
    document.getElementById(id).classList.remove("open");
}

function viewProfile(userId) {
    currentViewingUserId = userId;

    const user = usersCache.find(u => Number(u.user_id) === Number(userId));
    if (!user) return;

    const matchedStaff = staffMap[Number(user.user_id)];
    const displayName = getDisplayName(user);
    const roleLabel = getRoleLabel(user.role_name);
    const roleClass = getRoleBadgeClass(user.role_name);
    const username = getUsernameFromEmail(user.email);

    document.getElementById("viewProfileImg").src = getProfileImage(user);
    document.getElementById("viewProfileName").innerText = displayName;
    document.getElementById("viewProfileId").innerText = `ID: ${user.user_id}`;
    document.getElementById("viewProfileUsername").innerText = `@${username}`;

    const roleBadge = document.getElementById("viewProfileRole");
    roleBadge.innerText = roleLabel;
    roleBadge.className = `role-badge ${roleClass}`;

    const records = document.getElementById("viewProfileRecords");
    records.innerHTML = `
    <div class="bg-white/5 p-4 rounded-xl flex justify-between items-center">
        <span class="font-bold text-sm">Email</span>
        <span class="text-[11px] opacity-80">${user.email || "-"}</span>
    </div>
    <div class="bg-white/5 p-4 rounded-xl flex justify-between items-center">
        <span class="font-bold text-sm">Status</span>
        <span class="text-[10px] ${user.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} px-3 py-1 rounded-full font-black">
            ${user.is_active ? "ACTIVE" : "INACTIVE"}
        </span>
    </div>
    <div class="bg-white/5 p-4 rounded-xl flex justify-between items-center">
        <span class="font-bold text-sm">Role</span>
        <span class="text-[11px] opacity-80">${roleLabel}</span>
    </div>
    <div class="bg-white/5 p-4 rounded-xl flex justify-between items-center">
        <span class="font-bold text-sm">Created</span>
        <span class="text-[11px] opacity-80">${user.created_at || "-"}</span>
    </div>
    <div class="bg-white/5 p-4 rounded-xl flex justify-between items-center">
        <span class="font-bold text-sm">Position</span>
        <span class="text-[11px] opacity-80">${matchedStaff?.position || "-"}</span>
    </div>
    <div class="bg-white/5 p-4 rounded-xl flex justify-between items-center">
        <span class="font-bold text-sm">Wallet Code</span>
        <span class="text-[11px] opacity-80">${maskWalletCode(user.wallet_code)}</span>
    </div>
    <div class="bg-white/5 p-4 rounded-xl flex justify-between items-center">
        <span class="font-bold text-sm">Wallet Balance</span>
        <span class="text-[11px] opacity-80">${formatMoney(user.wallet_balance || 0)}</span>
    </div>
    <div class="bg-white/5 p-4 rounded-xl flex justify-between items-center">
        <span class="font-bold text-sm">Wallet Access</span>
        <span class="text-[11px] text-yellow-400 font-bold">Use Wallets module for top-up</span>
    </div>
`;

    const toggleInBtn = document.getElementById("toggleInBtn");
    if (canOpenAttendance(user)) {
        toggleInBtn.innerHTML = `<i class="fas fa-user-clock mr-2"></i>Attendance Logs`;
        toggleInBtn.className = "btn-toggle bg-yellow-400 text-black py-3 rounded-xl font-black text-[10px] uppercase hover:scale-[1.02]";
        toggleInBtn.disabled = false;
        toggleInBtn.onclick = goToAttendanceProfile;
        toggleInBtn.style.display = "block";
    } else {
        toggleInBtn.style.display = "none";
        toggleInBtn.disabled = true;
        toggleInBtn.onclick = null;
    }

    const toggleActiveBtn = document.getElementById("toggleActiveBtn");
    toggleActiveBtn.innerText = user.is_active ? "Deactivate Profile" : "Reactivate Profile";
    toggleActiveBtn.className = user.is_active
        ? "btn-toggle bg-red-500/10 text-red-500 py-3 rounded-xl font-bold text-[10px] uppercase hover:bg-red-500/20"
        : "btn-toggle bg-green-500/20 text-green-400 py-3 rounded-xl font-bold text-[10px] uppercase hover:bg-green-500/30";
    toggleActiveBtn.disabled = false;

    openModal("profileModal");
}

async function toggleStatus() {
    if (!currentViewingUserId) return;

    const user = usersCache.find(u => Number(u.user_id) === Number(currentViewingUserId));
    if (!user) return;

    try {
        const response = await fetch(`${API_URL}/users/${currentViewingUserId}/active`, {
            method: "PATCH",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                is_active: !Boolean(user.is_active)
            })
        });

        if (!response.ok) {
            throw new Error(`Toggle active failed: ${response.status}`);
        }

        user.is_active = !Boolean(user.is_active);

        renderGrid();
        updateCounts();
        viewProfile(currentViewingUserId);
        showToast(`Profile ${user.is_active ? "activated" : "deactivated"}`);
    } catch (error) {
        console.error("Toggle active error:", error);
        alert("Failed to update profile status.");
    }
}

function previewImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        uploadedProfileImage = reader.result;
        document.getElementById("profilePreview").src = reader.result;
    };
    reader.readAsDataURL(file);
}

function updateIdLabel() {
    const role = document.getElementById("role").value;
    document.getElementById("idLabel").innerText = role === "Customer" ? "Customer ID" : "Employee ID";
}

function updatePreviewFromName() {
    if (uploadedProfileImage) return;

    const fullName = document.getElementById("fullName")?.value || "U";
    document.getElementById("profilePreview").src = buildInitialAvatar(fullName);
}
function showToast(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
}

function confirmReset() {
    if (!currentViewingUserId) return;

    const user = usersCache.find(u => Number(u.user_id) === Number(currentViewingUserId));
    if (!user) return;

    const role = (user.role_name || "").toLowerCase();

    if (!["admin", "cashier", "staff"].includes(role)) {
        alert("Reset password is only available for admin, staff, or cashier.");
        return;
    }

    openModal("confirmModal");
}

async function processReset() {
    if (!currentViewingUserId) return;

    try {
        const response = await fetch(`${API_URL}/staff/${currentViewingUserId}/reset-password`, {
            method: "POST",
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Reset password failed: ${response.status}`);
        }

        closeModal("confirmModal");

        const tempPassword = result.temporary_password || "";
        showToast("Password reset successful");

        setTimeout(() => {
            alert(`Temporary password for ${result.email}:\n\n${tempPassword}`);
        }, 300);

    } catch (error) {
        console.error("Reset password error:", error);
        alert(error.message || "Failed to reset password.");
    }
}

function editAccountFromProfile() {
    if (!currentViewingUserId) return;

    const user = usersCache.find(u => Number(u.user_id) === Number(currentViewingUserId));
    if (!user) return;

    closeModal("profileModal");

    const displayName = getDisplayName(user);
    const username = getUsernameFromEmail(user.email);
    const roleLabel = getRoleLabel(user.role_name);

    document.getElementById("modalTitle").innerText = "Edit Profile";
    document.getElementById("editCardId").value = user.user_id;
    document.getElementById("officialId").value = user.user_id;
    document.getElementById("fullName").value = displayName === user.email ? "" : displayName;
    document.getElementById("userName").value = username;
    document.getElementById("email").value = user.email || "";
    document.getElementById("profilePreview").src = getProfileImage(user);
    uploadedProfileImage = null;

    if (roleLabel === "Admin") {
        document.getElementById("role").value = "Admin";
    } else if (roleLabel === "Cashier") {
        document.getElementById("role").value = "Cashier";
    } else if (roleLabel === "Staff") {
        document.getElementById("role").value = "Staff";
    } else {
        document.getElementById("role").value = "Customer";
    }

    updateIdLabel();
    openModal("formModal", true);
}

async function submitAccountForm(event) {
    event.preventDefault();

    const editId = document.getElementById("editCardId").value;
    const roleValue = document.getElementById("role").value;
    const fullName = document.getElementById("fullName").value.trim();
    const userName = document.getElementById("userName").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();

    if (!fullName || !email) {
        alert("Full name and email are required.");
        return;
    }

    const role = roleValue.toLowerCase();
    const isEditMode = Boolean(editId);
    const generatedPassword = `${userName || "user"}@123`;

    try {
        let response;

        if (isEditMode) {
            if (role === "customer") {
                response = await fetch(`${API_URL}/users/customers/${editId}`, {
                    method: "PATCH",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        full_name: fullName,
                        profile_picture: uploadedProfileImage
                    })
                });
            } else {
                response = await fetch(`${API_URL}/staff/${editId}`, {
                    method: "PATCH",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        full_name: fullName,
                        role,
                        position: roleValue,
                        profile_picture: uploadedProfileImage
                    })
                });
            }
        } else {
            if (role === "customer") {
                response = await fetch(`${API_URL}/users/customers`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        email,
                        full_name: fullName,
                        password: generatedPassword,
                        is_active: true,
                        profile_picture: null
                    })
                });
            } else {
                response = await fetch(`${API_URL}/staff/register`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        email,
                        full_name: fullName,
                        password: generatedPassword,
                        role,
                        position: roleValue,
                        is_active: true,
                        profile_picture: uploadedProfileImage
                    })
                });
            }
        }

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `${isEditMode ? "Edit" : "Create"} profile failed: ${response.status}`);
        }

        closeModal("formModal");
        await Promise.all([fetchUsers(), fetchStaffProfiles()]);
        renderGrid();
        updateCounts();

        if (isEditMode) {
            showToast("Profile updated successfully");
        } else {
            const tempPassword = result.temporary_password || generatedPassword;
            showToast(`Profile created. Temp password: ${tempPassword}`);
        }
    } catch (error) {
        console.error("Submit profile error:", error);
        alert(error.message || "Failed to save profile.");
    }
}

async function initializeAccountsPage() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
        document.body.classList.add("light-theme");
        document.getElementById("themeIcon").className = "fa-solid fa-moon";
    }

    document.getElementById("accountForm")?.addEventListener("submit", submitAccountForm);
    document.getElementById("fullName")?.addEventListener("input", updatePreviewFromName);

    await Promise.all([fetchUsers(), fetchStaffProfiles()]);
    renderGrid();
    updateCounts();
}

window.searchCards = searchCards;
window.openModal = openModal;
window.closeModal = closeModal;
window.viewProfile = viewProfile;
window.toggleStatus = toggleStatus;
window.previewImage = previewImage;
window.updateIdLabel = updateIdLabel;
window.confirmReset = confirmReset;
window.processReset = processReset;
window.editAccountFromProfile = editAccountFromProfile;
window.setRoleFilter = setRoleFilter;
window.goToAttendanceProfile = goToAttendanceProfile;

window.onload = () => {
    initializeAccountsPage();
};