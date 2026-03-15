const STORAGE_KEY = 'discipline_os_v2';

// Theme config
const THEMES = {
  physique: { color: 'var(--accent1)', icon: '🏃‍♂️' },
  mental:   { color: 'var(--accent2)', icon: '🧠' },
  skill:    { color: 'var(--accent3)', icon: '🛠' },
  personal: { color: 'var(--accent4)', icon: '☕' }
};

const PILLARS = ['physique', 'mental', 'skill', 'personal'];

let state = {
  tasks: {
    physique: ["Morning workout 30min", "Walk 5000 steps", "Track nutrition"],
    mental:   ["10min meditation", "Journaling", "Gratitude practice"],
    skill:    ["Study 1 hour", "Build/code 30min", "Read chapter"],
    personal: ["Hobby time", "Connect with someone", "Digital detox 1hr"]
  },
  log: {}
};

let activeTab = 'tab-today';
let chartsInstance = {}; // hold chart instances

// Modal state
let editTarget = { pillar: null, index: null };

// ================================
// INIT & STORAGE
// ================================

function init() {
  // Try local first for instant paint
  loadStateFromLocal();
  initTodayLog();
  
  setupListeners();
  updateHeader();
  renderAllPillars();
  updateStats();
  
  // Theme check
  if (localStorage.getItem('discipline_theme') === 'light') {
    document.body.classList.add('light-mode');
  }
  
  // Init SW if supported
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.error("SW registration failed", err));
  }
}

// Global function called by index.html when Auth confirms user
window.syncCloudData = async function() {
  if (!window.firebaseUser || !window.firebaseDb) return;
  
  const uid = window.firebaseUser.uid;
  const { doc, getDoc } = window.firebaseStore;
  
  try {
    const docRef = doc(window.firebaseDb, "users", uid);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      state = docSnap.data();
      saveStateToLocal(); // keep local copy hot
      initTodayLog();
      renderAllPillars();
      updateStats();
      if(activeTab === 'tab-charts') renderCharts();
      if(activeTab === 'tab-heatmap') buildHeatmap();
      showToast("Cloud state synced");
    }
  } catch (error) {
    console.error("Error reading cloud state", error);
    showToast("Error syncing to cloud");
  }
};

function loadStateFromLocal() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    try {
      state = JSON.parse(data);
    } catch (e) {
      console.error("Failed to parse local state", e);
    }
  }
}

function saveState() {
  saveStateToLocal();
  syncStateToCloud();
}

function saveStateToLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function syncStateToCloud() {
  if (!window.firebaseUser || !window.firebaseDb) return;
  
  const uid = window.firebaseUser.uid;
  const { doc, setDoc } = window.firebaseStore;
  
  try {
    const docRef = doc(window.firebaseDb, "users", uid);
    await setDoc(docRef, state);
  } catch (err) {
    console.error("Failed cloud save", err);
  }
}

async function handleLogout() {
  if(window.firebaseSignOut && window.firebaseAuth) {
    await window.firebaseSignOut(window.firebaseAuth);
    // index.html observer will handle the redirect
  } else {
    window.location.href = './login.html'; // Fallback
  }
}

function getTodayString() {
  return new Date().toISOString().slice(0,10);
}

function initTodayLog() {
  const today = getTodayString();
  if (!state.log[today]) {
    state.log[today] = {};
    PILLARS.forEach(p => {
      // Create empty array mapping dynamically to lengths of tasks
      state.log[today][p] = new Array(state.tasks[p].length).fill(false);
    });
    saveState();
  } else {
    // Array lengths sync safeguard
    PILLARS.forEach(p => {
      if (!state.log[today][p]) state.log[today][p] = [];
      while(state.log[today][p].length < state.tasks[p].length) state.log[today][p].push(false);
      // If task was removed on another device/tab, slice it
      if (state.log[today][p].length > state.tasks[p].length) {
         state.log[today][p].length = state.tasks[p].length;
      }
    });
    saveState();
  }
}

// ================================
// HELPERS
// ================================

function escHtml(str) {
  const div = document.createElement('div');
  div.innerText = str;
  return div.innerHTML;
}

function showToast(msg) {
  const cont = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerText = msg;
  cont.appendChild(t);
  
  setTimeout(() => {
    t.classList.add('hide');
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

function getCssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function setupListeners() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => switchTab(btn.dataset.target, btn));
  });

  // Modal
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-modal') closeModal();
  });
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('btn-delete').addEventListener('click', deleteTask);
  document.getElementById('btn-save').addEventListener('click', saveTask);
  document.getElementById('edit-task-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveTask();
  });

  // Theme
  document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('discipline_theme', isLight ? 'light' : 'dark');
    if (activeTab === 'tab-charts') renderCharts(); // re-render charts for colors
  });
}

// ================================
// RENDERING UI
// ================================

function updateHeader() {
  const d = new Date();
  const days = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  
  document.getElementById('day-name').innerText = days[d.getDay()];
  
  const dateStr = `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
  document.getElementById('full-date').innerText = dateStr;

  // Year Progress
  const start = new Date(d.getFullYear(), 0, 1);
  const end = new Date(d.getFullYear(), 11, 31);
  const diffTime = Math.abs(d - start);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  const totalDays = (end - start) / (1000 * 60 * 60 * 24) + 1;
  const pct = (diffDays / totalDays) * 100;

  document.getElementById('day-of-year').innerText = `DAY ${diffDays} / ${totalDays}`;
  // small timeout to allow animation from 0 width
  setTimeout(() => {
    document.getElementById('year-bar').style.width = pct + '%';
  }, 100);
}

function renderAllPillars() {
  PILLARS.forEach(p => renderPillar(p));
}

function renderPillar(pillar) {
  const card = document.getElementById(`card-${pillar}`);
  const tasks = state.tasks[pillar];
  const today = getTodayString();
  const logs = state.log[today][pillar]; // shouldn't be null after init
  
  const streak = calcStreak(pillar);

  let html = `
    <div class="pillar-header">
      <div class="pillar-name">${THEMES[pillar].icon} ${pillar.toUpperCase()}</div>
      <div class="pillar-streak">🔥 ${streak}d</div>
    </div>
    <div class="task-list">
  `;

  tasks.forEach((t, i) => {
    const isDone = logs[i];
    const doneClass = isDone ? 'done' : '';
    const colorStyle = isDone ? `background-color: ${THEMES[pillar].color}; border-color: ${THEMES[pillar].color};` : '';
    const bgStyle = isDone ? `background-color: color-mix(in srgb, ${THEMES[pillar].color} 10%, transparent);` : '';

    html += `
      <div class="task-item ${doneClass}" style="${bgStyle}" onclick="toggleTask('${pillar}', ${i})">
        <div class="checkbox" style="${colorStyle}"></div>
        <div class="task-text">${escHtml(t)}</div>
        <button class="task-edit-btn" onclick="openEdit('${pillar}', ${i}, event)">✎</button>
      </div>
    `;
  });

  html += `
    </div>
    <div class="add-task-row">
      <input type="text" id="add-input-${pillar}" class="add-input" placeholder="New ${pillar} task..." onkeypress="handleAddKey(event, '${pillar}')">
      <button class="add-btn" onclick="addTask('${pillar}')">+</button>
    </div>
    <div class="pillar-footer">
      <div class="pillar-progress-track">
        <div id="prog-fill-${pillar}" class="pillar-progress-fill" style="background-color: ${THEMES[pillar].color}"></div>
      </div>
      <div id="prog-frac-${pillar}" class="pillar-fraction">0/0</div>
    </div>
  `;

  card.innerHTML = html;
  updatePillarProgress(pillar);
}

function updatePillarProgress(pillar) {
  const today = getTodayString();
  const logs = state.log[today][pillar];
  const taskCount = state.tasks[pillar].length;
  const doneCount = logs.filter(Boolean).length;
  
  const pct = taskCount === 0 ? 0 : (doneCount / taskCount) * 100;
  
  const fill = document.getElementById(`prog-fill-${pillar}`);
  const frac = document.getElementById(`prog-frac-${pillar}`);
  if(fill) fill.style.width = `${pct}%`;
  if(frac) frac.innerText = `${doneCount}/${taskCount}`;
}

// ================================
// ACTIONS
// ================================

function toggleTask(pillar, index) {
  const today = getTodayString();
  const curStats = state.log[today][pillar][index];
  state.log[today][pillar][index] = !curStats;
  
  saveState();
  renderPillar(pillar); // re-renders single pillar to update streak and colors
  updateStats();
  
  if(!curStats) showToast("Task completed!");
}

function handleAddKey(e, pillar) {
  if (e.key === 'Enter') addTask(pillar);
}

function addTask(pillar) {
  const input = document.getElementById(`add-input-${pillar}`);
  const val = input.value.trim();
  if(!val) return;

  state.tasks[pillar].push(val);
  
  // Sync all logs
  for (let date in state.log) {
    if(!state.log[date][pillar]) state.log[date][pillar] = [];
    state.log[date][pillar].push(false);
  }

  saveState();
  renderPillar(pillar);
  updateStats();
  showToast("Task added");
}

function openEdit(pillar, index, event) {
  event.stopPropagation(); // prevent toggle
  editTarget = { pillar, index };
  const val = state.tasks[pillar][index];
  
  const modal = document.getElementById('edit-modal');
  const input = document.getElementById('edit-task-input');
  
  input.value = val;
  modal.classList.add('show');
  input.focus();
}

function closeModal() {
  document.getElementById('edit-modal').classList.remove('show');
}

function saveTask() {
  const val = document.getElementById('edit-task-input').value.trim();
  if(!val) return;
  
  const { pillar, index } = editTarget;
  state.tasks[pillar][index] = val;
  
  saveState();
  renderPillar(pillar);
  closeModal();
  showToast("Task updated");
}

function deleteTask() {
  const { pillar, index } = editTarget;
  
  state.tasks[pillar].splice(index, 1);
  
  // Splice from all logs
  for (let date in state.log) {
    if(state.log[date][pillar]) {
      state.log[date][pillar].splice(index, 1);
    }
  }

  saveState();
  renderPillar(pillar);
  updateStats();
  closeModal();
  showToast("Task deleted");
}

function switchTab(targetId, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  btn.classList.add('active');
  document.getElementById(targetId).classList.add('active');
  
  activeTab = targetId;

  if (targetId === 'tab-charts') renderCharts();
  if (targetId === 'tab-heatmap') buildHeatmap();
}

// ================================
// CALCULATIONS & STATS
// ================================

function calcStreak(pillar) {
  // streak ignores today if it's not complete, but keeps looking backwards
  let count = 0;
  
  // sort dates descending
  const dates = Object.keys(state.log).sort().reverse();
  const today = getTodayString();
  
  for (let date of dates) {
    const logs = state.log[date][pillar] || [];
    const isAllDone = logs.length > 0 && logs.every(Boolean);
    
    if (date === today && !isAllDone) continue; // Skip incomplete today
    if (!isAllDone) {
      // If we see a day that's not all done, and it's NOT today, streak breaks
      if (date !== today) break;
    } else {
      count++;
    }
  }
  return count;
}

function dayTotalPct(dateKey) {
  const dLog = state.log[dateKey];
  if(!dLog) return null;
  
  let totalTasks = 0;
  let doneTasks = 0;
  
  PILLARS.forEach(p => {
    if(dLog[p]) {
      totalTasks += dLog[p].length;
      doneTasks += dLog[p].filter(Boolean).length;
    }
  });
  
  return totalTasks === 0 ? 0 : (doneTasks/totalTasks)*100;
}

function pillarDailyPct(pillar, dateKey) {
  const logs = state.log[dateKey]?.[pillar] || [];
  if (logs.length === 0) return null;
  return (logs.filter(Boolean).length / logs.length) * 100;
}

function updateStats() {
  const today = getTodayString();
  const dates = Object.keys(state.log).sort().reverse();
  
  // Best streak overall
  let best = 0;
  PILLARS.forEach(p => {
    const s = calcStreak(p);
    if(s > best) best = s;
  });
  document.getElementById('stat-streak').innerText = best;

  // Today
  const todPct = dayTotalPct(today);
  document.getElementById('stat-today').innerText = Math.round(todPct || 0) + '%';

  // 7 Day
  let sum7 = 0;
  let count7 = 0;
  for(let i=0; i<Math.min(7, dates.length); i++) {
    const p = dayTotalPct(dates[i]);
    if(p !== null) { sum7 += p; count7++; }
  }
  document.getElementById('stat-7day').innerText = count7 ? Math.round(sum7/count7) + '%' : '0%';

  // All time
  let sumAll = 0;
  let countAll = 0;
  dates.forEach(d => {
    const p = dayTotalPct(d);
    if(p !== null) { sumAll += p; countAll++; }
  });
  document.getElementById('stat-alltime').innerText = countAll ? Math.round(sumAll/countAll) + '%' : '0%';
}

// ================================
// CHARTS (Chart.js via CDN)
// ================================

function clearChart(id) {
  if (chartsInstance[id]) {
    chartsInstance[id].destroy();
  }
}

function renderCharts() {
  if (typeof Chart === 'undefined') return; // wait for CDN

  Chart.defaults.font.family = "'JetBrains Mono', monospace";
  Chart.defaults.color = getCssVar('--muted');
  
  renderLineChart();
  renderBarChart();
  renderDonutChart();
}

function renderLineChart() {
  clearChart('lineChart');
  const ctx = document.getElementById('lineChart').getContext('2d');
  
  // Last 30 days
  const d = new Date();
  const dates = [];
  const labels = [];
  
  for(let i=29; i>=0; i--) {
    const tmp = new Date(d);
    tmp.setDate(tmp.getDate() - i);
    dates.push(tmp.toISOString().slice(0,10));
    labels.push(`${tmp.getMonth()+1}/${tmp.getDate()}`);
  }

  const datasets = PILLARS.map(p => {
    return {
      label: p.toUpperCase(),
      data: dates.map(dt => pillarDailyPct(p, dt)), // leaves null for skipping
      borderColor: getCssVar(THEMES[p].color),
      tension: 0.4,
      fill: false,
      pointRadius: 3,
      spanGaps: true
    };
  });

  chartsInstance['lineChart'] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { 
          min: 0, max: 100,
          grid: { color: getCssVar('--border') }
        },
        x: {
          grid: { color: getCssVar('--border') },
          ticks: { maxRotation: 45, minRotation: 45 }
        }
      },
      plugins: {
        legend: { labels: { usePointStyle: true, boxWidth: 6 } }
      }
    }
  });
}

function renderBarChart() {
  clearChart('barChart');
  const ctx = document.getElementById('barChart').getContext('2d');
  
  const dates = Object.keys(state.log);
  
  const data = PILLARS.map(p => {
    let sum = 0; let count = 0;
    dates.forEach(d => {
      const pct = pillarDailyPct(p, d);
      if(pct !== null) { sum += pct; count++; }
    });
    return count === 0 ? 0 : sum/count;
  });

  const colors = PILLARS.map(p => {
    return getCssVar(THEMES[p].color).replace(')', ', 0.8)').replace('rgb', 'rgba'); 
    // basic alpha approximation if it's hex, might fail if hex, let's use JS color mix or just pure color
  });
  
  // Safe hex to rgba trick or just passing raw hex
  const hexColors = PILLARS.map(p => getCssVar(THEMES[p].color));

  chartsInstance['barChart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: PILLARS.map(p=>p.toUpperCase()),
      datasets: [{
        label: 'Overall %',
        data: data,
        backgroundColor: hexColors,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 100, grid: { color: getCssVar('--border') } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderDonutChart() {
  clearChart('donutChart');
  const ctx = document.getElementById('donutChart').getContext('2d');
  
  const today = getTodayString();
  const data = PILLARS.map(p => {
    const logs = state.log[today]?.[p] || [];
    return logs.filter(Boolean).length;
  });
  
  const total = data.reduce((a,b)=>a+b, 0);
  
  if (total === 0) {
    // Empty state
    chartsInstance['donutChart'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['No tasks done'],
        datasets: [{ data: [1], backgroundColor: [getCssVar('--border')] }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%' }
    });
    return;
  }

  chartsInstance['donutChart'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: PILLARS.map(p=>p.toUpperCase()),
      datasets: [{
        data: data,
        backgroundColor: PILLARS.map(p => getCssVar(THEMES[p].color)),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 6 } }
      }
    }
  });
}

// ================================
// HEATMAP
// ================================

function buildHeatmap() {
  const container = document.getElementById('heatmap-grid');
  container.innerHTML = '';
  
  // Calculate total possible tasks daily
  const totalTasksCount = PILLARS.reduce((acc, p) => acc + state.tasks[p].length, 0);
  
  const year = new Date().getFullYear();
  const start = new Date(year, 0, 1);
  const offset = start.getDay(); // 0 is Sunday
  
  // Add empty blocks for offset
  for(let i=0; i<offset; i++) {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.style.visibility = 'hidden';
    container.appendChild(cell);
  }

  // Days in year
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInYear = isLeap ? 366 : 365;

  const todayStr = getTodayString();
  
  for(let i=0; i<daysInYear; i++) {
    const d = new Date(year, 0, i+1);
    const dateStr = d.toISOString().slice(0,10);
    
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    
    // logic
    let score = 0;
    let titleMsg = `${dateStr} — No data`;

    if (state.log[dateStr]) {
      let done = 0;
      let total = 0;
      PILLARS.forEach(p => {
        if(state.log[dateStr][p]) {
          total += state.log[dateStr][p].length;
          done += state.log[dateStr][p].filter(Boolean).length;
        }
      });
      
      const pct = total === 0 ? 0 : done/total;
      score = pct === 0 ? (done > 0 ? 1 : 0) : Math.ceil(pct * 4);
      titleMsg = `${dateStr} — ${Math.round(pct*100)}% done`;
    }

    if (dateStr > todayStr) {
      cell.style.opacity = '0.3';
      titleMsg = `${dateStr} — Future`;
    }

    cell.dataset.level = score;
    cell.title = titleMsg;
    
    container.appendChild(cell);
  }
}

// Start app
document.addEventListener("DOMContentLoaded", init);
