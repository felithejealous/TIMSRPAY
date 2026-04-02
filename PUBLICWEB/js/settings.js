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