$(function () {
    "use strict";

    let selectedColor = "#3b82f6";
    let editColor = "#3b82f6";

    // ============ Helpers ============
    function showAlert(containerId, msg, type) {
        const colors = {
            danger: "bg-red-100 text-red-700 border-red-200",
            success: "bg-emerald-100 text-emerald-700 border-emerald-200"
        };
        const cls = colors[type] || colors.danger;
        $("#" + containerId).html(
            '<div class="flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm border mb-3 ' + cls + '">' +
            '<span>' + $("<span>").text(msg).html() + '</span>' +
            '<button onclick="$(this).parent().fadeOut(200,function(){$(this).remove()})" class="hover:opacity-70 transition-opacity text-lg leading-none">&times;</button>' +
            '</div>'
        );
    }

    function escapeHtml(str) {
        return $("<span>").text(str).html();
    }

    // ============ Color pickers ============
    // Highlight default
    $(".ical-color-dot[data-color='" + selectedColor + "']").addClass("ring-2 ring-offset-2 ring-indigo-400");

    $(document).on("click", ".ical-color-dot", function () {
        selectedColor = $(this).data("color");
        $(".ical-color-dot").removeClass("ring-2 ring-offset-2 ring-indigo-400");
        $(this).addClass("ring-2 ring-offset-2 ring-indigo-400");
    });

    $(document).on("click", ".edit-color-dot", function () {
        editColor = $(this).data("color");
        $(".edit-color-dot").removeClass("ring-2 ring-offset-2 ring-indigo-400");
        $(this).addClass("ring-2 ring-offset-2 ring-indigo-400");
    });

    // ============ Load Calendars ============
    function loadCalendars() {
        $.getJSON("/api/ical-calendars", function (data) {
            const $list = $("#calendars-list");
            $list.empty();

            if (!data || data.length === 0) {
                $("#calendars-empty").removeClass("hidden");
                $("#cal-count").text("");
                return;
            }

            $("#calendars-empty").addClass("hidden");
            $("#cal-count").text(data.length + " calendar" + (data.length !== 1 ? "s" : ""));

            data.forEach(function (cal) {
                $list.append(
                    '<div class="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors" data-cal-id="' + cal.id + '">' +
                    '  <div class="w-4 h-4 rounded-full shrink-0" style="background:' + escapeHtml(cal.color) + '"></div>' +
                    '  <div class="flex-1 min-w-0">' +
                    '    <p class="text-sm montserrat-medium text-gray-800 truncate">' + escapeHtml(cal.name) + '</p>' +
                    '    <p class="text-xs text-gray-400 roboto-regular truncate">' + escapeHtml(cal.url) + '</p>' +
                    '  </div>' +
                    '  <label class="relative inline-flex items-center cursor-pointer shrink-0" title="' + (cal.visible ? 'Visible' : 'Hidden') + '">' +
                    '    <input type="checkbox" class="sr-only peer toggle-visible" data-id="' + cal.id + '"' + (cal.visible ? ' checked' : '') + '>' +
                    '    <div class="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-indigo-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary_purp"></div>' +
                    '  </label>' +
                    '  <button type="button" class="edit-cal-btn p-1.5 rounded-lg text-gray-400 hover:text-primary_purp hover:bg-indigo-50 transition-colors" data-id="' + cal.id + '" data-name="' + escapeHtml(cal.name) + '" data-url="' + escapeHtml(cal.url) + '" data-color="' + escapeHtml(cal.color) + '">' +
                    '    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>' +
                    '  </button>' +
                    '  <button type="button" class="delete-cal-btn p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" data-id="' + cal.id + '">' +
                    '    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>' +
                    '  </button>' +
                    '</div>'
                );
            });
        });
    }

    // ============ Add Calendar ============
    $("#add-ical-btn").on("click", function () {
        const name = $("#ical-name").val().trim();
        const url = $("#ical-url").val().trim();

        if (!name) { showAlert("add-alert", "Please enter a calendar name.", "danger"); return; }
        if (!url) { showAlert("add-alert", "Please enter an iCal URL.", "danger"); return; }
        if (!/^https?:\/\//i.test(url)) { showAlert("add-alert", "URL must start with http:// or https://", "danger"); return; }

        const $btn = $(this);
        $btn.prop("disabled", true).text("Adding…");

        $.ajax({
            url: "/api/ical-calendars",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({ name: name, url: url, color: selectedColor }),
            success: function () {
                $("#ical-name").val("");
                $("#ical-url").val("");
                showAlert("add-alert", "Calendar added!", "success");
                loadCalendars();
                $btn.prop("disabled", false).text("Add Calendar");
            },
            error: function (xhr) {
                const msg = "Failed to add calendar.";
                try { msg = JSON.parse(xhr.responseText).message || msg; } catch (e) {}
                showAlert("add-alert", msg, "danger");
                $btn.prop("disabled", false).text("Add Calendar");
            }
        });
    });

    // ============ Toggle Visibility ============
    $(document).on("change", ".toggle-visible", function () {
        const id = $(this).data("id");
        const visible = this.checked;
        $.ajax({
            url: "/api/ical-calendars/" + id,
            method: "PUT",
            contentType: "application/json",
            data: JSON.stringify({ visible: visible })
        });
    });

    // ============ Edit Calendar ============
    $(document).on("click", ".edit-cal-btn", function () {
        const id = $(this).data("id");
        const name = $(this).data("name");
        const url = $(this).data("url");
        const color = $(this).data("color");

        $("#edit-cal-id").val(id);
        $("#edit-cal-name").val(name);
        $("#edit-cal-url").val(url);
        editColor = color;
        $("#edit-cal-alert").empty();

        $(".edit-color-dot").removeClass("ring-2 ring-offset-2 ring-indigo-400");
        $(".edit-color-dot[data-color='" + color + "']").addClass("ring-2 ring-offset-2 ring-indigo-400");

        $("#edit-cal-modal").removeClass("hidden");
    });

    function closeEditModal() {
        $("#edit-cal-modal").addClass("hidden");
    }

    $("#edit-cal-close").on("click", closeEditModal);
    $("#edit-cal-cancel").on("click", closeEditModal);
    $("#edit-cal-modal").on("click", function (e) { if (e.target === this) closeEditModal(); });

    $("#edit-cal-save").on("click", function () {
        const id = $("#edit-cal-id").val();
        const name = $("#edit-cal-name").val().trim();
        const url = $("#edit-cal-url").val().trim();

        if (!name) { showAlert("edit-cal-alert", "Name cannot be empty.", "danger"); return; }
        if (!url) { showAlert("edit-cal-alert", "URL cannot be empty.", "danger"); return; }
        if (!/^https?:\/\//i.test(url)) { showAlert("edit-cal-alert", "URL must start with http:// or https://", "danger"); return; }

        const $btn = $(this);
        $btn.prop("disabled", true).text("Saving…");

        $.ajax({
            url: "/api/ical-calendars/" + id,
            method: "PUT",
            contentType: "application/json",
            data: JSON.stringify({ name: name, url: url, color: editColor }),
            success: function () {
                closeEditModal();
                loadCalendars();
                $btn.prop("disabled", false).text("Save Changes");
            },
            error: function (xhr) {
                const msg = "Failed to save changes.";
                try { msg = JSON.parse(xhr.responseText).message || msg; } catch (e) {}
                showAlert("edit-cal-alert", msg, "danger");
                $btn.prop("disabled", false).text("Save Changes");
            }
        });
    });

    // ============ Delete Calendar ============
    $(document).on("click", ".delete-cal-btn", function () {
        $("#delete-cal-id").val($(this).data("id"));
        $("#delete-cal-modal").removeClass("hidden");
    });

    function closeDeleteModal() {
        $("#delete-cal-modal").addClass("hidden");
    }

    $("#delete-cal-cancel").on("click", closeDeleteModal);
    $("#delete-cal-modal").on("click", function (e) { if (e.target === this) closeDeleteModal(); });

    $("#delete-cal-confirm").on("click", function () {
        const id = $("#delete-cal-id").val();
        const $btn = $(this);
        $btn.prop("disabled", true).text("Deleting…");

        $.ajax({
            url: "/api/ical-calendars/" + id,
            method: "DELETE",
            success: function () {
                closeDeleteModal();
                loadCalendars();
                $btn.prop("disabled", false).text("Delete");
            },
            error: function () {
                closeDeleteModal();
                $btn.prop("disabled", false).text("Delete");
            }
        });
    });

    // ============ Init ============
    loadCalendars();
});
