console.log("logoutstaff.js loaded");

document.addEventListener("DOMContentLoaded", function () {

    const logoutLinks = document.querySelectorAll(".logout-link");

    if (!logoutLinks.length) return;

    logoutLinks.forEach(link => {
        link.addEventListener("click", async function (e) {
            e.preventDefault();

            try {
                await fetch(`${API_URL}/auth/logout`, {
                    method: "POST",
                    credentials: "include"
                });
            } catch (error) {
                console.error("Logout error:", error);
            }

            // clear staff session
            localStorage.removeItem("staffUser");

            // redirect to staff login
            window.location.href = "loginstaff.html";
        });
    });

});