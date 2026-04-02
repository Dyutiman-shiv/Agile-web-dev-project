$(function () {
    "use strict";

    // ============ State ============
    var currentView = "month"; // day | week | month
    var currentDate = new Date();
    var miniDate = new Date(); // independent mini-calendar month
    var events = [];
    var selectedColor = "#6366f1";
    var selectedType = "session";
    var editingEvent = null;
    var isEditMode = false;  // Track if we're in edit mode
    var currentSummaryEvent = null;

    var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    var MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    var DAYS_MINI = ["S", "M", "T", "W", "T", "F", "S"];

    //Format date & time
    function pad(num) {
        return num.toString().padStart(2, '0');
    }

    function toLocalISO(d) {
        return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    function dateKey(d) {
        return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
    }

    function sameDay(a, b) { return dateKey(a) === dateKey(b); }

    function startOfWeek(d) {
        var s = new Date(d);
        s.setDate(s.getDate() - s.getDay());
        s.setHours(0,0,0,0);
        return s;
    }

    function getViewRange() {
        var start, end;
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
            start.setHours(0,0,0,0);
            end = new Date(start);
            end.setDate(end.getDate() + 1);
        }
        return { start: start, end: end };
    }

    function getAgendaRange() {
        var today = new Date();
        today.setHours(0,0,0,0);
        var end = new Date(today);
        end.setDate(end.getDate() + 2);
        return { start: today, end: end };
    }

    function showAlert(msg, type) {
        var colorMap = {
            danger:  "bg-red-100 text-red-700 border-red-200",
            success: "bg-emerald-100 text-emerald-700 border-emerald-200"
        };
        var cls = colorMap[type] || colorMap.danger;
        $("#event-alert").html(
            '<div class="flex items-center justify-between gap-2 rounded-xl px-4 py-2 text-sm border mb-3 ' + cls + '">' +
            '<span>' + msg + '</span></div>'
        );
    }

    function formatTime12(d) {
        var h = d.getHours();
        var m = d.getMinutes();
        var ampm = h >= 12 ? "PM" : "AM";
        h = h % 12; if (h === 0) h = 12;
        return h + ":" + pad(m) + " " + ampm;
    }

    function formatTimeShort(d) {
        var h = d.getHours();
        var m = d.getMinutes();
        var ampm = h >= 12 ? "pm" : "am";
        h = h % 12; if (h === 0) h = 12;
        return h + ":" + pad(m) + " " + ampm;
    }

    function getEndTime(ev) {
        var start = new Date(ev.start);
        var dur = ev.type === "session" ? (ev.duration || 60) : 30;
        return new Date(start.getTime() + dur * 60000);
    }

    // ============ Fetch events ============
    // We fetch for both the visible calendar range AND the agenda range
    var allEvents = []; // superset for agenda
    function loadEvents() {
        var range = getViewRange();
        var agendaRange = getAgendaRange();
        // Merge ranges to get one request
        var fetchStart = range.start < agendaRange.start ? range.start : agendaRange.start;
        var fetchEnd = range.end > agendaRange.end ? range.end : agendaRange.end;

        $.getJSON("/api/events", {
            start: toLocalISO(fetchStart),
            end: toLocalISO(fetchEnd)
        }, function (data) {
            allEvents = data;
            events = data;
            render();
            renderMiniCalendar();
            renderAgenda();
        });
    }

    // ============ Title & view button state ============
    function updateTitle() {
        var title = "";
        if (currentView === "month") {
            title = MONTHS[currentDate.getMonth()] + " " + currentDate.getFullYear();
        } else if (currentView === "week") {
            var ws = startOfWeek(currentDate);
            var we = new Date(ws); we.setDate(we.getDate() + 6);
            title = MONTHS[ws.getMonth()] + " " + ws.getDate() + " – " + (ws.getMonth() !== we.getMonth() ? MONTHS[we.getMonth()] + " " : "") + we.getDate() + ", " + we.getFullYear();
        } else {
            title = MONTHS[currentDate.getMonth()] + " " + currentDate.getDate() + ", " + currentDate.getFullYear();
        }
        $("#cal-title").text(title);

        $(".cal-view-btn").each(function () {
            var $b = $(this);
            if ($b.data("view") === currentView) {
                $b.addClass("bg-indigo-600 text-white shadow-sm").removeClass("text-gray-500 bg-transparent");
            } else {
                $b.removeClass("bg-indigo-600 text-white shadow-sm").addClass("text-gray-500 bg-transparent");
            }
        });
    }

    // ============ Render calendar ============
    function render() {
        updateTitle();
        var $c = $("#calendar-container");
        if (currentView === "month") renderMonth($c);
        else if (currentView === "week") renderWeek($c);
        else renderDay($c);
    }

    // ============ Mini Calendar ============
    function renderMiniCalendar() {
        var $mc = $("#mini-calendar");
        if (!$mc.length) return;

        var year = miniDate.getFullYear();
        var month = miniDate.getMonth();
        var today = new Date(); today.setHours(0,0,0,0);

        var html = '<div class="select-none">';
        // Header: Month Year < >
        html += '<div class="flex items-center justify-between mb-3">';
        html += '<span class="text-sm font-bold text-gray-800">' + MONTHS[month] + ' ' + year + '</span>';
        html += '<div class="flex items-center gap-1">';
        html += '<button id="mini-prev" class="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg></button>';
        html += '<button id="mini-next" class="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg></button>';
        html += '</div></div>';

        // Day-of-week header
        html += '<div class="grid grid-cols-7 mb-1">';
        for (var d = 0; d < 7; d++) {
            html += '<div class="text-center text-xs font-medium text-gray-400 py-1">' + DAYS_SHORT[d] + '</div>';
        }
        html += '</div>';

        // Day cells
        var first = new Date(year, month, 1);
        var startDay = new Date(first);
        startDay.setDate(startDay.getDate() - startDay.getDay());

        html += '<div class="grid grid-cols-7">';
        for (var i = 0; i < 42; i++) {
            var cell = new Date(startDay);
            cell.setDate(cell.getDate() + i);
            var isCurrentMonth = cell.getMonth() === month;
            var isToday = sameDay(cell, today);
            var isSelected = sameDay(cell, currentDate);

            var cls = "mini-cal-cell w-8 h-8 flex items-center justify-center text-xs rounded-full cursor-pointer transition-all mx-auto ";
            if (isToday) {
                cls += "bg-indigo-600 text-white font-bold ";
            } else if (isSelected) {
                cls += "bg-indigo-100 text-indigo-700 font-semibold ";
            } else if (isCurrentMonth) {
                cls += "text-gray-700 hover:bg-gray-100 ";
            } else {
                cls += "text-gray-300 hover:bg-gray-50 ";
            }

            html += '<div class="' + cls + '" data-date="' + dateKey(cell) + '">' + cell.getDate() + '</div>';
        }
        html += '</div></div>';

        $mc.html(html);
    }

    // Mini calendar navigation
    $(document).on("click", "#mini-prev", function() {
        miniDate.setMonth(miniDate.getMonth() - 1);
        renderMiniCalendar();
    });
    $(document).on("click", "#mini-next", function() {
        miniDate.setMonth(miniDate.getMonth() + 1);
        renderMiniCalendar();
    });

    // Click mini calendar cell → navigate main calendar
    $(document).on("click", ".mini-cal-cell", function() {
        var parts = $(this).data("date").split("-");
        currentDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        loadEvents();
    });

    // ============ Agenda Panel ============
    function renderAgenda() {
        var $ap = $("#agenda-panel");
        if (!$ap.length) return;

        var today = new Date(); today.setHours(0,0,0,0);
        var tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

        var todayEvents = getEventsForDateFromAll(today);
        var tomorrowEvents = getEventsForDateFromAll(tomorrow);

        var html = '';

        // Today section
        html += '<div class="mb-5">';
        html += '<div class="flex items-center justify-between mb-2">';
        html += '<span class="text-sm font-bold text-gray-800">Today</span>';
        html += '<span class="text-xs text-indigo-500 font-medium">' + (today.getMonth()+1) + '/' + today.getDate() + '/' + today.getFullYear() + '</span>';
        html += '</div>';

        if (todayEvents.length === 0) {
            html += '<p class="text-xs text-gray-400 italic">No events</p>';
        } else {
            for (var i = 0; i < todayEvents.length; i++) {
                html += renderAgendaItem(todayEvents[i]);
            }
        }
        html += '</div>';

        // Tomorrow section
        html += '<div>';
        html += '<div class="flex items-center justify-between mb-2">';
        html += '<span class="text-sm font-bold text-gray-800">Tomorrow</span>';
        html += '<span class="text-xs text-gray-400 font-medium">' + (tomorrow.getMonth()+1) + '/' + tomorrow.getDate() + '/' + tomorrow.getFullYear() + '</span>';
        html += '</div>';

        if (tomorrowEvents.length === 0) {
            html += '<p class="text-xs text-gray-400 italic">No events</p>';
        } else {
            for (var j = 0; j < tomorrowEvents.length; j++) {
                html += renderAgendaItem(tomorrowEvents[j]);
            }
        }
        html += '</div>';

        $ap.html(html);
    }

    function renderAgendaItem(ev) {
        var start = new Date(ev.start);
        var end = getEndTime(ev);
        var timeStr = formatTime12(start) + " - " + formatTime12(end);
        var dotColor = ev.color || "#6366f1";
        var html = '<div class="flex items-start gap-2.5 py-2 cursor-pointer agenda-event hover:bg-gray-50 rounded-lg px-1 -mx-1 transition-colors" data-id="' + ev.id + '" data-type="' + ev.type + '">';
        html += '<div class="w-2 h-2 rounded-full mt-1.5 shrink-0" style="background:' + dotColor + '"></div>';
        html += '<div class="min-w-0">';
        html += '<div class="text-xs text-gray-500">' + timeStr + '</div>';
        html += '<div class="text-sm font-medium text-gray-800 truncate">' + escapeHtml(ev.title) + '</div>';
        html += '</div></div>';
        return html;
    }

    function getEventsForDateFromAll(date) {
        var key = dateKey(date);
        return allEvents.filter(function(ev) {
            return dateKey(new Date(ev.start)) === key;
        }).sort(function(a, b) {
            return new Date(a.start) - new Date(b.start);
        });
    }

    // Show summary popup
    function showSummaryModal(ev) {
        currentSummaryEvent = ev;
        var startDate = new Date(ev.start);
        var endDate = getEndTime(ev);
        
        // Set title and color
        $("#summary-title").text(ev.title);
        $("#summary-color-dot").css("background", ev.color || "#6366f1");
        
        // Set date and time
        var dateStr = startDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        var timeStr = formatTime12(startDate) + " - " + formatTime12(endDate);
        
        $("#summary-datetime").text(dateStr + " at " + timeStr);
        
        // Show/hide fields based on event type
        if (ev.type === "session") {
            $("#summary-duration-container").show();
            $("#summary-notes-container").show();
            $("#summary-description-container").hide();
            $("#summary-completed-container").hide();
            
            // Set duration
            var duration = ev.duration || 60;
            var hours = Math.floor(duration / 60);
            var minutes = duration % 60;
            var durationText = hours > 0 ? hours + " hr" + (hours > 1 ? "s" : "") : "";
            durationText += minutes > 0 ? (durationText ? " " : "") + minutes + " min" : "";
            $("#summary-duration").text(durationText || "60 min");
            
            // Set notes
            $("#summary-notes").text(ev.notes || "No notes");
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
        
        $("#event-summary-modal").removeClass("hidden");
    }

    // Summary modal handlers
    $("#summary-close-btn").on("click", function() {
        $("#event-summary-modal").addClass("hidden");
        currentSummaryEvent = null;
    });

    $("#event-summary-modal").on("click", function(e) {
        if (e.target === this) {
            $("#event-summary-modal").addClass("hidden");
            currentSummaryEvent = null;
        }
    });

    // Edit from summary - open the main edit modal
    $("#summary-edit-btn").on("click", function() {
        if (currentSummaryEvent) {
            $("#event-summary-modal").addClass("hidden");
            openModal(currentSummaryEvent);
            currentSummaryEvent = null;
        }
    });

    // Delete from summary
    $("#summary-delete-btn").on("click", function() {
        if (!currentSummaryEvent) return;
        if (!confirm("Delete this event?")) return;
        
        var eventToDelete = currentSummaryEvent;
        $.ajax({
            url: "/api/events/" + eventToDelete.id + "?type=" + eventToDelete.type,
            method: "DELETE",
            success: function () {
                $("#event-summary-modal").addClass("hidden");
                currentSummaryEvent = null;
                loadEvents();
            },
            error: function (xhr) {
                var msg = xhr.responseJSON ? xhr.responseJSON.message : "Delete failed.";
                showAlert(msg, "danger");
            }
        });
    });

    // Click agenda event → open edit modal
    $(document).on("click", ".agenda-event", function(e) {
        e.stopPropagation();
        var id = $(this).data("id");
        var type = $(this).data("type");
        var ev = allEvents.find(function(x) { return x.id === id && x.type === type; });
        if (ev) showSummaryModal(ev);
    });

    // -- Month view --
    function renderMonth($c) {
        var html = '<div class="grid grid-cols-7 h-full" style="grid-template-rows: auto repeat(6, 1fr);">';
        // Header row
        for (var d = 0; d < 7; d++) {
            html += '<div class="px-2 py-2 text-center text-xs font-semibold text-gray-400 border-b border-gray-100">' + DAYS_SHORT[d] + '</div>';
        }

        var first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        var startDay = new Date(first); startDay.setDate(startDay.getDate() - startDay.getDay());
        var today = new Date(); today.setHours(0,0,0,0);

        for (var i = 0; i < 42; i++) {
            var cell = new Date(startDay);
            cell.setDate(cell.getDate() + i);
            var isCurrentMonth = cell.getMonth() === currentDate.getMonth();
            var isToday = sameDay(cell, today);
            var dayEvents = getEventsForDate(cell);

            html += '<div class="border-b border-r border-gray-100 p-1.5 cursor-pointer hover:bg-indigo-50/30 transition-colors overflow-hidden cal-cell" data-date="' + dateKey(cell) + '">';
            html += '<div class="text-xs font-medium mb-1 ' + (isToday ? 'bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : (isCurrentMonth ? 'text-gray-700' : 'text-gray-300')) + '">' + cell.getDate() + '</div>';

            for (var e = 0; e < Math.min(dayEvents.length, 3); e++) {
                var ev = dayEvents[e];
                var evStart = new Date(ev.start);
                var timeLabel = formatTimeShort(evStart);
                html += '<div class="event-pill flex items-center gap-1 text-xs py-0.5 mb-0.5 truncate cursor-pointer group" data-id="' + ev.id + '" data-type="' + ev.type + '">';
                html += '<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:' + ev.color + '"></span>';
                html += '<span class="text-gray-400">' + timeLabel + '</span>';
                html += '<span class="text-gray-700 font-medium truncate">' + escapeHtml(ev.title) + '</span>';
                html += '</div>';
            }
            if (dayEvents.length > 3) {
                html += '<div class="text-xs text-gray-400 pl-3">+' + (dayEvents.length - 3) + ' more</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        $c.html(html);
    }

    // -- Week view --
    function renderWeek($c) {
        var ws = startOfWeek(currentDate);
        var today = new Date(); today.setHours(0,0,0,0);
        var hours = [];
        for (var h = 0; h < 24; h++) hours.push(h);

        var html = '<div class="min-w-[700px] flex flex-col h-full">';
        // Header row with day columns
        html += '<div class="grid grid-cols-8 border-b border-gray-200 shrink-0">';
        html += '<div class="w-16 shrink-0"></div>';
        for (var d = 0; d < 7; d++) {
            var dayDate = new Date(ws); dayDate.setDate(dayDate.getDate() + d);
            var isTodayCol = sameDay(dayDate, today);
            html += '<div class="flex-1 text-center py-2 border-l border-gray-100">';
            html += '<div class="text-xs font-medium ' + (isTodayCol ? 'text-indigo-600' : 'text-gray-400') + '">' + DAYS_SHORT[d] + '</div>';
            if (isTodayCol) {
                html += '<div class="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center mx-auto text-sm font-bold">' + dayDate.getDate() + '</div>';
            } else {
                html += '<div class="text-lg font-bold text-gray-700 leading-8">' + dayDate.getDate() + '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        // All-day row (for events without specific time — simplified)
        // Time grid
        html += '<div class="flex-1 overflow-y-auto" id="week-scroll">';
        html += '<div class="grid grid-cols-8 relative" style="height:' + (hours.length * 60) + 'px">';

        // Hour labels + grid lines
        for (var hi = 0; hi < hours.length; hi++) {
            var hour = hours[hi];
            var topPx = hi * 60;
            var label = hour === 0 ? '12 AM' : (hour < 12 ? hour + ':00 am' : (hour === 12 ? '12:00 pm' : (hour-12) + ':00 pm'));
            html += '<div class="absolute text-xs text-gray-400 text-right pr-2" style="top:' + (topPx - 8) + 'px;width:4rem">' + label + '</div>';
            html += '<div class="absolute border-t border-gray-100" style="top:' + topPx + 'px;left:4rem;right:0"></div>';
        }

        // Events
        var firstHour = hours[0];
        for (var d2 = 0; d2 < 7; d2++) {
            var dayDate2 = new Date(ws); dayDate2.setDate(dayDate2.getDate() + d2);
            var dayEvts = getEventsForDate(dayDate2);
            for (var ei = 0; ei < dayEvts.length; ei++) {
                var ev = dayEvts[ei];
                var evDate = new Date(ev.start);
                var evEnd = getEndTime(ev);
                var topMin = (evDate.getHours() - firstHour) * 60 + evDate.getMinutes();
                var height = ev.type === "session" ? (ev.duration || 60) : 30;
                if (topMin < 0) { topMin = 0; }
                var leftPct = ((d2 + 1) / 8 * 100);
                var widthPct = (1 / 8 * 100);
                var bgColor = ev.color || "#6366f1";
                // Lighter background with colored left border
                html += '<div class="absolute rounded-lg px-2 py-1 overflow-hidden cursor-pointer event-pill border-l-4 shadow-sm" style="border-color:' + bgColor + ';background:' + bgColor + '20;top:' + topMin + 'px;left:' + leftPct + '%;width:calc(' + widthPct + '% - 4px);height:' + height + 'px" data-id="' + ev.id + '" data-type="' + ev.type + '">';
                html += '<div class="text-[10px] text-gray-500 leading-tight">' + formatTimeShort(evDate) + ' - ' + formatTimeShort(evEnd) + '</div>';
                html += '<div class="text-xs font-semibold text-gray-800 truncate">' + escapeHtml(ev.title) + '</div>';
                html += '</div>';
            }
        }

        html += '</div></div></div>';
        $c.html(html);

        // Scroll to current time or first hour
        var $scroll = $("#week-scroll");
        if ($scroll.length) {
            var now = new Date();
            var scrollTo = (now.getHours() - hours[0]) * 60 + now.getMinutes() - 60;
            $scroll.scrollTop(Math.max(0, scrollTo));
        }
        drawCurrentTimeLine();
    }

    // -- Day view --
    function renderDay($c) {
        var today = new Date(); today.setHours(0,0,0,0);
        var isToday = sameDay(currentDate, today);
        var dayEvents = getEventsForDate(currentDate);
        var hours = [];
        for (var h = 0; h < 24; h++) hours.push(h);

        var html = '<div class="flex flex-col h-full">';
        // Day header
        html += '<div class="px-4 py-3 border-b border-gray-200 shrink-0">';
        html += '<div class="text-sm font-medium ' + (isToday ? 'text-indigo-600' : 'text-gray-400') + '">' + DAYS_SHORT[currentDate.getDay()] + '</div>';
        if (isToday) {
            html += '<div class="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xl font-bold">' + currentDate.getDate() + '</div>';
        } else {
            html += '<div class="text-2xl font-bold text-gray-700">' + currentDate.getDate() + '</div>';
        }
        html += '</div>';

        // Time grid
        var firstHour = hours[0];
        html += '<div class="flex-1 overflow-y-auto" id="day-scroll">';
        html += '<div class="relative" style="height:' + (hours.length * 60) + 'px">';
        for (var hi = 0; hi < hours.length; hi++) {
            var hour = hours[hi];
            var topPx = hi * 60;
            var label = hour === 0 ? '12:00 am' : (hour < 12 ? hour + ':00 am' : (hour === 12 ? '12:00 pm' : (hour-12) + ':00 pm'));
            html += '<div class="absolute left-0 text-xs text-gray-400 w-20 text-right pr-3" style="top:' + (topPx - 8) + 'px">' + label + '</div>';
            html += '<div class="absolute border-t border-gray-100" style="top:' + topPx + 'px;left:5rem;right:0"></div>';
            html += '<div class="absolute cursor-pointer hover:bg-indigo-50/30 transition-colors cal-hour-cell" style="top:' + topPx + 'px;left:5rem;right:0;height:60px" data-hour="' + hour + '"></div>';
        }

        // Events
        for (var ei = 0; ei < dayEvents.length; ei++) {
            var ev = dayEvents[ei];
            var evDate = new Date(ev.start);
            var evEnd = getEndTime(ev);
            var topMin = (evDate.getHours() - firstHour) * 60 + evDate.getMinutes();
            var height = ev.type === "session" ? (ev.duration || 60) : 30;
            if (topMin < 0) { topMin = 0; }
            var bgColor = ev.color || "#6366f1";
            html += '<div class="absolute rounded-lg px-3 py-1.5 overflow-hidden cursor-pointer event-pill border-l-4 shadow-sm" style="border-color:' + bgColor + ';background:' + bgColor + '20;top:' + topMin + 'px;left:5.5rem;right:0.5rem;height:' + height + 'px" data-id="' + ev.id + '" data-type="' + ev.type + '">';
            html += '<div class="text-xs text-gray-500">' + formatTimeShort(evDate) + ' - ' + formatTimeShort(evEnd) + '</div>';
            html += '<div class="text-sm font-semibold text-gray-800">' + escapeHtml(ev.title) + '</div>';
            html += '</div>';
        }

        html += '</div></div></div>';
        $c.html(html);

        // Scroll to current time or first hour
        var $scroll = $("#day-scroll");
        if ($scroll.length) {
            var now = new Date();
            var scrollTo = (now.getHours() - hours[0]) * 60 + now.getMinutes() - 60;
            $scroll.scrollTop(Math.max(0, scrollTo));
        }
        drawCurrentTimeLine();
    }

    // ============ Current time indicator ============
    function drawCurrentTimeLine() {
        $(".current-time-line").remove();
        var now = new Date();
        var firstHour = 0;
        var topMin = (now.getHours() - firstHour) * 60 + now.getMinutes();

        if (currentView === "week") {
            var $grid = $("#week-scroll .grid");
            if (!$grid.length) return;
            var line = '<div class="current-time-line absolute z-10" style="top:' + topMin + 'px;left:4rem;right:0;pointer-events:none">';
            line += '<div class="flex items-center"><div class="w-2 h-2 rounded-full bg-red-500 -ml-1"></div><div class="flex-1 border-t-2 border-red-500"></div></div>';
            line += '</div>';
            $grid.append(line);
        } else if (currentView === "day") {
            var $rel = $("#day-scroll > .relative");
            if (!$rel.length) return;
            var line2 = '<div class="current-time-line absolute z-10" style="top:' + topMin + 'px;left:5rem;right:0;pointer-events:none">';
            line2 += '<div class="flex items-center"><div class="w-2 h-2 rounded-full bg-red-500 -ml-1"></div><div class="flex-1 border-t-2 border-red-500"></div></div>';
            line2 += '</div>';
            $rel.append(line2);
        }
    }

    // Update time indicator every minute
    setInterval(drawCurrentTimeLine, 60000);

    // ============ Click on week time slots ============
    $(document).on("click", "#week-scroll .grid", function(e) {
        if ($(e.target).hasClass("event-pill") || $(e.target).closest(".event-pill").length) return;
        if ($(e.target).hasClass("current-time-line") || $(e.target).closest(".current-time-line").length) return;
        var $grid = $(this);
        var rect = $grid[0].getBoundingClientRect();
        var scrollTop = $("#week-scroll").scrollTop();
        var y = e.clientY - rect.top + scrollTop;
        var clickedHour = Math.floor(y / 60);
        var clickedMin = Math.floor((y % 60) / 15) * 15;
        // Determine which day column was clicked
        var x = e.clientX - rect.left;
        var colWidth = rect.width / 8;
        var dayCol = Math.floor(x / colWidth) - 1;
        if (dayCol < 0 || dayCol > 6) return;
        var ws = startOfWeek(currentDate);
        var clickDate = new Date(ws);
        clickDate.setDate(clickDate.getDate() + dayCol);
        openModal(null, dateKey(clickDate), pad(clickedHour) + ":" + pad(clickedMin));
    });

    function getEventsForDate(date) {
        var key = dateKey(date);
        return events.filter(function (ev) {
            return dateKey(new Date(ev.start)) === key;
        }).sort(function(a, b) {
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
        var date = $(this).data("date");
        openModal(null, date, "09:00");
    });

    $(document).on("click", ".cal-hour-cell", function () {
        var hour = parseInt($(this).data("hour"));
        openModal(null, dateKey(currentDate), pad(hour) + ":00");
    });

    // ============ Click on event to edit ============
    $(document).on("click", ".event-pill", function (e) {
        e.stopPropagation();
        var id = $(this).data("id");
        var type = $(this).data("type");
        var ev = events.find(function (x) { return x.id === id && x.type === type; });
        if (ev) showSummaryModal(ev);
    });

    // ============ View Modal (NEW) ============
    function openViewModal(ev) {
        $("#event-view-modal").removeClass("hidden");

        var start = new Date(ev.start);
        var end = getEndTime(ev);

        var html = `
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
            
            var evDate = new Date(ev.start);
            selectType(ev.type);
            $("#event-title").val(ev.title);
            $("#event-date").val(dateKey(evDate));
            $("#event-time").val(pad(evDate.getHours()) + ":" + pad(evDate.getMinutes()));
            
            if (ev.type === "session") {
                $("#event-reminders").val(ev.duration || 60);
                $("#event-notes").val(ev.notes || "");
                selectColor(ev.color || "#6366f1");
            } else {
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
        var ev = $("#event-view-modal").data("event");
        $("#event-view-modal").addClass("hidden");
        openModal(ev);
    });

    $("#view-delete").on("click", function () {
        var ev = $("#event-view-modal").data("event");
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
        var todayStr = dateKey(new Date());
        openModal(null, todayStr, "09:00");
    });

    // ============ Save event ============
    $("#event-form").on("submit", function (e) {
        e.preventDefault();
        
        var id = $("#event-id").val();
        var title = $("#event-title").val().trim();
        var date = $("#event-date").val();
        var time = $("#event-time").val();

        if (!title || !date || !time) {
            showAlert("Please fill in all required fields.", "danger");
            return;
        }

        var startISO = date + "T" + time;
        var payload = {
            type: selectedType,
            title: title,
            start: startISO
        };

        if (selectedType === "session") {
            payload.duration = parseInt($("#event-reminders").val()) || 60;
            payload.notes = $("#event-notes").val();
            payload.color = selectedColor;
        } else {
            payload.description = $("#event-description").val();
            payload.completed = $("#event-completed").is(":checked");
        }

        var $btn = $("#event-save-btn");
        var $spinner = $("#event-spinner");
        $btn.prop("disabled", true);
        $spinner.removeClass("hidden");

        var method = id ? "PUT" : "POST";
        var url = id ? "/api/events/" + id : "/api/events";

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
                var msg = xhr.responseJSON ? xhr.responseJSON.message : "Save failed.";
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
            url: "/api/events/" + editingEvent.id + "?type=" + editingEvent.type,
            method: "DELETE",
            success: function () {
                closeModal();
                loadEvents();
            },
            error: function (xhr) {
                var msg = xhr.responseJSON ? xhr.responseJSON.message : "Delete failed.";
                showAlert(msg, "danger");
            }
        });
    });

    // ============ Initial load ============
    loadEvents();
});
