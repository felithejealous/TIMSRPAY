const API_URL = window.API_URL || "http://127.0.0.1:8000";

/* =========================
   HELPERS
========================= */
function $(id) {
    return document.getElementById(id);
}

function showStatus(targetId, message, type = "error") {
    const box = $(targetId);
    if (!box) return;

    box.textContent = message || "";
    box.className = `status-box show ${type}`;
}

function clearStatus(targetId) {
    const box = $(targetId);
    if (!box) return;

    box.textContent = "";
    box.className = "status-box";
}

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, options);

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        throw new Error(data?.detail || data?.message || `Request failed: ${response.status}`);
    }

    return data;
}

function setButtonLoading(button, isLoading, loadingText = "Please wait...") {
    if (!button) return;

    if (isLoading) {
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
        button.disabled = true;
        button.style.opacity = "0.7";
        button.style.cursor = "not-allowed";
    } else {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
        button.style.opacity = "1";
        button.style.cursor = "pointer";
    }
}

/* =========================
   LOGIN
========================= */
async function handleLoginSubmit(e) {
    e.preventDefault();
    clearStatus("loginStatus");

    const email = $("email")?.value.trim().toLowerCase();
    const password = $("password")?.value;
    const loginBtn = $("loginBtn");

    if (!email || !password) {
        showStatus("loginStatus", "Please enter your email and password.");
        return;
    }

    try {
        setButtonLoading(loginBtn, true, "Logging in...");

        const data = await fetchJSON(`${API_URL}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            credentials: "include",
            body: new URLSearchParams({
                email,
                password
            })
        });

        if (data.role === "admin") {
            showStatus("loginStatus", "Login successful. Redirecting...", "success");
            setTimeout(() => {
                window.location.href = "../html/dashboard.html";
            }, 700);
        } else {
            showStatus("loginStatus", "Not authorized for admin panel.");
        }
    } catch (err) {
        console.error("Login error:", err);
        showStatus("loginStatus", err.message || "Server error.");
    } finally {
        setButtonLoading(loginBtn, false);
    }
}

/* =========================
   FORGOT PASSWORD MODAL
========================= */
let forgotStep = 1;
let forgotEmail = "";
let forgotCode = "";

function updateForgotStepUI() {
    const step1 = $("forgotStep1");
    const step2 = $("forgotStep2");
    const step3 = $("forgotStep3");

    const pill1 = $("stepPill1");
    const pill2 = $("stepPill2");
    const pill3 = $("stepPill3");

    const subtitle = $("forgotSubtitle");

    [step1, step2, step3].forEach(step => step?.classList.remove("active"));
    [pill1, pill2, pill3].forEach(pill => pill?.classList.remove("active"));

    if (forgotStep === 1) {
        step1?.classList.add("active");
        pill1?.classList.add("active");
        if (subtitle) subtitle.textContent = "Enter your admin email to receive a 6-digit reset code.";
    } else if (forgotStep === 2) {
        step2?.classList.add("active");
        pill1?.classList.add("active");
        pill2?.classList.add("active");
        if (subtitle) subtitle.textContent = "Enter the 6-digit code sent to your email.";
    } else if (forgotStep === 3) {
        step3?.classList.add("active");
        pill1?.classList.add("active");
        pill2?.classList.add("active");
        pill3?.classList.add("active");
        if (subtitle) subtitle.textContent = "Set your new password.";
    }
}

function openForgotModal() {
    clearStatus("forgotStatus");
    $("forgotModal")?.classList.add("show");

    forgotStep = 1;
    forgotEmail = $("email")?.value.trim().toLowerCase() || "";
    forgotCode = "";

    $("fpEmail").value = forgotEmail;
    $("fpCode").value = "";
    $("fpNewPassword").value = "";
    $("fpConfirmPassword").value = "";

    $("devCodeText").textContent = "";
    $("devCodeBox")?.classList.remove("show");

    updateForgotStepUI();
}

function closeForgotModal() {
    $("forgotModal")?.classList.remove("show");
    clearStatus("forgotStatus");
}

async function sendResetCode() {
    clearStatus("forgotStatus");

    const email = $("fpEmail")?.value.trim().toLowerCase();
    const sendCodeBtn = $("sendCodeBtn");

    if (!email) {
        showStatus("forgotStatus", "Please enter your email address.");
        return;
    }

    try {
        setButtonLoading(sendCodeBtn, true, "Sending code...");

        const data = await fetchJSON(`${API_URL}/auth/forgot-password/request`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(email)
        }).catch(async () => {
            const response = await fetch(`${API_URL}/auth/forgot-password/request?email=${encodeURIComponent(email)}`, {
                method: "POST"
            });

            let fallbackData = null;
            try {
                fallbackData = await response.json();
            } catch {
                fallbackData = null;
            }

            if (!response.ok) {
                throw new Error(fallbackData?.detail || "Failed to send reset code.");
            }

            return fallbackData;
        });

        forgotEmail = email;

        if (data?.code_dev) {
            $("devCodeText").textContent = data.code_dev;
            $("devCodeBox")?.classList.add("show");
        } else {
            $("devCodeText").textContent = "";
            $("devCodeBox")?.classList.remove("show");
        }

        showStatus(
            "forgotStatus",
            data?.message || "If the email exists, a reset code was sent.",
            "success"
        );

        forgotStep = 2;
        updateForgotStepUI();
    } catch (err) {
        console.error("Forgot password request error:", err);
        showStatus("forgotStatus", err.message || "Failed to send reset code.");
    } finally {
        setButtonLoading(sendCodeBtn, false);
    }
}

function goToStep3() {
    clearStatus("forgotStatus");

    const code = $("fpCode")?.value.trim();

    if (!code) {
        showStatus("forgotStatus", "Please enter the 6-digit reset code.");
        return;
    }

    if (!/^\d{6}$/.test(code)) {
        showStatus("forgotStatus", "Reset code must be exactly 6 digits.");
        return;
    }

    forgotCode = code;
    forgotStep = 3;
    updateForgotStepUI();
}

async function resetPassword() {
    clearStatus("forgotStatus");

    const newPassword = $("fpNewPassword")?.value || "";
    const confirmPassword = $("fpConfirmPassword")?.value || "";
    const resetPasswordBtn = $("resetPasswordBtn");

    if (!forgotEmail) {
        showStatus("forgotStatus", "Missing email. Please restart the reset process.");
        forgotStep = 1;
        updateForgotStepUI();
        return;
    }

    if (!forgotCode) {
        showStatus("forgotStatus", "Missing reset code. Please restart the reset process.");
        forgotStep = 2;
        updateForgotStepUI();
        return;
    }

    if (!newPassword || !confirmPassword) {
        showStatus("forgotStatus", "Please fill in both password fields.");
        return;
    }

    if (newPassword !== confirmPassword) {
        showStatus("forgotStatus", "Passwords do not match.");
        return;
    }

    try {
        setButtonLoading(resetPasswordBtn, true, "Resetting...");

        const data = await fetchJSON(`${API_URL}/auth/forgot-password/confirm`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: forgotEmail,
                code: forgotCode,
                new_password: newPassword
            })
        });

        showStatus(
            "forgotStatus",
            data?.message || "Password reset successful.",
            "success"
        );

        $("password").value = "";
        $("email").value = forgotEmail;

        setTimeout(() => {
            closeForgotModal();
            showStatus("loginStatus", "Password reset successful. You can now log in.", "success");
        }, 1200);
    } catch (err) {
        console.error("Forgot password confirm error:", err);
        showStatus("forgotStatus", err.message || "Failed to reset password.");
    } finally {
        setButtonLoading(resetPasswordBtn, false);
    }
}

/* =========================
   INIT
========================= */
function initLoginPage() {
    $("loginForm")?.addEventListener("submit", handleLoginSubmit);

    $("forgotPasswordLink")?.addEventListener("click", (e) => {
        e.preventDefault();
        openForgotModal();
    });

    $("forgotCancelBtn1")?.addEventListener("click", closeForgotModal);
    $("forgotModalCloseBtn")?.addEventListener("click", closeForgotModal);

    $("backToStep1Btn")?.addEventListener("click", () => {
        clearStatus("forgotStatus");
        forgotStep = 1;
        updateForgotStepUI();
    });

    $("backToStep2Btn")?.addEventListener("click", () => {
        clearStatus("forgotStatus");
        forgotStep = 2;
        updateForgotStepUI();
    });

    $("sendCodeBtn")?.addEventListener("click", sendResetCode);
    $("goToStep3Btn")?.addEventListener("click", goToStep3);
    $("resetPasswordBtn")?.addEventListener("click", resetPassword);
}

window.addEventListener("DOMContentLoaded", initLoginPage);