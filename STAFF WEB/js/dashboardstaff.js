const body = document.body;


const welcomeText = document.getElementById("welcomeText");
const liveClock = document.getElementById("live-clock");
const liveDate = document.getElementById("live-date");

const clockInBtn = document.getElementById("clockInBtn");
const clockOutBtn = document.getElementById("clockOutBtn");
const breakBtn = document.getElementById("breakBtn");
const breakArea = document.getElementById("breakArea");

const statusLabel = document.getElementById("statusLabel");
const shiftTimer = document.getElementById("shiftTimer");
const historyBody = document.getElementById("historyBody");

const shiftTargetHours = document.getElementById("shiftTargetHours");
const weeklyTotalHours = document.getElementById("weeklyTotalHours");

const checkWipeCounters = document.getElementById("checkWipeCounters");
const checkRefillBins = document.getElementById("checkRefillBins");
const checkFinalCashRegister = document.getElementById("checkFinalCashRegister");
const checkPosDevicesCharging = document.getElementById("checkPosDevicesCharging");
const saveChecklistBtn = document.getElementById("saveChecklistBtn");
const checklistStatusText = document.getElementById("checklistStatusText");

let currentUser = null;
let currentOpenStatus = null;
let logsCache = [];
let timerInterval = null;
let checklistCache = null;

/* =========================
   HELPERS
========================= */
function getAPIURL() {
    if (!window.API_URL) {
        throw new Error("API_URL is not defined. Make sure authGuard.js loads first.");
    }
    return window.API_URL;
}

function getLocalDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        ...options
    });

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

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function parseServerDate(value) {
    if (!value) return null;

    const normalized = String(value).replace(" ", "T");
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) return null;
    return date;
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = parseServerDate(value);
    if (!date) return "-";

    return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function formatTimeOnly(value) {
    if (!value) return "-";
    const date = parseServerDate(value);
    if (!date) return "-";

    return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatShortDate(value) {
    if (!value) return "-";
    const date = parseServerDate(value);
    if (!date) return "-";

    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function formatDurationFromHours(decimalHours) {
    const value = Number(decimalHours || 0);
    if (!Number.isFinite(value) || value <= 0) return "0h 0m";

    const totalMinutes = Math.round(value * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}h ${minutes}m`;
}

function formatTimerFromDate(startValue) {
    if (!startValue) return "00:00:00";

    const start = parseServerDate(startValue);
    if (!start) return "00:00:00";

    const diffMs = Math.max(0, Date.now() - start.getTime());
    const totalSeconds = Math.floor(diffMs / 1000);

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        String(seconds).padStart(2, "0")
    ].join(":");
}

function getStartOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getStartOfWeek() {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
}

/* =========================
   LOGOUT
========================= */
function setupLogout() {
    const logoutLink = document.querySelector(".logout-link");
    if (!logoutLink) return;

    logoutLink.addEventListener("click", async (event) => {
        event.preventDefault();

        try {
            await fetch(`${getAPIURL()}/auth/logout`, {
                method: "POST",
                credentials: "include"
            });
        } catch (error) {
            console.error("Logout failed:", error);
        } finally {
            window.location.href = "loginstaff.html";
        }
    });
}

/* =========================
   LIVE CLOCK
========================= */
function updateClockUI() {
    const now = new Date();

    if (liveClock) {
        liveClock.textContent = now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    }

    if (liveDate) {
        liveDate.textContent = now.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        });
    }
}

function startLiveClock() {
    updateClockUI();
    setInterval(updateClockUI, 1000);
}

/* =========================
   USER / ATTENDANCE FETCH
========================= */
async function loadCurrentUser() {
    currentUser = await fetchJSON(`${getAPIURL()}/auth/me`);
    const role = String(currentUser?.role || "").toLowerCase();

    if (welcomeText) {
        if (role === "cashier") {
            welcomeText.textContent = "Cashier Portal";
        } else if (role === "staff") {
            welcomeText.textContent = "Staff Portal";
        } else {
            welcomeText.textContent = "Attendance Portal";
        }
    }
}

async function loadAttendanceStatus() {
    currentOpenStatus = await fetchJSON(`${getAPIURL()}/attendance/my-status`);
}

async function loadAttendanceLogs() {
    const response = await fetchJSON(`${getAPIURL()}/attendance/my-logs?limit=50`);
    logsCache = Array.isArray(response?.data) ? response.data : [];
}

async function loadChecklistToday() {
    const localDate = getLocalDateString();
    checklistCache = await fetchJSON(`${getAPIURL()}/attendance/closing-checklist/my-today?checklist_date=${encodeURIComponent(localDate)}`);
}

/* =========================
   STATS
========================= */
function renderShiftStats() {
    const startOfToday = getStartOfToday();
    const startOfWeek = getStartOfWeek();

    const todaysLogs = logsCache.filter(log => {
        if (!log?.time_in) return false;
        const date = parseServerDate(log.time_in);
        return date && date >= startOfToday;
    });

    const thisWeeksLogs = logsCache.filter(log => {
        if (!log?.time_in) return false;
        const date = parseServerDate(log.time_in);
        return date && date >= startOfWeek;
    });

    let todayTarget = 8.0;

    if (currentOpenStatus?.scheduled_start && currentOpenStatus?.scheduled_end) {
        const start = parseServerDate(currentOpenStatus.scheduled_start);
        const end = parseServerDate(currentOpenStatus.scheduled_end);

        if (start && end && end > start) {
            todayTarget = (end - start) / 3600000;
        }
    } else if (todaysLogs.length && todaysLogs[0]?.scheduled_start && todaysLogs[0]?.scheduled_end) {
        const start = parseServerDate(todaysLogs[0].scheduled_start);
        const end = parseServerDate(todaysLogs[0].scheduled_end);

        if (start && end && end > start) {
            todayTarget = (end - start) / 3600000;
        }
    }

    const weeklyTotal = thisWeeksLogs.reduce((sum, log) => {
        return sum + Number(log.total_hours || 0);
    }, 0);

    if (shiftTargetHours) {
        shiftTargetHours.textContent = `${todayTarget.toFixed(1)} Hours`;
    }

    if (weeklyTotalHours) {
        weeklyTotalHours.textContent = `${weeklyTotal.toFixed(1)} Hours`;
    }
}

/* =========================
   STATUS / TIMER
========================= */
function stopShiftTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function startShiftTimer(timeIn) {
    stopShiftTimer();

    const render = () => {
        if (shiftTimer) {
            shiftTimer.textContent = formatTimerFromDate(timeIn);
        }
    };

    render();
    timerInterval = setInterval(render, 1000);
}

function renderAttendanceStatus() {
    const isClockedIn = Boolean(currentOpenStatus?.is_clocked_in);
    const attendanceStatus = String(currentOpenStatus?.attendance_status || "").toLowerCase();

    if (isClockedIn) {
        if (clockInBtn) clockInBtn.style.display = "none";
        if (clockOutBtn) clockOutBtn.style.display = "flex";
        if (breakArea) breakArea.style.display = "flex";

        if (attendanceStatus === "late" || Number(currentOpenStatus?.late_minutes || 0) > 0) {
            statusLabel.textContent = "Late";
            statusLabel.style.color = "var(--warning)";
        } else {
            statusLabel.textContent = "Active";
            statusLabel.style.color = "var(--success)";
        }

        startShiftTimer(currentOpenStatus.time_in);
    } else {
        if (clockInBtn) clockInBtn.style.display = "flex";
        if (clockOutBtn) clockOutBtn.style.display = "none";
        if (breakArea) breakArea.style.display = "none";

        statusLabel.textContent = "Offline";
        statusLabel.style.color = "var(--clock-panel-subtext)";

        stopShiftTimer();

        if (shiftTimer) {
            shiftTimer.textContent = "00:00:00";
        }
    }

    if (breakBtn) {
        breakBtn.disabled = true;
        breakBtn.title = "Break logs are not yet connected to backend.";
    }
}

/* =========================
   HISTORY
========================= */
function renderHistory() {
    if (!historyBody) return;

    if (!logsCache.length) {
        historyBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">No attendance logs found yet.</td>
            </tr>
        `;
        return;
    }

    historyBody.innerHTML = logsCache.slice(0, 10).map(log => {
        const breakDetails = "Not yet connected";
        const totalHours = formatDurationFromHours(log.total_hours || 0);

        return `
            <tr>
                <td style="color: var(--mango);"><strong>${escapeHTML(formatShortDate(log.shift_date || log.time_in))}</strong></td>
                <td>${escapeHTML(formatTimeOnly(log.time_in))}</td>
                <td style="color: var(--text-muted);">${escapeHTML(breakDetails)}</td>
                <td>${escapeHTML(formatTimeOnly(log.time_out))}</td>
                <td><strong style="color: var(--text-main); font-size: 15px;">${escapeHTML(totalHours)}</strong></td>
            </tr>
        `;
    }).join("");
}

/* =========================
   CHECKLIST
========================= */
function setChecklistInputsDisabled(disabled) {
    [checkWipeCounters, checkRefillBins, checkFinalCashRegister, checkPosDevicesCharging].forEach(el => {
        if (el) el.disabled = disabled;
    });

    if (saveChecklistBtn) {
        saveChecklistBtn.disabled = disabled;
        saveChecklistBtn.title = disabled ? "Checklist is locked after clock out." : "";
    }
}

function renderChecklist() {
    if (!checklistCache) return;

    if (checkWipeCounters) checkWipeCounters.checked = Boolean(checklistCache.wipe_counters);
    if (checkRefillBins) checkRefillBins.checked = Boolean(checklistCache.refill_bins);
    if (checkFinalCashRegister) checkFinalCashRegister.checked = Boolean(checklistCache.final_cash_register);
    if (checkPosDevicesCharging) checkPosDevicesCharging.checked = Boolean(checklistCache.pos_devices_charging);

    const locked = Boolean(checklistCache.checklist_locked);

    setChecklistInputsDisabled(locked);

    if (checklistStatusText) {
        if (locked && checklistCache.has_checklist) {
            checklistStatusText.textContent = `Checklist locked after clock out. Saved: ${formatDateTime(checklistCache.submitted_at)}`;
            checklistStatusText.style.color = "var(--success)";
        } else if (locked && !checklistCache.has_checklist) {
            checklistStatusText.textContent = "Checklist locked after clock out.";
            checklistStatusText.style.color = "var(--warning)";
        } else if (checklistCache.has_checklist) {
            checklistStatusText.textContent = `Checklist saved: ${formatDateTime(checklistCache.submitted_at)}`;
            checklistStatusText.style.color = "var(--success)";
        } else {
            checklistStatusText.textContent = "Checklist not yet submitted today.";
            checklistStatusText.style.color = "var(--text-muted)";
        }
    }
}

async function handleSaveChecklist() {
    try {
        if (checklistCache?.checklist_locked) {
            alert("Checklist is already locked after clock out.");
            return;
        }

        if (saveChecklistBtn) saveChecklistBtn.disabled = true;

        const payload = {
            wipe_counters: Boolean(checkWipeCounters?.checked),
            refill_bins: Boolean(checkRefillBins?.checked),
            final_cash_register: Boolean(checkFinalCashRegister?.checked),
            pos_devices_charging: Boolean(checkPosDevicesCharging?.checked)
        };

        checklistCache = await fetchJSON(`${getAPIURL()}/attendance/closing-checklist`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        renderChecklist();
        alert("Checklist saved successfully.");
    } catch (error) {
        console.error("Checklist save failed:", error);
        alert(error.message || "Failed to save checklist.");
    } finally {
        if (saveChecklistBtn && !checklistCache?.checklist_locked) {
            saveChecklistBtn.disabled = false;
        }
    }
}

/* =========================
   ACTIONS
========================= */
async function handleClockIn() {
    try {
        if (clockInBtn) clockInBtn.disabled = true;

        await fetchJSON(`${getAPIURL()}/attendance/clock-in`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                terminal_name: "STAFF WEB",
                notes: "Clock in from staff dashboard"
            })
        });

        await refreshAttendanceData();
        alert("Clock in successful.");
    } catch (error) {
        console.error("Clock in failed:", error);
        alert(error.message || "Failed to clock in.");
    } finally {
        if (clockInBtn) clockInBtn.disabled = false;
    }
}

async function handleClockOut() {
    const confirmed = confirm("Are you sure you want to end your shift?");
    if (!confirmed) return;

    try {
        if (clockOutBtn) clockOutBtn.disabled = true;

        await fetchJSON(`${getAPIURL()}/attendance/clock-out`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                terminal_name: "STAFF WEB",
                notes: "Clock out from staff dashboard"
            })
        });

        await refreshAttendanceData();
        alert("Clock out successful.");
    } catch (error) {
        console.error("Clock out failed:", error);
        alert(error.message || "Failed to clock out.");
    } finally {
        if (clockOutBtn) clockOutBtn.disabled = false;
    }
}

function setupActionButtons() {
    clockInBtn?.addEventListener("click", handleClockIn);
    clockOutBtn?.addEventListener("click", handleClockOut);

    breakBtn?.addEventListener("click", () => {
        alert("Break logging is not yet connected to backend.");
    });

    saveChecklistBtn?.addEventListener("click", handleSaveChecklist);
}

/* =========================
   REFRESH
========================= */
async function refreshAttendanceData() {
    await loadAttendanceStatus();
    await loadAttendanceLogs();
    await loadChecklistToday();

    renderAttendanceStatus();
    renderHistory();
    renderShiftStats();
    renderChecklist();
}

/* =========================
   INIT
========================= */
async function initDashboardStaffPage() {
    try {
        setupLogout();
        setupActionButtons();
        startLiveClock();

        await loadCurrentUser();
        await refreshAttendanceData();
    } catch (error) {
        console.error("dashboardstaff init error:", error);

        if (historyBody) {
            historyBody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">Failed to load attendance: ${escapeHTML(error.message || "Unknown error")}</td>
                </tr>
            `;
        }

        alert(error.message || "Failed to load attendance page.");
    }
}

document.addEventListener("DOMContentLoaded", initDashboardStaffPage);