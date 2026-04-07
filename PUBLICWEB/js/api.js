<<<<<<< HEAD
const API_BASE_URL = "http://127.0.0.1:8000";
=======
const API_BASE_URL = window.API_URL || "http://127.0.0.1:8000";
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d

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
<<<<<<< HEAD
=======
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
async function apiPatch(path, body = {}, extraHeaders = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(extraHeaders)
        },
        body: JSON.stringify(body)
    });

    const data = await res.json();
    return { res, data };
>>>>>>> 2d6fbf2f26c40f214140ad6009db07046db5635d
}