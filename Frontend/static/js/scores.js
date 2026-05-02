let units = {};
let unitNames = {};
let unitCredits = {};
let currentSemesterId = "";

function loadSemesters() {
  $.getJSON("/api/semesters", function (data) {
    const select = $("#semester-select");
    select.html("");

    data.forEach(s => {
      select.append(`<option value="${s.id}">${s.name}</option>`);
    });

    if (data.length > 0) {
      currentSemesterId = data[0].id;
      select.val(currentSemesterId);
      loadUnits();
    }
  });
}

$("#semester-select").on("change", function () {
  currentSemesterId = $(this).val();
  loadUnits();
});


function loadUnits() {
  $.getJSON("/api/units", {
    semester_id: currentSemesterId || null,
    archived: false
  }, function (unitData) {

    units = {};
    unitNames = {};

    unitData.forEach(u => {
      const key = "unit_" + u.id;
      units[key] = [];
      unitNames[key] = u.name;
      unitCredits[key] = u.number_credits;
    });

    $.getJSON(`/api/scores/${currentSemesterId}`, function (assessments) {

      assessments.forEach(a => {
        const key = "unit_" + a.unit_id;
        if (units[key]) {
          units[key].push({
            id: a.id,
            name: a.name,
            score: a.score,
            weight: a.weight
          });
        }
      });

      render();
    }).fail(function () {
      render();
    });

  }).fail(function () {
    const container = document.getElementById("units-container");
    container.innerHTML = `
      <div class="col-span-full text-red-500 text-sm">
        Failed to load units.
      </div>
    `;
  });
}

function addAssessment(unitId) {
  const realUnitId = unitId.split("_")[1];

  $.ajax({
    url: "/api/scores",
    method: "POST",
    contentType: "application/json",
    dataType: "json",
    data: JSON.stringify({
      unit_id: Number(realUnitId),
      name: "",
      score: 0,
      weight: 0
    }),
    success: function (res) {
      units[unitId].push({
        id: res.id,
        name: res.name || "",
        score: res.score || 0,
        weight: res.weight || 0
      });

      render();
      saveToLocal();
    },
    error: function (xhr) {
      console.error(xhr.responseText);
      alert("Add assessment failed: " + (xhr.responseText || xhr.status));
    }
  });
}

function deleteAssessment(unitId, id) {
  $.ajax({
    url: `/api/scores/${id}`,
    method: "DELETE",
    success: function () {
      units[unitId] = units[unitId].filter(a => a.id !== id);
      render();
      saveToLocal();
    },
    error: function (xhr) {
      console.error(xhr.responseText);
      alert("Delete assessment failed: " + (xhr.responseText || xhr.status));
    }
  });
}

function updateValue(unitId, id, field, value) {
  const item = units[unitId].find(a => a.id === id);
  if (!item) return;

  if (field === "name") {
    item.name = value;
    $.ajax({
      url: `/api/scores/${id}`,
      method: "PUT",
      contentType: "application/json",
      data: JSON.stringify({
      name: item.name,
      score: item.score,
      weight: item.weight
    })
  });

  saveToLocal();
  return;
}

  let val = Number(value);
  if (isNaN(val)) {
    showError(unitId,"Please enter a valid number for score and weight.");
    return;
  }
  if (val < 0 || val > 100) {
    showError(unitId,"Value must be between 0 and 100.");
    return;
  } 
  if (field === "weight") {
    let total = 0;

    units[unitId].forEach(a => {
      if (a.id === id) total += Number(val || 0);
      else total += Number(a.weight || 0);
    });

    const warn = document.getElementById(`${unitId}-warning`);

    if (total > 100) {
      warn.classList.remove("hidden");
      return;
    } else {
      warn.classList.add("hidden");
    }
  }

  clearError(unitId);

  item[field] = val;
  
  $.ajax({
    url: `/api/scores/${id}`,
    method: "PUT",
    contentType: "application/json",
    data: JSON.stringify({
      name: item.name,
      score: item.score,
      weight: item.weight
    })
  });

  updateTotal(unitId);
  saveToLocal();
}

function showError(unitId, message) {
  const container = document.getElementById(`${unitId}-warning`);

  container.classList.remove("hidden");
  container.innerText = message;
}

function clearError(unitId) {
  const container = document.getElementById(`${unitId}-warning`);
  container.classList.add("hidden");
}

function updateTotal(unitId) {
  let total = 0;

  units[unitId].forEach(a => {
    total += (Number(a.score || 0) * Number(a.weight || 0)) / 100;
  });

  document.getElementById(`${unitId}-total`).innerText = total.toFixed(2);

  updateOverallWAM();
}

function updateOverallWAM() {
  let sum = 0;
  let count = 0;

  Object.keys(units).forEach(unitId => {
    let total = 0;
    let credit = unitCredits[unitId];

    units[unitId].forEach(a => {
      total += (Number(a.score || 0) * Number(a.weight || 0)) / 100;
    });

    if (units[unitId].length > 0) {
      sum += total * credit;
      count += credit;
    }
  });

  document.getElementById("overall-wam").innerText =
    count ? (sum / count).toFixed(2) : "0";

    $.ajax({
      url: `/api/semesters/${currentSemesterId}`,
      method: "PUT",
      contentType: "application/json",
      data: JSON.stringify({
        wam: count ? (sum / count) : null
      })
    });
}

function render() {
  const container = document.getElementById("units-container");
  container.innerHTML = "";

  Object.keys(units).forEach(unitId => {

    container.innerHTML += `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">

        <div class="flex justify-between items-center">
          <h4 class="text-lg montserrat-bold text-gray-800">
            ${unitNames[unitId]}
          </h4>

          <button onclick="addAssessment('${unitId}')"
            class="px-3 py-1 montserrat-regular text-sm rounded-lg bg-indigo-50 text-primary_purp hover:bg-indigo-100 transition">
            + Add Assessment
          </button>
        </div>

        <p class="text-xs roboto-regular text-gray-500">
          ${unitCredits[unitId] ? unitCredits[unitId] + ' credits' : ''}
        </p>

        <div id="${unitId}-list" class="space-y-3"></div>

        <div class="text-sm roboto-regular text-gray-600">
          Total:
          <span id="${unitId}-total" class="roboto-medium text-gray-800">0</span>
        </div>

        <p id="${unitId}-warning"
          class="text-red-500 roboto-regular text-xs hidden">
          Total weight cannot exceed 100%
        </p>

      </div>
    `;
  });

  Object.keys(units).forEach(unitId => {
    const list = document.getElementById(`${unitId}-list`);

    units[unitId].forEach(a => {
      list.innerHTML += `
        <div class="bg-gray-50 rounded-xl border border-gray-100 p-4 flex items-center gap-3">

          <input type="text"
            placeholder="Assessment Name"
            value="${a.name || ''}"
            class="flex-1 px-3 py-2 rounded-lg  roboto-regular border border-gray-200 text-sm focus:ring-1 focus:ring-primary_purp"
            oninput="updateValue('${unitId}', ${a.id}, 'name', this.value)">

          <input type="number"
            placeholder="Score"
            min = "0"
            max = "100"
            value="${a.score || ''}"
            class="w-20 px-3 py-2 text-center rounded-lg border border-gray-200 text-sm roboto-regular"
            oninput="updateValue('${unitId}', ${a.id}, 'score', this.value)">

          <input type="number"
            min = "0"
            max = "100"
            placeholder="%"
            value="${a.weight || ''}"
            class="w-20 px-3 py-2 text-center rounded-lg border border-gray-200 text-sm roboto-regular"
            oninput="updateValue('${unitId}', ${a.id}, 'weight', this.value)">

          <button onclick="deleteAssessment('${unitId}', ${a.id})"
            class="text-gray-300 hover:text-red-500 text-lg roboto-regular transition">
            ✕
          </button>

        </div>
      `;
    });

    updateTotal(unitId);
  });
}

$(function () {
  loadSemesters();
});

function saveToLocal() {
  localStorage.setItem("scoresData", JSON.stringify(units));
}