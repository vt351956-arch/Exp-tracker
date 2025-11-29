/***************
 * Firebase config (your provided config embedded)
 ***************/
const firebaseConfig = {
  apiKey: "AIzaSyDzmZsnFsmLKxFJkjLgD5RRnMWZw0Y5gME",
  authDomain: "expence-tracker-8cd72.firebaseapp.com",
  projectId: "expence-tracker-8cd72",
  storageBucket: "expence-tracker-8cd72.firebasestorage.app",
  messagingSenderId: "791668375844",
  appId: "1:791668375844:web:0223fd5fc74f22009a33b1",
  measurementId: "G-PC58EDC4M5"
};

// Initialize firebase (compat)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/***************
 * App state
 ***************/
let expenses = [];      // will hold local copy of expenses
let editingId = null;   // id if editing
let chart = null;       // Chart.js instance

/***************
 * DOM refs
 ***************/
const addBtn = document.getElementById("addBtn");
const titleInput = document.getElementById("title");
const amountInput = document.getElementById("amount");
const dateInput = document.getElementById("date");
const categorySelect = document.getElementById("category");

const expenseList = document.getElementById("expense-list");
const totalAmountEl = document.getElementById("total-amount");
const monthAmountEl = document.getElementById("month-amount");
const totalItemsEl = document.getElementById("total-items");

const searchInput = document.getElementById("search");
const filterCategory = document.getElementById("filter-category");
const filterMonth = document.getElementById("filter-month");

/***************
 * Helpers
 ***************/
function isCurrentMonth(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function escapeHtml(text) {
  if (!text && text !== 0) return "";
  return String(text).replace(/[&<>"'`=\/]/g, function (s) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    })[s];
  });
}

/***************
 * Load months dropdown
 ***************/
(function loadMonths() {
  const sel = filterMonth;
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  months.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = m;
    sel.appendChild(opt);
  });
})();

/***************
 * Firestore: load all expenses (initial)
 ***************/
async function loadExpenses() {
  try {
    const snapshot = await db.collection("expenses").orderBy("date", "desc").get();
    expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    render(); // render UI using local array
  } catch (err) {
    console.error("Error loading expenses:", err);
    alert("Failed to load expenses from Firebase. Check console.");
  }
}

/***************
 * Add / Update expense (no overwrite)
 ***************/
async function saveExpense() {
  const title = titleInput.value.trim();
  const amount = Number(amountInput.value);
  const date = dateInput.value;
  const category = categorySelect.value;

  if (!title || !amount || !date || !category) {
    alert("Please fill all fields!");
    return;
  }

  const data = { title, amount, date, category };

  try {
    if (editingId) {
      // Update existing doc in firestore
      await db.collection("expenses").doc(editingId).update(data);

      // Update local copy
      const idx = expenses.findIndex(e => e.id === editingId);
      if (idx !== -1) expenses[idx] = { id: editingId, ...data };

      editingId = null;
      document.getElementById("form-title").innerText = "Add New Expense";
    } else {
      // Add new doc to firestore
      const docRef = await db.collection("expenses").add(data);
      // push to local array (preserve older entries)
      expenses.unshift({ id: docRef.id, ...data }); // add to top for recency
    }

    clearForm();
    render();
  } catch (err) {
    console.error("Save failed:", err);
    alert("Failed to save expense. See console.");
  }
}

/***************
 * Delete expense
 ***************/
async function deleteExpense(id) {
  if (!confirm("Delete this expense?")) return;
  try {
    await db.collection("expenses").doc(id).delete();
    expenses = expenses.filter(e => e.id !== id);
    render();
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Failed to delete. See console.");
  }
}

/***************
 * Edit helper (exposed)
 ***************/
window.editExpense = function(id) {
  const e = expenses.find(x => x.id === id);
  if (!e) return;
  titleInput.value = e.title;
  amountInput.value = e.amount;
  dateInput.value = e.date;
  categorySelect.value = e.category;
  editingId = id;
  document.getElementById("form-title").innerText = "Edit Expense";
};

/***************
 * Render UI (list + summary + chart)
 ***************/
function applyFilters(data) {
  const term = (searchInput?.value || "").toLowerCase();
  const cat = filterCategory?.value || "";
  const month = filterMonth?.value || "";

  return data.filter(exp => {
    return (
      (exp.title || "").toLowerCase().includes(term) &&
      (cat === "" || exp.category === cat) &&
      (month === "" || new Date(exp.date).getMonth() == month)
    );
  });
}

function render() {
  const list = expenseList;
  list.innerHTML = "";

  const filtered = applyFilters(expenses);

  let total = 0;
  let monthTotal = 0;

  filtered.forEach(exp => {
    total += Number(exp.amount) || 0;
    if (isCurrentMonth(exp.date)) monthTotal += Number(exp.amount) || 0;

    const li = document.createElement("li");
    li.className = "expense-item";
    li.innerHTML = `
      <div>
        <strong>${escapeHtml(exp.title)}</strong> (₹${Number(exp.amount).toFixed(2)})<br>
        ${escapeHtml(exp.category)} — ${escapeHtml(exp.date)}
      </div>
      <div>
        <button class="edit-btn" onclick="editExpense('${exp.id}')">Edit</button>
        <button class="delete-btn" onclick="deleteExpense('${exp.id}')">X</button>
      </div>
    `;
    list.appendChild(li);
  });

  totalAmountEl.innerText = total.toFixed(2);
  monthAmountEl.innerText = monthTotal.toFixed(2);
  totalItemsEl.innerText = filtered.length;

  updateChart(filtered);
}

/***************
 * Chart.js pie chart
 ***************/
function updateChart(data) {
  const ctx = document.getElementById("expenseChart");
  if (!ctx) return;

  const totals = {};
  data.forEach(exp => {
    totals[exp.category] = (totals[exp.category] || 0) + Number(exp.amount || 0);
  });

  const labels = Object.keys(totals);
  const values = Object.values(totals);

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ["#3498db","#e74c3c","#2ecc71","#9b59b6","#f1c40f"]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

/***************
 * Utility: clear form
 ***************/
function clearForm() {
  titleInput.value = "";
  amountInput.value = "";
  dateInput.value = "";
  categorySelect.value = "";
  editingId = null;
  document.getElementById("form-title").innerText = "Add New Expense";
}

/***************
 * Event listeners
 ***************/
addBtn.addEventListener("click", saveExpense);
searchInput && searchInput.addEventListener("input", render);
filterCategory && filterCategory.addEventListener("change", render);
filterMonth && filterMonth.addEventListener("change", render);

/***************
 * Initial load
 ***************/
loadExpenses();
