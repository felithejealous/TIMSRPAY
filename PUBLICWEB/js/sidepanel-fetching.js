function getInitials(name) {
<<<<<<< HEAD
    if (!name) return "--";

    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join("");
}

function splitName(fullName) {
    const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);

    return {
        firstName: parts[0] || "",
        lastName: parts.slice(1).join(" ") || ""
    };
}

function formatPeso(amount) {
    return `₱${Number(amount || 0).toFixed(2)}`;
}

function formatMemberSince(dateString) {
    if (!dateString) return "Member Since --";

    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return "Member Since --";

    return "Member Since " + d.toLocaleString("en-PH", {
        month: "short",
        year: "numeric"
    });
}

function getTierData(points) {
    const safePoints = Number(points) || 0;

    if (safePoints >= 2800) {
        return {
            label: "Gold Member",
            labelUpper: "GOLD MEMBER",
            icon: "fa-crown"
        };
    } else if (safePoints >= 1500) {
        return {
            label: "Silver Member",
            labelUpper: "SILVER MEMBER",
            icon: "fa-star"
        };
    }

    return {
        label: "Bronze Member",
        labelUpper: "BRONZE MEMBER",
        icon: "fa-medal"
    };
}

async function fetchCurrentUser() {
    const { res, data } = await apiGet("/auth/me");

    if (!res.ok) {
        throw new Error(data?.detail || "Failed to fetch current user");
    }

    return data;
}

async function fetchRewardPoints() {
    const { res, data } = await apiGet("/rewards/points");

    if (!res.ok) {
        throw new Error(data?.detail || "Failed to fetch reward points");
    }

    return Number(data.total_points || 0);
}

async function fetchWalletBalance() {
    const { res, data } = await apiGet("/wallet/balance");

    if (!res.ok) {
        throw new Error(data?.detail || "Failed to fetch wallet balance");
    }

    return Number(
        data.balance ??
        data.wallet_balance ??
        data.current_balance ??
        0
    );
}
=======
  if (!name) return "--";

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function splitName(fullName) {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
  };
}

function formatPeso(amount) {
  return `₱${Number(amount || 0).toFixed(2)}`;
}

function formatMemberSince(dateString) {
  if (!dateString) return "Member Since --";

  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "Member Since --";

  return (
    "Member Since " +
    d.toLocaleString("en-PH", {
      month: "short",
      year: "numeric",
    })
  );
}

function getTierData(points) {
  const safePoints = Number(points) || 0;

  if (safePoints >= 2800) {
    return {
      label: "Gold Member",
      labelUpper: "GOLD MEMBER",
      icon: "fa-crown",
    };
  } else if (safePoints >= 1500) {
    return {
      label: "Silver Member",
      labelUpper: "SILVER MEMBER",
      icon: "fa-star",
    };
  }

  return {
    label: "Bronze Member",
    labelUpper: "BRONZE MEMBER",
    icon: "fa-medal",
  };
}

function resolveProfileImage(profilePicture) {
  const value = String(profilePicture || "").trim();
  if (!value) return "";

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/")) {
    return `http://127.0.0.1:8000${value}`;
  }

  return value;
}

function setAvatarDisplay(
  target,
  { fullName = "User", profilePicture = "" } = {},
) {
  if (!target) return;

  const imageUrl = resolveProfileImage(profilePicture);
  const initials = getInitials(fullName);

  target.classList.add("avatar-has-shell");

  if (imageUrl) {
    target.innerHTML = `<img src="${imageUrl}" alt="${fullName}" class="avatar-image">`;
    target.classList.add("has-image");
    target.setAttribute("data-initials", initials);
    return;
  }

  target.innerHTML = `<span class="avatar-text">${initials}</span>`;
  target.classList.remove("has-image");
  target.setAttribute("data-initials", initials);
}

async function fetchCurrentUser() {
  const { res, data } = await apiGet("/auth/me");

  if (!res.ok) {
    throw new Error(data?.detail || "Failed to fetch current user");
  }

  return data;
}

async function fetchRewardPoints() {
  const { res, data } = await apiGet("/rewards/points");

  if (!res.ok) {
    throw new Error(data?.detail || "Failed to fetch reward points");
  }

  return Number(data.total_points || 0);
}

async function fetchWalletBalance() {
  const { res, data } = await apiGet("/wallet/balance");

  if (!res.ok) {
    throw new Error(data?.detail || "Failed to fetch wallet balance");
  }

  return Number(
    data.balance ?? data.wallet_balance ?? data.current_balance ?? 0,
  );
}
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
