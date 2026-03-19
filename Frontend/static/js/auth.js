$(function () {
    "use strict";

    // ===================== Helpers =====================
    function showAlert(containerId, message, type) {
        var colorMap = {
            danger:  "bg-red-500/90 text-white",
            warning: "bg-amber-500/90 text-white",
            info:    "bg-blue-500/90 text-white",
            success: "bg-emerald-500/90 text-white"
        };
        var cls = colorMap[type] || colorMap.danger;
        var $c = $("#" + containerId);
        $c.removeClass("hidden")
          .html(
              '<div class="animate-slide-down flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm shadow-md mb-2 ' + cls + '">' +
              '<span>' + message + '</span>' +
              '<button onclick="$(this).parent().fadeOut(200,function(){$(this).remove()})" class="hover:opacity-70 transition-opacity text-lg leading-none">&times;</button>' +
              '</div>'
          );
        // Shake the card on error
        if (type === "danger") {
            $c.closest("form").addClass("animate-shake");
            setTimeout(function(){ $c.closest("form").removeClass("animate-shake"); }, 600);
        }
    }

    function setLoading(btnId, spinnerId, loading) {
        var $btn = $("#" + btnId);
        var $spinner = $("#" + spinnerId);
        if (loading) {
            $btn.prop("disabled", true).addClass("opacity-70 cursor-not-allowed");
            $spinner.removeClass("hidden");
        } else {
            $btn.prop("disabled", false).removeClass("opacity-70 cursor-not-allowed");
            $spinner.addClass("hidden");
        }
    }

    // ===================== Toggle password visibility =====================
    $("#toggle-password").on("click", function () {
        var $input = $(this).closest(".relative").find("input");
        var isPassword = $input.attr("type") === "password";
        $input.attr("type", isPassword ? "text" : "password");
        $(this).find(".eye-open").toggleClass("hidden", !isPassword);
        $(this).find(".eye-closed").toggleClass("hidden", isPassword);
    });

    // ===================== Password strength =====================
    $("#signup-form #password").on("input", function () {
        var pw = $(this).val();
        var $el = $("#password-strength");
        if (pw.length === 0) {
            $el.html("");
            return;
        }
        var score = 0;
        if (pw.length >= 8)  score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;

        var labels = ["Weak", "Fair", "Good", "Strong"];
        var colors = ["#ef4444", "#f59e0b", "#3b82f6", "#10b981"];
        var textCls = ["text-red-400", "text-amber-400", "text-blue-400", "text-emerald-400"];
        var widths = ["25%", "50%", "75%", "100%"];
        var idx = Math.max(0, score - 1);

        $el.html(
            '<div class="w-full bg-white/10 rounded-full h-1 mt-2">' +
            '<div class="strength-meter rounded-full h-1" style="width:' + widths[idx] + ';background:' + colors[idx] + '"></div>' +
            '</div>' +
            '<p class="text-xs mt-1 ' + textCls[idx] + '">' + labels[idx] + '</p>'
        );
    });

    // ===================== Login form (AJAX) =====================
    $("#login-form").on("submit", function (e) {
        e.preventDefault();
        var email = $("#login-form #email").val().trim();
        var password = $("#login-form #password").val();
        var remember = $("#login-form #remember").is(":checked");

        if (!email || !password) {
            showAlert("login-alert", "Please fill in all fields.", "warning");
            return;
        }

        setLoading("login-btn", "login-spinner", true);

        $.ajax({
            url: "/login",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                email: email,
                password: password,
                remember: remember
            }),
            success: function (resp) {
                window.location.href = resp.redirect;
            },
            error: function (xhr) {
                var msg = "Login failed.";
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    msg = xhr.responseJSON.message;
                }
                showAlert("login-alert", msg, "danger");
                setLoading("login-btn", "login-spinner", false);
            }
        });
    });

    // ===================== Signup form (AJAX) =====================
    $("#signup-form").on("submit", function (e) {
        e.preventDefault();
        var username = $("#signup-form #username").val().trim();
        var email    = $("#signup-form #email").val().trim();
        var password = $("#signup-form #password").val();
        var confirm  = $("#signup-form #confirm_password").val();

        if (!username || !email || !password || !confirm) {
            showAlert("signup-alert", "Please fill in all fields.", "warning");
            return;
        }
        if (password !== confirm) {
            showAlert("signup-alert", "Passwords do not match.", "danger");
            return;
        }
        if (password.length < 8) {
            showAlert("signup-alert", "Password must be at least 8 characters.", "danger");
            return;
        }

        setLoading("signup-btn", "signup-spinner", true);

        $.ajax({
            url: "/signup",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                username: username,
                email: email,
                password: password,
                confirm_password: confirm
            }),
            success: function (resp) {
                window.location.href = resp.redirect;
            },
            error: function (xhr) {
                var msg = "Signup failed.";
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    msg = xhr.responseJSON.message;
                }
                showAlert("signup-alert", msg, "danger");
                setLoading("signup-btn", "signup-spinner", false);
            }
        });
    });
});
