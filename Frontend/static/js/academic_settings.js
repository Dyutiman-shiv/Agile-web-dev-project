$(function () {
    "use strict";

    var deleteSemId = null;

    function showAlert(containerId, msg, type) {
        var cls = type === "success" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200";
        $("#" + containerId).html(
            '<div class="flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm border mb-3 ' + cls + '">' +
            '<span>' + msg + '</span>' +
            '<button onclick="$(this).parent().fadeOut(200,function(){$(this).remove()})" class="hover:opacity-70 text-lg leading-none">&times;</button></div>'
        );
    }

    function escapeHtml(str) {
        return $("<div>").text(str).html();
    }

    function formatDate(iso) {
        var d = new Date(iso + "T00:00:00");
        return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    }

    function loadSemesters() {
        $.getJSON("/api/semesters", function (data) {
            if (!data.length) {
                $("#semesters-list").addClass("hidden");
                $("#semesters-empty").removeClass("hidden");
                $(document).trigger("semesters-changed");
                return;
            }
            $("#semesters-empty").addClass("hidden");
            $("#semesters-list").removeClass("hidden");

            var html = "";
            for (var i = 0; i < data.length; i++) {
                var s = data[i];
                html += '<div class="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">' +
                    '<div>' +
                    '<p class="text-sm montserrat-semi-bold text-gray-800">' + escapeHtml(s.name) + '</p>' +
                    '<p class="text-xs text-gray-400 roboto-regular mt-0.5">' + formatDate(s.start_date) + ' — ' + formatDate(s.end_date) +
                    (s.is_current ? ' <span class="inline-block ml-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] montserrat-medium">Current</span>' : '') +
                    (s.week_number ? ' <span class="text-gray-300 mx-1">·</span> Week ' + s.week_number : '') +
                    '</p></div>' +
                    '<div class="flex items-center gap-1">' +
                    '<button class="edit-sem-btn p-2 rounded-lg text-gray-400 hover:text-primary_purp hover:bg-indigo-50 transition-colors" data-id="' + s.id + '" data-name="' + escapeHtml(s.name) + '" data-start="' + s.start_date + '" data-end="' + s.end_date + '">' +
                    '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg></button>' +
                    '<button class="delete-sem-btn p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" data-id="' + s.id + '">' +
                    '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg></button>' +
                    '</div></div>';
            }
            $("#semesters-list").html(html);
            $(document).trigger("semesters-changed");
        });
    }

    loadSemesters();

    // Add semester
    $("#add-sem-btn").on("click", function () {
        var name = $("#sem-name").val().trim();
        var start = $("#sem-start").val();
        var end = $("#sem-end").val();

        if (!name || !start || !end) {
            showAlert("add-alert", "All fields are required.", "danger");
            return;
        }
        if (end <= start) {
            showAlert("add-alert", "End date must be after start date.", "danger");
            return;
        }

        $.ajax({
            url: "/api/semesters",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({ name: name, start_date: start, end_date: end }),
            success: function () {
                $("#sem-name").val("");
                $("#sem-start").val("");
                $("#sem-end").val("");
                showAlert("add-alert", "Semester added!", "success");
                loadSemesters();
            },
            error: function (xhr) {
                var msg = "Failed to add semester.";
                try { msg = xhr.responseJSON.message || msg; } catch (e) {}
                showAlert("add-alert", msg, "danger");
            }
        });
    });

    // Edit semester
    $(document).on("click", ".edit-sem-btn", function () {
        $("#edit-sem-id").val($(this).data("id"));
        $("#edit-sem-name").val($(this).data("name"));
        $("#edit-sem-start").val($(this).data("start"));
        $("#edit-sem-end").val($(this).data("end"));
        $("#edit-sem-modal").removeClass("hidden");
    });

    function closeEditModal() { $("#edit-sem-modal").addClass("hidden"); }
    $("#edit-sem-close").on("click", closeEditModal);
    $("#edit-sem-cancel").on("click", closeEditModal);
    $("#edit-sem-modal").on("click", function (e) { if (e.target === this) closeEditModal(); });

    $("#edit-sem-save").on("click", function () {
        var id = $("#edit-sem-id").val();
        var name = $("#edit-sem-name").val().trim();
        var start = $("#edit-sem-start").val();
        var end = $("#edit-sem-end").val();

        if (!name || !start || !end) {
            showAlert("edit-sem-alert", "All fields are required.", "danger");
            return;
        }

        $.ajax({
            url: "/api/semesters/" + id,
            method: "PUT",
            contentType: "application/json",
            data: JSON.stringify({ name: name, start_date: start, end_date: end }),
            success: function () {
                closeEditModal();
                loadSemesters();
            },
            error: function (xhr) {
                var msg = "Failed to update.";
                try { msg = xhr.responseJSON.message || msg; } catch (e) {}
                showAlert("edit-sem-alert", msg, "danger");
            }
        });
    });

    // Delete semester
    $(document).on("click", ".delete-sem-btn", function () {
        deleteSemId = $(this).data("id");
        $("#delete-sem-modal").removeClass("hidden");
    });

    function closeDeleteModal() { $("#delete-sem-modal").addClass("hidden"); deleteSemId = null; }
    $("#delete-sem-cancel").on("click", closeDeleteModal);
    $("#delete-sem-modal").on("click", function (e) { if (e.target === this) closeDeleteModal(); });

    $("#delete-sem-confirm").on("click", function () {
        if (!deleteSemId) return;
        $.ajax({
            url: "/api/semesters/" + deleteSemId,
            method: "DELETE",
            success: function () {
                closeDeleteModal();
                loadSemesters();
            }
        });
    });
});
