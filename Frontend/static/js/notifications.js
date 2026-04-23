/**
 * Global notification system — loaded on every authenticated page.
 * Handles: polling, bell dropdown, toast popups, browser push.
 */
(function () {
    "use strict";

    // Only run on pages with the bell (authenticated layout)
    if (!document.getElementById("notif-bell-btn")) return;

    var POLL_INTERVAL = 15000; // 15 seconds
    var toastTimeout = 5000;
    var knownIds = {};          // track IDs we've already seen

    // ============ Helpers ============
    function escapeHtml(str) {
        return $("<div>").text(str || "").html();
    }

    function relativeTime(iso) {
        var d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
        var now = new Date();
        var diff = Math.floor((now - d) / 1000);
        if (diff < 60) return "just now";
        if (diff < 3600) return Math.floor(diff / 60) + "m ago";
        if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
        return Math.floor(diff / 86400) + "d ago";
    }

    function notifIcon(type) {
        var icons = {
            task_due: '<svg class="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
            task_overdue: '<svg class="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>',
            session_reminder: '<svg class="w-5 h-5 text-indigo-500 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>',
            semester_alert: '<svg class="w-5 h-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347"/></svg>',
            timer_done: '<svg class="w-5 h-5 text-purple-500 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg>',
        };
        return icons[type] || icons.task_due;
    }

    // ============ Badge ============
    function updateBadge(count) {
        var $badge = $("#notif-count");
        if (count > 0) {
            $badge.text(count > 99 ? "99+" : count).removeClass("hidden");
        } else {
            $badge.addClass("hidden");
        }
    }

    // ============ Render dropdown list ============
    function renderDropdownItem(n) {
        var readCls = n.read ? "opacity-60" : "";
        return '<div class="notif-item flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors ' + readCls + '" data-id="' + n.id + '" data-link="' + escapeHtml(n.link || "") + '">' +
            notifIcon(n.type) +
            '<div class="min-w-0 flex-1">' +
                '<p class="text-sm font-medium text-gray-800 truncate">' + escapeHtml(n.title) + '</p>' +
                '<p class="text-xs text-gray-500 truncate">' + escapeHtml(n.message) + '</p>' +
                '<p class="text-[10px] text-gray-400 mt-0.5">' + relativeTime(n.created_at) + '</p>' +
            '</div>' +
            (n.read ? '' : '<span class="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1.5"></span>') +
        '</div>';
    }

    function renderDropdown(notifications) {
        var $list = $("#notif-list");
        if (!notifications.length) {
            $list.html('<div class="py-8 text-center text-gray-400 text-sm">No notifications</div>');
            return;
        }
        $list.html(notifications.map(renderDropdownItem).join(""));
    }

    // ============ Load notifications (used by polling) ============
    function loadNotifications() {
        $.getJSON("/api/notifications?limit=15", function (resp) {
            var newItems = [];
            resp.notifications.forEach(function (n) {
                if (!knownIds[n.id] && !n.read) {
                    newItems.push(n);
                }
                knownIds[n.id] = true;
            });

            renderDropdown(resp.notifications);
            updateBadge(resp.unread);

            // Toast + push for genuinely new unread notifications
            newItems.forEach(function (n) {
                showToast(n);
                sendBrowserPush(n);
            });
        });
    }

    // ============ Click notification item ============
    $(document).on("click", ".notif-item", function () {
        var id = $(this).data("id");
        var link = $(this).data("link");
        // Mark as read
        $.ajax({ url: "/api/notifications/" + id + "/read", method: "PUT" });
        $(this).addClass("opacity-60").find(".bg-indigo-500").remove();
        // Update badge
        var current = parseInt($("#notif-count").text()) || 0;
        updateBadge(Math.max(0, current - 1));
        // Navigate
        if (link) window.location.href = link;
    });

    // ============ Mark all read ============
    $("#notif-mark-all-read").on("click", function (e) {
        e.preventDefault();
        $.ajax({
            url: "/api/notifications/mark-all-read",
            method: "POST",
            success: function () {
                updateBadge(0);
                $(".notif-item").addClass("opacity-60").find(".bg-indigo-500").remove();
            }
        });
    });

    // ============ Toast ============
    function showToast(notification) {
        var $container = $("#notif-toast-container");
        if (!$container.length) {
            $("body").append('<div id="notif-toast-container" class="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none" style="max-width:360px"></div>');
            $container = $("#notif-toast-container");
        }
        var $toast = $(
            '<div class="pointer-events-auto animate-slide-down flex items-start gap-3 bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 cursor-pointer" data-link="' + escapeHtml(notification.link || "") + '">' +
                notifIcon(notification.type) +
                '<div class="min-w-0 flex-1">' +
                    '<p class="text-sm font-medium text-gray-800">' + escapeHtml(notification.title) + '</p>' +
                    '<p class="text-xs text-gray-500">' + escapeHtml(notification.message) + '</p>' +
                '</div>' +
                '<button class="toast-close text-gray-400 hover:text-gray-600 text-lg leading-none shrink-0">&times;</button>' +
            '</div>'
        );
        $toast.on("click", function (e) {
            if ($(e.target).hasClass("toast-close")) {
                $toast.fadeOut(200, function () { $toast.remove(); });
                return;
            }
            var link = $toast.data("link");
            if (link) window.location.href = link;
        });
        $container.append($toast);
        setTimeout(function () {
            $toast.fadeOut(400, function () { $toast.remove(); });
        }, toastTimeout);
    }

    // ============ Browser Push ============
    function sendBrowserPush(notification) {
        if (!("Notification" in window)) return;
        if (Notification.permission !== "granted") return;
        try {
            var n = new Notification(notification.title, {
                body: notification.message,
                icon: "/static/css/style.css", // fallback — no app icon
                tag: "planify-" + notification.id,
            });
            n.onclick = function () {
                window.focus();
                if (notification.link) window.location.href = notification.link;
            };
        } catch (e) {
            // Notification constructor may fail in some contexts
        }
    }

    // ============ Init ============
    loadNotifications();
    setInterval(loadNotifications, POLL_INTERVAL);

})();
