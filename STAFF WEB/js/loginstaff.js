const API_URL = "http://127.0.0.1:8000";

const staffLoginForm = document.getElementById("staffLoginForm");
const loginBtn = document.getElementById("loginBtn");
const loginMessage = document.getElementById("loginMessage");
const emailInput = document.getElementById("empId");
const passwordInput = document.getElementById("empPass");

function updateClock() {
    const now = new Date();

    const timeElement = document.getElementById("time");
    const dateElement = document.getElementById("date");

    if (timeElement) {
        timeElement.textContent = now.toLocaleTimeString("en-US", {
            hour12: true,
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    if (dateElement) {
        dateElement.textContent = now.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "2-digit",
            year: "numeric"
        });
    }
}

function setLoginMessage(message, type = "") {
    if (!loginMessage) return;

    loginMessage.textContent = message;
    loginMessage.className = "login-message";

    if (type) {
        loginMessage.classList.add(type);
    }
}

function setButtonLoading(isLoading) {
    if (!loginBtn) return;

    if (isLoading) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Authenticating...';
    } else {
        loginBtn.disabled = false;
        loginBtn.innerHTML = 'Verify & Enter <i class="fa-solid fa-arrow-right"></i>';
    }
}

function isAllowedStaffRole(role) {
    const allowedRoles = ["cashier", "staff"];
    return allowedRoles.includes((role || "").toLowerCase());
}

async function loginStaff(email, password) {
    const formData = new URLSearchParams();
    formData.append("email", email);
    formData.append("password", password);

    const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        credentials: "include",
        body: formData
    });

    let data = {};
    try {
        data = await response.json();
    } catch (error) {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data.detail || "Invalid email or password.");
    }

    return data;
}

async function getCurrentUser() {
    const response = await fetch(`${API_URL}/auth/me`, {
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
        throw new Error(data.detail || "Failed to verify login session.");
    }

    return data;
}

async function handleLogin(event) {
    event.preventDefault();

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value.trim() : "";

    if (!email || !password) {
        setLoginMessage("Please enter your email and password.", "error");
        return;
    }

    setLoginMessage("");
    setButtonLoading(true);

    try {
        await loginStaff(email, password);

        const currentUser = await getCurrentUser();

        if (!isAllowedStaffRole(currentUser.role)) {
            throw new Error("This account is not allowed to access the staff portal.");
        }

        setLoginMessage("Login successful. Redirecting...", "success");

        setTimeout(() => {
            window.location.href = "overview.html";
        }, 700);

    } catch (error) {
        console.error("Staff login error:", error);
        setLoginMessage(error.message || "Unable to login right now.", "error");
    } finally {
        setButtonLoading(false);
    }
}

setInterval(updateClock, 1000);
updateClock();

if (staffLoginForm) {
    staffLoginForm.addEventListener("submit", handleLogin);
}