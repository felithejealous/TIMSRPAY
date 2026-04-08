console.log("logout.js loaded");

document.addEventListener("DOMContentLoaded", function () {
    const logoutBtn = document.getElementById("logoutBtn");
    console.log("logoutBtn:", logoutBtn);

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async function (e) {
            e.preventDefault();
            console.log("Logout clicked");

            try {
                const response = await fetch(`${API_URL}/auth/logout`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token") || ""}`
                    }
                });

                const data = await response.json().catch(() => ({}));
                console.log("Logout response:", data);
            } catch (error) {
                console.error("Logout error:", error);
            }

            localStorage.removeItem("token");
            localStorage.removeItem("user_id");
            localStorage.removeItem("user_role");
            localStorage.removeItem("teoDmango_Store");
            localStorage.removeItem("theme");
            sessionStorage.clear();

            window.location.href = "../html/login.html";
        });
    }
});