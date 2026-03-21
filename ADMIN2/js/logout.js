console.log("logout.js loaded");

// TANGGALIN ang: const API_URL = "http://127.0.0.1:8000";
// Gamitin na lang yung API_URL galing sa authGuard.js

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
                    credentials: "include"
                });
                const data = await response.json();
                console.log("Logout response:", data);
            } catch (error) {
                console.error("Logout error:", error);
            }

            localStorage.removeItem('teoDmango_Store');
            localStorage.removeItem('theme');
            window.location.href = "../html/login.html";
        });
    }
});