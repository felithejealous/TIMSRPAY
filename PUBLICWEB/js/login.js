function toggleTheme() {
    const body = document.body;
    const isDark = body.getAttribute('data-theme') === 'dark';
    body.setAttribute('data-theme', isDark ? 'light' : 'dark');
}

function show(id) {
    document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();
    const errorBox = document.getElementById("loginError");

    if (errorBox) errorBox.textContent = "";

    try {
        const response = await fetch(
            `http://127.0.0.1:8000/auth/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
            {
                method: "POST"
            }
        );

        const data = await response.json();
        console.log("LOGIN RESPONSE:", data);

        if (!response.ok) {
            if (errorBox) {
                errorBox.textContent = data.detail || "Invalid email or password.";
            }
            return;
        }

        if (!data.access_token) {
            if (errorBox) errorBox.textContent = "Login failed. No access token returned.";
            return;
        }

        localStorage.setItem("token", data.access_token);
        window.location.href = "/PUBLICWEB/welcome.html";

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
        const response = await fetch(`http://127.0.0.1:8000/auth/register?full_name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`, {
            method: "POST"
        });

        const data = await response.json();
        console.log("REGISTER RESPONSE:", data);

        if (!response.ok) {
            alert(data.detail || "Registration failed.");
            return;
        }

        alert("Account created successfully!");
        document.getElementById("register").classList.remove("active");
        document.getElementById("login").classList.add("active");
        document.getElementById("registerName").value = "";
        document.getElementById("registerEmail").value = "";
        document.getElementById("registerPassword").value = "";
    } catch (err) {
        console.error("Register error:", err);
        alert("Something went wrong while connecting to the server.");
    }
}

async function sendCode() {
    const email = document.getElementById('email').value.trim();

    if (!email) {
        alert('Please enter your email address.');
        return;
    }

    try {
        const response = await fetch(
            `http://127.0.0.1:8000/auth/forgot-password/request?email=${encodeURIComponent(email)}`,
            {
                method: 'POST'
            }
        );

        const data = await response.json();

        if (response.ok) {
            alert('Code sent successfully to your email.');
            localStorage.setItem('resetEmail', email);
            show('confirm');
        } else {
            alert(data.detail || 'Failed to send code.');
        }

    } catch (error) {
        console.error(error);
        alert('Something went wrong while connecting to the server.');
    }
}

async function resetPassword() {
    const email = localStorage.getItem("resetEmail");
    const code = document.getElementById("resetCode").value;
    const newPassword = document.getElementById("newPassword").value;

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
    console.log(data);
    alert(JSON.stringify(data));
}

function togglePassword(inputId, icon) {
    const input = document.getElementById(inputId);

    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace("fa-eye","fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.replace("fa-eye-slash","fa-eye");
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

if (strength <= 2) {
bar.style.width = "33%";
bar.style.background = "#ff4d6d";
text.textContent = "Weak password";
}

else if (strength <= 4) {
bar.style.width = "66%";
bar.style.background = "#ffc244";
text.textContent = "Medium strength";
}

else {
bar.style.width = "100%";
bar.style.background = "#2ecc71";
text.textContent = "Strong password";
}
}