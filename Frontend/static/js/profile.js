$(function () {
    "use strict";

    function showAlert(containerId, message, type) {
        const colorMap = {
            danger:  "bg-red-100 text-red-700 border-red-200",
            warning: "bg-amber-100 text-amber-700 border-amber-200",
            success: "bg-emerald-100 text-emerald-700 border-emerald-200"
        };
        const cls = colorMap[type] || colorMap.danger;
        $("#" + containerId).html(
            '<div class="flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm border mb-3 ' + cls + '">' +
            '<span>' + message + '</span>' +
            '<button onclick="$(this).parent().fadeOut(200,function(){$(this).remove()})" class="hover:opacity-70 transition-opacity text-lg leading-none">&times;</button>' +
            '</div>'
        );
    }

    // =========== Profile picture preview ===========
    $("#profile_picture").on("change", function () {
        const file = this.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            showAlert("profile-alert", "File too large. Max 2MB.", "danger");
            this.value = "";
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            $("#avatar-preview").attr("src", e.target.result);
        };
        reader.readAsDataURL(file);
    });

    // =========== Save profile (username + picture) ===========
    $("#profile-form").on("submit", function (e) {
        e.preventDefault();
        const formData = new FormData(this);
        const $btn = $("#profile-save-btn");
        const $spinner = $("#profile-save-spinner");
        $btn.prop("disabled", true);
        $spinner.removeClass("hidden");

        $.ajax({
            url: "/profile/update",
            method: "POST",
            data: formData,
            processData: false,
            contentType: false,
            success: function (resp) {
                showAlert("profile-alert", resp.message, "success");
                $btn.prop("disabled", false);
                $spinner.addClass("hidden");
            },
            error: function (xhr) {
                const msg = xhr.responseJSON ? xhr.responseJSON.message : "Update failed.";
                showAlert("profile-alert", msg, "danger");
                $btn.prop("disabled", false);
                $spinner.addClass("hidden");
            }
        });
    });

    // =========== Change password ===========
    $("#password-form").on("submit", function (e) {
        e.preventDefault();
        const $btn = $("#password-btn");
        const $spinner = $("#password-spinner");
        $btn.prop("disabled", true);
        $spinner.removeClass("hidden");

        $.ajax({
            url: "/profile/password",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                current_password: $("#current_password").val() || "",
                new_password: $("#new_password").val(),
                confirm_password: $("#confirm_password").val()
            }),
            success: function (resp) {
                showAlert("password-alert", resp.message, "success");
                $("#password-form")[0].reset();
                $btn.prop("disabled", false);
                $spinner.addClass("hidden");
            },
            error: function (xhr) {
                const msg = xhr.responseJSON ? xhr.responseJSON.message : "Password update failed.";
                showAlert("password-alert", msg, "danger");
                $btn.prop("disabled", false);
                $spinner.addClass("hidden");
            }
        });
    });

    // =========== Delete account modal ===========
    $("#delete-account-btn").on("click", function () {
        $("#delete-modal").removeClass("hidden");
    });
    $("#delete-cancel-btn").on("click", function () {
        $("#delete-modal").addClass("hidden");
        $("#delete-form")[0].reset();
    });
    // Close modal on overlay click
    $("#delete-modal").on("click", function (e) {
        if (e.target === this) {
            $(this).addClass("hidden");
        }
    });

    $("#delete-form").on("submit", function (e) {
        e.preventDefault();
        const $btn = $("#delete-confirm-btn");
        const $spinner = $("#delete-spinner");
        $btn.prop("disabled", true);
        $spinner.removeClass("hidden");

        $.ajax({
            url: "/profile/delete",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({ password: $("#delete_confirm").val() }),
            success: function (resp) {
                window.location.href = resp.redirect || "/";
            },
            error: function (xhr) {
                const msg = xhr.responseJSON ? xhr.responseJSON.message : "Deletion failed.";
                showAlert("delete-alert", msg, "danger");
                $btn.prop("disabled", false);
                $spinner.addClass("hidden");
            }
        });
    });
});
