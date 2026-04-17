$(function () {
    "use strict";

    var selectedColor = "#6366f1";
    var deleteUnitId = null;
    var semesters = [];

    function escapeHtml(str) {
        return $("<div>").text(str).html();
    }

    function showAlert(containerId, msg, type) {
        var cls = type === "success" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200";
        $("#" + containerId).html(
            '<div class="flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm border mb-3 ' + cls + '">' +
            '<span>' + msg + '</span>' +
            '<button onclick="$(this).parent().fadeOut(200,function(){$(this).remove()})" class="hover:opacity-70 text-lg leading-none">&times;</button></div>'
        );
    }

    // Load semesters for dropdowns
    function loadSemesters(cb) {
        $.getJSON("/api/semesters", function (data) {
            semesters = data;
            var filterHtml = '<option value="">All Semesters</option>';
            var modalHtml = '<option value="">None</option>';
            for (var i = 0; i < data.length; i++) {
                filterHtml += '<option value="' + data[i].id + '">' + escapeHtml(data[i].name) + '</option>';
                modalHtml += '<option value="' + data[i].id + '">' + escapeHtml(data[i].name) + '</option>';
            }
            $("#filter-semester").html(filterHtml);
            $("#unit-semester").html(modalHtml);
            if (cb) cb();
        });
    }

    function loadUnits() {
        var params = {};
        var semId = $("#filter-semester").val();
        if (semId) params.semester_id = semId;
        if (!$("#show-archived").is(":checked")) params.archived = "false";

        $.getJSON("/api/units", params, function (data) {
            if (!data.length) {
                $("#units-grid").addClass("hidden");
                $("#units-empty").removeClass("hidden");
                return;
            }
            $("#units-empty").addClass("hidden");
            $("#units-grid").removeClass("hidden");

            var html = "";
            for (var i = 0; i < data.length; i++) {
                var u = data[i];
                html += '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow' + (u.archived ? ' opacity-60' : '') + '">' +
                    '<div class="flex items-start justify-between mb-3">' +
                    '<div class="flex items-center gap-2">' +
                    '<div class="w-3 h-3 rounded-full shrink-0" style="background:' + u.color + '"></div>' +
                    '<h4 class="text-sm montserrat-semi-bold text-gray-800">' + escapeHtml(u.name) + '</h4>' +
                    '</div>' +
                    '<div class="flex items-center gap-0.5">' +
                    '<button class="edit-unit-btn p-1.5 rounded-lg text-gray-400 hover:text-primary_purp hover:bg-indigo-50 transition-colors" ' +
                    'data-id="' + u.id + '" data-name="' + escapeHtml(u.name) + '" data-code="' + escapeHtml(u.code) + '" data-color="' + u.color + '" data-semester="' + (u.semester_id || '') + '" data-archived="' + u.archived + '">' +
                    '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg></button>' +
                    '<button class="archive-unit-btn p-1.5 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition-colors" data-id="' + u.id + '" data-archived="' + u.archived + '" title="' + (u.archived ? 'Unarchive' : 'Archive') + '">' +
                    '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg></button>' +
                    '<button class="delete-unit-btn p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" data-id="' + u.id + '">' +
                    '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg></button>' +
                    '</div></div>' +
                    (u.code ? '<p class="text-xs text-gray-400 roboto-regular mb-2">' + escapeHtml(u.code) + '</p>' : '') +
                    (u.semester_name ? '<span class="inline-block px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] montserrat-medium">' + escapeHtml(u.semester_name) + '</span>' : '') +
                    (u.archived ? ' <span class="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] montserrat-medium">Archived</span>' : '') +
                    '</div>';
            }
            $("#units-grid").html(html);
        });
    }

    loadSemesters(function () { loadUnits(); });

    // Refresh when semesters are changed (from academic_settings.js)
    $(document).on("semesters-changed", function () {
        loadSemesters(function () { loadUnits(); });
    });

    // Filters
    $("#filter-semester").on("change", loadUnits);
    $("#show-archived").on("change", loadUnits);

    // Color picker
    $(".unit-color-dot[data-color='" + selectedColor + "']").addClass("ring-2 ring-offset-2 ring-indigo-400");
    $(document).on("click", ".unit-color-dot", function () {
        $(".unit-color-dot").removeClass("ring-2 ring-offset-2 ring-indigo-400");
        $(this).addClass("ring-2 ring-offset-2 ring-indigo-400");
        selectedColor = $(this).data("color");
    });

    // Open create modal
    function openCreateModal() {
        $("#unit-modal-title").text("New Unit");
        $("#unit-edit-id").val("");
        $("#unit-name").val("");
        $("#unit-code").val("");
        $("#unit-semester").val("");
        selectedColor = "#6366f1";
        $(".unit-color-dot").removeClass("ring-2 ring-offset-2 ring-indigo-400");
        $(".unit-color-dot[data-color='#6366f1']").addClass("ring-2 ring-offset-2 ring-indigo-400");
        $("#unit-modal").removeClass("hidden");
    }

    $("#add-unit-btn").on("click", openCreateModal);
    $(document).on("click", ".open-create-unit", openCreateModal);

    // Open edit modal
    $(document).on("click", ".edit-unit-btn", function () {
        var $btn = $(this);
        $("#unit-modal-title").text("Edit Unit");
        $("#unit-edit-id").val($btn.data("id"));
        $("#unit-name").val($btn.data("name"));
        $("#unit-code").val($btn.data("code"));
        $("#unit-semester").val($btn.data("semester") || "");
        selectedColor = $btn.data("color");
        $(".unit-color-dot").removeClass("ring-2 ring-offset-2 ring-indigo-400");
        $(".unit-color-dot[data-color='" + selectedColor + "']").addClass("ring-2 ring-offset-2 ring-indigo-400");
        $("#unit-modal").removeClass("hidden");
    });

    function closeModal() { $("#unit-modal").addClass("hidden"); }
    $("#unit-modal-close").on("click", closeModal);
    $("#unit-cancel-btn").on("click", closeModal);
    $("#unit-modal").on("click", function (e) { if (e.target === this) closeModal(); });

    // Save (create or update)
    $("#unit-save-btn").on("click", function () {
        var id = $("#unit-edit-id").val();
        var name = $("#unit-name").val().trim();
        var code = $("#unit-code").val().trim();
        var semesterId = $("#unit-semester").val() || null;

        if (!name) {
            showAlert("unit-alert", "Unit name is required.", "danger");
            return;
        }

        var payload = { name: name, code: code, color: selectedColor, semester_id: semesterId ? parseInt(semesterId) : null };
        var url = id ? "/api/units/" + id : "/api/units";
        var method = id ? "PUT" : "POST";

        $.ajax({
            url: url,
            method: method,
            contentType: "application/json",
            data: JSON.stringify(payload),
            success: function () {
                closeModal();
                loadUnits();
            },
            error: function (xhr) {
                var msg = "Failed to save unit.";
                try { msg = xhr.responseJSON.message || msg; } catch (e) {}
                showAlert("unit-alert", msg, "danger");
            }
        });
    });

    // Archive toggle
    $(document).on("click", ".archive-unit-btn", function () {
        var id = $(this).data("id");
        var isArchived = $(this).data("archived") === true || $(this).data("archived") === "true";
        $.ajax({
            url: "/api/units/" + id,
            method: "PUT",
            contentType: "application/json",
            data: JSON.stringify({ archived: !isArchived }),
            success: loadUnits
        });
    });

    // Delete
    $(document).on("click", ".delete-unit-btn", function () {
        deleteUnitId = $(this).data("id");
        $("#delete-unit-modal").removeClass("hidden");
    });

    function closeDeleteModal() { $("#delete-unit-modal").addClass("hidden"); deleteUnitId = null; }
    $("#delete-unit-cancel").on("click", closeDeleteModal);
    $("#delete-unit-modal").on("click", function (e) { if (e.target === this) closeDeleteModal(); });

    $("#delete-unit-confirm").on("click", function () {
        if (!deleteUnitId) return;
        $.ajax({
            url: "/api/units/" + deleteUnitId,
            method: "DELETE",
            success: function () {
                closeDeleteModal();
                loadUnits();
            }
        });
    });
});
