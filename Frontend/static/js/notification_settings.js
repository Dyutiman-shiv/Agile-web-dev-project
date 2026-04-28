$(function () {
    "use strict";

    function showAlert(msg, type) {
        var cls = type === "success"
            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
            : "bg-red-100 text-red-700 border-red-200";
        $("#prefs-alert").html(
            '<div class="flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm border mb-3 ' + cls + '">' +
            '<span>' + msg + '</span>' +
            '<button onclick="$(this).parent().fadeOut(200,function(){$(this).remove()})" class="hover:opacity-70 text-lg leading-none">&times;</button></div>'
        );
    }

    // Load current preferences
    $.getJSON("/api/notifications/preferences", function (prefs) {
        $.each(prefs, function (key, val) {
            $("#pref-" + key).prop("checked", val);
        });
    });

    // Auto-save on toggle change
    $(document).on("change", ".pref-toggle", function () {
        var field = $(this).data("field");
        var val = $(this).is(":checked");
        var data = {};
        data[field] = val;

        $.ajax({
            url: "/api/notifications/preferences",
            method: "PUT",
            contentType: "application/json",
            data: JSON.stringify(data),
            success: function () {
                showAlert("Preference saved.", "success");
            },
            error: function () {
                showAlert("Failed to save preference.", "danger");
            }
        });
    });

    // Browser push status
    function updatePushStatus() {
        var $status = $("#browser-push-status");
        var $btn = $("#enable-push-btn");

        if (!("Notification" in window)) {
            $status.html('<p class="text-sm text-gray-500">Your browser does not support notifications.</p>');
            $btn.addClass("hidden");
            return;
        }

        var perm = Notification.permission;
        if (perm === "granted") {
            $status.html('<div class="flex items-center gap-2 text-sm text-emerald-600"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg> Browser notifications are enabled</div>');
            $btn.text("Enabled").addClass("bg-emerald-600 hover:bg-emerald-700").prop("disabled", true);
        } else if (perm === "denied") {
            $status.html('<p class="text-sm text-red-500">Browser notifications are blocked. Please enable them in your browser settings.</p>');
            $btn.addClass("hidden");
        } else {
            $status.html('<p class="text-sm text-gray-500">Browser notifications are not yet enabled.</p>');
        }
    }

    updatePushStatus();

    // Request permission
    $("#enable-push-btn").on("click", function () {
        if (!("Notification" in window)) return;

        Notification.requestPermission().then(function (permission) {
            updatePushStatus();
            if (permission === "granted") {
                // Save preference
                $.ajax({
                    url: "/api/notifications/preferences",
                    method: "PUT",
                    contentType: "application/json",
                    data: JSON.stringify({ browser_push_enabled: true }),
                });
                showAlert("Browser notifications enabled!", "success");
            }
        });
    });
});
