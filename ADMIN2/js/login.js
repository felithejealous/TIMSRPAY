const API_URL = "http://127.0.0.1:8000";

document.getElementById("loginForm").addEventListener("submit", async function(e){
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {

        const response = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            credentials: "include",
            body: new URLSearchParams({
                email: email,
                password: password
            })
        });

        const data = await response.json();

        console.log("Response:", data);

        if(!response.ok){
            alert(data.detail || "Login failed");
            return;
        }

        if(data.role === "admin"){
            window.location.href = "../html/dashboard.html";
        } else {
            alert("Not authorized for admin panel");
        }

    } catch(err){
        console.error("Login error:", err);
        alert("Server error");
    }
});