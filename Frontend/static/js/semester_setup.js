$(function () {
    "use strict";

    const semesters = [{ name: "", start_date: "", end_date: "" }];

    function showAlert(msg, type) {
        const cls = type === "success" ? "bg-emerald-500/90 text-white" : "bg-red-500/90 text-white";
        $("#setup-alert").removeClass("hidden").html(
            '<div class="flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm shadow-md mb-4 ' + cls + '">' +
            '<span>' + msg + '</span>' +
            '<button onclick="$(this).parent().fadeOut(200,function(){$(this).remove()})" class="hover:opacity-70 text-lg leading-none">&times;</button>' +
            '</div>'
        );
    }

    function render() {
        let html = "";
        for (let i = 0; i < semesters.length; i++) {
            html += '<div class="bg-white/10 rounded-xl p-4 border border-white/10">' +
                '<div class="flex items-center justify-between mb-3">' +
                '<span class="text-xs text-white/50 montserrat-medium">Semester ' + (i + 1) + '</span>' +
                (semesters.length > 1 ? '<button type="button" class="remove-sem text-white/40 hover:text-red-300 transition-colors" data-idx="' + i + '">' +
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>' : '') +
                '</div>' +
                '<div class="space-y-3">' +
                '<input type="text" class="sem-name w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder-white/40 focus:border-white/50 focus:ring-1 focus:ring-white/30 transition-all" data-idx="' + i + '" placeholder="e.g. Semester 1 2026" value="' + (semesters[i].name || '') + '">' +
                '<div class="grid grid-cols-2 gap-3">' +
                '<div><label class="block text-xs text-white/50 mb-1 roboto-regular">Start Date</label>' +
                '<input type="date" class="sem-start w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:border-white/50 focus:ring-1 focus:ring-white/30 transition-all" data-idx="' + i + '" value="' + (semesters[i].start_date || '') + '"></div>' +
                '<div><label class="block text-xs text-white/50 mb-1 roboto-regular">End Date</label>' +
                '<input type="date" class="sem-end w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:border-white/50 focus:ring-1 focus:ring-white/30 transition-all" data-idx="' + i + '" value="' + (semesters[i].end_date || '') + '"></div>' +
                '</div></div></div>';
        }
        $("#semester-rows").html(html);
    }

    render();

    // Sync inputs
    $(document).on("input", ".sem-name", function () {
        semesters[$(this).data("idx")].name = $(this).val();
    });
    $(document).on("change", ".sem-start", function () {
        semesters[$(this).data("idx")].start_date = $(this).val();
    });
    $(document).on("change", ".sem-end", function () {
        semesters[$(this).data("idx")].end_date = $(this).val();
    });

    // Add semester row
    $("#add-semester-btn").on("click", function () {
        semesters.push({ name: "", start_date: "", end_date: "" });
        render();
    });

    // Remove semester row
    $(document).on("click", ".remove-sem", function () {
        semesters.splice($(this).data("idx"), 1);
        render();
    });

    // Save
    $("#save-semesters-btn").on("click", function () {
        // Collect from DOM
        $(".sem-name").each(function () { semesters[$(this).data("idx")].name = $(this).val(); });
        $(".sem-start").each(function () { semesters[$(this).data("idx")].start_date = $(this).val(); });
        $(".sem-end").each(function () { semesters[$(this).data("idx")].end_date = $(this).val(); });

        const valid = semesters.filter(function (s) {
            return s.name.trim() && s.start_date && s.end_date;
        });

        if (valid.length === 0) {
            showAlert("Please fill in at least one semester.", "danger");
            return;
        }

        for (let i = 0; i < valid.length; i++) {
            if (valid[i].end_date <= valid[i].start_date) {
                showAlert("End date must be after start date for \"" + valid[i].name + "\".", "danger");
                return;
            }
        }

        $("#save-spinner").removeClass("hidden");

        $.ajax({
            url: "/api/setup/semesters",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify(valid),
            success: function () {
                window.location.href = "/home";
            },
            error: function (xhr) {
                let msg = "Something went wrong.";
                try { msg = xhr.responseJSON.message || msg; } catch (e) {}
                showAlert(msg, "danger");
                $("#save-spinner").addClass("hidden");
            }
        });
    });
});
