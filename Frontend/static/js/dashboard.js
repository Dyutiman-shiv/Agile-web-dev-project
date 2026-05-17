$(document).ready(function () {
  "use strict";

  function loadPage() {
    loadTodaysTasks();
    loadCurrentSemester();
    loadDashboardFeed();
    loadActiveFocusSession();
  }

  loadPage();
});

const $sidebar = $("#dashboard-sidebar");
const $overlay = $("#sidebar-overlay");

// OPEN SIDEBAR
$("#mobile-sidebar-toggle").on("click", function () {
  $sidebar.removeClass("-translate-x-full");
  $overlay.removeClass("hidden");
});

// CLOSE BUTTON
$("#close-sidebar-btn").on("click", function () {
  closeSidebar();
});

// CLICK OVERLAY
$overlay.on("click", function () {
  closeSidebar();
});

// CLOSE FUNCTION
function closeSidebar() {
  $sidebar.addClass("-translate-x-full");
  $overlay.addClass("hidden");
}

// HANDLE RESIZE
$(window).on("resize", function () {
  if ($(window).width() >= 1024) {
    $overlay.addClass("hidden");

    $sidebar.removeClass("-translate-x-full");
  } else {
    $sidebar.addClass("-translate-x-full");
  }
});

function loadTodaysTasks() {
  const dateObj = new Date();
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0"); // Los meses van de 0 a 11
  const day = String(dateObj.getDate()).padStart(2, "0");

  const today = `${year}-${month}-${day}`;

  $.getJSON("/api/dashboard/get_today_tasks/" + today, function (tasks) {
    if (!tasks || tasks.length === 0) {
      const ul = document.getElementById("task-list");
      ul.innerHTML = '<li class="text-gray-400">No tasks for today! 🎉</li>';
      return;
    }

    const ul = document.getElementById("task-list");

    // Clear existing content
    ul.innerHTML = "";

    tasks.forEach((task) => {
      const li = document.createElement("li");
      const span = document.createElement("span");

      span.className = getClass(task.completed);
      span.textContent = task.title;

      li.appendChild(span);
      li.appendChild(document.createTextNode(" " + getIcon(task.completed)));

      ul.appendChild(li);

      //Updating the status bar
      updateProgresBar(tasks);
    });
  });
}

function getIcon(status) {
  if (status === true) {
    return "✅";
  } else {
    return "⏱️";
  }
}

function getClass(status) {
  if (status === true) {
    return "text-gray-500 line-through roboto-regular text-sm";
  } else {
    return "text-text_dark_gray roboto-regular text-sm";
  }
}

function updateProgresBar(tasks) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;

  const bar = document.getElementById("progress-bar");
  const text = document.getElementById("progress-text");

  // Avoid division by zero
  const percentage = total === 0 ? 0 : (completed / total) * 100;

  // Update width
  bar.style.width = percentage + "%";

  // Update text
  text.textContent = `${completed}/${total}`;

  // Dynamic styling + messaging
  if (total === 0) {
    bar.style.width = "100%";
    bar.className = "h-2 rounded-full bg-gray-300 transition-all duration-500";
  } else if (completed === total) {
    bar.className = "h-2 rounded-full bg-green-500 transition-all duration-500";
  } else {
    bar.className =
      "h-2 rounded-full bg-task_green transition-all duration-500";
  }
}

//Active Focus Session

function loadActiveFocusSession() {
  const card = document.getElementById("current-focus-card");
  if (!card) return;

  $.getJSON("/api/dashboard/active-session", function (session) {

    if (!session) {
      card.classList.add("hidden");
      return;
    }

    document.getElementById("focus-session-title").textContent =
      session.title || "Untitled Session";

    const unitBadge = document.getElementById("focus-unit-badge");
    if (session.unit_name) {
      unitBadge.textContent = session.unit_code
        ? `📚 ${session.unit_code} - ${session.unit_name}`
        : `📚 ${session.unit_name}`;
      unitBadge.classList.remove("hidden");
    } else {
      unitBadge.classList.add("hidden");
    }

    const totalSeconds = parseInt(session.accumulated_seconds || 0, 10);
    document.getElementById("focus-accumulated-time").textContent =
      formatAccumulatedTime(totalSeconds);

    const checklistContainer = document.getElementById(
      "focus-checklist-container",
    );
    const checklistList = document.getElementById("focus-checklist-list");

    if (session.checklist && session.checklist.length > 0) {
      checklistList.innerHTML = ""; 

      session.checklist.forEach((item) => {
        const isCompleted = item.completed === true;

        checklistList.innerHTML += `
          <li class="flex items-start gap-2 text-xs text-gray-600 roboto-regular">
            <span class="flex-shrink-0 mt-0.5 text-sm">
              ${isCompleted ? "✅" : "⬜"}
            </span>
            <span class="${isCompleted ? "line-through text-gray-400" : "text-gray-700"} break-words min-w-0 flex-1">
              ${item.title || item.content || "Task"}
            </span>
          </li>
        `;
      });

      checklistContainer.classList.remove("hidden");
    } else {
      checklistContainer.classList.add("hidden");
    }

    card.classList.remove("hidden");
  }).fail(function () {
    card.classList.add("hidden");
  });
}

function formatAccumulatedTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const paddedMins = String(mins).padStart(2, "0");
  const paddedSecs = String(secs).padStart(2, "0");

  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${paddedMins}:${paddedSecs}`;
  }
  return `${paddedMins}:${paddedSecs}`;
}

// Loading Curent Semester
function loadCurrentSemester() {
  $.getJSON("/api/semesters/current", function (semester) {
    const wamContainer = document.getElementById("wam-card");

    if (!semester) {
      wamContainer.classList.add("hidden");
      return;
    } else {
      wamContainer.classList.remove("hidden");
      document.getElementById("semester-name").textContent = semester.name;

      // Update the Wam Ring

      const wamValue = parseFloat(semester.wam || 0);
      const ring = document.getElementById("wam-ring");
      const text = document.getElementById("current-wam");

      let radius = parseFloat(ring.getAttribute("r"));
      const circumference = 2 * Math.PI * radius;
      let wam = semester.wam === null ? 0 : parseFloat(semester.wam);

      const offset =
        circumference - (semester.wam === null ? 0 : wam / 100) * circumference;
      ring.style.strokeDashoffset = offset;

      document.getElementById("wam-current").textContent = wam.toFixed(1);

      loadUnits(semester.id);
    }
  });
}

function loadUnits(semester_id) {
  $.getJSON("/api/units", { semester_id: semester_id }, function (units) {
    let max_score = 0;
    let min_score = Infinity;
    let bestUnit = units[0];
    let lowestUnit = units[0];

    units.forEach((unit) => {
      if (unit.score > max_score) {
        max_score = parseFloat(unit.score);
        bestUnit = unit;
      }

      if (unit.score < min_score) {
        min_score = parseFloat(unit.score);
        lowestUnit = unit;
      }
    });

    if (parseFloat(bestUnit.score) > parseFloat(lowestUnit.score)) {
      document.getElementById("wam-best").textContent =
        bestUnit.name + " - " + parseFloat(bestUnit.score).toFixed(2) + " ⭐";
    } else {
      document.getElementById("wam-best").textContent = "";
    }

    if (parseFloat(lowestUnit.score) < 60) {
      document.getElementById("wam-worst").textContent =
        lowestUnit.name + " - " + parseFloat(lowestUnit.score).toFixed(2);
    } else {
      document.getElementById("wam-worst").textContent = "";
    }

    loadUpcomingAssessments(semester_id, units);
  });
}

function loadUpcomingAssessments(semester_id, units) {
  const upcomingCard = document.getElementById("upcoming-assessments-card");
  const listContainer = document.getElementById("upcoming-tasks-list");

  if (!upcomingCard || !listContainer) return;

  const unitMap = {};
  units.forEach((u) => {
    unitMap[u.id] = u.name;
  });

  $.getJSON(`/api/scores/${semester_id}`, function (assessments) {
    if (!assessments || assessments.length === 0) {
      upcomingCard.classList.add("hidden");
      return;
    }

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const futureAssessments = assessments.filter((a) => {
      if (!a.due_date) return false;
      const dueDate = new Date(a.due_date);

      const dateParts = a.due_date.split("-");
      const parsedDueDate = new Date(
        dateParts[0],
        dateParts[1] - 1,
        dateParts[2],
      );

      const isCompleted = parseFloat(a.score) > 0;

      return parsedDueDate >= startOfToday && !isCompleted;
    });

    if (futureAssessments.length === 0) {
      upcomingCard.classList.add("hidden");
      return;
    }

    futureAssessments.sort(
      (a, b) => new Date(a.due_date) - new Date(b.due_date),
    );

    const topThree = futureAssessments.slice(0, 3);

    listContainer.innerHTML = "";

    topThree.forEach((a) => {
      const dueDate = new Date(a.due_date);
      const formattedDate = dueDate.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      });
      const unitName = unitMap[a.unit_id] || "Unknow Unit";

      const isToday =
        dueDate.getDate() === now.getDate() &&
        dueDate.getMonth() === now.getMonth() &&
        dueDate.getFullYear() === now.getFullYear();

      const dateBadgeText = isToday
        ? "Today"
        : dueDate.toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          });

      listContainer.innerHTML += `
        <div class="flex items-center justify-between p-3 rounded-xl bg-white border border-gray-100 hover:bg-gray-100/70 transition">
          <div class="space-y-0.5">
            <h4 class="text-xs font-semibold text-gray-800 roboto-medium truncate max-w-[180px] sm:max-w-xs">
              ${a.name || "Unnamed Assessment"}
            </h4>
            <p class="text-[10px] text-gray-400 font-medium tracking-wide uppercase">
              ${unitName}
            </p>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold text-primary_purp bg-primary_purp/20 px-2 py-1 rounded-md">
              ${dateBadgeText}
            </span>
          </div>
        </div>
      `;
    });

    upcomingCard.classList.remove("hidden");
  }).fail(function () {
    upcomingCard.classList.add("hidden");
  });
}

// Group Actions

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

function openDeleteModal(id, type, element = null) {
  itemToDelete = { id, type, element };
  $("#delete-modal").removeClass("hidden").addClass("flex");
}

function closeDeleteModal() {
  $("#delete-modal").addClass("hidden").removeClass("flex");
  itemToDelete = { id: null, type: null, element: null };
}

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

// Feed Section

function loadDashboardFeed() {
  $.getJSON("/api/dashboard/feed", function (posts) {
    renderPosts(posts);
  }).fail(function () {
    $("#posts-container").html(`
      <div class="bg-white rounded-2xl p-10 text-center border border-gray-100">
        <p class="text-red-500 roboto-regular text-sm">
          Error loading feed. Please try again later.
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

  //Create a map for the metrics posts

  const metricPool = [
      {
        id: "summary",
        html: `
          <div class="w-full bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div class="flex justify-between items-center">
              <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 montserrat-semi-bold">Weekly Performance</h3>
              <span class="text-[10px] bg-primary_purp/20 text-primary_purp px-2 py-0.5 rounded-full font-bold uppercase">Statistics</span>
            </div>
            <div class="grid grid-cols-3 gap-4 text-center pt-2">
              <div><p id="stat-total-hours" class="text-xl sm:text-2xl font-black text-gray-900 montserrat-bold">--</p><p class="text-[10px] uppercase font-bold text-gray-400 mt-1">Hours</p></div>
              <div class="border-x border-gray-100"><p id="stat-current-streak" class="text-xl sm:text-2xl font-black text-primary_purp montserrat-bold">-- 🔥</p><p class="text-[10px] uppercase font-bold text-gray-400 mt-1">Streak</p></div>
              <div><p id="stat-avg-minutes" class="text-xl sm:text-2xl font-black text-gray-900 montserrat-bold">--</p><p class="text-[10px] uppercase font-bold text-gray-400 mt-1">Average</p></div>
            </div>
          </div>`
      },
      {
        id: "tasks",
        html: `
          <div class="w-full bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div class="flex justify-between items-center">
              <div class="space-y-0.5">
                <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 montserrat-semi-bold">This week's tasks progress.</h3>
                <p id="task-completion-ratio" class="text-base sm:text-lg font-black text-gray-800 montserrat-bold">0 / 0</p>
              </div>
              <div class="w-10 h-10 rounded-xl bg-primary_purp/20 flex items-center justify-center text-primary_purp flex-shrink-0">
                <svg xmlns="http://w3.org" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
              </div>
            </div>
            <div class="w-full bg-gray-50 h-2 rounded-full border border-gray-100 overflow-hidden p-0.5">
              <div id="task-global-bar" class="bg-indigo-600 h-full rounded-full transition-all duration-500" style="width: 0%"></div>
            </div>
          </div>`
      }
    ];

    let postsSinceLastMetric = 0;
    const minSpacing = posts.length <= 3 ? 1 : 2; // Minimum number of posts between metrics

  posts.forEach((post, index) => {
    const formattedDate = formatMyCustomDate(post.created_at);
    const likes = post.likes;
    const isLiked = likes.includes(currentUserId);

    // Randomply insert a metric card if conditions are met
      if (index > 0 && metricPool.length > 0 && postsSinceLastMetric >= minSpacing) {
        const isLastChance = (index === posts.length - 1);
        const shouldInsert = isLastChance ? true : (Math.random() < 0.35);

        if (shouldInsert) {
          const randomIndex = Math.floor(Math.random() * metricPool.length);
          const selectedMetric = metricPool.splice(randomIndex, 1); 
          html += selectedMetric[0].html;
          postsSinceLastMetric = 0;
        }
      }
      postsSinceLastMetric++;

      const coverHtml = post.group.cover_picture
        ? `<img src="/static/${post.group.cover_picture}" class="w-full h-full object-cover" alt="cover">`
        : `<div class=" w-11 h-11 rounded-full p-2 object-cover bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
             <svg class="w-full h-full text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1"
                     d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857
                        M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857
                        m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
             </svg>
           </div>`;

    html += `
      <div id="post-card-${post.id}" class="w-full bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden">

        <!-- POST -->
        <div class="p-6">

          <div class="flex items-center gap-3 mb-2">


            ${
              post.group.name
                ? coverHtml
                : `
                  <div class="w-11 h-11 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold">
                    ${post.group.name[0].toUpperCase()}
                  </div>
                `
            }

            <div>

              <a href="/api/groups/${post.group.id}" class="text-sm montserrat-medium text-gray-800 hover:opacity-80 transition-opacity">
                ${post.group.name || "Unknown Group"}
              </a>

              <p class="text-xs text-gray-400">
                <span>${post.author_name} - </span><span>${formattedDate}</span>
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

  fetchInlineMetricsData();
}

function fetchInlineMetricsData() {

    if ($("#stat-total-hours").length) {
      $.getJSON("/api/stats/summary?period=week", function (data) {
        if (!data) return;
        $("#stat-total-hours").text(data.total_hours.toFixed(1));
        $("#stat-current-streak").text(`${data.current_streak} 🔥`);
        $("#stat-avg-minutes").text(`${data.avg_minutes}m`);
      });
    }

    if ($("#task-completion-ratio").length) {
      $.getJSON("/api/stats/task-completion?period=week", function (data) {
        if (!data || data.length === 0) return;
        let total = 0, completed = 0;
        data.forEach(u => { total += u.total; completed += u.completed; });
        $("#task-completion-ratio").text(`${completed} / ${total}`);
        $("#task-global-bar").css("width", `${total > 0 ? (completed / total) * 100 : 0}%`);
      });
    }
  }