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

      console.log(JSON.stringify(posts))
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

  posts.forEach((post) => {
    html += `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        <!-- POST -->
        <div class="p-6">

          <div class="flex items-center gap-3 mb-4">

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
                ${formatDate(post.created_at)}
              </p>

            </div>

          </div>

          ${
            post.title
              ? `
                <h2 class="text-xl montserrat-bold text-gray-800 mb-3">
                  ${post.title}
                </h2>
              `
              : ""
          }

          <p class="text-gray-700 whitespace-pre-wrap roboto-regular">
            ${post.content}
          </p>

        </div>

        <!-- COMMENTS -->
        <div class="border-t border-gray-100 bg-gray-50 p-5">

          <h3 class="text-sm montserrat-bold text-gray-600 mb-4">
            Comments
          </h3>

          <div class="space-y-4">

            ${
              post.comments.length
                ? post.comments
                    .map((comment) => renderComment(comment))
                    .join("")
                : `
                  <p class="text-sm text-gray-400">
                    No comments yet.
                  </p>
                `
            }

          </div>

        </div>

      </div>
    `;
  });

  container.html(html);
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
              ${comment.author_name[0].toUpperCase()}
            </div>
          `
      }

      <div class="flex-1 bg-white rounded-xl border border-gray-100 p-3">

        <div class="flex items-center gap-2 mb-1">

          <span class="text-sm montserrat-medium text-gray-800">
            ${comment.author_name}
          </span>

          <span class="text-xs text-gray-400">
            ${formatDate(comment.created_at)}
          </span>

        </div>

        <p class="text-sm text-gray-700">
          ${comment.content}
        </p>

      </div>

    </div>
  `;
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
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
      const errorMsg = xhr.responseJSON ? xhr.responseJSON.message : "Error desconocido";
      alert("Error: " + errorMsg);
    },
  });
}

function resetPostForm() {

  $("#post-content").val("");

  $("#article-url")
    .val("")
    .addClass("hidden");

  $("#post-media-input").val("");

  $("#media-preview-container")
    .html("")
    .addClass("hidden");

}
