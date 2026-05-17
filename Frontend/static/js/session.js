$(function () {
    "use strict";

    // ============ State ============
    let sessionName = "";
    let checklistItems = [];   // [{title, completed}]
    let timerMode = "stopwatch";
    let countdownTotalSeconds = 25 * 60; // default 25 min
    let timerRunning = false;
    let startTimestamp = null;  // Date when session started
    let elapsedSeconds = 0;
    let timerInterval = null;
    let deleteTargetId = null;
    let editTempName = "";
    let editTempChecklist = [];
    let timerPaused = false;
    let editTempTimerMode = "stopwatch";
    let editTempCountdownTotal = 25 * 60;
    let currentSessionId = null;  // Track the ID of the current session if it's from history
    let isResumedSession = false;  // Flag to track if we're resuming a session
    let sittingWallStart = null;  // Date when current sitting's timer first ran (wall clock)
    let sittingBaselineElapsed = null;  // elapsedSeconds at sittingWallStart

    // ============ Helpers ============
    function pad(n) { return n < 10 ? "0" + n : "" + n; }

    function formatDuration(totalSec) {
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return pad(h) + ":" + pad(m) + ":" + pad(s);
    }

    function markSittingAnchorIfNeeded() {
        if (!timerRunning || timerPaused) return;
        if (sittingWallStart != null) return;
        sittingWallStart = new Date();
        sittingBaselineElapsed = elapsedSeconds;
    }

    function buildSegmentPayload() {
        const endIso = new Date().toISOString();
        const startIso = sittingWallStart
            ? sittingWallStart.toISOString()
            : (startTimestamp ? startTimestamp.toISOString() : endIso);
        const base = sittingBaselineElapsed != null ? sittingBaselineElapsed : 0;
        const segElapsed = Math.max(0, elapsedSeconds - base);
        return {
            segment_started_at: startIso,
            segment_ended_at: endIso,
            segment_elapsed_seconds: segElapsed
        };
    }

    function formatDurationShort(minutes) {
        if (minutes < 60) return minutes + "m";
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return h + "h" + (m > 0 ? " " + m + "m" : "");
    }

    function showSetupAlert(msg, type) {
        const colors = {
            danger: "bg-red-100 text-red-700 border-red-200",
            success: "bg-emerald-100 text-emerald-700 border-emerald-200",
            info: "bg-blue-100 text-blue-700 border-blue-200"
        };
        const cls = colors[type] || colors.danger;
        $("#setup-alert").html(
            '<div class="flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm border mb-3 ' + cls + '">' +
            '<span>' + $("<span>").text(msg).html() + '</span>' +
            '<button onclick="$(this).parent().fadeOut(200,function(){$(this).remove()})" class="hover:opacity-70 transition-opacity text-lg leading-none">&times;</button>' +
            '</div>'
        );
    }

    // ============ Init Clock Ticks & Numbers ============
    function initClockFace() {
        const ticksG = document.getElementById("clock-ticks");
        const numsG = document.getElementById("clock-numbers");
        if (!ticksG || !numsG) return;

        ticksG.innerHTML = "";
        numsG.innerHTML = "";

        for (let i = 0; i < 60; i++) {
            const angle = (i * 6) * Math.PI / 180;
            const isHour = i % 5 === 0;
            const r1 = isHour ? 78 : 83;
            const r2 = 88;
            const x1 = 100 + r1 * Math.sin(angle);
            const y1 = 100 - r1 * Math.cos(angle);
            const x2 = 100 + r2 * Math.sin(angle);
            const y2 = 100 - r2 * Math.cos(angle);

            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y1);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y2);
            line.setAttribute("stroke", isHour ? "#6b7280" : "#d1d5db");
            line.setAttribute("stroke-width", isHour ? "2" : "1");
            ticksG.appendChild(line);
        }

        for (let h = 1; h <= 12; h++) {
            const a = (h * 30) * Math.PI / 180;
            const r = 68;
            const x = 100 + r * Math.sin(a);
            const y = 100 - r * Math.cos(a);

            const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
            txt.setAttribute("x", x);
            txt.setAttribute("y", y);
            txt.textContent = h;
            numsG.appendChild(txt);
        }
    }

    // ============ Update Clock Hands ============
    function updateClockHands(totalSeconds) {
        const hours = totalSeconds / 3600;
        const minutes = (totalSeconds % 3600) / 60;
        const seconds = totalSeconds % 60;

        const secDeg = (seconds / 60) * 360;
        const minDeg = (minutes / 60) * 360;
        const hourDeg = (hours / 12) * 360;

        $("#clock-second").attr("transform", "rotate(" + secDeg + " 100 100)");
        $("#clock-minute").attr("transform", "rotate(" + minDeg + " 100 100)");
        $("#clock-hour").attr("transform", "rotate(" + hourDeg + " 100 100)");
    }

    // ============ Validate Start ============
    function validateStart() {
        const name = $("#session-name").val().trim();
        const hasName = name.length > 0;
        const hasItems = checklistItems.length > 0;
        const enabled = hasName && hasItems;

        const $btn = $("#start-session-btn");
        $btn.prop("disabled", !enabled);
        if (enabled) {
            $btn.removeClass("bg-gray-300 cursor-not-allowed").addClass("bg-primary_purp hover:bg-indigo-600 cursor-pointer");
        } else {
            $btn.removeClass("bg-primary_purp hover:bg-indigo-600 cursor-pointer").addClass("bg-gray-300 cursor-not-allowed");
        }
    }

    // ============ Render Checklist Builder ============
    function renderChecklistBuilder() {
        const $c = $("#checklist-builder");
        $c.empty();
        checklistItems.forEach(function (item, idx) {
            $c.append(
                '<div class="flex items-center gap-2 group" data-idx="' + idx + '">' +
                '<span class="flex-1 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 roboto-regular">' +
                $("<span>").text(item.title).html() +
                '</span>' +
                '<button type="button" class="remove-checklist-btn p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">' +
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>' +
                '</button>' +
                '</div>'
            );
        });
        validateStart();
    }

    // ============ Render Live Checklist ============
    function renderLiveChecklist() {
        const $c = $("#live-checklist");
        $c.empty();
        let done = 0;
        checklistItems.forEach(function (item, idx) {
            if (item.completed) done++;
            $c.append(
                '<label class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ' +
                (item.completed ? 'bg-emerald-50' : 'hover:bg-gray-50') + '">' +
                '<input type="checkbox" class="live-check w-4 h-4 rounded border-gray-300 text-primary_purp focus:ring-primary_purp" data-idx="' + idx + '"' +
                (item.completed ? ' checked' : '') + '>' +
                '<span class="text-sm roboto-regular ' + (item.completed ? 'line-through text-gray-400' : 'text-gray-700') + '">' +
                $("<span>").text(item.title).html() +
                '</span>' +
                '</label>'
            );
        });
        $("#checklist-progress").text(done + "/" + checklistItems.length);
    }

    // ============ Timer Mode Toggle ============
    $(document).on("click", ".timer-mode-btn", function () {
        const mode = $(this).data("mode");
        timerMode = mode;
        $(".timer-mode-btn").removeClass("bg-primary_purp text-white").addClass("text-gray-500 hover:text-gray-700");
        $(this).addClass("bg-primary_purp text-white").removeClass("text-gray-500 hover:text-gray-700");
        if (mode === "countdown") {
            $("#countdown-setup").removeClass("hidden");
        } else {
            $("#countdown-setup").addClass("hidden");
        }
    });

    // ============ Add Checklist Item ============
    function addChecklistItem() {
        const val = $("#new-checklist-item").val().trim();
        if (!val) return;
        checklistItems.push({ title: val, completed: false });
        $("#new-checklist-item").val("");
        renderChecklistBuilder();
    }

    $("#add-checklist-btn").on("click", addChecklistItem);
    $("#new-checklist-item").on("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            addChecklistItem();
        }
    });

    // ============ Remove Checklist Item ============
    $(document).on("click", ".remove-checklist-btn", function () {
        const idx = $(this).closest("[data-idx]").data("idx");
        checklistItems.splice(idx, 1);
        renderChecklistBuilder();
    });

    // ============ Session Name Change ============
    $("#session-name").on("input", validateStart);

    // ============ Start Session ============
    $("#start-session-btn").on("click", function () {
        sessionName = $("#session-name").val().trim();
        if (!sessionName || checklistItems.length === 0) return;

        // Reset checklist completed state
        checklistItems.forEach(function (item) { item.completed = false; });

        // Countdown total
        if (timerMode === "countdown") {
            const h = parseInt($("#countdown-hours").val()) || 0;
            const m = parseInt($("#countdown-minutes").val()) || 0;
            countdownTotalSeconds = h * 3600 + m * 60;
            if (countdownTotalSeconds <= 0) {
                showSetupAlert("Please set a countdown duration greater than 0.", "danger");
                return;
            }
        }

        // Switch to active phase
        startTimestamp = new Date();
        elapsedSeconds = 0;
        timerRunning = true;
        timerPaused = false;
        isResumedSession = false;
        currentSessionId = null;
        sittingWallStart = null;
        sittingBaselineElapsed = null;

        $("#setup-phase").addClass("hidden");
        $("#active-phase").removeClass("hidden");
        $("#active-session-name").text(sessionName);
        $("#active-timer-mode").text(timerMode === "stopwatch" ? "Stopwatch — counting up" : "Countdown — " + formatDuration(countdownTotalSeconds));
        $("#countdown-done-badge").addClass("hidden");

        renderLiveChecklist();
        updateTimerDisplay();
        initClockFace();
        updateClockHands(0);

        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(function () {
            if (!timerRunning || timerPaused) return;
            elapsedSeconds++;
            updateTimerDisplay();
        }, 1000);
        markSittingAnchorIfNeeded();
    });

    // ============ Pause / Resume ============
    $("#pause-resume-btn").on("click", function () {
        if (!timerRunning) return;
        timerPaused = !timerPaused;
        if (timerPaused) {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            $("#pause-icon").addClass("hidden");
            $("#resume-icon").removeClass("hidden");
            $("#pause-resume-label").text("Resume");
            $(this).removeClass("bg-amber-500 hover:bg-amber-600").addClass("bg-emerald-500 hover:bg-emerald-600");
            $("#active-badge").removeClass("bg-emerald-100 text-emerald-700 animate-pulse").addClass("bg-amber-100 text-amber-700").text("Paused");
        } else {
            timerInterval = setInterval(function () {
                if (!timerRunning || timerPaused) return;
                elapsedSeconds++;
                updateTimerDisplay();
            }, 1000);
            markSittingAnchorIfNeeded();
            $("#pause-icon").removeClass("hidden");
            $("#resume-icon").addClass("hidden");
            $("#pause-resume-label").text("Pause");
            $(this).removeClass("bg-emerald-500 hover:bg-emerald-600").addClass("bg-amber-500 hover:bg-amber-600");
            $("#active-badge").removeClass("bg-amber-100 text-amber-700").addClass("bg-emerald-100 text-emerald-700 animate-pulse").text("In Progress");
        }
    });

    // ============ Update Timer Display ============
    function updateTimerDisplay() {
        let displaySeconds;
        if (timerMode === "stopwatch") {
            displaySeconds = elapsedSeconds;
        } else {
            displaySeconds = Math.max(0, countdownTotalSeconds - elapsedSeconds);
            if (displaySeconds === 0 && elapsedSeconds > 0 && timerRunning && !timerPaused) {
                $("#countdown-done-badge").removeClass("hidden");
                // Browser push notification for timer done
                if ("Notification" in window && Notification.permission === "granted") {
                    try {
                        var n = new Notification("Time's up!", {
                            body: sessionName || "Your countdown timer has finished.",
                            tag: "planify-timer-done"
                        });
                        n.onclick = function () { window.focus(); };
                    } catch (e) { /* ignore */ }
                }
            }
        }

        $("#digital-timer").text(formatDuration(displaySeconds));
        updateClockHands(timerMode === "stopwatch" ? elapsedSeconds : displaySeconds);
    }

    // ============ Live Checklist Toggle ============
    $(document).on("change", ".live-check", function () {
        const idx = $(this).data("idx");
        checklistItems[idx].completed = this.checked;
        renderLiveChecklist();
    });

    // ============ Inline Add Task (during session) ============
    function addLiveItem() {
        const val = $("#live-new-item").val().trim();
        if (!val) return;
        checklistItems.push({ title: val, completed: false });
        $("#live-new-item").val("");
        renderLiveChecklist();
    }

    $("#live-add-item-btn").on("click", addLiveItem);
    $("#live-new-item").on("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); addLiveItem(); }
    });

    // ============ Resume Session from History ============
    function resumeSession(sessionData, elapsedSecondsParam, options) {
        options = options || {};
        const startPaused = !!options.startPaused;

        sittingWallStart = null;
        sittingBaselineElapsed = null;

        sessionName = sessionData.title;
        timerMode = sessionData.timer_mode || "stopwatch";
        checklistItems = (sessionData.checklist || []).map(function (c) {
            return { id: c.id, title: c.title, completed: !!c.completed };
        });
        currentSessionId = sessionData.id;
        isResumedSession = true;

        elapsedSeconds = Math.floor(Math.max(0, elapsedSecondsParam));

        if (timerMode === "countdown") {
            const originalDuration = (parseInt(sessionData.duration, 10) || 25) * 60;
            countdownTotalSeconds = originalDuration;

            if (elapsedSeconds >= countdownTotalSeconds) {
                timerRunning = false;
                timerPaused = false;
                if (timerInterval) clearInterval(timerInterval);
                timerInterval = null;
                $("#countdown-done-badge").removeClass("hidden");
                showSetupAlert("This countdown session has already finished. Please end it to save.", "info");
            }
        }

        if (!(timerMode === "countdown" && elapsedSeconds >= countdownTotalSeconds)) {
            timerRunning = true;
            timerPaused = !!startPaused;
        }

        startTimestamp = new Date(sessionData.start);

        if (!timerRunning) {
            $("#pause-icon").addClass("hidden");
            $("#resume-icon").addClass("hidden");
            $("#pause-resume-label").text("Pause");
            $("#pause-resume-btn").removeClass("bg-emerald-500 hover:bg-emerald-600").addClass("bg-amber-500 hover:bg-amber-600");
            $("#active-badge").removeClass("animate-pulse").addClass("bg-amber-100 text-amber-700").text("Countdown finished — end session to save");
        } else if (timerPaused) {
            $("#pause-icon").addClass("hidden");
            $("#resume-icon").removeClass("hidden");
            $("#pause-resume-label").text("Resume");
            $("#pause-resume-btn").removeClass("bg-amber-500 hover:bg-amber-600").addClass("bg-emerald-500 hover:bg-emerald-600");
            $("#active-badge").removeClass("bg-emerald-100 text-emerald-700 animate-pulse").addClass("bg-amber-100 text-amber-700").text("Paused — press Resume when ready");
        } else {
            $("#pause-icon").removeClass("hidden");
            $("#resume-icon").addClass("hidden");
            $("#pause-resume-label").text("Pause");
            $("#pause-resume-btn").removeClass("bg-emerald-500 hover:bg-emerald-600").addClass("bg-amber-500 hover:bg-amber-600");
            $("#active-badge").removeClass("bg-amber-100 text-amber-700").addClass("bg-emerald-100 text-emerald-700 animate-pulse").text("In Progress");
        }

        $("#setup-phase").addClass("hidden");
        $("#active-phase").removeClass("hidden");
        $("#active-session-name").text(sessionName);

        if (timerMode === "stopwatch") {
            $("#active-timer-mode").text("Stopwatch — counting up" + (timerRunning && timerPaused ? " (paused)" : timerRunning ? " (Resumed)" : ""));
        } else {
            const remaining = Math.max(0, countdownTotalSeconds - elapsedSeconds);
            $("#active-timer-mode").text("Countdown — " + formatDuration(remaining) + " remaining" + (timerRunning && timerPaused ? " (paused)" : timerRunning ? " (Resumed)" : ""));
        }

        renderLiveChecklist();
        updateTimerDisplay();
        initClockFace();
        updateClockHands(timerMode === "stopwatch" ? elapsedSeconds : Math.max(0, countdownTotalSeconds - elapsedSeconds));

        if (timerInterval) clearInterval(timerInterval);
        timerInterval = null;

        if (timerMode === "countdown" && elapsedSeconds >= countdownTotalSeconds) {
            timerRunning = false;
        } else if (timerRunning && !timerPaused) {
            timerInterval = setInterval(function () {
                if (!timerRunning || timerPaused) return;
                elapsedSeconds++;
                updateTimerDisplay();

                if (timerMode === "countdown" && elapsedSeconds >= countdownTotalSeconds && timerRunning) {
                    timerRunning = false;
                    if (timerInterval) clearInterval(timerInterval);
                    timerInterval = null;
                    $("#countdown-done-badge").removeClass("hidden");
                    updateTimerDisplay();

                    if ("Notification" in window && Notification.permission === "granted") {
                        try {
                            var n = new Notification("Time's up!", {
                                body: sessionName || "Your countdown timer has finished.",
                                tag: "planify-timer-done"
                            });
                            n.onclick = function () { window.focus(); };
                        } catch (e) { /* ignore */ }
                    }
                }
            }, 1000);
            markSittingAnchorIfNeeded();
        }

        const isNewContinuation = !!options.isNewContinuation;

        if (!(timerMode === "countdown" && elapsedSeconds >= countdownTotalSeconds)) {
            showSetupAlert(
                isNewContinuation
                    ? "New timer for today is ready (paused). Press Resume when you want it to run, or End Session to log time on this date."
                    : timerRunning && timerPaused
                        ? "Session loaded while paused. Press Resume on the timer when you want the clock to run, or End Session to save time to your calendar."
                        : "Session resumed! Timer continues from where you left off.",
                "success"
            );
            setTimeout(function () {
                $("#setup-alert").fadeOut(200, function () { $(this).empty().show(); });
            }, 3200);
        }
    }

    // ============ Edit Session Modal ============
    function renderEditChecklist() {
        const $c = $("#edit-checklist-list");
        $c.empty();
        editTempChecklist.forEach(function (item, idx) {
            $c.append(
                '<div class="flex items-center gap-2" data-edit-idx="' + idx + '">' +
                '<svg class="w-3.5 h-3.5 shrink-0 ' + (item.completed ? 'text-emerald-500' : 'text-gray-300') + '" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' +
                (item.completed
                    ? '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
                    : '<circle cx="12" cy="12" r="9"/>') +
                '</svg>' +
                '<span class="flex-1 text-sm roboto-regular ' + (item.completed ? 'text-gray-400 line-through' : 'text-gray-700') + '">' + $("<span>").text(item.title).html() + '</span>' +
                '<button type="button" class="edit-remove-item p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">' +
                '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>' +
                '</button>' +
                '</div>'
            );
        });
    }

    function showEditAlert(msg, type) {
        const colors = {
            danger: "bg-red-100 text-red-700 border-red-200",
            success: "bg-emerald-100 text-emerald-700 border-emerald-200"
        };
        const cls = colors[type] || colors.danger;
        $("#edit-alert").html(
            '<div class="flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm border mb-3 ' + cls + '">' +
            '<span>' + $("<span>").text(msg).html() + '</span>' +
            '<button onclick="$(this).parent().fadeOut(200,function(){$(this).remove()})" class="hover:opacity-70 transition-opacity text-lg leading-none">&times;</button>' +
            '</div>'
        );
    }

    function openEditModal() {
        editTempName = sessionName;
        editTempChecklist = checklistItems.map(function (item) {
            return { title: item.title, completed: item.completed };
        });
        editTempTimerMode = timerMode;
        editTempCountdownTotal = countdownTotalSeconds;

        $("#edit-session-name").val(editTempName);
        $("#edit-alert").empty();
        $("#edit-new-item").val("");

        // Highlight active timer mode button
        $(".edit-timer-mode-btn").removeClass("bg-primary_purp text-white").addClass("text-gray-500 hover:text-gray-700");
        $(".edit-timer-mode-btn[data-mode='" + editTempTimerMode + "']").addClass("bg-primary_purp text-white").removeClass("text-gray-500 hover:text-gray-700");

        // Show/hide countdown fields
        if (editTempTimerMode === "countdown") {
            const remaining = Math.max(0, countdownTotalSeconds - elapsedSeconds);
            const rH = Math.floor(remaining / 3600);
            const rM = Math.floor((remaining % 3600) / 60);
            $("#edit-countdown-hours").val(rH);
            $("#edit-countdown-minutes").val(rM);
            $("#edit-countdown-setup").removeClass("hidden");
        } else {
            $("#edit-countdown-setup").addClass("hidden");
        }

        renderEditChecklist();
        $("#edit-session-modal").removeClass("hidden");
    }

    function closeEditModal() {
        $("#edit-session-modal").addClass("hidden");
        editTempName = "";
        editTempChecklist = [];
    }

    $("#edit-session-btn").on("click", openEditModal);
    $("#edit-modal-close").on("click", closeEditModal);
    $("#edit-cancel-btn").on("click", closeEditModal);
    $("#edit-session-modal").on("click", function (e) {
        if (e.target === this) closeEditModal();
    });

    // Toggle timer mode in edit modal
    $(document).on("click", ".edit-timer-mode-btn", function () {
        const mode = $(this).data("mode");
        editTempTimerMode = mode;
        $(".edit-timer-mode-btn").removeClass("bg-primary_purp text-white").addClass("text-gray-500 hover:text-gray-700");
        $(this).addClass("bg-primary_purp text-white").removeClass("text-gray-500 hover:text-gray-700");
        if (mode === "countdown") {
            // Pre-fill with 25 min when switching to countdown
            if (editTempTimerMode !== timerMode) {
                $("#edit-countdown-hours").val(0);
                $("#edit-countdown-minutes").val(25);
            }
            $("#edit-countdown-setup").removeClass("hidden");
        } else {
            $("#edit-countdown-setup").addClass("hidden");
        }
    });

    // Add item in edit modal
    function addEditItem() {
        const val = $("#edit-new-item").val().trim();
        if (!val) return;
        editTempChecklist.push({ title: val, completed: false });
        $("#edit-new-item").val("");
        renderEditChecklist();
    }

    $("#edit-add-item-btn").on("click", addEditItem);
    $("#edit-new-item").on("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); addEditItem(); }
    });

    // Remove item in edit modal
    $(document).on("click", ".edit-remove-item", function () {
        const idx = $(this).closest("[data-edit-idx]").data("edit-idx");
        editTempChecklist.splice(idx, 1);
        renderEditChecklist();
    });

    // Save edits
    $("#edit-save-btn").on("click", function () {
        const name = $("#edit-session-name").val().trim();
        if (!name) {
            showEditAlert("Session name cannot be empty.", "danger");
            return;
        }
        if (editTempChecklist.length === 0) {
            showEditAlert("Add at least one checklist item.", "danger");
            return;
        }

        // Validate countdown duration if switching to or staying on countdown
        if (editTempTimerMode === "countdown") {
            const newH = parseInt($("#edit-countdown-hours").val()) || 0;
            const newM = parseInt($("#edit-countdown-minutes").val()) || 0;
            const newRemaining = newH * 3600 + newM * 60;
            if (newRemaining <= 0) {
                showEditAlert("Countdown duration must be greater than 0.", "danger");
                return;
            }
            // Recalculate countdownTotalSeconds so remaining = newRemaining
            countdownTotalSeconds = elapsedSeconds + newRemaining;
        }

        // Apply timer mode
        timerMode = editTempTimerMode;
        $("#active-timer-mode").text(
            timerMode === "stopwatch"
                ? "Stopwatch — counting up"
                : "Countdown — " + formatDuration(countdownTotalSeconds)
        );

        // If countdown finished badge was showing but mode changed or duration extended, hide it
        if (timerMode === "stopwatch" || countdownTotalSeconds - elapsedSeconds > 0) {
            $("#countdown-done-badge").addClass("hidden");
        }

        sessionName = name;
        checklistItems = editTempChecklist.map(function (item) {
            return { title: item.title, completed: item.completed };
        });
        $("#active-session-name").text(sessionName);
        renderLiveChecklist();
        updateTimerDisplay();
        closeEditModal();
    });

    // ============ End Session ============
    $("#end-session-btn").on("click", function () {
        if (!timerRunning && timerMode === "stopwatch") return;
        
        const $btn = $("#end-session-btn");
        $btn.prop("disabled", true).text("Saving…");
        
        const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
        const allTasksDone =
            checklistItems.length > 0 &&
            checklistItems.every(function (item) {
                return item.completed;
            });

        if (currentSessionId && isResumedSession) {
            // Keep DB status "active" until every checklist item is done, so Resume stays available.
            const seg = buildSegmentPayload();
            $.ajax({
                url: "/api/sessions/" + currentSessionId,
                method: "PUT",
                contentType: "application/json",
                data: JSON.stringify({
                    status: allTasksDone ? "completed" : "active",
                    duration_minutes: durationMinutes,
                    accumulated_seconds: elapsedSeconds,
                    notes: "",
                    checklist: checklistItems,
                    segment_started_at: seg.segment_started_at,
                    segment_ended_at: seg.segment_ended_at,
                    segment_elapsed_seconds: seg.segment_elapsed_seconds
                }),
                success: function () {
                    timerRunning = false;
                    timerPaused = false;
                    if (timerInterval) {
                        clearInterval(timerInterval);
                        timerInterval = null;
                    }
                    resetToSetup();
                    loadHistory();
                    showSetupAlert(
                        allTasksDone
                            ? "Session completed and saved!"
                            : "Progress saved. You can resume this session anytime.",
                        "success"
                    );
                    currentSessionId = null;
                    isResumedSession = false;
                    $btn.prop("disabled", false).text("End Session");
                },
                error: function (xhr) {
                    let msg = "Failed to update session.";
                    try { msg = JSON.parse(xhr.responseText).message || msg; } catch (e) {}
                    showSetupAlert(msg, "danger");
                    $btn.prop("disabled", false).text("End Session");
                }
            });
        } else {
            // New session - create it
            const seg = buildSegmentPayload();
            const payload = {
                name: sessionName,
                start_time: startTimestamp.toISOString(),
                duration_minutes: durationMinutes,
                accumulated_seconds: elapsedSeconds,
                timer_mode: timerMode,
                color: "#6366f1",
                notes: "",
                checklist: checklistItems,
                unit_id: $("#session-unit").val() || null,
                segment_started_at: seg.segment_started_at,
                segment_ended_at: seg.segment_ended_at,
                segment_elapsed_seconds: seg.segment_elapsed_seconds
            };
            
            $.ajax({
                url: "/api/sessions",
                method: "POST",
                contentType: "application/json",
                data: JSON.stringify(payload),
                success: function () {
                    timerRunning = false;
                    timerPaused = false;
                    if (timerInterval) {
                        clearInterval(timerInterval);
                        timerInterval = null;
                    }
                    resetToSetup();
                    loadHistory();
                    showSetupAlert(
                        allTasksDone
                            ? "Session saved! It will now appear in your Calendar."
                            : "Session saved. You can resume anytime until all tasks are done.",
                        "success"
                    );
                    $btn.prop("disabled", false).text("End Session");
                },
                error: function (xhr) {
                    let msg = "Failed to save session.";
                    try { msg = JSON.parse(xhr.responseText).message || msg; } catch (e) {}
                    showSetupAlert(msg, "danger");
                    $btn.prop("disabled", false).text("End Session");
                }
            });
        }
    });

    // ============ Reset to Setup ============
    function resetToSetup() {
        timerRunning = false;
        timerPaused = false;
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        sessionName = "";
        checklistItems = [];
        elapsedSeconds = 0;
        startTimestamp = null;
        currentSessionId = null;
        isResumedSession = false;
        sittingWallStart = null;
        sittingBaselineElapsed = null;
        
        $("#pause-icon").removeClass("hidden");
        $("#resume-icon").addClass("hidden");
        $("#pause-resume-label").text("Pause");
        $("#pause-resume-btn").removeClass("bg-emerald-500 hover:bg-emerald-600").addClass("bg-amber-500 hover:bg-amber-600");
        $("#active-badge").removeClass("bg-amber-100 text-amber-700").addClass("bg-emerald-100 text-emerald-700 animate-pulse").text("In Progress");
        
        $("#active-phase").addClass("hidden");
        $("#setup-phase").removeClass("hidden");
        $("#session-name").val("");
        $("#new-checklist-item").val("");
        renderChecklistBuilder();
        $("#digital-timer").text("00:00:00");
        $("#end-session-btn").prop("disabled", false).text("End Session");
    }

    // ============ Update Checklist Item Completion (Tick) ============
    function updateChecklistItemCompletion(sessionId, itemId, completed) {
        $.ajax({
            url: "/api/sessions/" + sessionId + "/checklist/" + itemId,
            method: "PUT",
            contentType: "application/json",
            data: JSON.stringify({ completed: completed }),
            success: function () {
                loadHistory(); // Refresh history to show updated state
            },
            error: function (xhr) {
                console.error("Failed to update checklist item:", xhr);
                showSetupAlert("Failed to update task status.", "danger");
            }
        });
    }

    // ============ Load History ============
    function loadHistory(done) {
        $.getJSON("/api/sessions", function (data) {
            const $list = $("#history-list");
            $list.empty();

            if (!data || data.length === 0) {
                $("#history-empty").removeClass("hidden");
                $("#history-count").text("");
                if (typeof done === "function") done();
                return;
            }

            $("#history-empty").addClass("hidden");
            $("#history-count").text(data.length + " session" + (data.length !== 1 ? "s" : ""));

            data.forEach(function (s) {
                const d = new Date(s.start);
                const dateStr = d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
                const timeStr = d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
                const checklist = s.checklist || [];
                const done = checklist.filter(function (c) { return c.completed; }).length;
                const isActive = s.status === "active";
                const hasSplitChild = isActive && s.continued_as_session_id;
                const canResume = isActive && !s.continued_as_session_id;

                let html = '<div class="history-item px-4 sm:px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer" data-id="' + s.id + '">';
                html += '  <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">';
                html += '    <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:' + (s.color || '#6366f1') + '20">';
                html += '      <svg class="w-5 h-5" style="color:' + (s.color || '#6366f1') + '" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
                html += '    </div>';
                html += '    <div class="flex-1 min-w-0">';
                html += '      <div class="flex items-center gap-2 flex-wrap">';
                html += '        <span class="montserrat-medium text-sm text-gray-800 truncate">' + $("<span>").text(s.title).html() + '</span>';
                html += '        <span class="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500 roboto-regular shrink-0">' + (s.timer_mode || 'stopwatch') + '</span>';
                if (s.unit_code) {
                    html += '        <span class="px-2 py-0.5 text-xs rounded-full text-white roboto-regular shrink-0" style="background:' + (s.color || '#6366f1') + '">' + $("<span>").text(s.unit_code).html() + '</span>';
                }
                if (hasSplitChild) {
                    html += '        <span class="px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-800 roboto-regular shrink-0">Continued with new timer</span>';
                } else if (isActive) {
                    html += '        <span class="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700 roboto-regular shrink-0 animate-pulse">In Progress</span>';
                }
                html += '      </div>';
                html += '      <p class="text-xs text-gray-400 roboto-regular mt-0.5">' + dateStr + ' at ' + timeStr + ' · ' + (isActive ? 'Still running' : formatDurationShort(s.duration)) + '</p>';
                html += '    </div>';
                html += '    <div class="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 shrink-0 w-full sm:w-auto">';
                html += '      <span class="text-xs roboto-regular ' + (done === checklist.length && checklist.length > 0 ? 'text-emerald-600' : 'text-gray-400') + '">' + done + '/' + checklist.length + ' done</span>';
                if (canResume) {
                    html += '      <button class="resume-history-btn p-1.5 rounded-lg text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors" data-id="' + s.id + '" title="Resume this session">';
                    html += '        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M18 12h2.25M12 18H9.75M5.666 6.743l-1.59-1.59M5.666 17.257l-1.59 1.59M6 12H3.75"/></svg>';
                    html += '      </button>';
                }
                html += '      <button class="delete-history-btn p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" data-id="' + s.id + '" title="Delete session">';
                html += '        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>';
                html += '      </button>';
                html += '    </div>';
                html += '  </div>';
                html += '  <div class="history-details hidden mt-3 sm:ml-14 space-y-1">';
                html += renderHistoryChecklist(s.id, checklist);
                html += '  </div>';
                html += '</div>';
                $list.append(html);
            });
            if (typeof done === "function") done();
        });
    }

    function focusHistorySessionFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const sid = params.get("session");
        if (!sid) return;
        const $row = $('.history-item[data-id="' + sid + '"]');
        if (!$row.length) return;
        const el = $row.get(0);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
        $row.find(".history-details").removeClass("hidden");
        $row.addClass("ring-2 ring-primary_purp ring-offset-2 rounded-xl");
        setTimeout(function () {
            $row.removeClass("ring-2 ring-primary_purp ring-offset-2 rounded-xl");
        }, 2600);
        try {
            history.replaceState({}, "", window.location.pathname);
        } catch (e) { /* ignore */ }
    }

    function applySessionPrefillFromStorage() {
        let raw = null;
        try {
            raw = localStorage.getItem("planify_session_prefill");
        } catch (e) { /* ignore */ }
        if (!raw) return;
        let p = null;
        try {
            p = JSON.parse(raw);
        } catch (e) {
            return;
        }
        try {
            localStorage.removeItem("planify_session_prefill");
        } catch (e) { /* ignore */ }
        if (!p || typeof p !== "object") return;
        if (p.name) $("#session-name").val(p.name);
        if (p.timer_mode === "countdown" || p.timer_mode === "stopwatch") {
            timerMode = p.timer_mode;
            $(".timer-mode-btn").removeClass("bg-primary_purp text-white").addClass("text-gray-500 hover:text-gray-700");
            $('.timer-mode-btn[data-mode="' + timerMode + '"]').addClass("bg-primary_purp text-white").removeClass("text-gray-500 hover:text-gray-700");
            if (timerMode === "countdown") {
                $("#countdown-setup").removeClass("hidden");
            } else {
                $("#countdown-setup").addClass("hidden");
            }
        }
        if (p.checklist && Array.isArray(p.checklist) && p.checklist.length) {
            checklistItems = p.checklist.map(function (t) {
                return { title: (typeof t === "string" ? t : (t.title || "")).trim(), completed: false };
            }).filter(function (x) { return x.title; });
            renderChecklistBuilder();
        }
        if (p.unit_id) $("#session-unit").val(String(p.unit_id));
        validateStart();
    }

    // ============ Handle Tick/Complete in History ============
    $(document).on("click", ".tick-checklist-item", function (e) {
        e.stopPropagation();
        const $btn = $(this);
        const sessionId = $btn.data("session-id");
        const itemId = $btn.data("item-id");
        const currentCompleted = $btn.data("completed") === true;
        const newCompleted = !currentCompleted;
        
        updateChecklistItemCompletion(sessionId, itemId, newCompleted);
    });

    function renderHistoryChecklist(sessionId, checklist) {
        if (!checklist || checklist.length === 0) return '<p class="text-xs text-gray-400 roboto-regular">No checklist items.</p>';
        let html = '<div class="space-y-2">';
        checklist.forEach(function (item) {
            html += '<div class="flex items-center gap-2 group hover:bg-gray-50 rounded-lg p-1 transition-colors">' +
                '<button class="tick-checklist-item p-1 rounded-md transition-colors ' + (item.completed ? 'text-emerald-600 hover:text-emerald-700' : 'text-gray-400 hover:text-emerald-500') + '" ' +
                'data-session-id="' + sessionId + '" data-item-id="' + item.id + '" data-completed="' + item.completed + '">' +
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' +
                (item.completed 
                    ? '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' 
                    : '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>') +
                '</svg>' +
                '</button>' +
                '<span class="flex-1 text-xs roboto-regular ' + (item.completed ? 'text-gray-400 line-through' : 'text-gray-600') + '">' + 
                $("<span>").text(item.title).html() + '</span>' +
                '</div>';
        });
        html += '</div>';
        return html;
    }

    // ============ Resume Session Button Handler ============
    // Clicking Resume always continues the same session from its saved time —
    // no modal, no branching. Sessions stay resumable until every task is ticked off.
    $(document).on("click", ".resume-history-btn", function (e) {
        e.stopPropagation();
        const sessionId = $(this).data("id");
        const $btn = $(this);
        $btn.prop("disabled", true);
        $.ajax({
            url: "/api/sessions/" + sessionId + "/resume",
            method: "POST",
            success: function (response) {
                if (response.success) {
                    resumeSession(response.session, response.elapsed_seconds, { startPaused: true });
                    loadHistory();
                } else {
                    showSetupAlert(response.message || "Could not resume session.", "danger");
                }
            },
            error: function (xhr) {
                let msg = "Could not resume session.";
                try { msg = JSON.parse(xhr.responseText).message || msg; } catch (err) { /* ignore */ }
                showSetupAlert(msg, "danger");
            },
            complete: function () {
                $btn.prop("disabled", false);
            }
        });
    });

    // ============ Toggle History Details ============
    $(document).on("click", ".history-item", function (e) {
        if ($(e.target).closest(".delete-history-btn, .resume-history-btn, .tick-checklist-item").length) return;
        $(this).find(".history-details").toggleClass("hidden");
    });

    // ============ Delete Session ============
    $(document).on("click", ".delete-history-btn", function (e) {
        e.stopPropagation();
        deleteTargetId = $(this).data("id");
        $("#delete-session-modal").removeClass("hidden");
    });

    $("#delete-session-cancel").on("click", function () {
        $("#delete-session-modal").addClass("hidden");
        deleteTargetId = null;
    });

    $("#delete-session-modal").on("click", function (e) {
        if (e.target === this) {
            $(this).addClass("hidden");
            deleteTargetId = null;
        }
    });

    $("#delete-session-confirm").on("click", function () {
        if (!deleteTargetId) return;
        const id = deleteTargetId;
        const $btn = $(this);
        $btn.prop("disabled", true).text("Deleting…");

        $.ajax({
            url: "/api/sessions/" + id,
            method: "DELETE",
            success: function () {
                $("#delete-session-modal").addClass("hidden");
                deleteTargetId = null;
                $btn.prop("disabled", false).text("Delete");
                loadHistory();
                showSetupAlert("Session deleted successfully.", "success");
                setTimeout(function() {
                    $("#setup-alert").fadeOut(200, function() { $(this).empty().show(); });
                }, 2000);
            },
            error: function () {
                $btn.prop("disabled", false).text("Delete");
                showSetupAlert("Failed to delete session.", "danger");
            }
        });
    });

    // ============ Request Notification Permission ============
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }

    // ============ Init ============
    initClockFace();
    loadHistory(focusHistorySessionFromQuery);
    validateStart();

    // Load units for dropdown (current semester only)
    $.getJSON("/api/semesters/current", function (sem) {
        let url = "/api/units?archived=false";
        if (sem && sem.id) url += "&semester_id=" + sem.id;
        $.getJSON(url, function (data) {
            const $sel = $("#session-unit");
            $sel.html('<option value="">None</option>');
            data.forEach(function (u) {
                $sel.append('<option value="' + u.id + '">' + $("<span>").text((u.code ? u.code + " — " : "") + u.name).html() + '</option>');
            });
            applySessionPrefillFromStorage();
        });
    });
});
