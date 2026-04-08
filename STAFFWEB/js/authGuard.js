const API_BASE_URL = window.API_URL || "http://127.0.0.1:8000";

function isAllowedStaffRole(role) {
    const allowedRoles = ["cashier", "staff"];
    return allowedRoles.includes((role || "").toLowerCase());
}

async function checkStaffAuth() {
    try {
        const response = await fetch(`${window.API_URL}/auth/me`, {
            method: "GET",
            credentials: "include"
        });

        let data = {};
        try {
            data = await response.json();
        } catch (error) {
            data = {};
        }

        if (!response.ok) {
            window.location.href = "loginstaff.html";
            return;
        }

        if (!isAllowedStaffRole(data.role)) {
            alert("Unauthorized access.");
            window.location.href = "loginstaff.html";
            return;
        }

        console.log("Staff auth check passed:", data);

    } catch (error) {
        console.error("Staff auth check error:", error);
        window.location.href = "loginstaff.html";
    }
}

checkStaffAuth();