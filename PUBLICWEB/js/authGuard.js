function clearCustomerSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user_id");
  localStorage.removeItem("user_email");
  localStorage.removeItem("user_role");
  localStorage.removeItem("resetEmail");
}

async function checkCustomerAuth() {
  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "login.html";
    return false;
  }

  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });

    if (!response.ok) {
      clearCustomerSession();
      window.location.href = "login.html";
      return false;
    }

    const data = await response.json();
    console.log("Public auth/me data:", data);

    if ((data.role || "").toLowerCase() !== "customer") {
      alert("This portal is for customer accounts only.");

      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error("Forced logout error:", error);
      }

      clearCustomerSession();
      window.location.href = "login.html";
      return false;
    }

    return true;
  } catch (error) {
    console.error("Customer auth check error:", error);
    clearCustomerSession();
    window.location.href = "login.html";
    return false;
  }
}
