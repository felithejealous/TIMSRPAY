
function isAllowedStaffRole(role) {
    const allowedRoles = ["cashier", "staff"];
    return allowedRoles.includes((role || "").toLowerCase());
}

function clearStaffSession() {
    localStorage.removeItem("token");
    localStorage.removeItem("staff_user_id");
    localStorage.removeItem("staff_user_email");
    localStorage.removeItem("staff_user_role");
}

async function checkStaffAuth() {
    try {
        const token = localStorage.getItem("token");

        if (!token) {
            window.location.href = "loginstaff.html";
            return;
        }

        const response = await fetch(`${window.API_URL}/auth/me`, {
            method: "GET",
            credentials: "include",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        let data = {};
        try {
            data = await response.json();
        } catch (error) {
            data = {};
        }

        if (!response.ok) {
            clearStaffSession();
            window.location.href = "loginstaff.html";
            return;
        }

        if (!isAllowedStaffRole(data.role)) {
            clearStaffSession();
            alert("Unauthorized access.");
            window.location.href = "loginstaff.html";
            return;
        }

        console.log("Staff auth check passed:", data);

    } catch (error) {
        console.error("Staff auth check error:", error);
        clearStaffSession();
        window.location.href = "loginstaff.html";
    }
}

checkStaffAuth();