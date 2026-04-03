const RESET_CODE_COOLDOWN_SECONDS = 60;
let cooldownInterval = null;

function toggleTheme() {
    const body = document.body;
    const isDark = body.getAttribute("data-theme") === "dark";
    body.setAttribute("data-theme", isDark ? "light" : "dark");
}

function show(id) {
    document.querySelectorAll(".auth-view").forEach(view => view.classList.remove("active"));
    const target = document.getElementById(id);
    if (target) target.classList.add("active");

    const loginError = document.getElementById("loginError");
    if (loginError) loginError.textContent = "";

    if (id === "forgot") {
        restoreSendCodeCooldown();
    }
}

function getCooldownElements() {
    return {
        button: document.getElementById("sendCodeBtn"),
        text: document.getElementById("cooldownText")
    };
}

function setSendCodeCooldown(seconds) {
    const expiresAt = Date.now() + seconds * 1000;
    localStorage.setItem("forgotResetCooldownUntil", String(expiresAt));
    restoreSendCodeCooldown();
}

function clearSendCodeCooldown() {
    localStorage.removeItem("forgotResetCooldownUntil");

    if (cooldownInterval) {
        clearInterval(cooldownInterval);
        cooldownInterval = null;
    }

    const { button, text } = getCooldownElements();
    if (button) {
        button.disabled = false;
        button.textContent = "Send Reset Code";
        button.style.opacity = "1";
        button.style.cursor = "pointer";
    }
    if (text) {
        text.textContent = "";
    }
}

function restoreSendCodeCooldown() {
    const { button, text } = getCooldownElements();
    const stored = localStorage.getItem("forgotResetCooldownUntil");

    if (!button || !text) return;

    if (!stored) {
        clearSendCodeCooldown();
        return;
    }

    const expiresAt = Number(stored);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        clearSendCodeCooldown();
        return;
    }

    if (cooldownInterval) {
        clearInterval(cooldownInterval);
        cooldownInterval = null;
    }

    const tick = () => {
        const remainingMs = expiresAt - Date.now();
        const remainingSeconds = Math.ceil(remainingMs / 1000);

        if (remainingSeconds <= 0) {
            clearSendCodeCooldown();
            return;
        }

        button.disabled = true;
        button.textContent = `Resend in ${remainingSeconds}s`;
        button.style.opacity = "0.7";
        button.style.cursor = "not-allowed";
        text.textContent = `You can request another reset code in ${remainingSeconds} second(s).`;
    };

    tick();
    cooldownInterval = setInterval(tick, 1000);
}

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();
    const errorBox = document.getElementById("loginError");

    if (errorBox) errorBox.textContent = "";

    if (!email || !password) {
        if (errorBox) errorBox.textContent = "Please enter your email and password.";
        return;
    }

    try {
        const formData = new URLSearchParams();
        formData.append("email", email);
        formData.append("password", password);

        const response = await fetch("http://127.0.0.1:8000/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: formData,
            credentials: "include"
        });

        const data = await response.json();
        console.log("LOGIN RESPONSE:", data);

        if (!response.ok) {
            if (errorBox) {
                errorBox.textContent = data.detail || "Invalid email or password.";
            }
            return;
        }

        if ((data.role || "").toLowerCase() !== "customer") {
            if (errorBox) {
                errorBox.textContent = "This portal is for customer accounts only.";
            }

            try {
                await fetch("http://127.0.0.1:8000/auth/logout", {
                    method: "POST",
                    credentials: "include"
                });
            } catch (logoutError) {
                console.error("Forced logout error:", logoutError);
            }

            localStorage.removeItem("token");
            localStorage.removeItem("user_id");
            localStorage.removeItem("user_email");
            localStorage.removeItem("user_role");
            return;
        }

        if (data.access_token) {
            localStorage.setItem("token", data.access_token);
        }

        localStorage.setItem("user_id", data.user_id || "");
        localStorage.setItem("user_email", data.email || "");
        localStorage.setItem("user_role", data.role || "");

        window.location.href = "welcome.html";
    } catch (error) {
        console.error("Login error:", error);
        if (errorBox) errorBox.textContent = "Something went wrong while connecting to the server.";
    }
}
async function handleRegister(e) {
    e.preventDefault();

    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value.trim();

    if (!name || !email || !password) {
        alert("Please fill out all fields.");
        return;
    }

    try {
        const response = await fetch(
            `http://127.0.0.1:8000/auth/register?full_name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
            {
                method: "POST"
            }
        );

        const data = await response.json();
        console.log("REGISTER RESPONSE:", data);

        if (!response.ok) {
            alert(data.detail || "Registration failed.");
            return;
        }

        alert(data.message || "Account created successfully!");

        document.getElementById("registerName").value = "";
        document.getElementById("registerEmail").value = "";
        document.getElementById("registerPassword").value = "";

        const strengthBar = document.getElementById("strengthBar");
        const strengthText = document.getElementById("strengthText");
        if (strengthBar) {
            strengthBar.style.width = "0%";
            strengthBar.style.background = "transparent";
        }
        if (strengthText) {
            strengthText.textContent = "";
        }

        show("login");
    } catch (error) {
        console.error("Register error:", error);
        alert("Something went wrong while connecting to the server.");
    }
}

async function sendCode() {
    const email = document.getElementById("email").value.trim();
    const cooldownUntil = Number(localStorage.getItem("forgotResetCooldownUntil") || "0");

    if (cooldownUntil > Date.now()) {
        restoreSendCodeCooldown();
        return;
    }

    if (!email) {
        alert("Please enter your email address.");
        return;
    }

    try {
        const response = await fetch(
            `http://127.0.0.1:8000/auth/forgot-password/request?email=${encodeURIComponent(email)}`,
            {
                method: "POST"
            }
        );

        const data = await response.json();
        console.log("FORGOT PASSWORD REQUEST RESPONSE:", data);

        if (!response.ok) {
            alert(data.detail || "Failed to send code.");
            return;
        }

        localStorage.setItem("resetEmail", email);
        setSendCodeCooldown(RESET_CODE_COOLDOWN_SECONDS);

        if (data.code_dev) {
            alert(`DEV MODE: Your reset code is ${data.code_dev}`);
        } else {
            alert(data.message || "Code sent successfully to your email.");
        }

        show("confirm");
    } catch (error) {
        console.error("Send code error:", error);
        alert("Something went wrong while connecting to the server.");
    }
}

async function resetPassword() {
    const email = localStorage.getItem("resetEmail");
    const code = document.getElementById("resetCode").value.trim();
    const newPassword = document.getElementById("newPassword").value.trim();

    if (!email) {
        alert("Missing reset email. Please request a code again.");
        show("forgot");
        return;
    }

    if (!code || !newPassword) {
        alert("Please enter the reset code and your new password.");
        return;
    }

    try {
        const response = await fetch("http://127.0.0.1:8000/auth/forgot-password/confirm", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email,
                code: code,
                new_password: newPassword
            })
        });

        const data = await response.json();
        console.log("RESET PASSWORD RESPONSE:", data);

        if (!response.ok) {
            alert(data.detail || "Failed to reset password.");
            return;
        }

        alert(data.message || "Password reset successful!");

        localStorage.removeItem("resetEmail");
        document.getElementById("email").value = "";
        document.getElementById("resetCode").value = "";
        document.getElementById("newPassword").value = "";

        show("login");
    } catch (error) {
        console.error("Reset password error:", error);
        alert("Something went wrong while connecting to the server.");
    }
}

function togglePassword(inputId, icon) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace("fa-eye", "fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.replace("fa-eye-slash", "fa-eye");
    }
}

function checkPasswordStrength(password) {
    let strength = 0;

    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    const bar = document.getElementById("strengthBar");
    const text = document.getElementById("strengthText");

    if (!bar || !text) return;

    if (!password) {
        bar.style.width = "0%";
        bar.style.background = "transparent";
        text.textContent = "";
        return;
    }

    if (strength <= 2) {
        bar.style.width = "33%";
        bar.style.background = "#ff4d6d";
        text.textContent = "Weak password";
    } else if (strength <= 4) {
        bar.style.width = "66%";
        bar.style.background = "#ffc244";
        text.textContent = "Medium strength";
    } else {
        bar.style.width = "100%";
        bar.style.background = "#2ecc71";
        text.textContent = "Strong password";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    restoreSendCodeCooldown();
});