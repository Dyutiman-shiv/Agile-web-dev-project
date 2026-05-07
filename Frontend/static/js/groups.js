$(document).ready(function () {
  "use strict";

  function loadPage() {
    loadGroups();
  }

  $("#create-group-btn").on("click", () => {
    $("#group-modal").removeClass("hidden");
  });

  $("#group-modal-close, #group-cancel-btn").on("click", () => {
    $("#group-modal").addClass("hidden");
  });

    //Create a group
  $("#group-save-btn").on("click", (event) => {
    event.preventDefault();

    const group_name = $("#group-name").val().trim();
    const group_description = $("#group-description").val().trim();

    if (!group_name) {
      $("#group-alert").html(
        '<p class="text-red-500 text-sm roboto-regular">Group name is required.</p>',
      );
      return;
    }

    const payload = {
      name: group_name,
      description: group_description,
    };

    $.ajax({
      url: "/api/groups",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify(payload),
      success: function (group) {
        // Upload cover if exists
        const file = $("#group-cover")[0].files[0];

        if (file) {
          const formData = new FormData();
          formData.append("cover", file);

          $.ajax({
            url: `/api/groups/${group.id}/cover`,
            method: "PUT",
            data: formData,
            processData: false,
            contentType: false,
            complete: () => location.reload(),
          });
        } else {
          location.reload();
        }
      },
      error: function () {
        $("#group-alert").html(
          '<p class="text-red-500 text-sm">Error creating group</p>',
        );
      },
    });
  });

  //Load Groups

  function loadGroups() {
    $.getJSON("/api/groups", function (groups) {
      let html = "";

      // Empty state
      if (groups.length === 0) {
        $("#groups-container").html("");
        $("#empty-groups").removeClass("hidden");
        return;
      }

      $("#empty-groups").addClass("hidden");

      groups.forEach((group) => {
        html += `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition cursor-pointer">

          <!-- Cover -->
          <div class="h-48 bg-gray-200 relative">
            <img src="${group.cover_picture || "/static/uploads/group_covers/default-group.jpg"}"
                 class="w-full h-full object-cover">

            <div class="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
          </div>

          <!-- Content -->
          <div class="p-4">

            <h3 class="text-sm montserrat-semi-bold text-gray-800">
              ${group.name}
            </h3>

            <p class="text-xs text-gray-500 roboto-light mt-1 line-clamp-2">
              ${group.description || "No description"}
            </p>

            <div class="mt-4 flex justify-between items-center">

              <span class="text-[11px] roboto-regular text-gray-400">
                ${group.members.length} members
              </span>

              <a href="/groups/${group.id}"
                 class="text-xs text-primary_purp hover:underline">
                View →
              </a>

            </div>
          </div>
        </div>
      `;
      });

      $("#groups-container").html(html);
    });
  };

  loadPage();
});
