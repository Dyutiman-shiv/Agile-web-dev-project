
$(document).ready(function () {
"use strict";
  loadGroupPosts();

});

async function loadGroupPosts() {

  const container = $("#posts-container");

  container.html(`
    <div class="text-center py-10 text-gray-400">
      Loading posts...
    </div>
  `);

  try {

    const response = await fetch(
      `/api/groups/${groupData.group_id}/posts`
    );

    if (!response.ok) {
      throw new Error("Failed to load posts");
    }

    const posts = await response.json();

    renderPosts(posts);

  } catch (error) {

    console.error(error);

    container.html(`
      <div class="text-center py-10 text-red-500">
        Failed to load posts.
      </div>
    `);

  }

}

function renderPosts(posts) {

  const container = $("#posts-container");

  if (!posts.length) {

    container.html(`
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
        <p class="text-gray-500 text-sm">
          No posts yet. Create the first discussion!
        </p>
      </div>
    `);

    return;
  }

  let html = "";

  posts.forEach(post => {

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

          <p class="text-gray-700 roboto-regular whitespace-pre-wrap">
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
                ? post.comments.map(comment => renderComment(comment)).join("")
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

      <div class="flex-1 bg-white rounded-xl p-3 border border-gray-100">

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