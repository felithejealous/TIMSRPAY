const API_URL = window.API_URL || "http://127.0.0.1:8000";

async function checkAuth() {
    try {
        const token = localStorage.getItem("token");

        if (!token) {
            alert("No token found. Please log in again.");
            window.location.href = "login.html";
            return;
        }

        const response = await fetch(`${API_URL}/auth/me`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log("auth/me status:", response.status);

        const text = await response.text();
        console.log("auth/me raw response:", text);

        if (!response.ok) {
            alert(`auth/me failed: ${response.status}\n${text}`);
            localStorage.removeItem("token");
            window.location.href = "login.html";
            return;
        }

        const data = JSON.parse(text);
        console.log("auth/me data:", data);

        if (data.role !== "admin") {
            alert("Unauthorized role: " + data.role);
            localStorage.removeItem("token");
            window.location.href = "login.html";
            return;
        }

        console.log("Auth check passed");
    } catch (error) {
        console.error("Auth check error:", error);
        alert("Auth check error: " + error.message);
    }
}

checkAuth();