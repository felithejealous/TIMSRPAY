function getInitials(name) {
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