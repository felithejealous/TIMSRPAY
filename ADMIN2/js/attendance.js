let staffCache = [];
let attendanceLogsCache = [];
let attendanceStatusMap = {};
let checklistMap = {};
let complianceSummary = null;
let attendanceFilter = "all";
let searchDebounceTimer = null;
let currentAttendanceStaff = null;

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getLocalDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseServerDate(value) {
    if (!value) return null;
    const normalized = String(value).replace(" ", "T");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

function toggleTheme() {
    document.body.classList.toggle("light-theme");
    const isLight = document.body.classList.contains("light-theme");
    localStorage.setItem("theme", isLight ? "light" : "dark");

    const themeIcon = document.getElementById("themeIcon");
    if (themeIcon) {
        themeIcon.className = isLight ? "fa-solid fa-moon" : "fa-solid fa-sun";
    }
}

function applySavedTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
        document.body.classList.add("light-theme");
        const themeIcon = document.getElementById("themeIcon");
        if (themeIcon) {
            themeIcon.className = "fa-solid fa-moon";
        }
    }
}

function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.innerText = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

function openModal(id) {
    document.getElementById(id)?.classList.add("open");
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove("open");
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = parseServerDate(value);
    if (!date) return "-";

    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function formatShortDate(value) {
    if (!value) return "-";
    const date = parseServerDate(value);
    if (!date) return "-";

    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function formatShiftHours(timeIn, timeOut = null) {
    if (!timeIn) return "-";

    const start = parseServerDate(timeIn);
    const end = timeOut ? parseServerDate(timeOut) : new Date();

    if (!start || !end) return "-";

    const diffMs = end - start;
    const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}h ${minutes}m`;
}

function formatDecimalHours(value) {
    const num = Number(value || 0);
    if (!num) return "0h";
    const hours = Math.floor(num);
    const minutes = Math.round((num - hours) * 60);

    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
}

function buildInitialAvatar(name) {
    const safeName = (name || "S").trim();
    const initial = safeName.charAt(0).toUpperCase() || "S";

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
            <rect width="100%" height="100%" rx="100" ry="100" fill="#fcdb05"/>
            <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
                font-family="Arial, sans-serif" font-size="88" font-weight="700" fill="#120f0a">
                ${initial}
            </text>
        </svg>
    `.trim();

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getRoleBadge(role) {
    const raw = String(role || "").toLowerCase();

    if (raw === "cashier") return `<span class="role-badge role-cashier">Cashier</span>`;
    return `<span class="role-badge role-staff">Staff</span>`;
}

function getChecklistBadge(checklist) {
    if (checklist?.has_checklist) {
        return `<span class="status-badge status-present">● Submitted</span>`;
    }
    return `<span class="status-badge status-offline">● Missing</span>`;
}

function getLogStatusMeta(log) {
    const rawStatus = String(log?.attendance_status || "").toLowerCase();

    if (rawStatus === "late") {
        return {
            label: "Late",
            className: "status-badge status-late"
        };
    }

    if (rawStatus === "overtime") {
        return {
            label: "Overtime",
            className: "status-badge status-late"
        };
    }

    if (rawStatus === "undertime") {
        return {
            label: "Undertime",
            className: "status-badge status-offline"
        };
    }

    if (!log?.time_out) {
        return {
            label: "Clocked In",
            className: "status-badge status-present"
        };
    }

    if (log?.time_out) {
        return {
            label: "Completed",
            className: "status-badge status-complete"
        };
    }

    return {
        label: "Offline",
        className: "status-badge status-offline"
    };
}

function getOpenLogForStaff(staffId) {
    return attendanceLogsCache.find(log =>
        Number(log.staff_id) === Number(staffId) && !log.time_out
    ) || null;
}

function getLatestLogForStaff(staffId) {
    return attendanceLogsCache.find(log => Number(log.staff_id) === Number(staffId)) || null;
}

function isLongShift(staffId) {
    const openLog = getOpenLogForStaff(staffId);
    if (!openLog || !openLog.time_in) return false;

    const start = parseServerDate(openLog.time_in);
    if (!start) return false;

    const diffHours = (Date.now() - start.getTime()) / 3600000;
    return diffHours >= 8;
}

function getAttendanceStatusMeta(staff) {
    const status = attendanceStatusMap[staff.user_id];
    const openLog = getOpenLogForStaff(staff.user_id);
    const latestLog = getLatestLogForStaff(staff.user_id);

    if (status?.is_clocked_in) {
        const liveStatus = String(status.attendance_status || "").toLowerCase();

        if (liveStatus === "late" || Number(status.late_minutes || 0) > 0) {
            return {
                label: "Late",
                className: "status-badge status-late"
            };
        }

        if (isLongShift(staff.user_id)) {
            return {
                label: "Long Shift",
                className: "status-badge status-late"
            };
        }

        return {
            label: "Clocked In",
            className: "status-badge status-present"
        };
    }

    if (latestLog) {
        return getLogStatusMeta(latestLog);
    }

    if (openLog) {
        return {
            label: "Clocked In",
            className: "status-badge status-present"
        };
    }

    return {
        label: "Offline",
        className: "status-badge status-offline"
    };
}

function getChecklistForStaff(staffId) {
    if (checklistMap[staffId]) return checklistMap[staffId];

    const latestLog = getLatestLogForStaff(staffId);
    if (latestLog?.closing_checklist?.has_checklist) {
        return latestLog.closing_checklist;
    }

    return null;
}

function getFilteredStaff() {
    const query = (document.getElementById("attendanceSearchInput")?.value || "").trim().toLowerCase();

    return staffCache.filter(staff => {
        const status = attendanceStatusMap[staff.user_id];
        const latestLog = getLatestLogForStaff(staff.user_id);
        const checklist = getChecklistForStaff(staff.user_id);

        const isClockedIn = Boolean(status?.is_clocked_in);
        const isLate = Boolean(
            Number(status?.late_minutes || 0) > 0 ||
            String(status?.attendance_status || "").toLowerCase() === "late" ||
            String(latestLog?.attendance_status || "").toLowerCase() === "late" ||
            String(latestLog?.attendance_status || "").toLowerCase() === "overtime" ||
            isLongShift(staff.user_id)
        );
        const isMissingChecklist = !Boolean(checklist?.has_checklist);

        if (attendanceFilter === "clocked-in" && !isClockedIn) return false;
        if (attendanceFilter === "clocked-out" && isClockedIn) return false;
        if (attendanceFilter === "late" && !isLate) return false;
        if (attendanceFilter === "missing-checklist" && !isMissingChecklist) return false;

        if (!query) return true;

        const searchable = [
            staff.user_id,
            staff.full_name,
            staff.email,
            staff.position,
            staff.role,
            staff.staff_code || "",
            latestLog?.staff_code || ""
        ].join(" ").toLowerCase();

        return searchable.includes(query);
    });
}

function updateAttendanceSummary() {
    const totalStaff = staffCache.length;
    const clockedIn = staffCache.filter(staff => attendanceStatusMap[staff.user_id]?.is_clocked_in).length;

    const lateCount = staffCache.filter(staff => {
        const status = attendanceStatusMap[staff.user_id];
        const latestLog = getLatestLogForStaff(staff.user_id);

        return Boolean(
            Number(status?.late_minutes || 0) > 0 ||
            String(status?.attendance_status || "").toLowerCase() === "late" ||
            String(latestLog?.attendance_status || "").toLowerCase() === "late" ||
            String(latestLog?.attendance_status || "").toLowerCase() === "overtime" ||
            isLongShift(staff.user_id)
        );
    }).length;

    const today = new Date().toDateString();
    const completedToday = attendanceLogsCache.filter(log => {
        if (!log.time_out) return false;
        const outDate = parseServerDate(log.time_out);
        if (!outDate) return false;
        return outDate.toDateString() === today;
    }).length;

    const totalStaffEl = document.getElementById("totalStaffCount");
    const clockedInEl = document.getElementById("clockedInCount");
    const lateEl = document.getElementById("lateCount");
    const completedEl = document.getElementById("completedTodayCount");

    if (totalStaffEl) totalStaffEl.innerText = totalStaff;
    if (clockedInEl) clockedInEl.innerText = clockedIn;
    if (lateEl) lateEl.innerText = lateCount;
    if (completedEl) completedEl.innerText = completedToday;
}

function renderComplianceSummary() {
    const totalEl = document.getElementById("complianceTotalStaff");
    const submittedEl = document.getElementById("complianceSubmitted");
    const missingEl = document.getElementById("complianceMissing");
    const rateEl = document.getElementById("complianceRate");

    if (!complianceSummary) return;

    if (totalEl) totalEl.innerText = complianceSummary.total_staff ?? 0;
    if (submittedEl) submittedEl.innerText = complianceSummary.submitted_count ?? 0;
    if (missingEl) missingEl.innerText = complianceSummary.not_submitted_count ?? 0;
    if (rateEl) rateEl.innerText = `${Number(complianceSummary.compliance_rate || 0).toFixed(0)}%`;
}

function renderAttendanceCards() {
    const grid = document.getElementById("attendanceGrid");
    if (!grid) return;

    const filteredStaff = getFilteredStaff();
    grid.innerHTML = "";

    if (!filteredStaff.length) {
        grid.innerHTML = `<div class="glass empty-box">No attendance records matched your filters.</div>`;
        updateAttendanceSummary();
        return;
    }

    filteredStaff.forEach(staff => {
        const latestLog = getLatestLogForStaff(staff.user_id);
        const statusMeta = getAttendanceStatusMeta(staff);
        const checklist = getChecklistForStaff(staff.user_id);

        const card = document.createElement("div");
        card.className = "attendance-card glass";
        card.onclick = () => openAttendanceProfile(staff.user_id);

        card.innerHTML = `
            <div class="flex items-start justify-between gap-4 mb-5">
                <div class="flex items-center gap-4 min-w-0">
                    <img src="${buildInitialAvatar(staff.full_name || staff.email || `S${staff.user_id}`)}" class="staff-img">
                    <div class="min-w-0">
                        <h3 class="font-black text-lg truncate">${escapeHtml(staff.full_name || staff.email || `Staff #${staff.user_id}`)}</h3>
                        <p class="text-[10px] opacity-40 font-bold">
                            ${escapeHtml(staff.staff_code || latestLog?.staff_code || `STAFF ID #${staff.user_id}`)}
                        </p>
                    </div>
                </div>
                ${getRoleBadge(staff.role)}
            </div>

            <div class="space-y-3">
                <div class="flex justify-between gap-4">
                    <span class="text-xs uppercase font-black opacity-50">Position</span>
                    <span class="text-sm text-right">${escapeHtml(staff.position || "-")}</span>
                </div>

                <div class="flex justify-between gap-4">
                    <span class="text-xs uppercase font-black opacity-50">Email</span>
                    <span class="text-sm text-right truncate max-w-[170px]">${escapeHtml(staff.email || "-")}</span>
                </div>

                <div class="flex justify-between gap-4">
                    <span class="text-xs uppercase font-black opacity-50">Clock In</span>
                    <span class="text-sm text-right">${escapeHtml(formatDateTime(latestLog?.time_in))}</span>
                </div>

                <div class="flex justify-between gap-4">
                    <span class="text-xs uppercase font-black opacity-50">Clock Out</span>
                    <span class="text-sm text-right">${escapeHtml(formatDateTime(latestLog?.time_out))}</span>
                </div>

                <div class="flex justify-between gap-4">
                    <span class="text-xs uppercase font-black opacity-50">Shift Hours</span>
                    <span class="text-sm text-right">${escapeHtml(formatDecimalHours(latestLog?.total_hours || 0))}</span>
                </div>

                <div class="flex justify-between gap-4 items-center">
                    <span class="text-xs uppercase font-black opacity-50">Checklist</span>
                    ${getChecklistBadge(checklist)}
                </div>

                <div class="flex justify-between gap-4 items-center pt-2">
                    <span class="text-xs uppercase font-black opacity-50">Status</span>
                    <span class="${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });

    updateAttendanceSummary();
}

function renderAttendanceTable() {
    const body = document.getElementById("attendanceTableBody");
    if (!body) return;

    body.innerHTML = "";

    if (!attendanceLogsCache.length) {
        body.innerHTML = `
            <tr>
                <td colspan="6" class="opacity-60">No attendance logs found.</td>
            </tr>
        `;
        return;
    }

    attendanceLogsCache.slice(0, 20).forEach(log => {
        const statusMeta = getLogStatusMeta(log);

        const shiftLabel = log.scheduled_start || log.scheduled_end
            ? `${formatDateTime(log.scheduled_start)} → ${formatDateTime(log.scheduled_end)}`
            : formatDecimalHours(log.total_hours || 0);

        const row = document.createElement("tr");
        row.innerHTML = `
            <td class="font-bold">
                ${escapeHtml(log.full_name || `Staff #${log.staff_id}`)}
                <div class="text-[11px] opacity-50 mt-1">${escapeHtml(log.staff_code || `ID #${log.staff_id}`)}</div>
            </td>
            <td>${escapeHtml(log.position || "-")}</td>
            <td>${escapeHtml(formatDateTime(log.time_in))}</td>
            <td>${escapeHtml(formatDateTime(log.time_out))}</td>
            <td>${escapeHtml(shiftLabel)}</td>
            <td>
                <span class="${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
            </td>
        `;
        body.appendChild(row);
    });
}

async function fetchStaff() {
    try {
        const response = await fetch(`${API_URL}/staff/`, {
            method: "GET",
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Staff fetch failed: ${response.status}`);
        }

        staffCache = (result.data || []).filter(item =>
            ["staff", "cashier"].includes(String(item.role || "").toLowerCase())
        );
    } catch (error) {
        console.error("Staff fetch error:", error);
        staffCache = [];
    }
}

async function fetchAttendanceLogs() {
    try {
        const response = await fetch(`${API_URL}/attendance/logs?limit=200`, {
            method: "GET",
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Attendance logs fetch failed: ${response.status}`);
        }

        attendanceLogsCache = (result.data || []).filter(log =>
            ["staff", "cashier"].includes(String(log.role || "").toLowerCase())
        );
    } catch (error) {
        console.error("Attendance logs fetch error:", error);
        attendanceLogsCache = [];
    }
}

async function fetchAttendanceStatuses() {
    attendanceStatusMap = {};

    await Promise.all(
        staffCache.map(async (staff) => {
            try {
                const response = await fetch(`${API_URL}/attendance/status/${staff.user_id}`, {
                    method: "GET",
                    credentials: "include"
                });

                const result = await response.json();

                if (response.ok) {
                    attendanceStatusMap[staff.user_id] = result;
                } else {
                    attendanceStatusMap[staff.user_id] = {
                        staff_id: staff.user_id,
                        is_clocked_in: false,
                        open_attendance_id: null,
                        time_in: null,
                        attendance_status: null,
                        late_minutes: 0,
                        scheduled_start: null,
                        scheduled_end: null
                    };
                }
            } catch (error) {
                attendanceStatusMap[staff.user_id] = {
                    staff_id: staff.user_id,
                    is_clocked_in: false,
                    open_attendance_id: null,
                    time_in: null,
                    attendance_status: null,
                    late_minutes: 0,
                    scheduled_start: null,
                    scheduled_end: null
                };
            }
        })
    );
}

async function fetchClosingChecklists() {
    checklistMap = {};

    try {
        const localDate = getLocalDateString();
        const response = await fetch(`${API_URL}/attendance/closing-checklists?checklist_date=${encodeURIComponent(localDate)}`, {
            method: "GET",
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Closing checklist fetch failed: ${response.status}`);
        }

        (result.data || []).forEach(item => {
            checklistMap[item.staff_id] = item;
        });
    } catch (error) {
        console.error("Closing checklist fetch error:", error);
        checklistMap = {};
    }
}

async function fetchComplianceSummary() {
    complianceSummary = null;

    try {
        const localDate = getLocalDateString();
        const response = await fetch(`${API_URL}/attendance/closing-checklist/compliance-summary?checklist_date=${encodeURIComponent(localDate)}`, {
            method: "GET",
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || `Compliance summary fetch failed: ${response.status}`);
        }

        complianceSummary = result;
    } catch (error) {
        console.error("Compliance summary fetch error:", error);
        complianceSummary = null;
    }
}

function setAttendanceFilter(filter) {
    attendanceFilter = filter;

    document.querySelectorAll("#attendanceFilters .filter-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.filter === filter);
    });

    renderAttendanceCards();
}

function handleAttendanceSearch() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        renderAttendanceCards();
    }, 250);
}

function getStaffLogs(staffId) {
    return attendanceLogsCache.filter(log => Number(log.staff_id) === Number(staffId));
}

function openAttendanceProfile(staffId) {
    const staff = staffCache.find(item => Number(item.user_id) === Number(staffId));
    if (!staff) return;

    currentAttendanceStaff = staff;
    const statusMeta = getAttendanceStatusMeta(staff);
    const status = attendanceStatusMap[staff.user_id];
    const logs = getStaffLogs(staffId);
    const latestLog = getLatestLogForStaff(staffId);
    const checklist = getChecklistForStaff(staffId);

    document.getElementById("attendanceDetailName").innerText = staff.full_name || `Staff #${staff.user_id}`;
    document.getElementById("attendanceDetailEmail").innerText = staff.email || "-";
    document.getElementById("attendanceDetailPosition").innerText = staff.position || "-";
    document.getElementById("attendanceDetailStaffId").innerText = staff.staff_code || latestLog?.staff_code || staff.user_id;
    document.getElementById("attendanceDetailRole").innerHTML = getRoleBadge(staff.role);
    document.getElementById("attendanceDetailStatus").innerHTML = `<span class="${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>`;
    document.getElementById("attendanceDetailTimeIn").innerText = formatDateTime(status?.time_in || latestLog?.time_in);

    const history = document.getElementById("attendanceDetailHistory");
    history.innerHTML = "";

    if (!logs.length) {
        history.innerHTML = `<div class="opacity-60">No attendance history found.</div>`;
    } else {
        logs.slice(0, 10).forEach(log => {
            const item = document.createElement("div");
            item.className = "info-row";

            const meta = getLogStatusMeta(log);
            const notesText = log.notes ? `<div class="text-xs opacity-50 mt-1">Notes: ${escapeHtml(log.notes)}</div>` : "";
            const terminalText = log.terminal_name ? `<div class="text-xs opacity-50 mt-1">Terminal: ${escapeHtml(log.terminal_name)}</div>` : "";
            const scheduleText = (log.scheduled_start || log.scheduled_end)
                ? `<div class="text-xs opacity-50 mt-1">Schedule: ${escapeHtml(formatDateTime(log.scheduled_start))} → ${escapeHtml(formatDateTime(log.scheduled_end))}</div>`
                : "";

            item.innerHTML = `
                <div>
                    <div class="font-bold text-sm">${escapeHtml(formatShortDate(log.shift_date || log.time_in))}</div>
                    <div class="text-xs opacity-60 mt-1">In: ${escapeHtml(formatDateTime(log.time_in))}</div>
                    <div class="text-xs opacity-60 mt-1">Out: ${escapeHtml(formatDateTime(log.time_out))}</div>
                    ${scheduleText}
                    ${terminalText}
                    ${notesText}
                </div>
                <div class="text-right">
                    <div class="font-black text-yellow-400">${escapeHtml(formatDecimalHours(log.total_hours || 0))}</div>
                    <div class="text-xs opacity-60 mt-1">${escapeHtml(meta.label)}</div>
                    <div class="text-xs opacity-60 mt-1">Late: ${escapeHtml(log.late_minutes || 0)} min</div>
                    <div class="text-xs opacity-60 mt-1">OT: ${escapeHtml(formatDecimalHours(log.overtime_hours || 0))}</div>
                </div>
            `;
            history.appendChild(item);
        });
    }

    const checklistContainer = document.getElementById("attendanceDetailChecklist");
    if (checklistContainer) {
        if (!checklist || !checklist.has_checklist) {
            checklistContainer.innerHTML = `<div class="history-box opacity-60">No checklist submitted today.</div>`;
        } else {
            checklistContainer.innerHTML = `
                <div class="history-box">
                    <div class="text-sm font-bold mb-2">Submitted At</div>
                    <div class="text-xs opacity-70 mb-4">${escapeHtml(formatDateTime(checklist.submitted_at))}</div>

                    <div class="space-y-2 text-sm">
                        <div>${checklist.wipe_counters ? "✅" : "❌"} Wipe all counters & blenders</div>
                        <div>${checklist.refill_bins ? "✅" : "❌"} Refill fruit bins (Mango/Avocado)</div>
                        <div>${checklist.final_cash_register ? "✅" : "❌"} Final Cash Register Count</div>
                        <div>${checklist.pos_devices_charging ? "✅" : "❌"} Ensure all POS devices are charging</div>
                        <div class="pt-2 text-xs opacity-70">${checklist.checklist_locked ? "Checklist locked after clock out" : "Checklist still editable"}</div>
                    </div>
                </div>
            `;
        }
    }

    openModal("attendanceProfileModal");
}

async function downloadAttendance() {
    try {
        const start = document.getElementById("startDate")?.value;
        const end = document.getElementById("endDate")?.value;

        let url = `${API_URL}/attendance/export`;
        const params = new URLSearchParams();

        if (start) params.append("start_date", start);
        if (end) params.append("end_date", end);

        if (params.toString()) {
            url += `?${params.toString()}`;
        }

        const response = await fetch(url, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error("Failed to download attendance");
        }

        const blob = await response.blob();
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = "attendance.csv";

        document.body.appendChild(link);
        link.click();
        link.remove();

        showToast("Attendance downloaded");
    } catch (error) {
        console.error(error);
        showToast("Download failed");
    }
}

async function refreshAttendancePage(showMessage = true) {
    await fetchStaff();
    await fetchAttendanceLogs();
    await fetchAttendanceStatuses();
    await fetchClosingChecklists();
    await fetchComplianceSummary();

    renderComplianceSummary();
    renderAttendanceCards();
    renderAttendanceTable();

    if (showMessage) {
        showToast("Attendance refreshed");
    }
}

function initializeAttendancePage() {
    applySavedTheme();
    document.getElementById("attendanceSearchInput")?.addEventListener("input", handleAttendanceSearch);
    refreshAttendancePage(false);
}

window.toggleTheme = toggleTheme;
window.setAttendanceFilter = setAttendanceFilter;
window.refreshAttendancePage = refreshAttendancePage;
window.openModal = openModal;
window.closeModal = closeModal;
window.downloadAttendance = downloadAttendance;

window.onload = () => {
    initializeAttendancePage();
};