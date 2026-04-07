function openAccountPanel() {
<<<<<<< HEAD
    const overlay = document.getElementById("mainOverlay");
    const panel = document.getElementById("accountPanel");

    if (overlay) overlay.classList.add("active");
    if (panel) panel.classList.add("active");

    document.body.style.overflow = "hidden";
}

function closeAllPanels() {
    const overlay = document.getElementById("mainOverlay");
    const panel = document.getElementById("accountPanel");

    if (overlay) overlay.classList.remove("active");
    if (panel) panel.classList.remove("active");

    document.body.style.overflow = "auto";
}

function updateAccountPanelUI({ fullName, tierLabel, points, walletBalance }) {
    const initials = getInitials(fullName);

    const panelAvatar = document.getElementById("panelUserInitials") || document.getElementById("panelAvatar");
    const panelName = document.getElementById("panelUserName") || document.getElementById("panelFullName");
    const panelTier = document.getElementById("panelUserTier") || document.getElementById("panelTier");
    const panelPoints = document.getElementById("panelRewardPoints") || document.getElementById("panelPoints");
    const panelWallet = document.getElementById("panelWalletBalance") || document.getElementById("panelWallet");

    if (panelAvatar) panelAvatar.textContent = initials;
    if (panelName) panelName.textContent = fullName || "User";
    if (panelTier) panelTier.textContent = tierLabel || "Member";
    if (panelPoints) panelPoints.textContent = Number(points || 0).toLocaleString();
    if (panelWallet) panelWallet.textContent = formatPeso(walletBalance || 0);
}

async function loadSharedAccountPanel() {
    try {
        const user = await fetchCurrentUser();
        const points = await fetchRewardPoints();
        const walletBalance = await fetchWalletBalance();

        const fullName =
            user.full_name ||
            user.name ||
            user.username ||
            user.email ||
            "User";

        const tier = getTierData(points);

        updateAccountPanelUI({
            fullName,
            tierLabel: tier.labelUpper,
            points,
            walletBalance
        });

        return { user, points, walletBalance, tier };
    } catch (err) {
        console.error("Failed to load account panel", err);
        return null;
    }
}
=======
  const overlay = document.getElementById("mainOverlay");
  const panel = document.getElementById("accountPanel");

  if (overlay) overlay.classList.add("active");
  if (panel) panel.classList.add("active");

  document.body.style.overflow = "hidden";
}

function closeAllPanels() {
  const overlay = document.getElementById("mainOverlay");
  const panel = document.getElementById("accountPanel");

  if (overlay) overlay.classList.remove("active");
  if (panel) panel.classList.remove("active");

  document.body.style.overflow = "auto";
}

function updateAccountPanelUI({
  fullName,
  tierLabel,
  points,
  walletBalance,
  profilePicture = "",
}) {
  const panelAvatar =
    document.getElementById("panelUserInitials") ||
    document.getElementById("panelAvatar");
  const panelName =
    document.getElementById("panelUserName") ||
    document.getElementById("panelFullName");
  const panelTier =
    document.getElementById("panelUserTier") ||
    document.getElementById("panelTier");
  const panelPoints =
    document.getElementById("panelRewardPoints") ||
    document.getElementById("panelPoints");
  const panelWallet =
    document.getElementById("panelWalletBalance") ||
    document.getElementById("panelWallet");

  if (panelAvatar) {
    setAvatarDisplay(panelAvatar, {
      fullName: fullName || "User",
      profilePicture,
    });
  }

  if (panelName) panelName.textContent = fullName || "User";
  if (panelTier) panelTier.textContent = tierLabel || "Member";
  if (panelPoints)
    panelPoints.textContent = Number(points || 0).toLocaleString();
  if (panelWallet) panelWallet.textContent = formatPeso(walletBalance || 0);
}

async function loadSharedAccountPanel() {
  try {
    const user = await fetchCurrentUser();
    const points = await fetchRewardPoints();
    const walletBalance = await fetchWalletBalance();

    const fullName =
      user.full_name || user.name || user.username || user.email || "User";

    const tier = getTierData(points);

    updateAccountPanelUI({
      fullName,
      tierLabel: tier.labelUpper,
      points,
      walletBalance,
      profilePicture: user.profile_picture || "",
    });

    return { user, points, walletBalance, tier };
  } catch (err) {
    console.error("Failed to load account panel", err);
    return null;
  }
}
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
