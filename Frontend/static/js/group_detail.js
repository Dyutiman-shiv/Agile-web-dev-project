let itemToDelete = { id: null, type: null, element: null };

$(document).ready(function () {
  "use strict";
  const group_id = $("#group-data").data("group-id");
  loadGroupPosts(group_id);
  loadGroupMembers(group_id);
  initSidebar();
  initGroupSettings(group_id);
  initInviteModal(group_id);
  initLeaveGroup(group_id);

  $("#edit-group-cover").on("change", function () {
    const file = this.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        $("#edit-cover-preview").attr("src", e.target.result);
        $("#edit-cover-preview-container").removeClass("hidden");
      };
      reader.readAsDataURL(file);
    }
  });

  $("#group-update-save-btn").on("click", function () {
    const groupId = $("#group-data").data("group-id");
    const formData = new FormData();

    formData.append("name", $("#edit-group-name").val().trim());
    formData.append("description", $("#edit-group-description").val().trim());

    const file = $("#edit-group-cover")[0].files[0];
    if (file) {
      formData.append("cover", file);
    }

    const btn = $(this);
    btn.prop("disabled", true).text("Saving...");

    $.ajax({
      url: `/api/groups/${groupId}`,
      type: "PUT",
      data: formData,
      processData: false,
      contentType: false,
      success: function (response) {
        if (response.success) {
          $("#display-group-name").text(response.group.name);
          $("#display-group-description").text(response.group.description);

          if (response.group.cover_picture) {
            $("#display-group-cover")
              .attr("src", "/static/" + response.group.cover_picture)
              .removeClass("hidden");
          }

          $("#group-data").data("group-name", response.group.name);
          $("#group-data").data(
            "group-description",
            response.group.description,
          );
          $("#group-data").data("group-picture", response.group.cover_picture);

          closeEditGroupModal();
        }
        btn.prop("disabled", false).text("Save Changes");
      },
      error: function (xhr) {
        const errorMsg = xhr.responseJSON
          ? xhr.responseJSON.message
          : "Update failed";
        $("#edit-group-alert").html(
          `<p class="text-red-500 text-xs mt-2">${errorMsg}</p>`,
        );
        btn.prop("disabled", false).text("Save Changes");
      },
    });
  });

  $("#confirm-delete-btn")
    .off("click")
    .on("click", function (e) {
      const { id, type, element } = itemToDelete;
      e.preventDefault();
      e.stopImmediatePropagation();

      const groupId = $("#group-data").data("group-id");

      let url = "";

      if (type === "post") {
        url = `/api/posts/${id}`;
      } else if (type === "comment") {
        url = `/api/comments/${id}`;
      } else {
        url = `/api/groups/${groupId}`;
      }

      $.ajax({
        url: url,
        type: "DELETE",
        success: function (response) {
          if (response.success) {
            if (type === "post") {
              $(`#post-card-${id}`).fadeOut(400, function () {
                $(this).remove();
              });
            } else {
              $(element)
                .closest(".flex.gap-3")
                .fadeOut(300, function () {
                  $(this).remove();
                });
            }
            closeDeleteModal();

            if (type === "comment") {
              $(element).closest(".flex.gap-3").fadeOut(300);

              const postId = response.post_id;
              const counterSpan = $(`#comment-count-${postId}`);
              const currentCount = parseInt(counterSpan.text()) || 0;
              counterSpan.text(Math.max(0, currentCount - 1));

              $(`#comments-card-${id}`).remove();
              if (parseInt($(`#comment-count-${postId}`).text()) === 0) {
                $(`#comments-list-${postId}`).html(
                  `<p class="text-sm text-gray-400 text-center py-4 no-comments-msg">Be the first one in comment this post.</p>`,
                );
              }
            } else if (type === "post") {
              $(`#post-card-${id}`).fadeOut(400, function () {
                $(this).remove();
              });
            } else {
              window.location.href = "/groups";
            }
          }
        },
        error: function () {
          alert("Error trying to delete this content.");
          closeDeleteModal();
        },
      });
    });

  $("#upload-media-btn").on("click", function () {
    $("#post-media-input").click();
  });

  $("#toggle-article-btn").on("click", function () {
    $("#article-url").toggleClass("hidden");
  });

  $("#post-media-input").on("change", function (event) {
    const file = event.target.files[0];

    if (!file) return;

    const url = URL.createObjectURL(file);

    let previewHTML = "";

    if (file.type.startsWith("image")) {
      previewHTML = `
      <img
        src="${url}"
        class="w-auto h-auto max-h-[300px] object-contain rounded-md"
      />
    `;
    } else if (file.type.startsWith("video")) {
      previewHTML = `
      <video
        controls
        class="w-full max-h-80 rounded-2xl"
      >
        <source src="${url}">
      </video>
    `;
    }

    $("#media-preview-container").html(previewHTML).removeClass("hidden");
  });
  $("#submit-post-btn").on("click", createPost);
});

function initSidebar() {
  $("#mobile-members-toggle").on("click", function () {
    $("#members-sidebar").removeClass("-translate-x-full");

    $("#sidebar-overlay").removeClass("hidden");
  });

  $("#close-members-sidebar, #sidebar-overlay").on("click", function () {
    $("#members-sidebar").addClass("-translate-x-full");

    $("#sidebar-overlay").addClass("hidden");
  });
}

function loadGroupPosts(group_id) {
  $.getJSON(
    "/api/groups/" + group_id + "/posts",

    function (posts) {
      renderPosts(posts);
    },
  ).fail(function () {
    $("#posts-container").html(`
      <div class="bg-white rounded-2xl p-10 text-center border border-gray-100">
        <p class="text-red-500">
          Failed to load posts.
        </p>
      </div>
    `);
  });
}

function formatMyCustomDate(isoString) {
  if (!isoString) return "";

  const cleanIsoString = isoString.endsWith("Z") ? isoString : isoString + "Z";
  const date = new Date(cleanIsoString);

  return date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function renderPosts(posts) {
  const container = $("#posts-container");

  if (!posts.length) {
    container.html(`
      <p class="text-gray-500 text-center [text-shadow:_2px_2px_4px_rgb(0_0_0_/_0.2)]  montserrat-regular"->
          No posts yet. Start the conversation!
        </p>
    `);

    return;
  }

  let html = "";
  const currentUserPicture = $("#user-data").data("user-profile-picture");
  const currentUserId = $("#user-data").data("user-id");

  posts.forEach((post) => {
    const formattedDate = formatMyCustomDate(post.created_at);
    const likes = post.likes;
    const isLiked = likes.includes(currentUserId);

    html += `
      <div id="post-card-${post.id}" class="bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden">

        <!-- POST -->
        <div class="p-6">

          <div class="flex items-center gap-3 mb-2">

            ${
              post.author_picture
                ? `
                  <img
                    src="${post.author_picture}"
                    class="w-11 h-11 rounded-full object-cover"
                  />
                `
                : `
                  <div class="w-11 h-11 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold">
                    ${post.author_name[0].toUpperCase()}
                  </div>
                `
            }

            <div>

              <p class="text-sm montserrat-medium text-gray-800">
                ${post.author_name}
              </p>

              <p class="text-xs text-gray-400">
                ${formattedDate}
              </p>

            </div>

            ${
              post.author_id === currentUserId
                ? `
            <button onclick="openDeleteModal(${post.id}, 'post')" class="text-gray-400 ml-auto hover:text-red-500 p-1">
              <svg xmlns="http://w3.org" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          `
                : ""
            }

          </div>

          <p class="text-gray-700 whitespace-pre-wrap roboto-regular">
            ${post.content}
          </p>

          ${
            post.media_url
              ? `
                <div class="mt-2 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center">
                  ${
                    post.media_type === "video"
                      ? `
                    <video src="/static/${post.media_url}" controls class="max-w-full max-h-[300px]"></video>
                  `
                      : `
                    <img src="/static/${post.media_url}" class="max-w-full max-h-[300px] object-contain" />
                  `
                  }
                </div>
              `
              : ""
          }

          ${
            post.article_url
              ? `
                <a href="${post.article_url}" target="_blank" class="mt-3 block text-sm text-primary_purp hover:underline truncate">
                  🔗 ${post.article_url}
                </a>
              `
              : ""
          }

        </div>

        <!-- Interaction Bar -->
        <div class="flex items-center gap-6 my-3 pt-4 px-4 border-t border-gray-50">
          
          <!-- Button Like -->
          <button onclick="toggleLike(${post.id})" id="like-btn-${post.id}" class="flex items-center gap-2 transition-colors ${isLiked ? "text-red-500" : "text-gray-500 hover:text-red-500"}">
            <svg xmlns="http://www.w3.org/2000/svg" 
              id="like-icon-${post.id}"
              fill="${isLiked ? "currentColor" : "none"}" 
              viewBox="0 0 24 24" 
              stroke-width="1.5" 
              stroke="currentColor" 
              class="w-5 h-5 transition-transform duration-200">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
          </svg>
            <span id="like-count-${post.id}" class="text-xs font-medium">${post.likes.length || 0}</span>
          </button>

          <!-- Button Comments -->
          <button onclick="toggleComments(${post.id})" class="flex items-center gap-2 text-gray-500 hover:text-indigo-600 transition-colors">
            <svg xmlns="http://w3.org" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785 0.5 0.5 0 0 0 .416.791 6 6 0 0 0 4.627-2.323 5.964 5.964 0 0 0 2.02.326Z" />
            </svg>
            <span id="comment-count-${post.id}" class="text-xs font-medium">${post.comments.length}</span>
          </button>
        </div>

        <!-- SECCIÓN DE COMENTARIOS -->
        <div id="comments-section-${post.id}" class="hidden border-t border-gray-100 bg-gray-50">
          
          <!-- Comments list-->
          <div class="max-h-[250px] overflow-y-auto p-5 space-y-4 custom-scrollbar" id="comments-list-${post.id}">
            ${
              post.comments.length
                ? post.comments
                    .map((comment) => renderComment(comment))
                    .join("")
                : `<p class="text-sm text-gray-400 text-center py-4 no-comments-msg">Be the first one in comment this post.</p>`
            }
          </div>

          <!-- Fixed Bar to Input Comments -->
          <div class="p-4 bg-white border-t border-gray-100">
            <div class="flex gap-3">
              <img src="${currentUserPicture}" class="w-8 h-8 rounded-full object-cover">
              <div class="flex-1 relative">
                <textarea
                  id="comment-input-${post.id}"
                  rows="1"
                  placeholder="Write a comment..."
                  class="w-full p-2 pr-10 bg-gray-100 border-transparent focus:outline-none focus:ring-0 rounded-2xl text-sm resize-none roboto-regular"
                  oninput="this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'"
                ></textarea>
                <button 
                  onclick="submitComment(${post.id})"
                  class="absolute right-2 bottom-2 text-indigo-600 hover:text-primary_purp p-1"
                >
                  <div class"bg-primary_purp">
                    <svg xmlns="http://w3.org" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                      <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>


      </div>

    `;
  });

  container.html(html);
}

function submitComment(postId) {
  const input = $(`#comment-input-${postId}`);
  const content = input.val().trim();

  if (!content) return;

  $.ajax({
    url: `/api/posts/${postId}/comments`,
    type: "POST",
    contentType: "application/json",
    data: JSON.stringify({ content: content }),
    success: function (response) {
      if (response.success) {
        input.val("");
        input.css("height", "auto");

        const newCommentHtml = renderComment(response.comment);
        const counterSpan = $(`#comment-count-${postId}`);
        const currentCount = parseInt(counterSpan.text()) || 0;
        counterSpan.text(currentCount + 1);

        const list = $(`#comments-list-${postId}`);

        list.find(".no-comments-msg").remove();

        list.append(newCommentHtml);

        list.animate({ scrollTop: list.prop("scrollHeight") }, 500);
      }
    },
    error: function (xhr) {
      const msg = xhr.responseJSON
        ? xhr.responseJSON.message
        : "Error al comentar";
      alert(msg);
    },
  });
}

function renderComment(comment) {
  const currentUserId = $("#user-data").data("user-id");

  return `
    <div id="comments-card-${comment.id}" class="flex gap-3">

      ${
        comment.author_picture
          ? `
            <img
              src="${comment.author_picture}"
              class="w-9 h-9 rounded-full object-cover"
            />
          `
          : `
            <div class="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-semibold">
              ${comment.author_name}
            </div>
          `
      }

      <div class="flex-1 bg-white rounded-xl border border-gray-100 p-3">

        <div class="flex items-center gap-2 mb-1">

          <span class="text-sm montserrat-bold text-gray-800">
            ${comment.author_name}
          </span>

          <span class="text-xs text-gray-400 roboto-regular">
            ${formatMyCustomDate(comment.created_at)}
          </span>

          <div class="flex gap-3 ml-auto">
            ${
              comment.author_id === currentUserId
                ? `
              <button onclick="openDeleteModal(${comment.id}, 'comment', this)" class="text-gray-400 hover:text-red-500 p-1">
                <svg xmlns="http://w3.org" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            `
                : ""
            }
          </div>

        </div>

        <p class="text-sm text-gray-700 roboto-regular px-2">
          ${comment.content}
        </p>

      </div>

    </div>
  `;
}

function toggleComments(postId) {
  $(`#comments-section-${postId}`).toggleClass("hidden");
}

function toggleLike(postId) {
  const btn = $(`#like-btn-${postId}`);
  const icon = $(`#like-icon-${postId}`);
  const countSpan = $(`#like-count-${postId}`);

  $.ajax({
    url: `/api/posts/${postId}/like`,
    type: "POST",
    success: function (response) {
      if (response.success) {
        // update number of likes
        countSpan.text(response.total_likes);

        if (response.status === "liked") {
          btn.addClass("text-red-500").removeClass("text-gray-500");
          icon.attr("fill", "currentColor");
          icon.addClass("scale-125");
          setTimeout(() => icon.removeClass("scale-125"), 200);
        } else {
          btn.addClass("text-gray-500").removeClass("text-red-500");
          icon.attr("fill", "none");
        }
      }
    },
  });
}

//Start checking here:
function createPost() {
  const content = $("#post-content").val().trim();
  const group_id = $("#group-data").data("group-id");

  if (!content) {
    $("#post-alert").html(
      '<p class="text-red-500 text-sm roboto-regular">Please tell us what this post is about.</p>',
    );
    return;
  }

  const formData = new FormData();

  formData.append("content", content);

  formData.append("article_url", $("#article-url").val());

  const mediaFile = $("#post-media-input")[0].files[0];

  if (mediaFile) {
    formData.append("media", mediaFile);
  }

  $.ajax({
    url: "/api/groups/" + group_id + "/posts",
    type: "POST",
    data: formData,
    processData: false,
    contentType: false,
    success: function () {
      resetPostForm();
      loadGroupPosts(group_id);
    },

    error: function (xhr) {
      const errorMsg = xhr.responseJSON
        ? xhr.responseJSON.message
        : "Unkown error";
      alert("Error: " + errorMsg);
    },
  });
}

function resetPostForm() {
  $("#post-content").val("");

  $("#article-url").val("").addClass("hidden");

  $("#post-media-input").val("");

  $("#media-preview-container").html("").addClass("hidden");
}

function openDeleteModal(id, type, element = null) {
  itemToDelete = { id, type, element };
  $("#delete-modal").removeClass("hidden").addClass("flex");
}

function closeDeleteModal() {
  $("#delete-modal").addClass("hidden").removeClass("flex");
  itemToDelete = { id: null, type: null, element: null };
}

// Open Edit Group Modal
function openEditGroupModal() {
  const groupName = $("#group-data").data("group-name");
  const groupDescription = $("#group-data").data("group-description");
  const groupPicture = $("#group-data").data("group-picture");

  $("#edit-group-name").val(groupName);
  $("#edit-group-description").val(groupDescription);

  $("#edit-group-modal").removeClass("hidden").addClass("flex");
}

function closeEditGroupModal() {
  $("#edit-group-modal").addClass("hidden").removeClass("flex");
  $("#edit-group-alert").empty();
}

// ═══════════════════════════════════════════════════════════════════
// MEMBERS, INVITES, SETTINGS, LEAVE
// ═══════════════════════════════════════════════════════════════════

function _escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _myRole() {
  return $("#user-data").data("my-role");
}

function _isOwner() {
  return $("#user-data").data("is-owner") === true ||
         $("#user-data").data("is-owner") === "true";
}

function _myUserId() {
  return $("#user-data").data("user-id");
}

function _ownerId() {
  // Owner is the member whose role === "owner". Cached per render.
  return window.__ownerId || null;
}

function _avatarHtml(member) {
  if (member.profile_picture) {
    const src = member.profile_picture.startsWith("http") ||
                member.profile_picture.startsWith("/")
      ? member.profile_picture
      : "/static/" + member.profile_picture;
    return `<img src="${_escapeHtml(src)}" class="w-9 h-9 rounded-full object-cover shrink-0" alt="">`;
  }
  const initial = (member.username || "?")[0].toUpperCase();
  return `<div class="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm montserrat-semi-bold shrink-0">${_escapeHtml(initial)}</div>`;
}

function _roleBadge(role) {
  const styles = {
    owner:  "bg-indigo-100 text-indigo-600",
    admin:  "bg-purple-100 text-purple-600",
    member: "bg-gray-100 text-gray-500",
  };
  const cls = styles[role] || styles.member;
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  return `<span class="text-[10px] montserrat-medium px-2 py-0.5 rounded-full ${cls}">${label}</span>`;
}

// ── Sidebar member list (compact) ──────────────────────────────────────────
function loadGroupMembers(groupId) {
  $.getJSON(`/api/groups/${groupId}/members`, function (members) {
    // Cache owner id for downstream logic
    const owner = members.find((m) => m.role === "owner");
    window.__ownerId = owner ? owner.user_id : null;

    renderSidebarMembers(members);
    $("#member-count").text(members.length);

    // If the settings modal is open, refresh that list too
    if (!$("#settings-modal").hasClass("hidden") &&
        !$("#settings-tab-members").hasClass("hidden")) {
      renderSettingsMembers(members);
    }
  });
}

function renderSidebarMembers(members) {
  const myId = _myUserId();
  const isOwner = _isOwner();
  const isAdmin = _myRole() === "admin" || isOwner;

  let html = "";
  members.forEach((m) => {
    const canRemove = isAdmin && m.role !== "owner" && m.user_id !== myId;
    const removeBtn = canRemove
      ? `<button class="member-remove-btn opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1"
                  data-user-id="${m.user_id}" data-username="${_escapeHtml(m.username)}"
                  title="Remove from group">
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
             <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
           </svg>
         </button>`
      : "";

    html += `
      <div class="group flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50">
        ${_avatarHtml(m)}
        <div class="flex-1 min-w-0">
          <p class="text-sm montserrat-medium text-gray-800 truncate">${_escapeHtml(m.username)}</p>
          <div class="mt-0.5">${_roleBadge(m.role)}</div>
        </div>
        ${removeBtn}
      </div>
    `;
  });

  $("#members-list").html(html);
}

// Sidebar inline remove button -> reuses the confirm flow via a small custom modal
$(document).on("click", ".member-remove-btn", function (e) {
  e.stopPropagation();
  const userId = $(this).data("user-id");
  const username = $(this).data("username");
  if (!confirm(`Remove ${username} from this group?`)) return;
  removeMember(userId, username);
});

function removeMember(userId, username) {
  const groupId = $("#group-data").data("group-id");
  $.ajax({
    url: `/api/groups/${groupId}/members/${userId}`,
    type: "DELETE",
    success: function (resp) {
      if (resp.success) {
        loadGroupMembers(groupId);
      }
    },
    error: function (xhr) {
      alert(xhr.responseJSON?.message || `Could not remove ${username}.`);
    },
  });
}

// ── Settings modal ────────────────────────────────────────────────────────
function initGroupSettings(groupId) {
  $("#open-settings-btn").on("click", function () {
    openSettings("members");
  });
  $("#settings-modal-close").on("click", closeSettings);

  $(".settings-tab").on("click", function () {
    const tab = $(this).data("tab");
    selectSettingsTab(tab);
  });
}

function openSettings(tab) {
  $("#settings-modal").removeClass("hidden");
  selectSettingsTab(tab || "members");
}

function closeSettings() {
  $("#settings-modal").addClass("hidden");
}

function selectSettingsTab(tab) {
  $(".settings-tab").each(function () {
    const isActive = $(this).data("tab") === tab;
    if (isActive) {
      $(this)
        .removeClass("border-transparent text-gray-500 hover:text-gray-700 text-red-500 hover:text-red-600")
        .addClass(
          tab === "danger"
            ? "border-red-500 text-red-600"
            : "border-primary_purp text-primary_purp"
        );
    } else {
      $(this)
        .removeClass("border-primary_purp text-primary_purp border-red-500 text-red-600")
        .addClass(
          $(this).data("tab") === "danger"
            ? "border-transparent text-red-500 hover:text-red-600"
            : "border-transparent text-gray-500 hover:text-gray-700"
        );
    }
  });

  $(".settings-pane").addClass("hidden");
  $(`#settings-tab-${tab}`).removeClass("hidden");

  const groupId = $("#group-data").data("group-id");
  if (tab === "members") loadSettingsMembers(groupId);
  if (tab === "audit") loadSettingsAudit(groupId);
}

function loadSettingsMembers(groupId) {
  $("#settings-members-list").html(
    `<p class="text-sm text-gray-400 text-center py-4 roboto-regular">Loading...</p>`
  );
  $.getJSON(`/api/groups/${groupId}/members`, function (members) {
    const owner = members.find((m) => m.role === "owner");
    window.__ownerId = owner ? owner.user_id : null;
    renderSettingsMembers(members);
  });
}

function renderSettingsMembers(members) {
  const myId = _myUserId();
  const isOwner = _isOwner();
  const isAdmin = _myRole() === "admin" || isOwner;

  let html = "";
  members.forEach((m) => {
    const isMe = m.user_id === myId;
    const isMemberOwner = m.role === "owner";

    // Action buttons
    const actions = [];
    if (isOwner && !isMemberOwner && !isMe) {
      if (m.role === "member") {
        actions.push(
          `<button class="role-change-btn px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-xs montserrat-medium hover:bg-indigo-100"
                   data-user-id="${m.user_id}" data-new-role="admin">Promote</button>`
        );
      } else if (m.role === "admin") {
        actions.push(
          `<button class="role-change-btn px-3 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs montserrat-medium hover:bg-gray-200"
                   data-user-id="${m.user_id}" data-new-role="member">Demote</button>`
        );
      }
    }
    if (isAdmin && !isMemberOwner && !isMe) {
      actions.push(
        `<button class="settings-remove-btn px-3 py-1 rounded-lg bg-red-50 text-red-600 text-xs montserrat-medium hover:bg-red-100"
                 data-user-id="${m.user_id}" data-username="${_escapeHtml(m.username)}">Remove</button>`
      );
    }

    html += `
      <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
        ${_avatarHtml(m)}
        <div class="flex-1 min-w-0">
          <p class="text-sm montserrat-medium text-gray-800 truncate">
            ${_escapeHtml(m.username)} ${isMe ? '<span class="text-xs text-gray-400 ml-1">(you)</span>' : ""}
          </p>
          <div class="mt-0.5">${_roleBadge(m.role)}</div>
        </div>
        <div class="flex gap-2 flex-wrap justify-end">${actions.join("")}</div>
      </div>
    `;
  });

  if (!html) {
    html = `<p class="text-sm text-gray-400 text-center py-4 roboto-regular">No members.</p>`;
  }
  $("#settings-members-list").html(html);
}

$(document).on("click", ".role-change-btn", function () {
  const userId = $(this).data("user-id");
  const newRole = $(this).data("new-role");
  const groupId = $("#group-data").data("group-id");

  $.ajax({
    url: `/api/groups/${groupId}/members/${userId}/role`,
    type: "PATCH",
    contentType: "application/json",
    data: JSON.stringify({ role: newRole }),
    success: function () {
      loadSettingsMembers(groupId);
      loadGroupMembers(groupId);
    },
    error: function (xhr) {
      alert(xhr.responseJSON?.message || "Could not change role.");
    },
  });
});

$(document).on("click", ".settings-remove-btn", function () {
  const userId = $(this).data("user-id");
  const username = $(this).data("username");
  if (!confirm(`Remove ${username} from this group?`)) return;
  removeMember(userId, username);
  // The modal list refresh happens because removeMember calls loadGroupMembers
  // which also refreshes the open settings panel.
  setTimeout(() => loadSettingsMembers($("#group-data").data("group-id")), 200);
});

// ── Audit log tab ─────────────────────────────────────────────────────────
function loadSettingsAudit(groupId) {
  $("#settings-audit-list").html(
    `<p class="text-sm text-gray-400 text-center py-4 roboto-regular">Loading...</p>`
  );
  $.getJSON(`/api/groups/${groupId}/audit-log`, function (logs) {
    if (!logs.length) {
      $("#settings-audit-list").html(
        `<p class="text-sm text-gray-400 text-center py-6 roboto-regular">No moderation actions yet.</p>`
      );
      return;
    }

    const verbs = {
      remove_member:  "removed",
      promote_admin:  "promoted",
      demote_admin:   "demoted",
      delete_post:    "deleted a post by",
    };

    let html = "";
    logs.forEach((log) => {
      const actor = _escapeHtml(log.actor_username || "Someone");
      const target = _escapeHtml(log.target_username || "");
      const verb = verbs[log.action] || log.action.replace("_", " ");
      const when = formatMyCustomDate(log.created_at);

      html += `
        <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
          <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                 stroke-width="2" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round"
                    d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-gray-700 roboto-regular">
              <span class="montserrat-semi-bold text-gray-800">${actor}</span>
              ${verb}
              ${target ? `<span class="montserrat-semi-bold text-gray-800">${target}</span>` : ""}
            </p>
            <p class="text-xs text-gray-400 mt-0.5">${when}</p>
          </div>
        </div>
      `;
    });

    $("#settings-audit-list").html(html);
  }).fail(function () {
    $("#settings-audit-list").html(
      `<p class="text-sm text-red-500 text-center py-6 roboto-regular">Failed to load audit log.</p>`
    );
  });
}

// ── Invite modal ──────────────────────────────────────────────────────────
function initInviteModal(groupId) {
  $("#invite-member-btn").on("click", function () {
    $("#invite-code-input").val("");
    $("#invite-alert").text("");
    $("#invite-modal").removeClass("hidden");
  });

  $("#invite-modal-close").on("click", function () {
    $("#invite-modal").addClass("hidden");
  });

  $("#invite-code-input").on("input", function () {
    const pos = this.selectionStart;
    this.value = this.value.toUpperCase();
    this.setSelectionRange(pos, pos);
  });

  $("#invite-code-input").on("keydown", function (e) {
    if (e.key === "Enter") $("#invite-send-btn").trigger("click");
  });

  $("#invite-send-btn").on("click", function () {
    const code = $("#invite-code-input").val().trim().toUpperCase();
    if (!code) {
      $("#invite-alert").text("Please enter a friend code.").css("color", "#ef4444");
      return;
    }
    if (code.length !== 8) {
      $("#invite-alert").text("Friend codes are 8 characters long.").css("color", "#ef4444");
      return;
    }

    $("#invite-alert").text("Sending...").css("color", "#6b7280");

    $.ajax({
      url: `/api/groups/${groupId}/invite-by-code`,
      type: "POST",
      contentType: "application/json",
      data: JSON.stringify({ friend_code: code }),
      success: function () {
        $("#invite-alert").text("Invitation sent!").css("color", "#16a34a");
        $("#invite-code-input").val("");
      },
      error: function (xhr) {
        const msg = xhr.responseJSON?.message || "Failed to send invitation.";
        $("#invite-alert").text(msg).css("color", "#ef4444");
      },
    });
  });
}

// ── Leave group ───────────────────────────────────────────────────────────
function initLeaveGroup(groupId) {
  $("#leave-group-btn").on("click", function () {
    $("#leave-modal").removeClass("hidden");
  });
  $("#leave-cancel-btn").on("click", function () {
    $("#leave-modal").addClass("hidden");
  });
  $("#leave-confirm-btn").on("click", function () {
    $.ajax({
      url: `/api/groups/${groupId}/leave`,
      type: "POST",
      success: function () {
        window.location.href = "/groups";
      },
      error: function (xhr) {
        alert(xhr.responseJSON?.message || "Could not leave group.");
        $("#leave-modal").addClass("hidden");
      },
    });
  });
}

// ── Helper for the "Delete Group" button in the danger zone ────────────────
function openDeleteGroupModal() {
  // Reuse the existing delete-confirm modal. type=null falls through to /api/groups/<id>.
  itemToDelete = { id: null, type: null, element: null };
  $("#delete-modal").removeClass("hidden").addClass("flex");
}
