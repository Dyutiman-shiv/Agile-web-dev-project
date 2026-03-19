$(function () {
    "use strict";

    // ============ State ============
    var currentView = "month"; // day | week | month
    var currentDate = new Date();
    var events = [];
    var selectedColor = "#6366f1";
    var selectedType = "session";
    var editingEvent = null;

    var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    var DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

    // ============ Helpers ============
    function pad(n) { return n < 10 ? "0" + n : "" + n; }

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

    // ============ Fetch events ============
    function loadEvents() {
        var range = getViewRange();
        $.getJSON("/api/events", {
            start: toLocalISO(range.start),
            end: toLocalISO(range.end)
        }, function (data) {
            events = data;
            render();
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
                $b.addClass("bg-white text-indigo-700 shadow-sm").removeClass("text-gray-500");
            } else {
                $b.removeClass("bg-white text-indigo-700 shadow-sm").addClass("text-gray-500");
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

    // -- Month view --
    function renderMonth($c) {
        var html = '<div class="grid grid-cols-7">';
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

            html += '<div class="min-h-[90px] border-b border-r border-gray-50 p-1.5 cursor-pointer hover:bg-indigo-50/50 transition-colors cal-cell" data-date="' + dateKey(cell) + '">';
            html += '<div class="text-xs font-medium mb-1 ' + (isToday ? 'bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : (isCurrentMonth ? 'text-gray-700' : 'text-gray-300')) + '">' + cell.getDate() + '</div>';

            for (var e = 0; e < Math.min(dayEvents.length, 3); e++) {
                var ev = dayEvents[e];
                html += '<div class="event-pill text-xs px-2 py-0.5 rounded-md mb-0.5 truncate text-white cursor-pointer font-medium" style="background:' + ev.color + '" data-id="' + ev.id + '" data-type="' + ev.type + '">' + escapeHtml(ev.title) + '</div>';
            }
            if (dayEvents.length > 3) {
                html += '<div class="text-xs text-gray-400 pl-1">+' + (dayEvents.length - 3) + ' more</div>';
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

        var html = '<div class="overflow-x-auto"><div class="min-w-[700px]">';
        // Header
        html += '<div class="grid grid-cols-8 border-b border-gray-100">';
        html += '<div class="px-2 py-2 text-xs font-semibold text-gray-400"></div>';
        for (var d = 0; d < 7; d++) {
            var dayDate = new Date(ws); dayDate.setDate(dayDate.getDate() + d);
            var isTodayCol = sameDay(dayDate, today);
            html += '<div class="px-2 py-2 text-center border-l border-gray-50">';
            html += '<div class="text-xs font-semibold ' + (isTodayCol ? 'text-indigo-600' : 'text-gray-400') + '">' + DAYS_SHORT[d] + '</div>';
            html += '<div class="text-lg font-bold ' + (isTodayCol ? 'bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center mx-auto' : 'text-gray-700') + '">' + dayDate.getDate() + '</div>';
            html += '</div>';
        }
        html += '</div>';

        // Time grid
        html += '<div class="relative" style="height:576px;overflow-y:auto" id="week-scroll">';
        html += '<div class="grid grid-cols-8" style="height:' + (hours.length * 60) + 'px;position:relative">';
        // Hour labels + grid lines
        for (var hi = 0; hi < hours.length; hi++) {
            var topPx = hi * 60;
            html += '<div class="absolute left-0 text-xs text-gray-400 pr-2 text-right" style="top:' + topPx + 'px;width:calc(100%/8)">' + (hi === 0 ? '12 AM' : (hi < 12 ? hi + ' AM' : (hi === 12 ? '12 PM' : (hi-12) + ' PM'))) + '</div>';
            html += '<div class="absolute border-t border-gray-50" style="top:' + topPx + 'px;left:calc(100%/8);right:0"></div>';
        }

        // Events overlaid
        for (var d2 = 0; d2 < 7; d2++) {
            var dayDate2 = new Date(ws); dayDate2.setDate(dayDate2.getDate() + d2);
            var dayEvts = getEventsForDate(dayDate2);
            for (var ei = 0; ei < dayEvts.length; ei++) {
                var ev = dayEvts[ei];
                var evDate = new Date(ev.start);
                var topMin = evDate.getHours() * 60 + evDate.getMinutes();
                var height = ev.type === "session" ? (ev.duration || 60) : 30;
                var leftPct = ((d2 + 1) / 8 * 100);
                var widthPct = (1 / 8 * 100);
                html += '<div class="absolute rounded-lg px-2 py-1 text-xs text-white font-medium overflow-hidden cursor-pointer event-pill shadow-sm" style="background:' + ev.color + ';top:' + topMin + 'px;left:' + leftPct + '%;width:' + widthPct + '%;height:' + height + 'px" data-id="' + ev.id + '" data-type="' + ev.type + '">';
                html += escapeHtml(ev.title);
                html += '</div>';
            }
        }

        html += '</div></div>';
        html += '</div></div>';
        $c.html(html);

        // Scroll to 8 AM
        var $scroll = $("#week-scroll");
        if ($scroll.length) $scroll.scrollTop(480);
    }

    // -- Day view --
    function renderDay($c) {
        var today = new Date(); today.setHours(0,0,0,0);
        var isToday = sameDay(currentDate, today);
        var dayEvents = getEventsForDate(currentDate);

        var html = '<div class="min-w-0">';
        // Day header
        html += '<div class="px-4 py-3 border-b border-gray-100 text-center">';
        html += '<div class="text-xs font-semibold ' + (isToday ? 'text-indigo-600' : 'text-gray-400') + '">' + DAYS_SHORT[currentDate.getDay()] + '</div>';
        html += '<div class="text-2xl font-bold ' + (isToday ? 'text-indigo-600' : 'text-gray-700') + '">' + currentDate.getDate() + '</div>';
        html += '</div>';

        // Time grid
        html += '<div style="height:576px;overflow-y:auto" id="day-scroll">';
        html += '<div class="relative" style="height:1440px">';
        for (var h = 0; h < 24; h++) {
            var topPx = h * 60;
            html += '<div class="absolute left-0 text-xs text-gray-400 w-16 text-right pr-3" style="top:' + topPx + 'px">' + (h === 0 ? '12 AM' : (h < 12 ? h + ' AM' : (h === 12 ? '12 PM' : (h-12) + ' PM'))) + '</div>';
            html += '<div class="absolute border-t border-gray-50" style="top:' + topPx + 'px;left:4rem;right:0"></div>';
            // Clickable area for creating events
            html += '<div class="absolute cursor-pointer hover:bg-indigo-50/30 transition-colors cal-hour-cell" style="top:' + topPx + 'px;left:4rem;right:0;height:60px" data-hour="' + h + '"></div>';
        }

        // Events
        for (var ei = 0; ei < dayEvents.length; ei++) {
            var ev = dayEvents[ei];
            var evDate = new Date(ev.start);
            var topMin = evDate.getHours() * 60 + evDate.getMinutes();
            var height = ev.type === "session" ? (ev.duration || 60) : 30;
            html += '<div class="absolute rounded-lg px-3 py-1.5 text-sm text-white font-medium overflow-hidden cursor-pointer event-pill shadow-sm" style="background:' + ev.color + ';top:' + topMin + 'px;left:5rem;right:0.5rem;height:' + height + 'px" data-id="' + ev.id + '" data-type="' + ev.type + '">';
            html += '<div class="font-semibold">' + escapeHtml(ev.title) + '</div>';
            if (ev.type === "session") {
                html += '<div class="text-xs opacity-80">' + ev.duration + ' min</div>';
            }
            html += '</div>';
        }

        html += '</div></div></div>';
        $c.html(html);

        // Scroll to 8 AM
        var $scroll = $("#day-scroll");
        if ($scroll.length) $scroll.scrollTop(480);
    }

    function getEventsForDate(date) {
        var key = dateKey(date);
        return events.filter(function (ev) {
            return dateKey(new Date(ev.start)) === key;
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
        if (ev) openModal(ev);
    });

    // ============ Modal ============
    function openModal(ev, date, time) {
        editingEvent = ev || null;
        $("#event-alert").html("");

        if (ev) {
            // Editing
            $("#event-modal-title").text("Edit Event");
            $("#event-delete-btn").removeClass("hidden");
            var evDate = new Date(ev.start);
            $("#event-id").val(ev.id);
            selectType(ev.type);
            $("#event-title").val(ev.title);
            $("#event-date").val(dateKey(evDate));
            $("#event-time").val(pad(evDate.getHours()) + ":" + pad(evDate.getMinutes()));
            if (ev.type === "session") {
                $("#event-duration").val(ev.duration || 60);
                $("#event-notes").val(ev.notes || "");
                selectColor(ev.color || "#6366f1");
            } else {
                $("#event-description").val(ev.description || "");
                $("#event-completed").prop("checked", ev.completed);
            }
        } else {
            // Creating
            $("#event-modal-title").text("New Event");
            $("#event-delete-btn").addClass("hidden");
            $("#event-id").val("");
            $("#event-form")[0].reset();
            selectType("session");
            selectColor("#6366f1");
            if (date) $("#event-date").val(date);
            if (time) $("#event-time").val(time);
        }

        $("#event-modal").removeClass("hidden");
    }

    function closeModal() {
        $("#event-modal").addClass("hidden");
        editingEvent = null;
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
            $("#event-title-label").text("Subject");
            $("#event-title").attr("placeholder", "e.g. Math 101");
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

    // ============ Add event button ============
    $("#add-event-btn").on("click", function () {
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
            payload.duration = parseInt($("#event-duration").val()) || 60;
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
