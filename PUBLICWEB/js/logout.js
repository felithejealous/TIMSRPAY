document.addEventListener("DOMContentLoaded", function () {
    const logoutButtons = document.querySelectorAll(".btn-logout, .acc-link-btn.danger");

    logoutButtons.forEach(btn => {
        btn.addEventListener("click", async function (e) {
            e.preventDefault();

            try {
                await fetch(`${API_URL}/auth/logout`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token") || ""}`
                    }
                });
            } catch (error) {
                console.error("Logout error:", error);
            }

            clearCustomerSession();
            window.location.href = "login.html";
        });
    });
});