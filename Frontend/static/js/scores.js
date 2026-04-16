let units = {
  unit1: [],
  unit2: [],
  unit3: [],
  unit4: []
};

let unitNames = {
  unit1: "",
  unit2: "",
  unit3: "",
  unit4: ""
};

function updateUnitName(unitId, value) {
  unitNames[unitId] = value;
}

function addAssessment(unitID) {
  const id = Date.now();
  units[unitID].push({
    id: id,
    name: "",
    score: 0,
    weight: 0
  });
  render();
}

function deleteAssessment(unitId, assessmentId) {
  units[unitId] = units[unitId].filter(a => a.id !== assessmentId);
  render();           
  updateTotal(unitId); 
}

function updateValue(unitId, assessmentId, field, value) {
  const unit = units[unitId];
  const item = unit.find(a => a.id === assessmentId);
  if (field === "name") {
    item.name = value;
    return;
  }
  let newValue = Number(value);
  if (newValue < 0) {
    newValue = 0;
  }
  if (field === "weight") {
    let totalWeight = 0;
    unit.forEach(a => {
      if (a.id === assessmentId) {
        totalWeight += newValue;
      } else {
        totalWeight += a.weight;
      }
    });
    const warning = document.getElementById(`${unitId}-warning`);
    if (totalWeight > 100) {
      warning.classList.remove("hidden");
      return;
    } else {
      warning.classList.add("hidden");
    }
  }
  item[field] = newValue;
  updateTotal(unitId);
}


function calculateTotal() {
  let total = 0;
  assessments.forEach(a => {
    total += (a.score * a.weight) / 100;
  });
  document.getElementById("total").innerText = total.toFixed(2);
}

function updateOverallWAM() {
  let sum = 0;
  let count = 0;
  Object.keys(units).forEach(unitId => {
    let total = 0;
    units[unitId].forEach(a => {
      total += (a.score * a.weight) / 100;
    });
    if (units[unitId].length > 0) {
      sum += total;
      count++;
    }
  });
  let overall = count > 0 ? sum / count : 0;
  document.getElementById("overall-wam").innerText = overall.toFixed(2);
}

function updateTotal(unitId) {
  let total = 0;
  units[unitId].forEach(a => {
    total += (a.score * a.weight) / 100;
  });
  document.getElementById(`${unitId}-total`).innerText = total.toFixed(2);
  updateOverallWAM();
}

function render() {
  Object.keys(units).forEach(unitId => {
    const container = document.getElementById(unitId);

    let html = `
      <div class="bg-white p-6 rounded-xl shadow">

        <input 
          type="text"
          placeholder="Unit name"
          value="${unitNames[unitId] || ''}"
          class="w-full mb-2 px-3 py-2 border rounded"
          oninput="updateUnitName('${unitId}', this.value)"
        >

        <div id="${unitId}-list"></div>

        <button 
          onclick="addAssessment('${unitId}')"
          class="mt-3 w-full bg-indigo-600 text-white py-2 rounded"
        >
          Add Assessment
        </button>

        <div class="mt-4 font-semibold">
          Total: <span id="${unitId}-total">0</span>
        </div>

        <p id="${unitId}-warning" class="text-red-500 text-sm mt-2 hidden">
          Total weight cannot exceed 100%
        </p>

      </div>
    `;

    container.innerHTML = html;

    const list = document.getElementById(`${unitId}-list`);

    units[unitId].forEach(a => {
      list.innerHTML += `
        <div class="mb-2">

          <div class="flex items-center gap-2 mb-1">
            <input 
              type="text"
              placeholder="Assessment name"
              value="${a.name || ''}"
              class="w-full px-2 py-1 border rounded"
              oninput="updateValue('${unitId}', ${a.id}, 'name', this.value)"
            >

            <button 
              onclick="deleteAssessment('${unitId}', ${a.id})"
              class="text-red-500 font-bold"
            >
              ×
            </button>
          </div>

          <div class="flex gap-2">
            <input 
              type="number"
              min="0"
              value="${a.score || ''}"
              placeholder="Score"
              class="w-1/2 px-2 py-1 border rounded"
              oninput="updateValue('${unitId}', ${a.id}, 'score', this.value)"
            >

            <input 
              type="number"
              min="0"
              value="${a.weight || ''}"
              placeholder="Weight"
              class="w-1/2 px-2 py-1 border rounded"
              oninput="updateValue('${unitId}', ${a.id}, 'weight', this.value)"
            >
          </div>

        </div>
      `;
    });

    updateTotal(unitId);
  });
}

render();