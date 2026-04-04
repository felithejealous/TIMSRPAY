const API_BASE_URL = "http://127.0.0.1:8000";

function getToken() {
    return localStorage.getItem("token");
}

function getAuthHeaders(extra = {}) {
    const token = getToken();

    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra
    };
}

async function apiGet(path) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        method: "GET",
        headers: getAuthHeaders()
    });

    const data = await res.json();
    return { res, data };
}

async function apiPost(path, body = {}, extraHeaders = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(extraHeaders)
        },
        body: JSON.stringify(body)
    });

    const data = await res.json();
    return { res, data };
}
async function apiPut(path, body = {}, extraHeaders = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(extraHeaders)
        },
        body: JSON.stringify(body)
    });

    const data = await res.json();
    return { res, data };
}async function apiPostForm(path, formData, extraHeaders = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
            ...getAuthHeaders(extraHeaders)
        },
        body: formData
    });

    const data = await res.json();
    return { res, data };
}

async function apiDelete(path, extraHeaders = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        method: "DELETE",
        headers: getAuthHeaders(extraHeaders)
    });

    const data = await res.json();
    return { res, data };
}