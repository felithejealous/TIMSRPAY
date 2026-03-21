const API_URL = "http://127.0.0.1:8000";

async function checkAuth() {
    try {
        const response = await fetch(`${API_URL}/auth/me`, {
            method: "GET",
            credentials: "include"
        });

        console.log("auth/me status:", response.status);

        const text = await response.text();
        console.log("auth/me raw response:", text);

        if (!response.ok) {
            alert(`auth/me failed: ${response.status}\n${text}`);
            return;
        }

        const data = JSON.parse(text);
        console.log("auth/me data:", data);

        if (data.role !== "admin") {
            alert("Unauthorized role: " + data.role);
            return;
        }

        console.log("Auth check passed");
    } catch (error) {
        console.error("Auth check error:", error);
        alert("Auth check error: " + error.message);
    }
}

checkAuth();