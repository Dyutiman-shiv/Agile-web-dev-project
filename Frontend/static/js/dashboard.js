$(document).ready(function () {
  "use strict";

  function loadPage() {
    loadTodaysTasks();
  }

  function loadTodaysTasks() {
    const today = new Date().toISOString().split("T")[0];

    $.getJSON("/api/dashboard/get_today_tasks/" + today, function (tasks) {
      console.log("Today's Tasks:", tasks);
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
      bar.className = "h-2 rounded-full bg-task_green transition-all duration-500";
    }
    
  }

  loadPage();
});
