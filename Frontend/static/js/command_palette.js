/**
 * Global command palette (Ctrl/Cmd+K). Navigation, search, and action panels.
 */
(function () {
    "use strict";

    var LS_UNIT = "planify_palette_default_unit";
    var LS_TIMER = "planify_palette_timer_mode";

    var cfgEl = document.getElementById("command-palette-config");
    var CONFIG = { nav: [] };
    if (cfgEl && cfgEl.textContent) {
        try {
            CONFIG = JSON.parse(cfgEl.textContent);
        } catch (e) {
            console.warn("command palette config parse error", e);
        }
    }

    var backdrop = document.getElementById("command-palette-backdrop");
    var modal = document.getElementById("command-palette-modal");
    var input = document.getElementById("command-palette-input");
    var resultsEl = document.getElementById("command-palette-results");
    var panelWrap = document.getElementById("command-palette-panel");
    var panelInner = document.getElementById("command-palette-panel-inner");

    if (!backdrop || !modal || !input || !resultsEl) return;

    var openState = false;
    var selectedIndex = 0;
    var flatResults = [];
    var cache = {
        sessions: [],
        units: [],
        semesters: [],
        icals: [],
        events: [],
        groups: [],
        invitesReceived: [],
        invitesSent: [],
        loadedAt: 0
    };

    var commandPaletteHeader = document.getElementById("command-palette-header");
    var actionPanelOpen = false;
    var pendingActionRestore = null;

    function jsonFetch(url, options) {
        var opts = options || {};
        opts.credentials = "same-origin";
        opts.headers = opts.headers || {};
        if (!opts.headers["Content-Type"] && opts.method && opts.method !== "GET") {
            opts.headers["Content-Type"] = "application/json";
        }
        return fetch(url, opts).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) {
                    var err = new Error((data && data.message) || r.statusText || "Request failed");
                    err.status = r.status;
                    err.body = data;
                    throw err;
                }
                return data;
            });
        });
    }

    function blobMatch(blob, filterText) {
        if (!filterText) return true;
        return String(blob).toLowerCase().indexOf(String(filterText).toLowerCase()) >= 0;
    }

    function sortItems(items) {
        items.sort(function (a, b) {
            return (a.label || "").localeCompare(b.label || "");
        });
        return items;
    }

    function dedupeCalendarEvents(events) {
        var seen = {};
        var out = [];
        if (!events || !events.length) return out;
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            var oid = e.original_id != null ? e.original_id : e.id;
            var key = (e.type || "session") + "-" + String(oid);
            if (seen[key]) continue;
            seen[key] = true;
            out.push(e);
        }
        return out;
    }

    function eventsUrlRange() {
        var start = new Date();
        start.setDate(start.getDate() - 14);
        var end = new Date();
        end.setDate(end.getDate() + 120);
        return "/api/events?start=" + encodeURIComponent(start.toISOString()) + "&end=" + encodeURIComponent(end.toISOString());
    }

    function loadContext() {
        var p1 = jsonFetch("/api/sessions?limit=50").catch(function () { return []; });
        var p2 = jsonFetch("/api/units?archived=false").catch(function () { return []; });
        var p3 = jsonFetch("/api/semesters").catch(function () { return []; });
        var p4 = jsonFetch("/api/ical-calendars").catch(function () { return []; });
        var p5 = jsonFetch(eventsUrlRange()).catch(function () { return []; });
        var p6 = jsonFetch("/api/groups").catch(function () { return []; });
        var p7 = jsonFetch("/api/groups/invitations/pending").catch(function () { return []; });
        var p8 = jsonFetch("/api/groups/invitations/sent").catch(function () { return []; });
        return Promise.all([p1, p2, p3, p4, p5, p6, p7, p8]).then(function (arr) {
            cache.sessions = Array.isArray(arr[0]) ? arr[0] : [];
            cache.units = Array.isArray(arr[1]) ? arr[1] : [];
            cache.semesters = Array.isArray(arr[2]) ? arr[2] : [];
            cache.icals = Array.isArray(arr[3]) ? arr[3] : [];
            cache.events = Array.isArray(arr[4]) ? dedupeCalendarEvents(arr[4]) : [];
            cache.groups = Array.isArray(arr[5]) ? arr[5] : [];
            cache.invitesReceived = Array.isArray(arr[6]) ? arr[6] : [];
            cache.invitesSent = Array.isArray(arr[7]) ? arr[7] : [];
            cache.loadedAt = Date.now();
        });
    }

    // ── Group helpers ──────────────────────────────────────────────────────────

    function groupsWhere(predicate) {
        var out = [];
        for (var i = 0; i < cache.groups.length; i++) {
            if (predicate(cache.groups[i])) out.push(cache.groups[i]);
        }
        return out;
    }

    function isOwnerOrAdmin(g) {
        return g.is_owner || g.my_role === "admin";
    }

    function ownedGroups() {
        return groupsWhere(function (g) { return g.is_owner; });
    }

    function adminOrOwnerGroups() {
        return groupsWhere(isOwnerOrAdmin);
    }

    function nonOwnerGroups() {
        return groupsWhere(function (g) { return !g.is_owner; });
    }

    function buildGroupActionItems(filter) {
        var items = [];
        var hasGroups = cache.groups.length > 0;
        var hasOwned = ownedGroups().length > 0;
        var hasAdminish = adminOrOwnerGroups().length > 0;
        var hasNonOwner = nonOwnerGroups().length > 0;
        var hasReceived = cache.invitesReceived.length > 0;
        var hasSent = cache.invitesSent.length > 0;

        function add(row) {
            var blob = row.label + " " + (row.keywords || "");
            if (!blobMatch(blob, filter)) return;
            items.push(row);
        }

        add({
            label: "Go to Groups hub",
            category: "Groups",
            kind: "group-nav-hub",
            keywords: "navigate open page list"
        });

        if (hasGroups) {
            add({
                label: "Open a group…",
                category: "Groups",
                kind: "action-panel",
                action: "panel-group-open",
                keywords: "navigate jump enter feed"
            });
        }

        add({
            label: "Create new group",
            category: "Group actions",
            kind: "action-panel",
            action: "panel-group-create",
            keywords: "new add make"
        });

        if (hasReceived) {
            add({
                label: "Pending invites you received (" + cache.invitesReceived.length + ")",
                category: "Group invites",
                kind: "action-panel",
                action: "panel-group-invites-received",
                keywords: "accept decline incoming inbox"
            });
        }

        if (hasSent) {
            add({
                label: "Pending invites you sent (" + cache.invitesSent.length + ")",
                category: "Group invites",
                kind: "action-panel",
                action: "panel-group-invites-sent",
                keywords: "cancel withdraw outgoing"
            });
        }

        if (hasAdminish) {
            add({
                label: "Invite someone by friend code",
                category: "Group actions",
                kind: "action-panel",
                action: "panel-group-invite",
                keywords: "add member friend code send"
            });
            add({
                label: "Remove a member",
                category: "Group actions",
                kind: "action-panel",
                action: "panel-group-remove-member",
                keywords: "kick boot delete moderation"
            });
            add({
                label: "View group audit log",
                category: "Group actions",
                kind: "action-panel",
                action: "panel-group-audit",
                keywords: "moderation history actions log"
            });
        }

        if (hasOwned) {
            add({
                label: "Promote / demote admin",
                category: "Owner",
                kind: "action-panel",
                action: "panel-group-role",
                keywords: "role admin member"
            });
            add({
                label: "Edit group (name / description)",
                category: "Owner",
                kind: "action-panel",
                action: "panel-group-edit",
                keywords: "rename update settings"
            });
            add({
                label: "Delete a group",
                category: "Owner",
                kind: "action-panel",
                action: "panel-group-delete",
                keywords: "destroy remove permanent"
            });
        }

        if (hasGroups) {
            add({
                label: "Quick post to a group",
                category: "Group actions",
                kind: "action-panel",
                action: "panel-group-post",
                keywords: "share message text feed write"
            });
        }

        if (hasNonOwner) {
            add({
                label: "Leave a group",
                category: "Group actions",
                kind: "action-panel",
                action: "panel-group-leave",
                keywords: "quit exit unjoin"
            });
        }

        return items;
    }

    function buildResultItems(query) {
        var raw = (query || "").trim();
        if (raw === "") return [];

        var nav = CONFIG.nav || [];

        // /help — handled in renderResults (no list rows)
        if (/^\/help$/i.test(raw) || raw.toLowerCase().startsWith("/help ")) {
            return [];
        }

        function itemFromConfig(n) {
            return {
                label: n.label,
                category: n.category || "More",
                url: n.url,
                action: n.action,
                kind: n.url ? "nav" : "action",
                id: n.id,
                slash: n.slash,
                keywords: n.keywords
            };
        }

        var nm = raw.match(/^\/n\s*(.*)$/i);
        if (nm) {
            var nFilter = (nm[1] || "").trim();
            var nItems = [];
            for (var ni = 0; ni < nav.length; ni++) {
                var cn = nav[ni];
                if (!cn.url) continue;
                var nblob = cn.label + " " + (cn.keywords || "");
                if (!blobMatch(nblob, nFilter)) continue;
                nItems.push(itemFromConfig(cn));
            }
            for (var s = 0; s < cache.sessions.length; s++) {
                var sess = cache.sessions[s];
                var title = sess.title || "Session";
                var sblob = "Open session: " + title + " session";
                if (!blobMatch(sblob, nFilter)) continue;
                nItems.push({
                    label: "Open session: " + title,
                    category: "Sessions",
                    kind: "session-open",
                    sessionId: sess.id
                });
            }
            for (var u = 0; u < cache.units.length; u++) {
                var unit = cache.units[u];
                var uname = (unit.code ? unit.code + " " : "") + unit.name;
                var ublob = "Unit: " + uname;
                if (!blobMatch(ublob, nFilter)) continue;
                nItems.push({
                    label: "Unit: " + uname,
                    category: "Units",
                    kind: "goto-units"
                });
            }
            for (var m = 0; m < cache.semesters.length; m++) {
                var sem = cache.semesters[m];
                var sb = "Semester: " + sem.name;
                if (!blobMatch(sb, nFilter)) continue;
                nItems.push({
                    label: "Semester: " + sem.name,
                    category: "Semesters",
                    kind: "goto-academic"
                });
            }
            for (var e = 0; e < cache.events.length; e++) {
                var ev = cache.events[e];
                var elabel = "Calendar: " + ev.title + " (" + (ev.type || "session") + ")";
                var eblob = elabel + " " + (ev.title || "");
                if (!blobMatch(eblob, nFilter)) continue;
                var oid = ev.original_id != null ? ev.original_id : ev.id;
                nItems.push({
                    label: elabel,
                    category: "Calendar",
                    kind: "goto-calendar",
                    eventId: oid,
                    eventType: ev.type || "session"
                });
            }
            return sortItems(nItems);
        }

        var am = raw.match(/^\/a\s*(.*)$/i);
        if (am) {
            var aFilter = (am[1] || "").trim();
            var aItems = [];
            for (var ai = 0; ai < nav.length; ai++) {
                var ca = nav[ai];
                if (!ca.action) continue;
                var ablob = ca.label + " " + (ca.keywords || "");
                if (!blobMatch(ablob, aFilter)) continue;
                aItems.push(itemFromConfig(ca));
            }
            return sortItems(aItems);
        }

        // /gr - <name>  → search groups by name (open feed)
        var grName = raw.match(/^\/gr\s*-\s*(.*)$/i);
        if (grName) {
            var nameFilter = (grName[1] || "").trim();
            var nItems = [];
            for (var gx = 0; gx < cache.groups.length; gx++) {
                var grp = cache.groups[gx];
                var blob = grp.name + " " + (grp.description || "");
                if (!blobMatch(blob, nameFilter)) continue;
                var roleSuffix = grp.is_owner ? " · owner" : (grp.my_role === "admin" ? " · admin" : " · member");
                nItems.push({
                    label: "Open group: " + grp.name + roleSuffix,
                    category: "Groups",
                    kind: "group-open",
                    groupId: grp.id
                });
            }
            return sortItems(nItems);
        }

        // /gr [filter]  → group actions, role-aware
        var grAction = raw.match(/^\/gr\s*(.*)$/i);
        if (grAction) {
            var gFilter = (grAction[1] || "").trim();
            return buildGroupActionItems(gFilter);
        }

        // Global search: any text, match config + entities
        var gFilter = raw.replace(/^\/+/, "").trim();
        if (gFilter === "") return [];
        var items = [];
        for (var gi = 0; gi < nav.length; gi++) {
            var gn = nav[gi];
            var gblob = gn.label + " " + (gn.keywords || "") + " " + (gn.category || "");
            if (!blobMatch(gblob, gFilter)) continue;
            items.push(itemFromConfig(gn));
        }
        for (var s2 = 0; s2 < cache.sessions.length; s2++) {
            var sess2 = cache.sessions[s2];
            var title2 = sess2.title || "Session";
            var blob2 = (title2 + " session open").toLowerCase();
            if (!blobMatch(blob2, gFilter)) continue;
            items.push({
                label: "Open session: " + title2,
                category: "Sessions",
                kind: "session-open",
                sessionId: sess2.id
            });
        }
        for (var u2 = 0; u2 < cache.units.length; u2++) {
            var unit2 = cache.units[u2];
            var uname2 = (unit2.code ? unit2.code + " " : "") + unit2.name;
            if (!blobMatch(uname2 + " unit", gFilter)) continue;
            items.push({
                label: "Unit: " + uname2,
                category: "Units",
                kind: "goto-units"
            });
        }
        for (var m2 = 0; m2 < cache.semesters.length; m2++) {
            var sem2 = cache.semesters[m2];
            if (!blobMatch(sem2.name + " semester", gFilter)) continue;
            items.push({
                label: "Semester: " + sem2.name,
                category: "Semesters",
                kind: "goto-academic"
            });
        }
        for (var e2 = 0; e2 < cache.events.length; e2++) {
            var ev2 = cache.events[e2];
            if (!blobMatch(ev2.title + " calendar", gFilter)) continue;
            var oid2 = ev2.original_id != null ? ev2.original_id : ev2.id;
            items.push({
                label: "Calendar: " + ev2.title + " (" + (ev2.type || "session") + ")",
                category: "Calendar",
                kind: "goto-calendar",
                eventId: oid2,
                eventType: ev2.type || "session"
            });
        }
        return sortItems(items);
    }

    var CHEVRON_SVG =
        '<svg class="cp-row-chevron w-4 h-4 shrink-0 text-primary_purp/80 opacity-90" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>';

    function updateSelectionHighlight() {
        var base =
            "command-palette-row w-full text-left mx-2 pl-3 pr-3 py-2.5 mb-0.5 rounded-xl flex items-center gap-3 border-l-[3px] ";
        resultsEl.querySelectorAll(".command-palette-row").forEach(function (btn) {
            var idx = parseInt(btn.getAttribute("data-idx"), 10);
            var active = idx === selectedIndex;
            btn.setAttribute("aria-selected", active ? "true" : "false");
            btn.className =
                base +
                (active
                    ? "command-palette-row-active border-primary_purp text-slate-900"
                    : "border-transparent text-slate-800 hover:bg-slate-100");
            var chev = btn.querySelector(".cp-row-chevron");
            if (active) {
                if (!chev) btn.insertAdjacentHTML("beforeend", CHEVRON_SVG);
            } else if (chev) {
                chev.remove();
            }
        });
    }

    function scrollActiveIntoView() {
        var row = resultsEl.querySelector(".command-palette-row-active");
        if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function renderHelpHtml() {
        return (
            '<div class="px-5 py-4 text-sm text-slate-700 roboto-regular space-y-3 leading-relaxed">' +
            '<p class="font-semibold text-slate-900">Slash commands</p>' +
            '<ul class="list-disc pl-5 space-y-2 text-slate-700">' +
            '<li><span class="font-mono text-primary_purp font-medium">/n</span> — Navigation: pages, settings, open sessions, units, semesters, calendar. Narrow after the space, e.g. <span class="font-mono text-slate-600">/n scores</span>, <span class="font-mono text-slate-600">/n calendar settings</span>.</li>' +
            '<li><span class="font-mono text-primary_purp font-medium">/a</span> — Actions: quick forms. e.g. <span class="font-mono text-slate-600">/a add unit</span></li>' +
            '<li><span class="font-mono text-primary_purp font-medium">/gr</span> — Groups: actions filtered by your role (create, invite, audit, leave…). Use <span class="font-mono text-slate-600">/gr - name</span> to jump straight to a group by name.</li>' +
            '<li><span class="font-mono text-primary_purp font-medium">/help</span> — Show this help.</li>' +
            "<li>Or search without a prefix to match commands and your data together.</li>" +
            "</ul>" +
            '<p class="text-xs text-slate-500 pt-1 border-t border-slate-100"><span class="cp-kbd">↑</span> <span class="cp-kbd">↓</span> select a result · <span class="cp-kbd">Enter</span> run · <span class="cp-kbd">Esc</span> close palette</p>' +
            "</div>"
        );
    }

    function enterActionPanelMode() {
        if (actionPanelOpen) return;
        pendingActionRestore = { query: input.value, selectedIndex: selectedIndex };
        actionPanelOpen = true;
        if (commandPaletteHeader) commandPaletteHeader.classList.add("hidden");
        resultsEl.classList.add("hidden");
        modal.classList.add("cp-action-sheet");
        panelWrap.classList.add("cp-panel-floating");
    }

    function exitActionPanelMode() {
        if (!actionPanelOpen) return;
        actionPanelOpen = false;
        hidePanel();
        if (commandPaletteHeader) commandPaletteHeader.classList.remove("hidden");
        resultsEl.classList.remove("hidden");
        modal.classList.remove("cp-action-sheet");
        panelWrap.classList.remove("cp-panel-floating");
        if (pendingActionRestore) {
            input.value = pendingActionRestore.query;
            selectedIndex = pendingActionRestore.selectedIndex;
            pendingActionRestore = null;
        }
        renderResults();
        if (flatResults.length > 0) {
            selectedIndex = Math.min(Math.max(0, selectedIndex), flatResults.length - 1);
            updateSelectionHighlight();
            scrollActiveIntoView();
        }
        input.focus();
    }

    function hidePanel() {
        panelWrap.classList.add("hidden");
        panelInner.innerHTML = "";
        panelInner.classList.remove("cp-panel-reveal-active");
    }

    function showPanel(html) {
        panelWrap.classList.remove("hidden");
        panelInner.innerHTML =
            html +
            '<p class="text-xs text-slate-500 mt-4 pt-3 border-t border-slate-100 roboto-regular"><span class="cp-kbd">Esc</span> — back to command palette (restores your search)</p>';
        panelInner.classList.remove("cp-panel-reveal-active");
        void panelInner.offsetWidth;
        panelInner.classList.add("cp-panel-reveal-active");
        bindPanelForms();
        window.setTimeout(function () {
            var fe =
                panelInner.querySelector("input:not([type=hidden]):not(.sr-only), select, textarea");
            if (!fe) fe = panelInner.querySelector("button[type='submit'], button");
            if (fe) fe.focus();
        }, 40);
    }

    function renderResults() {
        var q = input.value;
        var qt = q.trim();

        if (/^\/help$/i.test(qt) || qt.toLowerCase().startsWith("/help ")) {
            flatResults = [];
            selectedIndex = 0;
            resultsEl.innerHTML = renderHelpHtml();
            return;
        }

        flatResults = buildResultItems(q);
        selectedIndex = Math.min(selectedIndex, Math.max(0, flatResults.length - 1));

        if (flatResults.length === 0) {
            if (qt === "") {
                resultsEl.innerHTML = "";
                return;
            }
            resultsEl.innerHTML =
                '<div class="px-6 py-12 text-center">' +
                '<p class="text-sm font-medium text-slate-800">No matches</p>' +
                '<p class="text-xs text-slate-500 mt-2 max-w-sm mx-auto">Try <span class="font-mono text-slate-600">/n</span> for navigation, <span class="font-mono text-slate-600">/a</span> for actions, <span class="font-mono text-slate-600">/gr</span> for groups, or <span class="font-mono text-slate-600">/help</span>.</p>' +
                "</div>";
            return;
        }

        var byCat = {};
        for (var i = 0; i < flatResults.length; i++) {
            var it = flatResults[i];
            var c = it.category;
            if (!byCat[c]) byCat[c] = [];
            byCat[c].push({ item: it, idx: i });
        }

        var html = "";
        var cats = Object.keys(byCat);
        var rowCounter = 0;
        for (var ci = 0; ci < cats.length; ci++) {
            var cat = cats[ci];
            html +=
                '<div class="command-palette-cat px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 sticky top-0 z-[1] border-b border-slate-200/90">' +
                escapeHtml(cat) +
                "</div>";
            var group = byCat[cat];
            for (var gi = 0; gi < group.length; gi++) {
                var g = group[gi];
                var active = g.idx === selectedIndex;
                var delay = Math.min(rowCounter * 24, 280);
                rowCounter++;
                html +=
                    '<button type="button" role="option" aria-selected="' +
                    (active ? "true" : "false") +
                    '" data-idx="' +
                    g.idx +
                    '" class="command-palette-row command-palette-row-in w-full text-left mx-2 pl-3 pr-3 py-2.5 mb-0.5 rounded-xl flex items-center gap-3 border-l-[3px] ' +
                    (active
                        ? "command-palette-row-active border-primary_purp text-slate-900"
                        : "border-transparent text-slate-800 hover:bg-slate-100") +
                    '" style="animation-delay:' +
                    delay +
                    'ms">' +
                    '<span class="flex-1 min-w-0 truncate roboto-regular text-sm leading-snug">' +
                    escapeHtml(g.item.label) +
                    "</span>" +
                    (active
                        ? '<svg class="cp-row-chevron w-4 h-4 shrink-0 text-primary_purp/80 opacity-90" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>'
                        : "") +
                    "</button>";
            }
        }
        resultsEl.innerHTML = html;

        var activeRow = resultsEl.querySelector(".command-palette-row-active");
        if (activeRow) activeRow.scrollIntoView({ block: "nearest" });
    }

    function escapeHtml(str) {
        if (str == null) return "";
        var d = document.createElement("div");
        d.textContent = str;
        return d.innerHTML;
    }

    function runSelected() {
        var it = flatResults[selectedIndex];
        if (!it) return;

        if (it.kind === "nav" && it.url) {
            closePalette();
            window.location.href = it.url;
            return;
        }

        if (it.kind === "session-open" && it.sessionId) {
            closePalette();
            window.location.href = "/sessions?session=" + encodeURIComponent(String(it.sessionId));
            return;
        }

        if (it.kind === "goto-units") {
            closePalette();
            var navItem = (CONFIG.nav || []).filter(function (n) { return n.id === "go-units"; })[0];
            window.location.href = navItem ? navItem.url : "/units";
            return;
        }

        if (it.kind === "goto-academic") {
            var navA = (CONFIG.nav || []).filter(function (n) { return n.id === "go-academic"; })[0];
            closePalette();
            window.location.href = navA ? navA.url : "/settings/academic";
            return;
        }

        if (it.kind === "goto-calendar") {
            var navC = (CONFIG.nav || []).filter(function (n) { return n.id === "go-calendar"; })[0];
            closePalette();
            window.location.href = navC ? navC.url : "/calendar";
            return;
        }

        if (it.kind === "group-nav-hub") {
            closePalette();
            window.location.href = "/groups";
            return;
        }

        if (it.kind === "group-open" && it.groupId != null) {
            closePalette();
            window.location.href = "/api/groups/" + encodeURIComponent(String(it.groupId));
            return;
        }

        if (it.action) {
            renderActionPanel(it.action);
            return;
        }
    }

    function icalColorPicker(name, selected, prefix) {
        var colors = ["#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];
        var html = '<div class="flex flex-wrap gap-2" data-ical-colors="' + escapeHtml(name) + '">';
        for (var i = 0; i < colors.length; i++) {
            var c = colors[i];
            var ring = selected === c ? " ring-2 ring-offset-2 ring-indigo-400" : "";
            html +=
                '<button type="button" class="w-7 h-7 rounded-full border border-gray-200 ical-palette-dot' +
                ring +
                '" data-color="' +
                c +
                '" style="background:' +
                c +
                '"></button>';
        }
        html += '<input type="hidden" id="' + prefix + '-ical-color" value="' + escapeHtml(selected) + '" /></div>';
        return html;
    }

    function renderActionPanel(action) {
        enterActionPanelMode();
        if (action === "panel-new-session") {
            var unitOpts = '<option value="">None</option>';
            for (var i = 0; i < cache.units.length; i++) {
                var u = cache.units[i];
                unitOpts +=
                    '<option value="' +
                    u.id +
                    '">' +
                    escapeHtml((u.code ? u.code + " — " : "") + u.name) +
                    "</option>";
            }
            var defUnit = localStorage.getItem(LS_UNIT) || "";
            var defTimer = localStorage.getItem(LS_TIMER) || "stopwatch";
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3 montserrat-semi-bold">Quick create session</h3>' +
                '<p class="text-xs text-gray-500 mb-3">Creates a saved session immediately (same as ending a live session). Defaults are remembered for next time.</p>' +
                '<form id="cp-form-new-session" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Name</label>' +
                '<input required name="name" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Study block" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">First checklist item</label>' +
                '<input required name="checklist" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Task 1" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Unit</label>' +
                '<select name="unit_id" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">' +
                unitOpts +
                "</select></div>" +
                '<div><label class="block text-xs text-gray-600 mb-1">Timer mode</label>' +
                '<select name="timer_mode" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">' +
                '<option value="stopwatch"' +
                (defTimer === "stopwatch" ? " selected" : "") +
                '>Stopwatch</option>' +
                '<option value="countdown"' +
                (defTimer === "countdown" ? " selected" : "") +
                '>Countdown</option>' +
                "</select></div>" +
                '<div id="cp-countdown-fields" class="grid grid-cols-2 gap-2' +
                (defTimer === "countdown" ? "" : " hidden") +
                '">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Hours</label><input type="number" min="0" name="ch" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="0" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Minutes</label><input type="number" min="0" name="cm" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="25" /></div>' +
                "</div>" +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<div class="flex gap-2 pt-2">' +
                '<button type="submit" class="flex-1 rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium hover:opacity-95">Create & open</button>' +
                '<a href="/sessions" class="px-4 py-2.5 text-sm text-indigo-600 rounded-xl border border-indigo-200 hover:bg-indigo-50">Full setup</a>' +
                "</div></form>"
            );
            var selUnit = panelInner.querySelector('select[name="unit_id"]');
            if (selUnit && defUnit) selUnit.value = defUnit;
            var tmSel = panelInner.querySelector('select[name="timer_mode"]');
            if (tmSel) {
                tmSel.addEventListener("change", function () {
                    var cd = panelInner.querySelector("#cp-countdown-fields");
                    if (cd) cd.classList.toggle("hidden", tmSel.value !== "countdown");
                });
            }
            return;
        }

        if (action === "panel-add-unit") {
            var semOpts = '<option value="">No semester</option>';
            for (var s = 0; s < cache.semesters.length; s++) {
                var sm = cache.semesters[s];
                semOpts += '<option value="' + sm.id + '">' + escapeHtml(sm.name) + "</option>";
            }
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Add unit</h3>' +
                '<form id="cp-form-unit" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Name</label><input required name="name" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Code (optional)</label><input name="code" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Semester</label><select name="semester_id" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">' +
                semOpts +
                "</select></div>" +
                '<div><label class="block text-xs text-gray-600 mb-1">Credits</label><input type="number" min="0" name="credits" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="6" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Color</label><input type="color" name="color" class="h-10 w-full rounded-lg border border-gray-200" value="#6366f1" /></div>' +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">Create unit</button>' +
                "</form>"
            );
            return;
        }

        if (action === "panel-add-semester") {
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Add semester</h3>' +
                '<form id="cp-form-sem-add" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Name</label><input required name="name" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Start date</label><input required type="date" name="start_date" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">End date</label><input required type="date" name="end_date" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>' +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">Create semester</button>' +
                "</form>"
            );
            return;
        }

        if (action === "panel-edit-semester") {
            var opts = "";
            for (var e = 0; e < cache.semesters.length; e++) {
                var sem = cache.semesters[e];
                opts += '<option value="' + sem.id + '">' + escapeHtml(sem.name) + "</option>";
            }
            if (!opts) {
                showPanel('<p class="text-sm text-gray-500">No semesters yet. Use Academic Settings or Add semester.</p>');
                return;
            }
            var first = cache.semesters[0];
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Edit semester</h3>' +
                '<form id="cp-form-sem-edit" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Semester</label><select id="cp-sem-pick" name="sem_id" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">' +
                opts +
                "</select></div>" +
                '<div><label class="block text-xs text-gray-600 mb-1">Name</label><input required name="name" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="' +
                escapeHtml(first.name) +
                '" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Start date</label><input required type="date" name="start_date" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="' +
                first.start_date +
                '" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">End date</label><input required type="date" name="end_date" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="' +
                first.end_date +
                '" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">WAM (optional)</label><input type="number" step="0.01" name="wam" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="' +
                (first.wam != null ? escapeHtml(String(first.wam)) : "") +
                '" /></div>' +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">Save semester</button>' +
                "</form>"
            );
            var pick = document.getElementById("cp-sem-pick");
            if (pick) {
                pick.addEventListener("change", function () {
                    var id = parseInt(pick.value, 10);
                    var found = cache.semesters.filter(function (x) { return x.id === id; })[0];
                    if (!found) return;
                    var form = document.getElementById("cp-form-sem-edit");
                    if (!form) return;
                    form.name.value = found.name;
                    form.start_date.value = found.start_date;
                    form.end_date.value = found.end_date;
                    form.wam.value = found.wam != null ? found.wam : "";
                });
            }
            return;
        }

        if (action === "panel-add-ical") {
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Add iCal feed</h3>' +
                '<form id="cp-form-ical-add" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Name</label><input required name="name" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">URL (https://…)</label><input required name="url" type="url" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="https://" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Color</label>' +
                icalColorPicker("add", "#3b82f6", "cp") +
                "</div>" +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">Add calendar</button>' +
                "</form>"
            );
            wireIcalDots(panelInner.querySelector('[data-ical-colors]'), "cp-ical-color");
            return;
        }

        if (action === "panel-edit-ical") {
            if (!cache.icals.length) {
                showPanel('<p class="text-sm text-gray-500">No iCal calendars. Add one from here or Calendar Settings.</p>');
                return;
            }
            var iopts = "";
            for (var i = 0; i < cache.icals.length; i++) {
                var ic = cache.icals[i];
                iopts += '<option value="' + ic.id + '">' + escapeHtml(ic.name) + "</option>";
            }
            var ic0 = cache.icals[0];
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Edit iCal calendar</h3>' +
                '<form id="cp-form-ical-edit" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Calendar</label><select id="cp-ical-pick" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">' +
                iopts +
                "</select></div>" +
                '<div><label class="block text-xs text-gray-600 mb-1">Name</label><input required name="name" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="' +
                escapeHtml(ic0.name) +
                '" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">URL</label><input required name="url" type="url" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="' +
                escapeHtml(ic0.url) +
                '" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Color</label>' +
                icalColorPicker("edit", ic0.color || "#3b82f6", "cp-ed") +
                "</div>" +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">Save</button>' +
                "</form>"
            );
            wireIcalDots(panelInner.querySelector('[data-ical-colors]'), "cp-ed-ical-color");
            var ip = document.getElementById("cp-ical-pick");
            if (ip) {
                ip.addEventListener("change", function () {
                    var id = parseInt(ip.value, 10);
                    var cal = cache.icals.filter(function (x) { return x.id === id; })[0];
                    if (!cal) return;
                    var form = document.getElementById("cp-form-ical-edit");
                    if (!form) return;
                    form.name.value = cal.name;
                    form.url.value = cal.url;
                    var hid = document.getElementById("cp-ed-ical-color");
                    if (hid) hid.value = cal.color || "#3b82f6";
                    panelInner.querySelectorAll(".ical-palette-dot").forEach(function (d) {
                        d.classList.toggle("ring-2", d.getAttribute("data-color") === hid.value);
                        d.classList.toggle("ring-offset-2", d.getAttribute("data-color") === hid.value);
                        d.classList.toggle("ring-indigo-400", d.getAttribute("data-color") === hid.value);
                    });
                });
            }
            return;
        }

        if (action === "panel-event-create") {
            var uo = '<option value="">None</option>';
            for (var ui = 0; ui < cache.units.length; ui++) {
                var ux = cache.units[ui];
                uo += '<option value="' + ux.id + '">' + escapeHtml((ux.code ? ux.code + " — " : "") + ux.name) + "</option>";
            }
            var now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            var localIso = now.toISOString().slice(0, 16);
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Create event</h3>' +
                '<form id="cp-form-event-create" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Type</label>' +
                '<select name="etype" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">' +
                '<option value="session">Study session (calendar block)</option>' +
                '<option value="task">Task / deadline</option>' +
                "</select></div>" +
                '<div><label class="block text-xs text-gray-600 mb-1">Title</label><input required name="title" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Start</label><input required type="datetime-local" name="start" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="' +
                localIso +
                '" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Duration (minutes)</label><input type="number" min="1" name="duration" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="60" /></div>' +
                '<div id="cp-event-unit-wrap"><label class="block text-xs text-gray-600 mb-1">Unit (sessions only)</label><select name="unit_id" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">' +
                uo +
                "</select></div>" +
                '<div id="cp-event-desc-wrap" class="hidden"><label class="block text-xs text-gray-600 mb-1">Description</label><textarea name="description" rows="2" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"></textarea></div>' +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">Create</button>' +
                "</form>"
            );
            var et = panelInner.querySelector('select[name="etype"]');
            if (et) {
                et.addEventListener("change", function () {
                    var isTask = et.value === "task";
                    panelInner.querySelector("#cp-event-unit-wrap").classList.toggle("hidden", isTask);
                    panelInner.querySelector("#cp-event-desc-wrap").classList.toggle("hidden", !isTask);
                    var dur = panelInner.querySelector('input[name="duration"]');
                    if (dur) dur.value = isTask ? "30" : "60";
                });
            }
            return;
        }

        if (action === "panel-event-edit") {
            if (!cache.events.length) {
                showPanel('<p class="text-sm text-gray-500">No calendar items in range. Open Calendar to add events.</p>');
                return;
            }
            var evOpts = "";
            for (var j = 0; j < cache.events.length; j++) {
                var ev = cache.events[j];
                var eid = ev.original_id != null ? ev.original_id : ev.id;
                evOpts +=
                    '<option value="' +
                    eid +
                    '" data-type="' +
                    (ev.type || "session") +
                    '">' +
                    escapeHtml(ev.title) +
                    " (" +
                    (ev.type || "session") +
                    ")</option>";
            }
            var ev0 = cache.events[0];
            var eid0 = ev0.original_id != null ? ev0.original_id : ev0.id;
            var dt0 = toDatetimeLocal(ev0.start);
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Edit event</h3>' +
                '<form id="cp-form-event-edit" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Event</label><select id="cp-event-pick" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">' +
                evOpts +
                "</select></div>" +
                '<input type="hidden" name="etype" value="' +
                (ev0.type || "session") +
                '" />' +
                '<div><label class="block text-xs text-gray-600 mb-1">Title</label><input required name="title" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="' +
                escapeHtml(ev0.title) +
                '" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Start</label><input required type="datetime-local" name="start" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="' +
                dt0 +
                '" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Duration (minutes)</label><input type="number" min="1" name="duration" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="' +
                (ev0.duration || 60) +
                '" /></div>' +
                '<div id="cp-ev-edit-desc" class="' +
                (ev0.type === "task" ? "" : "hidden") +
                '"><label class="block text-xs text-gray-600 mb-1">Description</label><textarea name="description" rows="2" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">' +
                escapeHtml(ev0.description || "") +
                "</textarea></div>" +
                '<div id="cp-ev-edit-completed" class="' +
                (ev0.type === "task" ? "" : "hidden") +
                '"><label class="flex items-center gap-2 text-sm"><input type="checkbox" name="completed" ' +
                (ev0.completed ? "checked" : "") +
                " /> Completed</label></div>" +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">Save changes</button>' +
                "</form>"
            );
            var ep = document.getElementById("cp-event-pick");
            if (ep) {
                ep.addEventListener("change", function () {
                    var opt = ep.options[ep.selectedIndex];
                    var tid = opt.getAttribute("data-type");
                    var idNum = parseInt(ep.value, 10);
                    var found = null;
                    for (var z = 0; z < cache.events.length; z++) {
                        var ee = cache.events[z];
                        var oid = ee.original_id != null ? ee.original_id : ee.id;
                        if (String(oid) === String(idNum) && (ee.type || "session") === tid) {
                            found = ee;
                            break;
                        }
                    }
                    if (!found) return;
                    var fm = document.getElementById("cp-form-event-edit");
                    if (!fm) return;
                    fm.etype.value = found.type || "session";
                    fm.title.value = found.title;
                    fm.start.value = toDatetimeLocal(found.start);
                    fm.duration.value = found.duration || (found.type === "task" ? 30 : 60);
                    var dw = document.getElementById("cp-ev-edit-desc");
                    var cw = document.getElementById("cp-ev-edit-completed");
                    var isTask = found.type === "task";
                    if (dw) {
                        dw.classList.toggle("hidden", !isTask);
                        if (fm.description) fm.description.value = found.description || "";
                    }
                    if (cw) {
                        cw.classList.toggle("hidden", !isTask);
                        if (fm.completed) fm.completed.checked = !!found.completed;
                    }
                });
            }
            return;
        }

        if (action === "panel-group-create") {
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Create new group</h3>' +
                '<form id="cp-form-group-create" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Group name</label><input required name="name" maxlength="120" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="e.g. Algorithms Study Group" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Description (optional)</label><textarea name="description" rows="2" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"></textarea></div>' +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">Create group</button>' +
                "</form>"
            );
            return;
        }

        if (action === "panel-group-open") {
            if (!cache.groups.length) {
                showPanel('<p class="text-sm text-gray-500">You have no groups yet. Use Create new group.</p>');
                return;
            }
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Open a group</h3>' +
                '<form id="cp-form-group-open" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Group</label>' +
                renderGroupSelect("group_id", cache.groups) +
                "</div>" +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">Open</button>' +
                "</form>"
            );
            return;
        }

        if (action === "panel-group-invite") {
            var inviteGroups = adminOrOwnerGroups();
            if (!inviteGroups.length) {
                showPanel('<p class="text-sm text-gray-500">You are not an admin or owner of any group.</p>');
                return;
            }
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Invite by friend code</h3>' +
                '<form id="cp-form-group-invite" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Group</label>' +
                renderGroupSelect("group_id", inviteGroups) +
                "</div>" +
                '<div><label class="block text-xs text-gray-600 mb-1">Friend code</label><input required name="friend_code" maxlength="8" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase tracking-widest" placeholder="ABCD1234" /></div>' +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">Send invite</button>' +
                "</form>"
            );
            return;
        }

        if (action === "panel-group-invites-received") {
            if (!cache.invitesReceived.length) {
                showPanel('<p class="text-sm text-gray-500">No pending invites.</p>');
                return;
            }
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Invites you received</h3>' +
                '<div id="cp-invites-received-list" class="space-y-2">' +
                renderReceivedInvites(cache.invitesReceived) +
                "</div>"
            );
            return;
        }

        if (action === "panel-group-invites-sent") {
            if (!cache.invitesSent.length) {
                showPanel('<p class="text-sm text-gray-500">No outgoing invites.</p>');
                return;
            }
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Invites you sent</h3>' +
                '<div id="cp-invites-sent-list" class="space-y-2">' +
                renderSentInvites(cache.invitesSent) +
                "</div>"
            );
            return;
        }

        if (action === "panel-group-audit") {
            var auditGroups = adminOrOwnerGroups();
            if (!auditGroups.length) {
                showPanel('<p class="text-sm text-gray-500">You are not an admin or owner of any group.</p>');
                return;
            }
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Group audit log</h3>' +
                '<form id="cp-form-group-audit" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Group</label>' +
                renderGroupSelect("group_id", auditGroups) +
                "</div>" +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">View log</button>' +
                "</form>" +
                '<div id="cp-audit-result" class="mt-3"></div>'
            );
            return;
        }

        if (action === "panel-group-remove-member") {
            var rmGroups = adminOrOwnerGroups();
            if (!rmGroups.length) {
                showPanel('<p class="text-sm text-gray-500">You are not an admin or owner of any group.</p>');
                return;
            }
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Remove a member</h3>' +
                '<form id="cp-form-group-remove" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Group</label>' +
                renderGroupSelect("group_id", rmGroups, "cp-rm-group") +
                "</div>" +
                '<div><label class="block text-xs text-gray-600 mb-1">Member</label>' +
                '<select required name="user_id" id="cp-rm-member" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="">Loading…</option></select>' +
                "</div>" +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-red-600 text-white py-2.5 text-sm font-medium">Remove member</button>' +
                "</form>"
            );
            wireMemberPicker("cp-rm-group", "cp-rm-member", { excludeOwner: true, excludeSelf: true });
            return;
        }

        if (action === "panel-group-role") {
            var roleGroups = ownedGroups();
            if (!roleGroups.length) {
                showPanel('<p class="text-sm text-gray-500">You do not own any group.</p>');
                return;
            }
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Promote / demote admin</h3>' +
                '<form id="cp-form-group-role" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Group</label>' +
                renderGroupSelect("group_id", roleGroups, "cp-role-group") +
                "</div>" +
                '<div><label class="block text-xs text-gray-600 mb-1">Member</label>' +
                '<select required name="user_id" id="cp-role-member" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="">Loading…</option></select>' +
                "</div>" +
                '<div><label class="block text-xs text-gray-600 mb-1">New role</label>' +
                '<select required name="role" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">' +
                '<option value="admin">Admin</option><option value="member">Member</option>' +
                "</select></div>" +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">Save role</button>' +
                "</form>"
            );
            wireMemberPicker("cp-role-group", "cp-role-member", { excludeOwner: true, excludeSelf: true });
            return;
        }

        if (action === "panel-group-edit") {
            var editGroups = ownedGroups();
            if (!editGroups.length) {
                showPanel('<p class="text-sm text-gray-500">You do not own any group.</p>');
                return;
            }
            var first = editGroups[0];
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Edit group</h3>' +
                '<form id="cp-form-group-edit" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Group</label>' +
                renderGroupSelect("group_id", editGroups, "cp-edit-group") +
                "</div>" +
                '<div><label class="block text-xs text-gray-600 mb-1">Name</label><input required name="name" maxlength="120" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="' +
                escapeHtml(first.name) +
                '" /></div>' +
                '<div><label class="block text-xs text-gray-600 mb-1">Description</label><textarea name="description" rows="2" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">' +
                escapeHtml(first.description || "") +
                "</textarea></div>" +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">Save changes</button>' +
                "</form>"
            );
            var pickEdit = document.getElementById("cp-edit-group");
            if (pickEdit) {
                pickEdit.addEventListener("change", function () {
                    var id = parseInt(pickEdit.value, 10);
                    var found = cache.groups.filter(function (x) { return x.id === id; })[0];
                    if (!found) return;
                    var f = document.getElementById("cp-form-group-edit");
                    if (!f) return;
                    f.name.value = found.name;
                    f.description.value = found.description || "";
                });
            }
            return;
        }

        if (action === "panel-group-delete") {
            var delGroups = ownedGroups();
            if (!delGroups.length) {
                showPanel('<p class="text-sm text-gray-500">You do not own any group.</p>');
                return;
            }
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Delete group</h3>' +
                '<form id="cp-form-group-delete" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Group</label>' +
                renderGroupSelect("group_id", delGroups) +
                "</div>" +
                '<div><label class="flex items-start gap-2 text-xs text-gray-700"><input required type="checkbox" name="confirm" class="mt-0.5" /> Yes, permanently delete this group, its posts, comments and memberships.</label></div>' +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-red-600 text-white py-2.5 text-sm font-medium">Delete permanently</button>' +
                "</form>"
            );
            return;
        }

        if (action === "panel-group-leave") {
            var leaveGroups = nonOwnerGroups();
            if (!leaveGroups.length) {
                showPanel('<p class="text-sm text-gray-500">No groups to leave (owners must delete instead).</p>');
                return;
            }
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Leave a group</h3>' +
                '<form id="cp-form-group-leave" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Group</label>' +
                renderGroupSelect("group_id", leaveGroups) +
                "</div>" +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-red-600 text-white py-2.5 text-sm font-medium">Leave group</button>' +
                "</form>"
            );
            return;
        }

        if (action === "panel-group-post") {
            if (!cache.groups.length) {
                showPanel('<p class="text-sm text-gray-500">You are not a member of any group.</p>');
                return;
            }
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Quick post to a group</h3>' +
                '<p class="text-xs text-gray-500 mb-3">Text only — for media, open the group page.</p>' +
                '<form id="cp-form-group-post" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Group</label>' +
                renderGroupSelect("group_id", cache.groups) +
                "</div>" +
                '<div><label class="block text-xs text-gray-600 mb-1">Message</label><textarea required name="content" rows="3" maxlength="2000" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Share something with the group…"></textarea></div>' +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-primary_purp text-white py-2.5 text-sm font-medium">Post</button>' +
                "</form>"
            );
            return;
        }

        if (action === "panel-event-delete") {
            if (!cache.events.length) {
                showPanel('<p class="text-sm text-gray-500">Nothing to delete in the synced range.</p>');
                return;
            }
            var delOpts = "";
            for (var d = 0; d < cache.events.length; d++) {
                var dx = cache.events[d];
                var did = dx.original_id != null ? dx.original_id : dx.id;
                delOpts +=
                    '<option value="' +
                    did +
                    '" data-type="' +
                    (dx.type || "session") +
                    '">' +
                    escapeHtml(dx.title) +
                    "</option>";
            }
            showPanel(
                '<h3 class="text-sm font-semibold text-gray-800 mb-3">Delete calendar event</h3>' +
                '<form id="cp-form-event-del" class="space-y-3">' +
                '<div><label class="block text-xs text-gray-600 mb-1">Event</label><select id="cp-event-del-pick" name="event_id" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">' +
                delOpts +
                "</select></div>" +
                '<div id="cp-panel-alert" class="text-sm text-red-600 hidden"></div>' +
                '<button type="submit" class="w-full rounded-xl bg-red-600 text-white py-2.5 text-sm font-medium">Delete permanently</button>' +
                "</form>"
            );
            return;
        }

        showPanel('<p class="text-sm text-slate-500">This action is not available.</p>');
    }

    function toDatetimeLocal(iso) {
        if (!iso) return "";
        var d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
    }

    function renderGroupSelect(name, groups, id) {
        var html = '<select required name="' + name + '"' + (id ? ' id="' + id + '"' : "") + ' class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">';
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            var role = g.is_owner ? "owner" : g.my_role;
            html += '<option value="' + g.id + '">' + escapeHtml(g.name) + " (" + escapeHtml(role) + ")</option>";
        }
        html += "</select>";
        return html;
    }

    function renderReceivedInvites(invites) {
        var html = "";
        for (var i = 0; i < invites.length; i++) {
            var inv = invites[i];
            html +=
                '<div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50" data-cp-invite-id="' + inv.id + '">' +
                '<div class="flex-1 min-w-0">' +
                '<p class="text-sm font-medium text-gray-800 truncate">' + escapeHtml(inv.group_name) + "</p>" +
                '<p class="text-xs text-gray-500 truncate">from ' + escapeHtml(inv.sender_username || "") + "</p>" +
                "</div>" +
                '<div class="flex gap-2 shrink-0">' +
                '<button type="button" data-cp-invite-action="accept" class="px-3 py-1.5 rounded-lg bg-primary_purp text-white text-xs font-medium hover:bg-indigo-600">Accept</button>' +
                '<button type="button" data-cp-invite-action="decline" class="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-100">Decline</button>' +
                "</div></div>";
        }
        return html;
    }

    function renderSentInvites(invites) {
        var html = "";
        for (var i = 0; i < invites.length; i++) {
            var inv = invites[i];
            html +=
                '<div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50" data-cp-sent-invite-id="' + inv.id + '">' +
                '<div class="flex-1 min-w-0">' +
                '<p class="text-sm font-medium text-gray-800 truncate">' + escapeHtml(inv.group_name) + "</p>" +
                '<p class="text-xs text-gray-500 truncate">to ' + escapeHtml(inv.receiver_username || "user") + "</p>" +
                "</div>" +
                '<button type="button" data-cp-sent-cancel class="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-100 shrink-0">Cancel</button>' +
                "</div>";
        }
        return html;
    }

    function loadMembersFor(groupId, selectEl, opts) {
        opts = opts || {};
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">Loading…</option>';
        jsonFetch("/api/groups/" + encodeURIComponent(groupId) + "/members")
            .then(function (members) {
                var html = "";
                for (var i = 0; i < members.length; i++) {
                    var m = members[i];
                    if (opts.excludeOwner && m.role === "owner") continue;
                    if (opts.excludeSelf && window.__CURRENT_USER_ID && m.user_id === window.__CURRENT_USER_ID) continue;
                    html += '<option value="' + m.user_id + '">' + escapeHtml(m.username) + " (" + escapeHtml(m.role) + ")</option>";
                }
                selectEl.innerHTML = html || '<option value="">No eligible members</option>';
            })
            .catch(function () {
                selectEl.innerHTML = '<option value="">Failed to load members</option>';
            });
    }

    function wireMemberPicker(groupSelectId, memberSelectId, opts) {
        var gs = document.getElementById(groupSelectId);
        var ms = document.getElementById(memberSelectId);
        if (!gs || !ms) return;
        if (gs.value) loadMembersFor(gs.value, ms, opts);
        gs.addEventListener("change", function () { loadMembersFor(gs.value, ms, opts); });
    }

    function wireIcalDots(container, hiddenId) {
        if (!container) return;
        var hid = document.getElementById(hiddenId);
        container.querySelectorAll(".ical-palette-dot").forEach(function (btn) {
            btn.addEventListener("click", function () {
                container.querySelectorAll(".ical-palette-dot").forEach(function (b) {
                    b.classList.remove("ring-2", "ring-offset-2", "ring-indigo-400");
                });
                btn.classList.add("ring-2", "ring-offset-2", "ring-indigo-400");
                if (hid) hid.value = btn.getAttribute("data-color");
            });
        });
    }

    function panelAlert(msg) {
        var el = document.getElementById("cp-panel-alert");
        if (el) {
            el.textContent = msg || "";
            el.classList.toggle("hidden", !msg);
        }
    }

    function bindPanelForms() {
        var fs = panelInner.querySelector("#cp-form-new-session");
        if (fs) {
            fs.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fs);
                var name = (fd.get("name") || "").toString().trim();
                var cl = (fd.get("checklist") || "").toString().trim();
                var unitId = fd.get("unit_id") || null;
                var timerMode = (fd.get("timer_mode") || "stopwatch").toString();
                var ch = parseInt(fd.get("ch"), 10) || 0;
                var cm = parseInt(fd.get("cm"), 10) || 0;
                var durationMin = timerMode === "countdown" ? ch * 60 + cm : 0;
                if (timerMode === "countdown" && durationMin <= 0) {
                    panelAlert("Set a countdown duration greater than 0.");
                    return;
                }
                if (unitId) localStorage.setItem(LS_UNIT, String(unitId));
                else localStorage.removeItem(LS_UNIT);
                localStorage.setItem(LS_TIMER, timerMode);

                jsonFetch("/api/sessions", {
                    method: "POST",
                    body: JSON.stringify({
                        name: name,
                        checklist: [{ title: cl, completed: false }],
                        start_time: new Date().toISOString(),
                        duration_minutes: durationMin,
                        timer_mode: timerMode,
                        color: "#6366f1",
                        notes: "",
                        unit_id: unitId ? parseInt(unitId, 10) : null
                    })
                })
                    .then(function (data) {
                        closePalette();
                        if (data.session && data.session.id) {
                            window.location.href = "/sessions?session=" + data.session.id;
                        } else {
                            window.location.href = "/sessions";
                        }
                    })
                    .catch(function (err) {
                        panelAlert(err.message || "Could not create session.");
                    });
            });
        }

        var fu = panelInner.querySelector("#cp-form-unit");
        if (fu) {
            fu.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fu);
                var body = {
                    name: (fd.get("name") || "").toString().trim(),
                    code: (fd.get("code") || "").toString().trim() || null,
                    color: (fd.get("color") || "#6366f1").toString(),
                    credits: parseInt(fd.get("credits"), 10) || 6
                };
                var sid = fd.get("semester_id");
                if (sid) body.semester_id = parseInt(sid, 10);
                jsonFetch("/api/units", { method: "POST", body: JSON.stringify(body) })
                    .then(function () {
                        closePalette();
                        var uNav = (CONFIG.nav || []).filter(function (n) { return n.id === "go-units"; })[0];
                        window.location.href = uNav ? uNav.url : "/units";
                    })
                    .catch(function (err) {
                        panelAlert(err.message || "Failed.");
                    });
            });
        }

        var fsa = panelInner.querySelector("#cp-form-sem-add");
        if (fsa) {
            fsa.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fsa);
                jsonFetch("/api/semesters", {
                    method: "POST",
                    body: JSON.stringify({
                        name: (fd.get("name") || "").toString().trim(),
                        start_date: fd.get("start_date"),
                        end_date: fd.get("end_date")
                    })
                })
                    .then(function () {
                        closePalette();
                        var navA = (CONFIG.nav || []).filter(function (n) { return n.id === "go-academic"; })[0];
                        window.location.href = navA ? navA.url : "/settings/academic";
                    })
                    .catch(function (err) {
                        panelAlert(err.message || "Failed.");
                    });
            });
        }

        var fse = panelInner.querySelector("#cp-form-sem-edit");
        if (fse) {
            fse.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fse);
                var semId = document.getElementById("cp-sem-pick").value;
                var payload = {
                    name: (fd.get("name") || "").toString().trim(),
                    start_date: fd.get("start_date"),
                    end_date: fd.get("end_date")
                };
                var w = fd.get("wam");
                if (w !== "" && w != null) payload.wam = parseFloat(w);
                else payload.wam = null;
                jsonFetch("/api/semesters/" + semId, { method: "PUT", body: JSON.stringify(payload) })
                    .then(function () {
                        closePalette();
                        var navA = (CONFIG.nav || []).filter(function (n) { return n.id === "go-academic"; })[0];
                        window.location.href = navA ? navA.url : "/settings/academic";
                    })
                    .catch(function (err) {
                        panelAlert(err.message || "Failed.");
                    });
            });
        }

        var fia = panelInner.querySelector("#cp-form-ical-add");
        if (fia) {
            fia.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fia);
                var url = (fd.get("url") || "").toString().trim();
                var hid = document.getElementById("cp-ical-color");
                var col = hid ? hid.value : "#3b82f6";
                if (!/^https?:\/\//i.test(url)) {
                    panelAlert("URL must start with http:// or https://");
                    return;
                }
                jsonFetch("/api/ical-calendars", {
                    method: "POST",
                    body: JSON.stringify({
                        name: (fd.get("name") || "").toString().trim(),
                        url: url,
                        color: col
                    })
                })
                    .then(function () {
                        closePalette();
                        var navCal = (CONFIG.nav || []).filter(function (n) { return n.id === "go-cal-settings"; })[0];
                        window.location.href = navCal ? navCal.url : "/calendar/settings";
                    })
                    .catch(function (err) {
                        panelAlert(err.message || "Failed.");
                    });
            });
        }

        var fie = panelInner.querySelector("#cp-form-ical-edit");
        if (fie) {
            fie.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fie);
                var cid = document.getElementById("cp-ical-pick").value;
                var url = (fd.get("url") || "").toString().trim();
                var hid = document.getElementById("cp-ed-ical-color");
                var col = hid ? hid.value : "#3b82f6";
                if (!/^https?:\/\//i.test(url)) {
                    panelAlert("URL must start with http:// or https://");
                    return;
                }
                jsonFetch("/api/ical-calendars/" + cid, {
                    method: "PUT",
                    body: JSON.stringify({
                        name: (fd.get("name") || "").toString().trim(),
                        url: url,
                        color: col
                    })
                })
                    .then(function () {
                        closePalette();
                        var navCal = (CONFIG.nav || []).filter(function (n) { return n.id === "go-cal-settings"; })[0];
                        window.location.href = navCal ? navCal.url : "/calendar/settings";
                    })
                    .catch(function (err) {
                        panelAlert(err.message || "Failed.");
                    });
            });
        }

        var fec = panelInner.querySelector("#cp-form-event-create");
        if (fec) {
            fec.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fec);
                var et = fd.get("etype");
                var startVal = fd.get("start");
                var d = new Date(startVal);
                var payload = {
                    type: et,
                    title: (fd.get("title") || "").toString().trim(),
                    start: d.toISOString(),
                    duration: parseInt(fd.get("duration"), 10) || (et === "task" ? 30 : 60)
                };
                if (et === "session") {
                    var uid = fd.get("unit_id");
                    if (uid) payload.unit_id = parseInt(uid, 10);
                } else {
                    payload.description = (fd.get("description") || "").toString();
                    payload.completed = false;
                }
                jsonFetch("/api/events", { method: "POST", body: JSON.stringify(payload) })
                    .then(function () {
                        closePalette();
                        var navC = (CONFIG.nav || []).filter(function (n) { return n.id === "go-calendar"; })[0];
                        window.location.href = navC ? navC.url : "/calendar";
                    })
                    .catch(function (err) {
                        panelAlert(err.message || "Failed.");
                    });
            });
        }

        var fee = panelInner.querySelector("#cp-form-event-edit");
        if (fee) {
            fee.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fee);
                var ep = document.getElementById("cp-event-pick");
                var opt = ep.options[ep.selectedIndex];
                var et = opt.getAttribute("data-type") || fee.etype.value;
                var eid = ep.value;
                var startVal = fd.get("start");
                var d = new Date(startVal);
                var payload = {
                    type: et,
                    title: (fd.get("title") || "").toString().trim(),
                    start: d.toISOString(),
                    duration: parseInt(fd.get("duration"), 10) || 60
                };
                if (et === "task") {
                    payload.description = (fd.get("description") || "").toString();
                    payload.completed = !!fee.completed && fee.completed.checked;
                }
                jsonFetch("/api/events/" + eid, { method: "PUT", body: JSON.stringify(payload) })
                    .then(function () {
                        closePalette();
                        var navC = (CONFIG.nav || []).filter(function (n) { return n.id === "go-calendar"; })[0];
                        window.location.href = navC ? navC.url : "/calendar";
                    })
                    .catch(function (err) {
                        panelAlert(err.message || "Failed.");
                    });
            });
        }

        var fgo = panelInner.querySelector("#cp-form-group-open");
        if (fgo) {
            fgo.addEventListener("submit", function (e) {
                e.preventDefault();
                var gid = (new FormData(fgo).get("group_id") || "").toString();
                if (!gid) return;
                closePalette();
                window.location.href = "/api/groups/" + encodeURIComponent(gid);
            });
        }

        var fgc = panelInner.querySelector("#cp-form-group-create");
        if (fgc) {
            fgc.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fgc);
                jsonFetch("/api/groups", {
                    method: "POST",
                    body: JSON.stringify({
                        name: (fd.get("name") || "").toString().trim(),
                        description: (fd.get("description") || "").toString().trim()
                    })
                })
                    .then(function (data) {
                        closePalette();
                        if (data && data.id != null) {
                            window.location.href = "/api/groups/" + encodeURIComponent(data.id);
                        } else {
                            window.location.href = "/groups";
                        }
                    })
                    .catch(function (err) { panelAlert(err.message || "Could not create group."); });
            });
        }

        var fgi = panelInner.querySelector("#cp-form-group-invite");
        if (fgi) {
            fgi.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fgi);
                var gid = (fd.get("group_id") || "").toString();
                var code = (fd.get("friend_code") || "").toString().trim().toUpperCase();
                if (code.length !== 8) {
                    panelAlert("Friend codes are 8 characters.");
                    return;
                }
                jsonFetch("/api/groups/" + encodeURIComponent(gid) + "/invite-by-code", {
                    method: "POST",
                    body: JSON.stringify({ friend_code: code })
                })
                    .then(function () {
                        closePalette();
                        window.location.href = "/groups";
                    })
                    .catch(function (err) { panelAlert(err.message || "Failed to send invite."); });
            });
        }

        panelInner.querySelectorAll("[data-cp-invite-action]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var row = btn.closest("[data-cp-invite-id]");
                if (!row) return;
                var id = row.getAttribute("data-cp-invite-id");
                var action = btn.getAttribute("data-cp-invite-action");
                row.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
                jsonFetch("/api/groups/invitations/" + encodeURIComponent(id) + "/" + action, { method: "POST" })
                    .then(function () {
                        row.remove();
                        var list = panelInner.querySelector("#cp-invites-received-list");
                        if (list && !list.children.length) {
                            list.innerHTML = '<p class="text-sm text-gray-500">No pending invites.</p>';
                        }
                    })
                    .catch(function () {
                        row.querySelectorAll("button").forEach(function (b) { b.disabled = false; });
                    });
            });
        });

        panelInner.querySelectorAll("[data-cp-sent-cancel]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var row = btn.closest("[data-cp-sent-invite-id]");
                if (!row) return;
                var id = row.getAttribute("data-cp-sent-invite-id");
                btn.disabled = true;
                jsonFetch("/api/groups/invitations/" + encodeURIComponent(id) + "/cancel", { method: "POST" })
                    .then(function () {
                        row.remove();
                        var list = panelInner.querySelector("#cp-invites-sent-list");
                        if (list && !list.children.length) {
                            list.innerHTML = '<p class="text-sm text-gray-500">No outgoing invites.</p>';
                        }
                    })
                    .catch(function () { btn.disabled = false; });
            });
        });

        var fga = panelInner.querySelector("#cp-form-group-audit");
        if (fga) {
            fga.addEventListener("submit", function (e) {
                e.preventDefault();
                var gid = (new FormData(fga).get("group_id") || "").toString();
                var out = panelInner.querySelector("#cp-audit-result");
                if (!out) return;
                out.innerHTML = '<p class="text-xs text-gray-500">Loading…</p>';
                jsonFetch("/api/groups/" + encodeURIComponent(gid) + "/audit-log")
                    .then(function (logs) {
                        if (!logs.length) {
                            out.innerHTML = '<p class="text-xs text-gray-500">No moderation actions yet.</p>';
                            return;
                        }
                        var html = '<ul class="space-y-1.5 text-xs text-gray-700 max-h-56 overflow-y-auto pr-1">';
                        for (var i = 0; i < logs.length; i++) {
                            var l = logs[i];
                            var when = l.created_at ? new Date(l.created_at).toLocaleString() : "";
                            html +=
                                '<li class="p-2 rounded-lg bg-slate-50">' +
                                '<span class="font-medium">' + escapeHtml(l.action) + "</span>" +
                                (l.actor_username ? ' by <span class="text-gray-600">' + escapeHtml(l.actor_username) + "</span>" : "") +
                                (l.target_username ? ' → <span class="text-gray-600">' + escapeHtml(l.target_username) + "</span>" : "") +
                                '<div class="text-[10px] text-gray-400 mt-0.5">' + escapeHtml(when) + "</div>" +
                                "</li>";
                        }
                        html += "</ul>";
                        out.innerHTML = html;
                    })
                    .catch(function (err) {
                        out.innerHTML = '<p class="text-xs text-red-600">' + escapeHtml(err.message || "Failed to load log.") + "</p>";
                    });
            });
        }

        var fgr = panelInner.querySelector("#cp-form-group-remove");
        if (fgr) {
            fgr.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fgr);
                var gid = (fd.get("group_id") || "").toString();
                var uid = (fd.get("user_id") || "").toString();
                if (!uid) { panelAlert("Pick a member."); return; }
                jsonFetch("/api/groups/" + encodeURIComponent(gid) + "/members/" + encodeURIComponent(uid), { method: "DELETE" })
                    .then(function () {
                        closePalette();
                        window.location.href = "/api/groups/" + encodeURIComponent(gid);
                    })
                    .catch(function (err) { panelAlert(err.message || "Failed to remove member."); });
            });
        }

        var fgrole = panelInner.querySelector("#cp-form-group-role");
        if (fgrole) {
            fgrole.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fgrole);
                var gid = (fd.get("group_id") || "").toString();
                var uid = (fd.get("user_id") || "").toString();
                var role = (fd.get("role") || "").toString();
                if (!uid) { panelAlert("Pick a member."); return; }
                jsonFetch("/api/groups/" + encodeURIComponent(gid) + "/members/" + encodeURIComponent(uid) + "/role", {
                    method: "PATCH",
                    body: JSON.stringify({ role: role })
                })
                    .then(function () {
                        closePalette();
                        window.location.href = "/api/groups/" + encodeURIComponent(gid);
                    })
                    .catch(function (err) { panelAlert(err.message || "Failed to change role."); });
            });
        }

        var fge = panelInner.querySelector("#cp-form-group-edit");
        if (fge) {
            fge.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fge);
                var gid = (fd.get("group_id") || "").toString();
                var body = new FormData();
                body.append("name", (fd.get("name") || "").toString().trim());
                body.append("description", (fd.get("description") || "").toString());
                fetch("/api/groups/" + encodeURIComponent(gid), {
                    method: "PUT",
                    credentials: "same-origin",
                    body: body
                })
                    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, body: d }; }); })
                    .then(function (res) {
                        if (!res.ok) {
                            panelAlert((res.body && res.body.message) || "Failed to update.");
                            return;
                        }
                        closePalette();
                        window.location.href = "/api/groups/" + encodeURIComponent(gid);
                    })
                    .catch(function (err) { panelAlert(err.message || "Failed to update group."); });
            });
        }

        var fgd = panelInner.querySelector("#cp-form-group-delete");
        if (fgd) {
            fgd.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var gid = (new FormData(fgd).get("group_id") || "").toString();
                jsonFetch("/api/groups/" + encodeURIComponent(gid), { method: "DELETE" })
                    .then(function () {
                        closePalette();
                        window.location.href = "/groups";
                    })
                    .catch(function (err) { panelAlert(err.message || "Failed to delete group."); });
            });
        }

        var fgl = panelInner.querySelector("#cp-form-group-leave");
        if (fgl) {
            fgl.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var gid = (new FormData(fgl).get("group_id") || "").toString();
                jsonFetch("/api/groups/" + encodeURIComponent(gid) + "/leave", { method: "POST" })
                    .then(function () {
                        closePalette();
                        window.location.href = "/groups";
                    })
                    .catch(function (err) { panelAlert(err.message || "Failed to leave."); });
            });
        }

        var fgp = panelInner.querySelector("#cp-form-group-post");
        if (fgp) {
            fgp.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var fd = new FormData(fgp);
                var gid = (fd.get("group_id") || "").toString();
                var body = new FormData();
                body.append("content", (fd.get("content") || "").toString().trim());
                fetch("/api/groups/" + encodeURIComponent(gid) + "/posts", {
                    method: "POST",
                    credentials: "same-origin",
                    body: body
                })
                    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, body: d }; }); })
                    .then(function (res) {
                        if (!res.ok) {
                            panelAlert((res.body && res.body.message) || "Failed to post.");
                            return;
                        }
                        closePalette();
                        window.location.href = "/api/groups/" + encodeURIComponent(gid);
                    })
                    .catch(function (err) { panelAlert(err.message || "Failed to post."); });
            });
        }

        var fed = panelInner.querySelector("#cp-form-event-del");
        if (fed) {
            fed.addEventListener("submit", function (e) {
                e.preventDefault();
                panelAlert("");
                var ep = document.getElementById("cp-event-del-pick");
                var opt = ep.options[ep.selectedIndex];
                var et = opt.getAttribute("data-type") || "session";
                var eid = ep.value;
                jsonFetch("/api/events/" + eid + "?type=" + encodeURIComponent(et), { method: "DELETE" })
                    .then(function () {
                        closePalette();
                        var navC = (CONFIG.nav || []).filter(function (n) { return n.id === "go-calendar"; })[0];
                        window.location.href = navC ? navC.url : "/calendar";
                    })
                    .catch(function (err) {
                        panelAlert(err.message || "Failed.");
                    });
            });
        }
    }

    function openPalette() {
        if (openState) return;
        window.clearTimeout(closePalette._t);
        openState = true;
        backdrop.classList.remove("hidden");
        modal.classList.remove("hidden");
        backdrop.classList.remove("cp-palette-visible");
        modal.classList.remove("cp-palette-visible");
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                backdrop.classList.add("cp-palette-visible");
                modal.classList.add("cp-palette-visible");
            });
        });
        hidePanel();
        actionPanelOpen = false;
        pendingActionRestore = null;
        if (commandPaletteHeader) commandPaletteHeader.classList.remove("hidden");
        resultsEl.classList.remove("hidden");
        modal.classList.remove("cp-action-sheet");
        panelWrap.classList.remove("cp-panel-floating");
        input.value = "";
        selectedIndex = 0;
        loadContext().then(function () {
            renderResults();
        });
        window.setTimeout(function () {
            input.focus();
        }, 80);
    }

    function closePalette() {
        if (!openState) return;
        openState = false;
        actionPanelOpen = false;
        pendingActionRestore = null;
        if (commandPaletteHeader) commandPaletteHeader.classList.remove("hidden");
        resultsEl.classList.remove("hidden");
        modal.classList.remove("cp-action-sheet");
        panelWrap.classList.remove("cp-panel-floating");
        backdrop.classList.remove("cp-palette-visible");
        modal.classList.remove("cp-palette-visible");
        hidePanel();
        window.clearTimeout(closePalette._t);
        closePalette._t = window.setTimeout(function () {
            backdrop.classList.add("hidden");
            modal.classList.add("hidden");
        }, 340);
    }

    function togglePalette() {
        if (openState) closePalette();
        else openPalette();
    }

    function getFocusable() {
        var sel = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        return Array.prototype.slice.call(modal.querySelectorAll(sel)).filter(function (el) {
            return el.offsetParent !== null || el === input;
        });
    }

    backdrop.addEventListener("click", function () {
        if (actionPanelOpen) exitActionPanelMode();
        else closePalette();
    });

    resultsEl.addEventListener("mouseover", function (e) {
        if (!openState) return;
        var btn = e.target.closest(".command-palette-row");
        if (!btn || !resultsEl.contains(btn)) return;
        var idx = parseInt(btn.getAttribute("data-idx"), 10);
        if (isNaN(idx) || idx === selectedIndex) return;
        selectedIndex = idx;
        updateSelectionHighlight();
    });

    resultsEl.addEventListener("click", function (e) {
        if (!openState) return;
        var btn = e.target.closest(".command-palette-row");
        if (!btn || !resultsEl.contains(btn)) return;
        selectedIndex = parseInt(btn.getAttribute("data-idx"), 10);
        runSelected();
    });

    document.addEventListener("keydown", function (e) {
        var mod = e.metaKey || e.ctrlKey;
        if (mod && String(e.key).toLowerCase() === "k") {
            e.preventDefault();
            togglePalette();
            return;
        }
        if (!openState) return;
        if (e.key === "Escape") {
            e.preventDefault();
            if (actionPanelOpen) exitActionPanelMode();
            else closePalette();
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (flatResults.length === 0) return;
            selectedIndex = Math.min(selectedIndex + 1, flatResults.length - 1);
            updateSelectionHighlight();
            scrollActiveIntoView();
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            if (flatResults.length === 0) return;
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateSelectionHighlight();
            scrollActiveIntoView();
            return;
        }
        if (e.key === "Enter") {
            if (document.activeElement && document.activeElement.closest("#command-palette-panel")) return;
            e.preventDefault();
            runSelected();
            return;
        }
    });

    input.addEventListener("input", function () {
        if (actionPanelOpen) return;
        selectedIndex = 0;
        hidePanel();
        renderResults();
    });

    modal.addEventListener("keydown", function (e) {
        if (e.key !== "Tab" || !openState) return;
        var list = getFocusable();
        if (list.length === 0) return;
        var ix = list.indexOf(document.activeElement);
        if (!e.shiftKey && ix === list.length - 1) {
            e.preventDefault();
            list[0].focus();
        } else if (e.shiftKey && (ix <= 0 || ix === -1)) {
            e.preventDefault();
            list[list.length - 1].focus();
        }
    });
})();
