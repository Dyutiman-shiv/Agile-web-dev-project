$(function () {
    "use strict";

    // ============ State ============
    let currentView = "month"; // day | week | month
    let currentDate = new Date();
    let miniDate = new Date(); // independent mini-calendar month
    let events = [];
    let selectedColor = "#6366f1";
    let selectedType = "session";
    let editingEvent = null;
    let isEditMode = false;  // Track if we're in edit mode
    let currentSummaryEvent = null;

    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const DAYS_MINI = ["S", "M", "T", "W", "T", "F", "S"];

    //Format date & time
    function pad(num) {
        return num.toString().padStart(2, '0');
    }

    function isMobileView() {
        return window.innerWidth < 640;
    }

    function toLocalISO(d) {
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":00";
    }

    function dateKey(d) {
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }

    function sameDay(a, b) { return dateKey(a) === dateKey(b); }

    function startOfWeek(d) {
        const s = new Date(d);
        s.setDate(s.getDate() - s.getDay());
        s.setHours(0, 0, 0, 0);
        return s;
    }

    function getViewRange() {
        let start, end;
        if (currentView === "month") {
            start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            start.setDate(start.getDate() - start.getDay());
            end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            end.setDate(end.getDate() + (6 - end.getDay()) + 1);
        } else if (currentView === "week") {
            start = startOfWeek(currentDate);
            end = new Date(start);
            end.setDate(end.getDate() + 7);
        } else {
            start = new Date(currentDate);
            start.setHours(0, 0, 0, 0);
            end = new Date(start);
            end.setDate(end.getDate() + 1);
        }
        return { start: start, end: end };
    }

    function getAgendaRange() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const end = new Date(today);
        end.setDate(end.getDate() + 2);
        return { start: today, end: end };
    }

    function showAlert(msg, type) {
        const colorMap = {
            danger: "bg-red-100 text-red-700 border-red-200",
            success: "bg-emerald-100 text-emerald-700 border-emerald-200"
        };
        const cls = colorMap[type] || colorMap.danger;
        $("#event-alert").html(
            '<div class="flex items-center justify-between gap-2 rounded-xl px-4 py-2 text-sm border mb-3 ' + cls + '">' +
            '<span>' + msg + '</span></div>'
        );
    }

    function formatTime12(d) {
        let h = d.getHours();
        const m = d.getMinutes();
        const ampm = h >= 12 ? "PM" : "AM";
        h = h % 12; if (h === 0) h = 12;
        return h + ":" + pad(m) + " " + ampm;
    }

    function formatTimeShort(d) {
        let h = d.getHours();
        const m = d.getMinutes();
        const ampm = h >= 12 ? "pm" : "am";
        h = h % 12; if (h === 0) h = 12;
        return h + ":" + pad(m) + " " + ampm;
    }

    function getEndTime(ev) {
        const start = new Date(ev.start);
        const dur = ev.duration || ((ev.type === "session" || ev.type === "session_segment") ? 60 : 30);
        return new Date(start.getTime() + dur * 60000);
    }

    // ============ Fetch events ============
    // We fetch for both the visible calendar range AND the agenda range
    let allEvents = []; // superset for agenda
    let dbEvents = [];  // DB events only (before iCal merge)
    function loadEvents() {
        const range = getViewRange();
        const agendaRange = getAgendaRange();
        // Merge ranges to get one request
        const fetchStart = range.start < agendaRange.start ? range.start : agendaRange.start;
        const fetchEnd = range.end > agendaRange.end ? range.end : agendaRange.end;

        $.getJSON("/api/events", {
            start: toLocalISO(fetchStart),
            end: toLocalISO(fetchEnd)
        }, function (data) {
            dbEvents = data;
            // Always merge with cached iCal events
            events = dbEvents.concat(icalEvents);
            allEvents = events;
            render();
            renderMiniCalendar();
            renderAgenda();
        });
    }

    // ============ Title & view button state ============
    function updateTitle() {
        let title = "";
        if (currentView === "month") {
            title = MONTHS[currentDate.getMonth()] + " " + currentDate.getFullYear();
        } else if (currentView === "week") {
            const ws = startOfWeek(currentDate);
            const we = new Date(ws); we.setDate(we.getDate() + 6);
            title = MONTHS[ws.getMonth()] + " " + ws.getDate() + " – " + (ws.getMonth() !== we.getMonth() ? MONTHS[we.getMonth()] + " " : "") + we.getDate() + ", " + we.getFullYear();
        } else {
            title = MONTHS[currentDate.getMonth()] + " " + currentDate.getDate() + ", " + currentDate.getFullYear();
        }
        $("#cal-title").text(title);

        $(".cal-view-btn").each(function () {
            const $b = $(this);
            if ($b.data("view") === currentView) {
                $b.addClass("bg-gradient-to-r from-secondary_blu  to-primary_purp to-80% text-white shadow-sm").removeClass("text-text_dark_gray bg-transparent");
            } else {
                $b.removeClass("bg-gradient-to-r from-secondary_blu  to-primary_purp to-80% text-white shadow-sm").addClass("text-text_dark_gray bg-transparent");
            }
        });
    }

    // ============ Render calendar ============
    function render() {
        updateTitle();
        const $c = $("#calendar-container");
        if (currentView === "month") renderMonth($c);
        else if (currentView === "week") renderWeek($c);
        else renderDay($c);
    }

    // ============ Mini Calendar ============
    function renderMiniCalendar() {
        const $mc = $("#mini-calendar");
        if (!$mc.length) return;

        const year = miniDate.getFullYear();
        const month = miniDate.getMonth();
        const today = new Date(); today.setHours(0, 0, 0, 0);

        let html = '<div class="select-none">';
        // Header: Month Year < >
        html += '<div class="flex items-center justify-between mb-3 pr-[8px] pl-[12px]">';
        html += '<span class="text-md roboto-semi-bold text-text_dark_gray">' + MONTHS[month] + ' ' + year + '</span>';
        html += '<div class="flex items-center gap-1">';
        html += '<button id="mini-prev" class="p-1 rounded hover:bg-gray-100 text-text_dark_graytransition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg></button>';
        html += '<button id="mini-next" class="p-1 rounded hover:bg-gray-100 text-text_dark_gray transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg></button>';
        html += '</div></div>';

        // Day-of-week header
        html += '<div class="grid grid-cols-7 mb-1">';
        for (let d = 0; d < 7; d++) {
            html += '<div class="text-center text-xs roboto-semi-bold text-text_dark_gray py-1">' + DAYS_SHORT[d] + '</div>';
        }
        html += '</div>';

        // Day cells
        const first = new Date(year, month, 1);
        const startDay = new Date(first);
        startDay.setDate(startDay.getDate() - startDay.getDay());

        html += '<div class="grid grid-cols-7">';
        for (let i = 0; i < 42; i++) {
            const cell = new Date(startDay);
            cell.setDate(cell.getDate() + i);
            const isCurrentMonth = cell.getMonth() === month;
            const isToday = sameDay(cell, today);
            const isSelected = sameDay(cell, currentDate);

            let cls = "mini-cal-cell w-8 h-8 flex items-center justify-center text-xs roboto-semi-bold text-text_dark_gray rounded-full cursor-pointer transition-all mx-auto ";
            if (isToday) {
                cls += "bg-tertiary_blu text-white roboto-semi-bold ";
            } else if (isSelected) {
                cls += "bg-tertiary_blu/50 text-white roboto-semi-bold ";
            } else if (isCurrentMonth) {
                cls += "text-text_dark_gray hover:bg-gray-100 ";
            } else {
                cls += "text-text_unactive_day hover:bg-gray-50 ";
            }

            html += '<div class="' + cls + '" data-date="' + dateKey(cell) + '">' + cell.getDate() + '</div>';
        }
        html += '</div></div>';

        $mc.html(html);
    }

    // Mini calendar navigation
    $(document).on("click", "#mini-prev", function () {
        miniDate.setMonth(miniDate.getMonth() - 1);
        renderMiniCalendar();
    });
    $(document).on("click", "#mini-next", function () {
        miniDate.setMonth(miniDate.getMonth() + 1);
        renderMiniCalendar();
    });

    // Click mini calendar cell → navigate main calendar
    $(document).on("click", ".mini-cal-cell", function () {
        const parts = $(this).data("date").split("-");
        currentDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        loadEvents();
    });

    // ============ Agenda Panel ============
    function renderAgenda() {
        const $agendaPanels = $("#agenda-panel, #mobile-agenda-panel");
        if (!$agendaPanels.length) return;

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

        const todayEvents = getEventsForDateFromAll(today);
        const tomorrowEvents = getEventsForDateFromAll(tomorrow);

        let html = '';

        // Today section
        html += '<div class="mb-5">';
        html += '<div class="flex items-center gap-2 mb-2">';
        html += '<span class="text-sm roboto-semi-bold text-tertiary_blu">Today</span>';
        html += '<span class="text-xs text-tertiary_blu roboto-regular">' + (today.getMonth() + 1) + '/' + today.getDate() + '/' + today.getFullYear() + '</span>';
        html += '</div>';

        if (todayEvents.length === 0) {
            html += '<p class="text-xs text-gray-400 roboto-regular-italic">No events</p>';
        } else {
            for (let i = 0; i < todayEvents.length; i++) {
                html += renderAgendaItem(todayEvents[i]);
            }
        }
        html += '</div>';

        // Tomorrow section
        html += '<div>';
        html += '<div class="flex items-center gap-2 mb-2">';
        html += '<span class="text-sm roboto-semi-bold text-text_dark_gray">Tomorrow</span>';
        html += '<span class="text-xs roboto-regular text-text_dark_gray">' + (tomorrow.getMonth() + 1) + '/' + tomorrow.getDate() + '/' + tomorrow.getFullYear() + '</span>';
        html += '</div>';

        if (tomorrowEvents.length === 0) {
            html += '<p class="text-xs text-gray-400 roboto-regular-italic">No events</p>';
        } else {
            for (let j = 0; j < tomorrowEvents.length; j++) {
                html += renderAgendaItem(tomorrowEvents[j]);
            }
        }
        html += '</div>';

        $agendaPanels.html(html);
    }

    function renderAgendaItem(ev) {
        const start = new Date(ev.start);
        const end = getEndTime(ev);
        const timeStr = formatTime12(start) + " - " + formatTime12(end);
        const dotColor = ev.color || "#725AEA";
        let html = '<div class="flex items-start gap-2.5 py-2 cursor-pointer agenda-event hover:bg-gray-50 rounded-lg px-1 -mx-1 transition-colors" data-id="' + ev.id + '" data-type="' + ev.type + '">';
        html += '<div class="w-2 h-2 rounded-full mt-1.5 shrink-0" style="background:' + dotColor + '"></div>';
        html += '<div class="min-w-0">';
        html += '<div class="text-xs text-text_dark_gray roboto-regular">' + timeStr + '</div>';
        html += '<div class="text-sm text-text_dark_gray roboto-semi-bold truncate">' + escapeHtml(ev.title) + '</div>';
        html += '</div></div>';
        return html;
    }

    function getEventsForDateFromAll(date) {
        const key = dateKey(date);
        return allEvents.filter(function (ev) {
            return dateKey(new Date(ev.start)) === key;
        }).sort(function (a, b) {
            return new Date(a.start) - new Date(b.start);
        });
    }

    // Show summary popup
    function showSummaryModal(ev) {
        currentSummaryEvent = ev;
        const startDate = new Date(ev.start);
        const endDate = getEndTime(ev);

        // Set title and color
        $("#summary-title").text(ev.title);
        $("#summary-color-dot").css("background", ev.color || "#725AEA");

        // Set date and time
        const dateStr = startDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const timeStr = formatTime12(startDate) + " - " + formatTime12(endDate);

        $("#summary-datetime").text(dateStr + " at " + timeStr);

        // Set repeat info
        const repeatLabels = {
            none: "Does not repeat",
            daily: "Daily",
            weekly: "Weekly",
            monthly: "Monthly"
        };

        $("#summary-repeat").text(repeatLabels[ev.repeat_type || "none"] || "Does not repeat");

        // Show/hide fields based on event type
        if (ev.type === "session" || ev.type === "session_segment") {
            $("#summary-duration-container").show();
            $("#summary-notes-container").show();
            $("#summary-description-container").hide();
            $("#summary-completed-container").hide();

            // Set duration
            const duration = ev.duration || 60;
            const hours = Math.floor(duration / 60);
            const minutes = duration % 60;
            let durationText = hours > 0 ? hours + " hr" + (hours > 1 ? "s" : "") : "";
            durationText += minutes > 0 ? (durationText ? " " : "") + minutes + " min" : "";
            $("#summary-duration").text(durationText || "60 min");

            // Set notes
            let notesText = ev.notes || "No notes";
            if (ev.type === "session_segment") {
                notesText = "Logged study time (timer). " + notesText;
            }
            $("#summary-notes").text(notesText);
        } else if (ev.type === "ical") {
            $("#summary-duration-container").show();
            $("#summary-notes-container").hide();
            $("#summary-description-container").show();
            $("#summary-completed-container").hide();

            // Show duration for iCal events
            const icalDur = ev.duration || 60;
            const icalH = Math.floor(icalDur / 60);
            const icalM = icalDur % 60;
            let icalDurText = icalH > 0 ? icalH + " hr" + (icalH > 1 ? "s" : "") : "";
            icalDurText += icalM > 0 ? (icalDurText ? " " : "") + icalM + " min" : "";
            if (ev.allDay) icalDurText = "All day";
            $("#summary-duration").text(icalDurText || "60 min");

            const descParts = [];
            if (ev.location) descParts.push("Location: " + ev.location);
            if (ev.description) descParts.push(ev.description);
            descParts.push("Calendar: " + (ev.calendarName || "iCal"));
            $("#summary-description").text(descParts.join("\n"));
        } else {
            $("#summary-duration-container").hide();
            $("#summary-notes-container").hide();
            $("#summary-description-container").show();
            $("#summary-completed-container").show();

            // Set description
            $("#summary-description").text(ev.description || "No description");

            // Set completed status
            $("#summary-completed").text(ev.completed ? "Completed ✓" : "Not completed");
            $("#summary-completed").removeClass().addClass("text-sm font-medium " +
                (ev.completed ? "text-green-600" : "text-gray-800"));
        }

        // Hide edit/delete for iCal events (read-only)
        if (ev.readonly || ev.type === "session_segment") {
            $("#summary-edit-btn").hide();
            $("#summary-delete-btn").hide();
        } else {
            $("#summary-edit-btn").show();
            $("#summary-delete-btn").show();
        }

        $("#event-summary-modal").removeClass("hidden");
    }

    // Summary modal handlers
    $("#summary-close-btn").on("click", function () {
        $("#event-summary-modal").addClass("hidden");
        currentSummaryEvent = null;
    });

    $("#event-summary-modal").on("click", function (e) {
        if (e.target === this) {
            $("#event-summary-modal").addClass("hidden");
            currentSummaryEvent = null;
        }
    });

    // Edit from summary - open the main edit modal
    $("#summary-edit-btn").on("click", function () {
        if (currentSummaryEvent) {
            $("#event-summary-modal").addClass("hidden");
            openModal(currentSummaryEvent);
            currentSummaryEvent = null;
        }
    });

    // Delete from summary
    $("#summary-delete-btn").on("click", function () {
        if (!currentSummaryEvent) return;
        if (!confirm("Delete this event?")) return;

        const eventToDelete = currentSummaryEvent;
        const deleteId = eventToDelete.original_id || eventToDelete.id;
        $.ajax({
            url: "/api/events/" + deleteId + "?type=" + eventToDelete.type,
            method: "DELETE",
            success: function () {
                $("#event-summary-modal").addClass("hidden");
                currentSummaryEvent = null;
                loadEvents();
            },
            error: function (xhr) {
                const msg = xhr.responseJSON ? xhr.responseJSON.message : "Delete failed.";
                showAlert(msg, "danger");
            }
        });
    });

    // Click agenda event → open edit modal
    $(document).on("click", ".agenda-event", function (e) {
        e.stopPropagation();
        const id = $(this).data("id");
        const type = $(this).data("type");
        const ev = allEvents.find(function (x) { return x.id === id && x.type === type; });
        if (ev) showSummaryModal(ev);
    });

    // -- Month view --
    function renderMonth($c) {
        let html = '<div class="grid grid-cols-7 h-full" style="grid-template-rows: auto repeat(6, 1fr);">';
        // Header row
        for (let d = 0; d < 7; d++) {
            html += '<div class="px-2 py-2 text-center text-xs roboto-light text-black border-b border-gray-100">' + DAYS_SHORT[d] + '</div>';
        }

        const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const startDay = new Date(first); startDay.setDate(startDay.getDate() - startDay.getDay());
        const today = new Date(); today.setHours(0, 0, 0, 0);

        for (let i = 0; i < 42; i++) {
            const cell = new Date(startDay);
            cell.setDate(cell.getDate() + i);
            const isCurrentMonth = cell.getMonth() === currentDate.getMonth();
            const isToday = sameDay(cell, today);
            const dayEvents = getEventsForDate(cell);

            html += '<div class="border-b border-r border-gray-100 p-1.5 cursor-pointer hover:bg-tertiary_blu/10 transition-colors overflow-hidden cal-cell" data-date="' + dateKey(cell) + '">';
            html += '<div class="text-xs roboto-semi-bold mb-1 ' + (isToday ? 'bg-tertiary_blu text-white w-6 h-6 rounded-full flex items-center justify-center' : (isCurrentMonth ? 'text-black' : 'text-text_unactive_day')) + '">' + cell.getDate() + '</div>';

            for (let e = 0; e < Math.min(dayEvents.length, 3); e++) {
                const ev = dayEvents[e];
                const evStart = new Date(ev.start);
                const timeLabel = formatTimeShort(evStart);
                const mobile = isMobileView();

                html += '<div class="event-pill flex items-center gap-1 text-xs py-0.5 mb-0.5 truncate cursor-pointer group" data-id="' + ev.id + '" data-type="' + ev.type + '">';
                html += '<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:' + ev.color + '"></span>';

                if (!mobile) {
                    html += '<span class="text-black roboto-regular shrink-0">' + timeLabel + '</span>';
                }

                html += '<span class="' + (mobile ? 'text-[11px] overflow-hidden whitespace-nowrap' : 'text-xs truncate') + ' text-black roboto-semi-bold">' + escapeHtml(ev.title) + '</span>';
                html += '</div>';
            }
            if (dayEvents.length > 3) {
                html += '<div class="text-xs text-gray-400 roboto-regular pl-3">+' + (dayEvents.length - 3) + ' more</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        $c.html(html);
    }

    // -- Week view --
    function renderWeek($c) {
        const ws = startOfWeek(currentDate);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const hours = [];
        for (let h = 0; h < 24; h++) hours.push(h);

        let html = '<div class="w-full flex flex-col h-full">';
        // Header row with day columns
        html += '<div class="grid grid-cols-8 border-b border-gray-200 shrink-0">';
        html += '<div class="w-16 shrink-0"></div>';
        for (let d = 0; d < 7; d++) {
            const dayDate = new Date(ws); dayDate.setDate(dayDate.getDate() + d);
            const isTodayCol = sameDay(dayDate, today);
            html += '<div class="flex-1 text-center py-2 border-l border-gray-100">';
            html += '<div class="text-xs roboto-light' + (isTodayCol ? 'text-tertiary_blu' : 'text-black') + '">' + DAYS_SHORT[d] + '</div>';
            if (isTodayCol) {
                html += '<div class="w-8 h-8 rounded-full bg-tertiary_blu text-white flex items-center justify-center mx-auto text-sm roboto-bold">' + dayDate.getDate() + '</div>';
            } else {
                html += '<div class="text-lg roboto-semi-bold text-black leading-8">' + dayDate.getDate() + '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        // All-day row (for events without specific time — simplified)
        // Time grid
        html += '<div class="flex-1 overflow-y-auto" id="week-scroll">';
        html += '<div class="grid grid-cols-8 relative" style="height:' + (hours.length * 60) + 'px">';

        // Hour labels + grid lines
        for (let hi = 0; hi < hours.length; hi++) {
            const hour = hours[hi];
            const topPx = hi * 60;
            const label = hour === 0 ? '12:00 am' : (hour < 12 ? hour + ':00 am' : (hour === 12 ? '12:00 pm' : (hour - 12) + ':00 pm'));
            html += '<div class="absolute text-xs text-text_dark_gray roboto-regular text-right pr-2 pt-2" style="top:' + (topPx - 8) + 'px;width:4rem">' + label + '</div>';
            html += '<div class="absolute border-t border-gray-100" style="top:' + topPx + 'px;left:4rem;right:0"></div>';
        }

        //Adding vertical borders
        const colWidthPercent = 100 / 8;

        for (let ci = 0; ci < 8; ci++) {
            const leftPercent = ci * colWidthPercent;

            html += '<div class="absolute border-l border-gray-100" ' +
                'style="top:0; bottom:0; left:' + leftPercent + '%"></div>';
        }

        // Events
        const firstHour = hours[0];
        for (let d2 = 0; d2 < 7; d2++) {
            const dayDate2 = new Date(ws); dayDate2.setDate(dayDate2.getDate() + d2);
            const dayEvts = getEventsForDate(dayDate2);
            for (let ei = 0; ei < dayEvts.length; ei++) {
                const ev = dayEvts[ei];
                const evDate = new Date(ev.start);
                const evEnd = getEndTime(ev);
                let topMin = (evDate.getHours() - firstHour) * 60 + evDate.getMinutes();
                const height = (ev.type === "session" || ev.type === "session_segment") ? (ev.duration || 60) : 30;
                if (topMin < 0) { topMin = 0; }
                const leftPct = ((d2 + 1) / 8 * 100);
                const widthPct = (1 / 8 * 100);
                const bgColor = ev.color || "#725AEA";
                // Lighter background with colored left border
                const mobile = isMobileView();

                html += '<div class="absolute rounded-lg px-2 py-1 overflow-hidden cursor-pointer event-pill shadow-sm ' +
                    (mobile ? '' : 'border-l-4') +
                    '" style="' +
                    (mobile ? '' : 'border-color:' + bgColor + ';') +
                    'background:' + bgColor + '20;top:' + topMin + 'px;left:' + leftPct + '%;width:calc(' + widthPct + '% - 4px);height:' + height + 'px" data-id="' + ev.id + '" data-type="' + ev.type + '">';

                if (!mobile) {
                    html += '<div class="text-[10px] montserrat-regular leading-tight truncate" style="color:' + bgColor + '">' +
                        formatTimeShort(evDate) + ' - ' + formatTimeShort(evEnd) +
                        '</div>';
                }

                html += '<div class="' +
                    (mobile ? 'text-[11px] overflow-hidden whitespace-nowrap' : 'text-xs truncate') +
                    ' montserrat-semi-bold leading-tight" style="color:' + bgColor + '">' +
                    escapeHtml(ev.title) +
                    '</div>';

                html += '</div>';
            }
        }

        html += '</div></div></div>';
        $c.html(html);

        // Scroll to current time or first hour
        const $scroll = $("#week-scroll");
        if ($scroll.length) {
            const now = new Date();
            const scrollTo = (now.getHours() - hours[0]) * 60 + now.getMinutes() - 60;
            $scroll.scrollTop(Math.max(0, scrollTo));
        }
        drawCurrentTimeLine();
    }

    // -- Day view --
    function renderDay($c) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const isToday = sameDay(currentDate, today);
        const dayEvents = getEventsForDate(currentDate);
        const hours = [];
        for (let h = 0; h < 24; h++) hours.push(h);

        let html = '<div class="flex flex-col h-full">';
        // Day header
        html += '<div class="px-4 py-3 border-b border-gray-200 shrink-0">';
        html += '<div class="text-sm pl-[10px] roboto-semi-bold ' + (isToday ? 'text-tertiary_blu' : 'text-text_dark_gray') + '">' + DAYS_SHORT[currentDate.getDay()] + '</div>';
        if (isToday) {
            html += '<div class="w-10 h-10 rounded-full bg-tertiary_blu text-white flex items-center justify-center text-xl roboto-semi-bold">' + currentDate.getDate() + '</div>';
        } else {
            html += '<div class="text-2xl roboto-semi-bold text-text_dark_gray>' + currentDate.getDate() + '</div>';
        }
        html += '</div>';

        // Time grid
        const firstHour = hours[0];
        html += '<div class="flex-1 overflow-y-auto" id="day-scroll">';
        html += '<div class="relative" style="height:' + (hours.length * 60) + 'px">';
        for (let hi = 0; hi < hours.length; hi++) {
            const hour = hours[hi];
            const topPx = hi * 60;
            const label = hour === 0 ? '12:00 am' : (hour < 12 ? hour + ':00 am' : (hour === 12 ? '12:00 pm' : (hour - 12) + ':00 pm'));
            html += '<div class="absolute pt-2 left-0 text-xs text-text_dark_gray roboto-regular w-20 text-right pr-3" style="top:' + (topPx - 8) + 'px">' + label + '</div>';
            html += '<div class="absolute border-t border-gray-100" style="top:' + topPx + 'px;left:5rem;right:0"></div>';
            html += '<div class="absolute cursor-pointer hover:bg-tertiary_blu/10 transition-colors cal-hour-cell" style="top:' + topPx + 'px;left:5rem;right:0;height:60px" data-hour="' + hour + '"></div>';
        }

        // Events
        for (let ei = 0; ei < dayEvents.length; ei++) {
            const ev = dayEvents[ei];
            const evDate = new Date(ev.start);
            const evEnd = getEndTime(ev);
            let topMin = (evDate.getHours() - firstHour) * 60 + evDate.getMinutes();
            const height = ((ev.type === "session" || ev.type === "session_segment") ? (ev.duration || 60) : 30) - 15;
            if (topMin < 0) { topMin = 0; }
            const bgColor = ev.color || "#6366f1";
            html += '<div class="absolute my-2 rounded-lg px-3 py-1.5 overflow-hidden cursor-pointer event-pill border-l-4 shadow-sm" style="border-color:' + bgColor + ';background:' + bgColor + '20;top:' + topMin + 'px;left:5.5rem;right:0.5rem;height:' + height + 'px" data-id="' + ev.id + '" data-type="' + ev.type + '">';
            html += '<div class="text-xs montserrat-regular" style="color:' + bgColor + '">' + formatTimeShort(evDate) + ' - ' + formatTimeShort(evEnd) + '</div>';
            html += '<div class="text-sm montserrat-semi-bold" style="color:' + bgColor + '">' + escapeHtml(ev.title) + '</div>';
            html += '</div>';
        }

        html += '</div></div></div>';
        $c.html(html);

        // Scroll to current time or first hour
        const $scroll = $("#day-scroll");
        if ($scroll.length) {
            const now = new Date();
            const scrollTo = (now.getHours() - hours[0]) * 60 + now.getMinutes() - 60;
            $scroll.scrollTop(Math.max(0, scrollTo));
        }
        drawCurrentTimeLine();
    }

    // ============ Current time indicator ============
    function drawCurrentTimeLine() {
        $(".current-time-line").remove();
        const now = new Date();
        const firstHour = 0;
        const topMin = (now.getHours() - firstHour) * 60 + now.getMinutes();

        if (currentView === "week") {
            const $grid = $("#week-scroll .grid");
            if (!$grid.length) return;
            let line = '<div class="current-time-line absolute z-10" style="top:' + topMin + 'px;left:4rem;right:0;pointer-events:none">';
            line += '<div class="flex items-center"><div class="w-2 h-2 rounded-full bg-red-500 -ml-1"></div><div class="flex-1 border-t-2 border-red-500"></div></div>';
            line += '</div>';
            $grid.append(line);
        } else if (currentView === "day") {
            const $rel = $("#day-scroll > .relative");
            if (!$rel.length) return;
            let line2 = '<div class="current-time-line absolute z-10" style="top:' + topMin + 'px;left:5rem;right:0;pointer-events:none">';
            line2 += '<div class="flex items-center"><div class="w-2 h-2 rounded-full bg-red-500 -ml-1"></div><div class="flex-1 border-t-2 border-red-500"></div></div>';
            line2 += '</div>';
            $rel.append(line2);
        }
    }

    // Update time indicator every minute
    setInterval(drawCurrentTimeLine, 60000);

    // ============ Click on week time slots ============
    $(document).on("click", "#week-scroll .grid", function (e) {
        if ($(e.target).hasClass("event-pill") || $(e.target).closest(".event-pill").length) return;
        if ($(e.target).hasClass("current-time-line") || $(e.target).closest(".current-time-line").length) return;
        const $grid = $(this);
        const rect = $grid[0].getBoundingClientRect();
        const scrollTop = $("#week-scroll").scrollTop();
        const y = e.clientY - rect.top + scrollTop;
        const clickedHour = Math.floor(y / 60);
        const clickedMin = Math.floor((y % 60) / 15) * 15;
        // Determine which day column was clicked
        const x = e.clientX - rect.left;
        const colWidth = rect.width / 8;
        const dayCol = Math.floor(x / colWidth) - 1;
        if (dayCol < 0 || dayCol > 6) return;
        const ws = startOfWeek(currentDate);
        const clickDate = new Date(ws);
        clickDate.setDate(clickDate.getDate() + dayCol);
        openModal(null, dateKey(clickDate), pad(clickedHour) + ":" + pad(clickedMin));
    });

    function getEventsForDate(date) {
        const key = dateKey(date);
        return events.filter(function (ev) {
            return dateKey(new Date(ev.start)) === key;
        }).sort(function (a, b) {
            return new Date(a.start) - new Date(b.start);
        });
    }

    function escapeHtml(str) {
        return $("<span>").text(str).html();
    }

    // ============ Navigation ============
    $("#cal-prev").on("click", function () {
        if (currentView === "month") currentDate.setMonth(currentDate.getMonth() - 1);
        else if (currentView === "week") currentDate.setDate(currentDate.getDate() - 7);
        else currentDate.setDate(currentDate.getDate() - 1);
        loadEvents();
    });

    $("#cal-next").on("click", function () {
        if (currentView === "month") currentDate.setMonth(currentDate.getMonth() + 1);
        else if (currentView === "week") currentDate.setDate(currentDate.getDate() + 7);
        else currentDate.setDate(currentDate.getDate() + 1);
        loadEvents();
    });

    $("#cal-today").on("click", function () {
        currentDate = new Date();
        miniDate = new Date();
        loadEvents();
    });

    $(".cal-view-btn").on("click", function () {
        currentView = $(this).data("view");
        loadEvents();
    });

    // ============ Click on cell to create event ============
    $(document).on("click", ".cal-cell", function (e) {
        if ($(e.target).hasClass("event-pill") || $(e.target).closest(".event-pill").length) return;
        const date = $(this).data("date");
        openModal(null, date, "09:00");
    });

    $(document).on("click", ".cal-hour-cell", function () {
        const hour = parseInt($(this).data("hour"));
        openModal(null, dateKey(currentDate), pad(hour) + ":00");
    });

    // ============ Click on event to edit ============
    $(document).on("click", ".event-pill", function (e) {
        e.stopPropagation();
        const id = $(this).data("id");
        const type = $(this).data("type");
        const ev = events.find(function (x) { return x.id === id && x.type === type; });
        if (ev) showSummaryModal(ev);
    });

    // ============ View Modal (NEW) ============
    function openViewModal(ev) {
        $("#event-view-modal").removeClass("hidden");

        const start = new Date(ev.start);
        const end = getEndTime(ev);

        let html = `
            <div><strong>${escapeHtml(ev.title)}</strong></div>
            <div>${formatTime12(start)} - ${formatTime12(end)}</div>
            <div>${start.toDateString()}</div>
        `;

        if (ev.type === "session" && ev.notes) {
            html += `<div>Notes: ${escapeHtml(ev.notes)}</div>`;
        }

        if (ev.type === "task" && ev.description) {
            html += `<div>Description: ${escapeHtml(ev.description)}</div>`;
        }

        $("#view-content").html(html);
        $("#event-view-modal").data("event", ev);
    }

    // ============ Modal ============
    function openModal(ev, date, time) {
        editingEvent = ev || null;
        isEditMode = true; // Always in edit mode when opened from summary
        $("#event-alert").html("");

        if (ev) {
            // Editing existing event
            $("#event-modal-title").text("Edit Event");
            $("#event-id").val(ev.id);

            // Enable all form fields for editing
            $("#event-form input, #event-form textarea, .event-type-btn, .color-dot").prop("disabled", false);
            $(".event-type-btn, .color-dot").removeClass("opacity-50 cursor-not-allowed");

            const editStart = ev.is_repeated_occurrence && ev.original_start ? ev.original_start : ev.start;
            const evDate = new Date(editStart);
            selectType(ev.type);
            $("#event-id").val(ev.original_id || ev.id);
            $("#event-title").val(ev.title);
            $("#event-date").val(dateKey(evDate));
            $("#event-time").val(pad(evDate.getHours()) + ":" + pad(evDate.getMinutes()));
            $("#event-repeat").val(ev.repeat_type || "none");
            $("#event-repeat-until").val(ev.repeat_until || "");
            updateRepeatUntilVisibility();

            if (ev.type === "session") {
                $("#event-reminders").val(ev.duration || 60);
                $("#event-notes").val(ev.notes || "");
                selectColor(ev.color || "#6366f1");
                $("#event-unit").val(ev.unit_id || "");
            } else {
                $("#event-reminders").val(ev.duration || 60);
                selectColor(ev.color || "#f59e0b");
                $("#event-description").val(ev.description || "");
                $("#event-completed").prop("checked", ev.completed);
            }

            // Set save button text
            $("#event-save-btn").text("Update").removeClass("bg-indigo-600").addClass("bg-indigo-700");
        } else {
            // Creating new event
            $("#event-modal-title").text("New Event");
            $("#event-id").val("");
            $("#event-form")[0].reset();

            // Enable all form fields
            $("#event-form input, #event-form textarea, .event-type-btn, .color-dot").prop("disabled", false);
            $(".event-type-btn, .color-dot").removeClass("opacity-50 cursor-not-allowed");

            selectType("session");
            selectColor("#6366f1");
            $("#event-repeat").val("none");
            $("#event-repeat-until").val("");
            updateRepeatUntilVisibility();
            $("#event-unit").val("");
            if (date) $("#event-date").val(date);
            if (time) $("#event-time").val(time);

            // Set save button text
            $("#event-save-btn").text("Save").removeClass("bg-indigo-700").addClass("bg-indigo-600");
        }

        $("#event-modal").removeClass("hidden");
    }

    function closeModal() {
        $("#event-modal").addClass("hidden");
        editingEvent = null;
        isEditMode = false;

        // Reset form state
        $("#event-form input, #event-form textarea, .event-type-btn, .color-dot").prop("disabled", false);
        $(".event-type-btn, .color-dot").removeClass("opacity-50 cursor-not-allowed");
        $("#event-save-btn").text("Save").removeClass("bg-indigo-700").addClass("bg-indigo-600");
    }

    $("#event-modal-close, #event-cancel-btn").on("click", closeModal);
    $("#event-modal").on("click", function (e) {
        if (e.target === this) closeModal();
    });

    // ============ Type & color selection ============
    function selectType(type) {
        selectedType = type;
        $(".event-type-btn").each(function () {
            if ($(this).data("type") === type) {
                $(this).addClass("border-indigo-500 bg-indigo-50 text-indigo-700").removeClass("border-gray-200 text-gray-600");
            } else {
                $(this).removeClass("border-indigo-500 bg-indigo-50 text-indigo-700").addClass("border-gray-200 text-gray-600");
            }
        });
        $("#shared-event-fields").removeClass("hidden");
        if (type === "session") {
            $("#session-fields").removeClass("hidden");
            $("#task-fields").addClass("hidden");
            $("#event-title-label").text("Task Name");
            $("#event-title").attr("placeholder", "Description...");
        } else {
            $("#session-fields").addClass("hidden");
            $("#task-fields").removeClass("hidden");
            $("#event-title-label").text("Title");
            $("#event-title").attr("placeholder", "e.g. Submit assignment");
        }
    }

    $(".event-type-btn").on("click", function () {
        selectType($(this).data("type"));
    });

    function updateRepeatUntilVisibility() {
        const repeatType = $("#event-repeat").val() || "none";

        if (repeatType === "none") {
            $("#repeat-until-row").addClass("hidden");
            $("#event-repeat-until").val("");
        } else {
            $("#repeat-until-row").removeClass("hidden");
        }
    }

    $("#event-repeat").on("change", updateRepeatUntilVisibility);

    function selectColor(color) {
        selectedColor = color;
        $(".color-dot").each(function () {
            if ($(this).data("color") === color) {
                $(this).addClass("ring-2 ring-offset-2 ring-indigo-400 scale-110");
            } else {
                $(this).removeClass("ring-2 ring-offset-2 ring-indigo-400 scale-110");
            }
        });
    }

    $(".color-dot").on("click", function () {
        selectColor($(this).data("color"));
    });

    // ============ View modal buttons ============
    $("#view-close").on("click", function () {
        $("#event-view-modal").addClass("hidden");
    });

    $("#view-edit").on("click", function () {
        const ev = $("#event-view-modal").data("event");
        $("#event-view-modal").addClass("hidden");
        openModal(ev);
    });

    $("#view-delete").on("click", function () {
        const ev = $("#event-view-modal").data("event");
        if (!ev) return;

        if (!confirm("Delete this event?")) return;

        $.ajax({
            url: "/api/events/" + ev.id + "?type=" + ev.type,
            method: "DELETE",
            success: function () {
                $("#event-view-modal").addClass("hidden");
                loadEvents();
            },
            error: function () {
                alert("Delete failed");
            }
        });
    });

    // ============ Add event button ============
    $("#add-event-btn, #add-event-btn-mobile").on("click", function () {
        const todayStr = dateKey(new Date());
        openModal(null, todayStr, "09:00");
    });

    // ============ Save event ============
    $("#event-form").on("submit", function (e) {
        e.preventDefault();

        const id = $("#event-id").val();
        const title = $("#event-title").val().trim();
        const date = $("#event-date").val();
        const time = $("#event-time").val();
        const repeatType = $("#event-repeat").val() || "none";
        const repeatUntil = $("#event-repeat-until").val() || "";

        if (!title || !date || !time) {
            showAlert("Please fill in all required fields.", "danger");
            return;
        }

        if (repeatType !== "none" && !repeatUntil) {
            showAlert("Please choose a repeat until date.", "danger");
            return;
        }

        if (repeatType !== "none" && repeatUntil < date) {
            showAlert("Repeat until date cannot be before the start date.", "danger");
            return;
        }

        const startISO = date + "T" + time + ":00";
        const payload = {
            type: selectedType,
            title: title,
            start: startISO,
            repeat_type: repeatType,
            repeat_until: repeatType === "none" ? "" : repeatUntil
        };

        if (selectedType === "session") {
            payload.duration = parseInt($("#event-reminders").val()) || 60;
            payload.notes = $("#event-notes").val();
            payload.color = selectedColor;
            payload.unit_id = $("#event-unit").val() || null;
        } else {
            payload.duration = parseInt($("#event-reminders").val()) || 30;
            payload.color = selectedColor;
            payload.description = $("#event-description").val();
            payload.completed = $("#event-completed").is(":checked");
        }

        const $btn = $("#event-save-btn");
        const $spinner = $("#event-spinner");
        $btn.prop("disabled", true);
        $spinner.removeClass("hidden");

        const method = id ? "PUT" : "POST";
        const url = id ? "/api/events/" + id : "/api/events";

        $.ajax({
            url: url,
            method: method,
            contentType: "application/json",
            data: JSON.stringify(payload),
            success: function () {
                closeModal();
                loadEvents();
                $btn.prop("disabled", false);
                $spinner.addClass("hidden");
            },
            error: function (xhr) {
                const msg = xhr.responseJSON ? xhr.responseJSON.message : "Save failed.";
                showAlert(msg, "danger");
                $btn.prop("disabled", false);
                $spinner.addClass("hidden");
            }
        });
    });

    // ============ Delete event ============
    $("#event-delete-btn").on("click", function () {
        if (!editingEvent) return;
        if (!confirm("Delete this event?")) return;

        $.ajax({
            url: "/api/events/" + (editingEvent.original_id || editingEvent.id) + "?type=" + editingEvent.type,
            method: "DELETE",
            success: function () {
                closeModal();
                loadEvents();
            },
            error: function (xhr) {
                const msg = xhr.responseJSON ? xhr.responseJSON.message : "Delete failed.";
                showAlert(msg, "danger");
            }
        });
    });

    // ============ Initial load ============
    loadEvents();

    // Load units for event modal (current semester only)
    $.getJSON("/api/semesters/current", function (sem) {
        let url = "/api/units?archived=false";
        if (sem && sem.id) url += "&semester_id=" + sem.id;
        $.getJSON(url, function (data) {
            const $sel = $("#event-unit");
            $sel.html('<option value="">None</option>');
            data.forEach(function (u) {
                $sel.append('<option value="' + u.id + '">' + $("<span>").text((u.code ? u.code + " — " : "") + u.name).html() + '</option>');
            });
        });
    });

    // ============ iCal Calendar Integration ============
    let icalEvents = [];  // parsed iCal events (read-only, not in DB)
    let icalRefreshTimer = null;
    const ICAL_REFRESH_INTERVAL = 5 * 60 * 1000; // refresh every 5 minutes

    function loadICalCalendars(silent) {
        $.getJSON("/api/ical-calendars", function (calendars) {
            let newIcalEvents = [];
            let pending = 0;
            const visibleCals = calendars.filter(function (c) { return c.visible; });

            if (visibleCals.length === 0) {
                icalEvents = [];
                mergeICalEvents();
                return;
            }

            visibleCals.forEach(function (cal) {
                pending++;
                $.get("/get_ical", { url: cal.url }, function (data) {
                    const parsed = parseICalData(data, cal.color, cal.name);
                    newIcalEvents = newIcalEvents.concat(parsed);
                }).always(function () {
                    pending--;
                    if (pending === 0) {
                        icalEvents = newIcalEvents;
                        mergeICalEvents();
                    }
                });
            });
        });
    }

    // Unfold iCal lines (RFC 5545: lines starting with space/tab are continuations)
    function unfoldICalLines(raw) {
        return raw.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
    }

    function parseICalDate(dt) {
        // Parse iCal date or datetime string into a JS Date
        // Formats: 20260415, 20260415T103000, 20260415T103000Z
        if (!dt) return null;
        dt = dt.replace(/Z$/, "");
        const year = parseInt(dt.slice(0, 4), 10);
        const month = parseInt(dt.slice(4, 6), 10) - 1;
        const day = parseInt(dt.slice(6, 8), 10);
        let hour = 0, minute = 0, second = 0;
        if (dt.length >= 13) {
            hour = parseInt(dt.slice(9, 11), 10);
            minute = parseInt(dt.slice(11, 13), 10);
            second = dt.length >= 15 ? parseInt(dt.slice(13, 15), 10) : 0;
        }
        return new Date(year, month, day, hour, minute, second);
    }

    function parseICalDuration(dur) {
        // Parse iCal DURATION like PT1H30M, P1DT2H, PT45M, P7D
        if (!dur) return 0;
        let totalMin = 0;
        const dMatch = dur.match(/(\d+)D/);
        const hMatch = dur.match(/(\d+)H/);
        const mMatch = dur.match(/(\d+)M/);
        if (dMatch) totalMin += parseInt(dMatch[1], 10) * 1440;
        if (hMatch) totalMin += parseInt(hMatch[1], 10) * 60;
        if (mMatch) totalMin += parseInt(mMatch[1], 10);
        return totalMin || 60; // default 60min if unparseable
    }

    function expandRRule(rrule, dtstart, limitYears) {
        // Basic RRULE expansion for DAILY, WEEKLY, MONTHLY, YEARLY
        // Returns array of Date objects for occurrences
        const dates = [];
        if (!rrule) return dates;

        const parts = {};
        rrule.replace(/^RRULE:/i, "").split(";").forEach(function (p) {
            const kv = p.split("=");
            if (kv.length === 2) parts[kv[0].toUpperCase()] = kv[1];
        });

        const freq = parts.FREQ;
        if (!freq) return dates;

        const count = parts.COUNT ? parseInt(parts.COUNT, 10) : null;
        const until = parts.UNTIL ? parseICalDate(parts.UNTIL) : null;
        const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1;
        const byDay = parts.BYDAY ? parts.BYDAY.split(",") : null;

        // Limit to prevent infinite loops
        const maxDate = new Date(dtstart);
        maxDate.setFullYear(maxDate.getFullYear() + (limitYears || 2));
        if (until && until < maxDate) maxDate = until;

        const maxOccurrences = count || 520; // ~10 years weekly
        const current = new Date(dtstart);
        const dayMap = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

        if (freq === "DAILY") {
            for (let i = 0; i < maxOccurrences && current <= maxDate; i++) {
                dates.push(new Date(current));
                current.setDate(current.getDate() + interval);
            }
        } else if (freq === "WEEKLY") {
            if (byDay) {
                // Expand for specific days of week
                const targetDays = byDay.map(function (d) { return dayMap[d.replace(/[^A-Z]/g, "")] || 0; });
                const weekStart = new Date(current);
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                let occ = 0;
                while (occ < maxOccurrences && weekStart <= maxDate) {
                    for (let di = 0; di < 7 && occ < maxOccurrences; di++) {
                        const candidate = new Date(weekStart);
                        candidate.setDate(candidate.getDate() + di);
                        candidate.setHours(dtstart.getHours(), dtstart.getMinutes(), 0, 0);
                        if (candidate >= dtstart && candidate <= maxDate && targetDays.indexOf(candidate.getDay()) !== -1) {
                            dates.push(new Date(candidate));
                            occ++;
                        }
                    }
                    weekStart.setDate(weekStart.getDate() + 7 * interval);
                }
            } else {
                for (let i = 0; i < maxOccurrences && current <= maxDate; i++) {
                    dates.push(new Date(current));
                    current.setDate(current.getDate() + 7 * interval);
                }
            }
        } else if (freq === "MONTHLY") {
            for (let i = 0; i < maxOccurrences && current <= maxDate; i++) {
                dates.push(new Date(current));
                current.setMonth(current.getMonth() + interval);
            }
        } else if (freq === "YEARLY") {
            for (let i = 0; i < maxOccurrences && current <= maxDate; i++) {
                dates.push(new Date(current));
                current.setFullYear(current.getFullYear() + interval);
            }
        }

        return dates;
    }

    function parseICalData(data, color, calName) {
        const parsed = [];
        const unfolded = unfoldICalLines(data);
        const blocks = unfolded.split("BEGIN:VEVENT");

        blocks.forEach(function (block) {
            if (block.indexOf("SUMMARY") === -1) return;

            const summaryMatch = block.match(/SUMMARY:(.*)/);
            const dtstartMatch = block.match(/DTSTART[^:]*:(\d{8}T?\d{0,6}Z?)/);
            if (!summaryMatch || !dtstartMatch) return;

            let title = summaryMatch[1].replace(/\r/g, "").trim();
            // Unescape iCal special chars
            title = title.replace(/\\n/g, " ").replace(/\\,/g, ",").replace(/\\\\/g, "\\");

            const dtRaw = dtstartMatch[1];
            const dtstart = parseICalDate(dtRaw);
            if (!dtstart) return;

            const isAllDay = dtRaw.length === 8; // YYYYMMDD = all-day

            // Parse end time or duration
            const dtendMatch = block.match(/DTEND[^:]*:(\d{8}T?\d{0,6}Z?)/);
            const durationMatch = block.match(/DURATION:(.*?)\r?\n/);
            let durationMinutes = 60;
            if (dtendMatch) {
                const dtend = parseICalDate(dtendMatch[1]);
                if (dtend) durationMinutes = Math.round((dtend - dtstart) / 60000);
            } else if (durationMatch) {
                durationMinutes = parseICalDuration(durationMatch[1].trim());
            } else if (isAllDay) {
                durationMinutes = 1440;
            }

            // Parse description & location
            const descMatch = block.match(/DESCRIPTION:(.*)/);
            const locMatch = block.match(/LOCATION:(.*)/);
            const description = descMatch ? descMatch[1].replace(/\r/g, "").replace(/\\n/g, "\n").replace(/\\,/g, ",").trim() : "";
            const location = locMatch ? locMatch[1].replace(/\r/g, "").replace(/\\,/g, ",").trim() : "";

            // Check for RRULE
            const rruleMatch = block.match(/(RRULE:.*)/);
            const rrule = rruleMatch ? rruleMatch[1].replace(/\r/g, "").trim() : null;

            // Parse EXDATE (excluded dates)
            const exdates = [];
            const exdateMatches = block.match(/EXDATE[^:]*:[^\n]*/g);
            if (exdateMatches) {
                exdateMatches.forEach(function (line) {
                    const vals = line.replace(/EXDATE[^:]*:/, "").replace(/\r/g, "").split(",");
                    vals.forEach(function (v) {
                        const d = parseICalDate(v.trim());
                        if (d) exdates.push(dateKey(d));
                    });
                });
            }

            if (rrule) {
                // Expand recurring events
                const occurrences = expandRRule(rrule, dtstart, 2);
                occurrences.forEach(function (occ) {
                    // Skip excluded dates
                    if (exdates.indexOf(dateKey(occ)) !== -1) return;

                    const formatted = toLocalISO(occ);
                    parsed.push({
                        id: "ical-" + calName + "-" + formatted + "-" + title,
                        title: title,
                        start: formatted,
                        duration: durationMinutes,
                        type: "ical",
                        color: color,
                        calendarName: calName,
                        description: description,
                        location: location,
                        allDay: isAllDay,
                        readonly: true
                    });
                });
            } else {
                const formatted = toLocalISO(dtstart);
                parsed.push({
                    id: "ical-" + calName + "-" + formatted + "-" + title,
                    title: title,
                    start: formatted,
                    duration: durationMinutes,
                    type: "ical",
                    color: color,
                    calendarName: calName,
                    description: description,
                    location: location,
                    allDay: isAllDay,
                    readonly: true
                });
            }
        });
        return parsed;
    }

    function formatICalDateTime(dt) {
        const year = dt.slice(0, 4);
        const month = dt.slice(4, 6);
        const day = dt.slice(6, 8);
        const hour = dt.length >= 13 ? dt.slice(9, 11) : "00";
        const minute = dt.length >= 13 ? dt.slice(11, 13) : "00";
        return year + "-" + month + "-" + day + "T" + hour + ":" + minute;
    }

    function mergeICalEvents() {
        // Rebuild events and allEvents with DB events + iCal events
        events = dbEvents.concat(icalEvents);
        allEvents = events;
        render();
        renderMiniCalendar();
        renderAgenda();
    }

    // Start auto-refresh for iCal calendars
    function startICalAutoRefresh() {
        if (icalRefreshTimer) clearInterval(icalRefreshTimer);
        icalRefreshTimer = setInterval(function () {
            loadICalCalendars(true);
        }, ICAL_REFRESH_INTERVAL);
    }

    // Load iCal calendars after DB events are loaded
    loadICalCalendars();
    startICalAutoRefresh();
});








