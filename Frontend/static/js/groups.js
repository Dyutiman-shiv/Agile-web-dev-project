$(document).ready(function () {
  "use strict";

  // ── State ────────────────────────────────────────────────────────────────
  let _activeInviteGroupId = null;
  let _newGroupId = null;
  let _allGroups = [];
  let _searchQuery = "";
  let _groupsLoading = false;
  let _invitesLoading = false;
  let _refreshTimer = null;

  // ── Init ─────────────────────────────────────────────────────────────────
  loadFriendCode();
  loadGroups();
  loadPendingInvitations();
  handleInvitationDeepLink();
  initAutoRefresh();

  // ── Notification deep link → highlight invitations card ──────────────────
  function handleInvitationDeepLink() {
    if (window.location.hash !== "#invitations") return;
    const card = document.getElementById("invitations");
    if (!card) return;
    setTimeout(() => {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add(
        "ring-2",
        "ring-indigo-300",
        "ring-offset-2",
        "shadow-md"
      );
      setTimeout(() => {
        card.classList.remove(
          "ring-2",
          "ring-indigo-300",
          "ring-offset-2",
          "shadow-md"
        );
      }, 2200);
    }, 200);
  }

  // ── Cover image preview in create modal ──────────────────────────────────
  $("#group-cover").on("change", function () {
    const file = this.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        $("#cover-preview").attr("src", e.target.result);
        $("#cover-preview-container").removeClass("hidden");
      };
      reader.readAsDataURL(file);
    } else {
      $("#cover-preview-container").addClass("hidden");
    }
  });

  // Normalise friend code inputs to uppercase as you type
  $("#invite-code-input, #invite-code-input-modal").on("input", function () {
    const pos = this.selectionStart;
    this.value = this.value.toUpperCase();
    this.setSelectionRange(pos, pos);
  });

  // ── My Friend Code ────────────────────────────────────────────────────────
  function loadFriendCode() {
    $.getJSON("/api/users/me/friend-code", function (data) {
      $("#friend-code-display").text(data.friend_code);
    });
  }

  $("#copy-friend-code").on("click", function () {
    const code = $("#friend-code-display").text();
    if (!code || code === "···") return;
    navigator.clipboard
      .writeText(code)
      .then(() => {
        $("#copy-toast").removeClass("hidden");
        setTimeout(() => $("#copy-toast").addClass("hidden"), 2000);
      })
      .catch(() => {
        // Fallback for older browsers
        const ta = document.createElement("textarea");
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        $("#copy-toast").removeClass("hidden");
        setTimeout(() => $("#copy-toast").addClass("hidden"), 2000);
      });
  });

  // ── Load Groups ───────────────────────────────────────────────────────────
  function loadGroups() {
    if (_groupsLoading) return;
    _groupsLoading = true;
    $.getJSON("/api/groups", function (groups) {
      _allGroups = groups;
      renderGroups(getFilteredGroups());
    })
      .fail(function () {
        $("#groups-container").html(
          '<p class="text-red-400 text-sm roboto-regular col-span-full text-center py-8">Failed to load groups.</p>'
        );
      })
      .always(function () {
        _groupsLoading = false;
      });
  }

  function renderGroups(groups) {
    if (groups.length === 0) {
      $("#groups-container").html("");
      $("#empty-groups").removeClass("hidden");
      return;
    }
    $("#empty-groups").addClass("hidden");

    let html = "";
    groups.forEach((group) => {
      const coverHtml = group.cover_picture
        ? `<img src="/static/${group.cover_picture}" class="w-full h-full object-cover" alt="cover">`
        : `<div class="w-full h-full flex items-center justify-center">
             <svg class="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                     d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857
                        M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857
                        m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
             </svg>
           </div>`;

      const roleBadge = group.is_owner
        ? `<span class="text-[10px] montserrat-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">Owner</span>`
        : group.my_role === "admin"
        ? `<span class="text-[10px] montserrat-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-600">Admin</span>`
        : `<span class="text-[10px] montserrat-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Member</span>`;

      const inviteBtn =
        group.is_owner || group.my_role === "admin"
          ? `<button class="invite-btn text-xs montserrat-medium px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition"
                     data-group-id="${group.id}" data-group-name="${escapeHtml(group.name)}">
               + Invite
             </button>`
          : "";

      html += `
        <div class="group-card bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition flex flex-col cursor-pointer"
             data-group-url="/api/groups/${group.id}">
          <!-- Cover -->
          <div class="h-36 bg-gradient-to-br from-indigo-50 to-purple-50 relative overflow-hidden pointer-events-none">
            ${coverHtml}
            <div class="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
            <div class="absolute top-2 right-2">${roleBadge}</div>
          </div>

          <!-- Content -->
          <div class="p-4 flex flex-col gap-2 flex-1">
            <h3 class="text-sm montserrat-semi-bold text-gray-800 line-clamp-1">
              ${escapeHtml(group.name)}
            </h3>
            <p class="text-xs roboto-regular text-gray-500 line-clamp-2 flex-1">
              ${escapeHtml(group.description || "No description")}
            </p>
            <div class="flex justify-between items-center mt-1">
              <span class="text-[11px] roboto-regular text-gray-400">
                ${group.members.length} member${group.members.length !== 1 ? "s" : ""}
              </span>
              <div class="flex items-center gap-2">
                ${inviteBtn}
              </div>
            </div>
          </div>
        </div>
      `;
    });

    $("#groups-container").html(html);
  }

  // ── Group card click → navigate ──────────────────────────────────────────
  // Ignore clicks that originated on a button or link inside the card so the
  // invite button (and any future inline action) doesn't also navigate.
  $(document).on("click", ".group-card", function (e) {
    if (e.target.closest("button, a")) return;
    window.location.href = $(this).data("group-url");
  });

  // ── Group search filter ───────────────────────────────────────────────────
  $("#group-search").on("input", function () {
    _searchQuery = $(this).val().toLowerCase().trim();
    renderGroups(getFilteredGroups());
  });

  // ── Invite button on group card ───────────────────────────────────────────
  $(document).on("click", ".invite-btn", function (e) {
    e.stopPropagation();
    _activeInviteGroupId = $(this).data("group-id");
    const groupName = $(this).data("group-name");
    $("#invite-modal-group-name").text(groupName);
    $("#invite-code-input").val("");
    $("#invite-alert").text("");
    $("#invite-modal").removeClass("hidden");
  });

  $("#invite-modal-close").on("click", () => {
    $("#invite-modal").addClass("hidden");
  });

  $("#invite-send-btn").on("click", function () {
    const code = $("#invite-code-input").val().trim().toUpperCase();
    sendInvite(_activeInviteGroupId, code, "#invite-alert", function () {
      $("#invite-code-input").val("");
    });
  });

  $("#invite-code-input").on("keydown", function (e) {
    if (e.key === "Enter") $("#invite-send-btn").trigger("click");
  });

  // ── Create Group modal ────────────────────────────────────────────────────
  $("#create-group-btn").on("click", () => {
    resetCreateModal();
    $("#group-modal").removeClass("hidden");
  });

  $("#group-modal-close, #group-cancel-btn").on("click", () => {
    $("#group-modal").addClass("hidden");
    resetCreateModal();
  });

  $("#modal-done-btn").on("click", () => {
    $("#group-modal").addClass("hidden");
    resetCreateModal();
    loadGroups();
  });

  function resetCreateModal() {
    $("#modal-step-create").removeClass("hidden");
    $("#modal-step-invite").addClass("hidden");
    $("#group-name").val("");
    $("#group-description").val("");
    $("#group-cover").val("");
    $("#cover-preview-container").addClass("hidden");
    $("#group-alert").html("");
    $("#invite-code-input-modal").val("");
    $("#modal-invite-alert").text("");
    _newGroupId = null;
  }

  $("#group-save-btn").on("click", function () {
    const name = $("#group-name").val().trim();
    const description = $("#group-description").val().trim();

    if (!name) {
      $("#group-alert").html(
        '<p class="text-red-500 text-xs roboto-regular">Group name is required.</p>'
      );
      return;
    }

    $("#group-save-btn").prop("disabled", true).text("Creating…");

    $.ajax({
      url: "/api/groups",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ name, description }),
      success: function (group) {
        _newGroupId = group.id;

        const file = $("#group-cover")[0].files[0];
        if (file) {
          const fd = new FormData();
          fd.append("cover", file);
          $.ajax({
            url: `/api/groups/${group.id}`,
            method: "PUT",
            data: fd,
            processData: false,
            contentType: false,
            complete: function () {
              showInviteStep();
            },
          });
        } else {
          showInviteStep();
        }
      },
      error: function (xhr) {
        const msg =
          xhr.responseJSON?.message || "Failed to create group. Please try again.";
        $("#group-alert").html(
          `<p class="text-red-500 text-xs roboto-regular">${escapeHtml(msg)}</p>`
        );
        $("#group-save-btn").prop("disabled", false).text("Create");
      },
    });
  });

  function showInviteStep() {
    $("#modal-step-create").addClass("hidden");
    $("#modal-step-invite").removeClass("hidden");
    $("#group-save-btn").prop("disabled", false).text("Create");
  }

  // Invite from the post-creation step
  $("#modal-invite-btn").on("click", function () {
    const code = $("#invite-code-input-modal").val().trim().toUpperCase();
    sendInvite(_newGroupId, code, "#modal-invite-alert", function () {
      $("#invite-code-input-modal").val("");
    });
  });

  $("#invite-code-input-modal").on("keydown", function (e) {
    if (e.key === "Enter") $("#modal-invite-btn").trigger("click");
  });

  // ── Send invite helper ─────────────────────────────────────────────────────
  function sendInvite(groupId, code, alertSelector, onSuccess) {
    if (!code) {
      $(alertSelector)
        .text("Please enter a friend code.")
        .css("color", "#ef4444");
      return;
    }
    if (code.length !== 8) {
      $(alertSelector)
        .text("Friend codes are 8 characters long.")
        .css("color", "#ef4444");
      return;
    }

    $(alertSelector).text("Sending…").css("color", "#6b7280");

    $.ajax({
      url: `/api/groups/${groupId}/invite-by-code`,
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ friend_code: code }),
      success: function () {
        $(alertSelector)
          .text("Invitation sent!")
          .css("color", "#16a34a");
        if (onSuccess) onSuccess();
      },
      error: function (xhr) {
        const msg =
          xhr.responseJSON?.message || "Failed to send invitation.";
        $(alertSelector).text(msg).css("color", "#ef4444");
      },
    });
  }

  // ── Pending Invitations ───────────────────────────────────────────────────
  function loadPendingInvitations() {
    if (_invitesLoading) return;
    _invitesLoading = true;
    $.getJSON("/api/groups/invitations/pending", function (invites) {
      if (invites.length === 0) {
        $("#invitations-container").html("");
        $("#no-invitations").removeClass("hidden");
        return;
      }
      $("#no-invitations").addClass("hidden");

      let html = "";
      invites.forEach((inv) => {
        const coverImg = inv.group_cover
          ? `<img src="/static/${inv.group_cover}" class="w-8 h-8 rounded-lg object-cover shrink-0" alt="">`
          : `<div class="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
               <span class="text-xs montserrat-bold text-indigo-400">${escapeHtml(inv.group_name[0] || "G")}</span>
             </div>`;

        html += `
          <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-xl" data-invite-id="${inv.id}">
            ${coverImg}
            <div class="flex-1 min-w-0">
              <p class="text-xs montserrat-semi-bold text-gray-700 truncate">${escapeHtml(inv.group_name)}</p>
              <p class="text-[11px] roboto-regular text-gray-400 truncate">from ${escapeHtml(inv.sender_username)}</p>
              <div class="flex gap-2 mt-2">
                <button class="accept-invite-btn flex-1 py-1 rounded-lg bg-primary_purp text-white text-[11px] montserrat-medium hover:bg-indigo-600 transition"
                        data-invite-id="${inv.id}">Accept</button>
                <button class="decline-invite-btn flex-1 py-1 rounded-lg border border-gray-200 text-gray-500 text-[11px] montserrat-medium hover:bg-gray-100 transition"
                        data-invite-id="${inv.id}">Decline</button>
              </div>
            </div>
          </div>
        `;
      });

      $("#invitations-container").html(html);
    }).always(function () {
      _invitesLoading = false;
    });
  }

  $(document).on("click", ".accept-invite-btn", function () {
    const id = $(this).data("invite-id");
    respondToInvite(id, "accept");
  });

  $(document).on("click", ".decline-invite-btn", function () {
    const id = $(this).data("invite-id");
    respondToInvite(id, "decline");
  });

  function respondToInvite(inviteId, action) {
    const row = $(`[data-invite-id="${inviteId}"]`);
    row.find("button").prop("disabled", true);

    $.ajax({
      url: `/api/groups/invitations/${inviteId}/${action}`,
      method: "POST",
      success: function () {
        row.remove();
        if ($("#invitations-container").children().length === 0) {
          $("#no-invitations").removeClass("hidden");
        }
        if (action === "accept") {
          loadGroups(); // refresh groups list to show the new group
        }
      },
      error: function () {
        row.find("button").prop("disabled", false);
      },
    });
  }

  // ── Utility ───────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getFilteredGroups() {
    if (!_searchQuery) return _allGroups;
    return _allGroups.filter((g) =>
      g.name.toLowerCase().includes(_searchQuery) ||
      (g.description || "").toLowerCase().includes(_searchQuery)
    );
  }

  // ── Background refresh (invite + groups auto-update) ─────────────────────
  function refreshGroupsData() {
    loadPendingInvitations();
    loadGroups();
  }

  function initAutoRefresh() {
    // Refresh every 10 seconds so new invites/membership changes appear quickly.
    _refreshTimer = window.setInterval(refreshGroupsData, 10000);

    // When user returns to this tab, refresh immediately.
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        refreshGroupsData();
      }
    });
  }
});
