$(document).ready(function () {
  "use strict";
  const group_id = $("#group-data").data("group-id");
  loadGroupPosts(group_id);

  initSidebar();

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

  const cleanIsoString = isoString.endsWith('Z') ? isoString : isoString + 'Z';
  const date = new Date(cleanIsoString);

  return date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

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

  posts.forEach((post) => {

    console.log(post.created_at);
    const formattedDate = formatMyCustomDate(post.created_at);
    
    html += `
      <div class="bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden">

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

        <!-- Barra de Interacción -->
        <div class="flex items-center gap-6 my-3 pt-4 px-4 border-t border-gray-50">
          
          <!-- Botón de Likes -->
          <button onclick="showLikes(${post.id})" class="flex items-center gap-2 text-gray-500 hover:text-red-500 transition-colors">
            <svg xmlns="http://w3.org" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
            <span class="text-xs font-medium">${post.likes_count || 0}</span>
          </button>

          <!-- Botón de Comentarios -->
          <button onclick="toggleComments(${post.id})" class="flex items-center gap-2 text-gray-500 hover:text-indigo-600 transition-colors">
            <svg xmlns="http://w3.org" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785 0.5 0.5 0 0 0 .416.791 6 6 0 0 0 4.627-2.323 5.964 5.964 0 0 0 2.02.326Z" />
            </svg>
            <span class="text-xs font-medium">${post.comments.length}</span>
          </button>
        </div>

        <!-- SECCIÓN DE COMENTARIOS -->
        <div id="comments-section-${post.id}" class="hidden border-t border-gray-100 bg-gray-50">
          
          <!-- Comments list-->
          <div class="max-h-[250px] overflow-y-auto p-5 space-y-4 custom-scrollbar" id="comments-list-${post.id}">
            ${
              post.comments.length
                ? post.comments.map((comment) => renderComment(comment)).join("")
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

                const list = $(`#comments-list-${postId}`);
                
                list.find(".no-comments-msg").remove();
                
                list.append(newCommentHtml);

                list.animate({ scrollTop: list.prop("scrollHeight") }, 500);
            }
        },
        error: function (xhr) {
            const msg = xhr.responseJSON ? xhr.responseJSON.message : "Error al comentar";
            alert(msg);
        }
    });
}


function renderComment(comment) {
  return `
    <div class="flex gap-3">

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

        </div>

        <p class="text-sm text-gray-700 roboto-regular px-2">
          ${comment.content}
        </p>

      </div>

    </div>
  `;
}

function toggleComments(postId) {
    $(`#comments-section-${postId}`).toggleClass('hidden');
}

function showLikes(postId) {
    alert("Próximamente: Lista de personas que dieron like al post " + postId);
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
        : "Error desconocido";
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
