$(document).ready(function () {
  "use strict";

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

  function loadPage() {
    loadTodaysTasks();
    loadCurrentSemester();
  }

  function loadTodaysTasks() {
    const today = new Date().toISOString().split("T")[0];

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
      bar.className =
        "h-2 rounded-full bg-gray-300 transition-all duration-500";
    } else if (completed === total) {
      bar.className =
        "h-2 rounded-full bg-green-500 transition-all duration-500";
    } else {
      bar.className =
        "h-2 rounded-full bg-task_green transition-all duration-500";
    }
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
          circumference -
          (semester.wam === null ? 0 : wam / 100) * circumference;
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
    });
  }

  loadPage();
});
