/* app.js — TRACS APPAREL Management Web App */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js';
import { getDatabase, ref, set, push, get, child } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

// ─── Firebase ─────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: 'AIzaSyCXDUrJtkuJZ4BvqsYOFg9SIjOysIgkqtk',
  authDomain: 'tracs-hr-mangment.firebaseapp.com',
  projectId: 'tracs-hr-mangment',
  storageBucket: 'tracs-hr-mangment.firebasestorage.app',
  messagingSenderId: '1094008024729',
  appId: '1:1094008024729:web:11f1afa99df6272cee9208',
  measurementId: 'G-6ZD2M74F0P',
};

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);
try { getAnalytics(firebaseApp); } catch (e) { console.warn('Analytics initialization failed:', e); }

// ─── Storage ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86400000;
const OT_RATE_FACTOR = 0.5 / 100;
const DATA_PATH = 'tracsApparelData/shared';
const STATIC_PASSWORD = 'tracsadmin';

let dataCache = defaultData();

function defaultData() {
  return {
    companyName:    'TRACS APPAREL',
    employees:      [],
    salaryRecords:  [],
    attendance:     {},
    timeRecords:    {},
    tiffinBillRate: 50,
  };
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeData(raw) {
  const base = defaultData();
  const safe = raw && typeof raw === 'object' ? raw : {};
  return {
    companyName:    (typeof safe.companyName === 'string' && safe.companyName.trim()) ? safe.companyName : base.companyName,
    employees:      Array.isArray(safe.employees) ? safe.employees : [],
    salaryRecords:  Array.isArray(safe.salaryRecords) ? safe.salaryRecords : [],
    attendance:     safe.attendance && typeof safe.attendance === 'object' ? safe.attendance : {},
    timeRecords:    safe.timeRecords && typeof safe.timeRecords === 'object' ? safe.timeRecords : {},
    tiffinBillRate: (typeof safe.tiffinBillRate === 'number' && safe.tiffinBillRate >= 0) ? safe.tiffinBillRate : base.tiffinBillRate,
  };
}

function getNextSalaryRecordId() {
  return push(ref(database, `${DATA_PATH}/salaryRecords`)).key || uid();
}

async function loadDataFromCloud() {
  const rootRef = ref(database);
  const snap = await get(child(rootRef, DATA_PATH));
  if (snap.exists()) {
    dataCache = normalizeData(snap.val());
    return;
  }
  dataCache = defaultData();
  await set(ref(database, DATA_PATH), dataCache);
}

function loadData() {
  return cloneData(dataCache);
}

async function saveData(data) {
  dataCache = normalizeData(data);
  try {
    await set(ref(database, DATA_PATH), dataCache);
    return true;
  } catch (e) {
    console.error('Failed to save data to Firebase Realtime Database:', e);
    showToast('Cloud save failed. Please try again.', 'error');
    return false;
  }
}

// ─── Salary Calculation ────────────────────────────────────────────────────────

function getDaysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function formatAsYYYYMMDD(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateStringToMidnight(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function daysBetweenInclusive(startDate, endDate) {
  const startUTC = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endUTC   = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.floor((endUTC - startUTC) / MS_PER_DAY) + 1;
}

function monthFromDate(dateStr) {
  return (dateStr || '').slice(0, 7);
}

function dayFromDate(dateStr) {
  const day = parseInt((dateStr || '').slice(8, 10), 10);
  return Number.isFinite(day) ? day : 0;
}

function getAttendanceStatus(data, empId, dateStr) {
  if (!empId || !dateStr) return 'P';
  const month = monthFromDate(dateStr);
  const day   = dayFromDate(dateStr);
  if (!month || !day) return 'P';
  const key = `${empId}|${month}`;
  return ((data.attendance || {})[key] || {})[day] || 'P';
}

function setAttendanceStatus(data, empId, dateStr, status) {
  if (!empId || !dateStr) return;
  const month = monthFromDate(dateStr);
  const day   = dayFromDate(dateStr);
  if (!month || !day) return;
  if (!data.attendance) data.attendance = {};
  const key = `${empId}|${month}`;
  if (!data.attendance[key]) data.attendance[key] = {};
  data.attendance[key][day] = status;
}

function calcSalary(basic, otHours, bonus, festivalBonus, absentDays, daysInMonth, deductions, advance, tiffinBills = 0) {
  const otAmount        = otHours * (basic * OT_RATE_FACTOR);
  const absentDeduction = daysInMonth > 0 ? (basic / daysInMonth) * absentDays : 0;
  const total           = Math.max(0, basic + otAmount + bonus + festivalBonus + tiffinBills - absentDeduction - deductions - advance);
  return { otAmount, absentDeduction, total };
}

// ─── Time & Shift Helpers ──────────────────────────────────────────────────────

const SHIFT_START_GRACE = '08:05'; // 8:00 AM + 5 min grace
const SHIFT_END         = '17:00'; // 5:00 PM
const TIFFIN_THRESHOLD  = '19:00'; // 7:00 PM

/** Parse "HH:MM" into minutes from midnight */
function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Is the given HH:MM time considered late? (> 08:05) */
function isLateArrival(inTime) {
  const mins = timeToMinutes(inTime);
  if (mins === null) return false;
  return mins > timeToMinutes(SHIFT_START_GRACE);
}

/** Return OT hours based on outTime and whether it is weekend duty. */
function calcOtHours(inTime, outTime, isWeekendDuty) {
  const outMins = timeToMinutes(outTime);
  if (outMins === null) return 0;
  if (isWeekendDuty) {
    const inMins  = timeToMinutes(inTime);
    const worked  = inMins !== null ? (outMins - inMins) : 0;
    return worked > 0 ? worked / 60 : 0;
  }
  const shiftEndMins = timeToMinutes(SHIFT_END);
  const overtime = outMins - shiftEndMins;
  return overtime > 0 ? overtime / 60 : 0;
}

/** Return tiffin bill amount if outTime > 19:00, else 0. */
function calcTiffinBill(outTime, rate) {
  const outMins = timeToMinutes(outTime);
  if (outMins === null) return 0;
  return outMins > timeToMinutes(TIFFIN_THRESHOLD) ? (rate || 0) : 0;
}

/**
 * Compute monthly stats from time records + attendance.
 * Returns { totalOtHours, totalTiffinBills, lateCount, penaltyAbsents, effectiveAbsentDays }
 * 'effectiveAbsentDays' = actual A days + penaltyAbsents (from Late)
 */
function getMonthTimeStats(data, empId, month) {
  if (!empId || !month) return { totalOtHours: 0, totalTiffinBills: 0, lateCount: 0, penaltyAbsents: 0, effectiveAbsentDays: 0 };
  const key       = `${empId}|${month}`;
  const att       = (data.attendance  || {})[key] || {};
  const times     = (data.timeRecords || {})[key] || {};
  const days      = getDaysInMonth(month);
  let   totalOt   = 0, totalTiffin = 0, lateCount = 0, absentCount = 0;

  for (let d = 1; d <= days; d++) {
    const status  = att[d] || 'P';
    const tr      = times[d] || {};
    if (status === 'A') absentCount++;
    if (status === 'L') lateCount++;
    totalOt     += tr.otHours    || 0;
    totalTiffin += tr.tiffinBill || 0;
  }

  const penaltyAbsents    = Math.floor(lateCount / 3);
  const effectiveAbsentDays = absentCount + penaltyAbsents;

  return { totalOtHours: totalOt, totalTiffinBills: totalTiffin, lateCount, penaltyAbsents, effectiveAbsentDays };
}

/** Get/set a time record for a single day. */
function getTimeRecord(data, empId, dateStr) {
  if (!empId || !dateStr) return {};
  const month = monthFromDate(dateStr);
  const day   = dayFromDate(dateStr);
  if (!month || !day) return {};
  const key = `${empId}|${month}`;
  return ((data.timeRecords || {})[key] || {})[day] || {};
}

function setTimeRecord(data, empId, dateStr, record) {
  if (!empId || !dateStr) return;
  const month = monthFromDate(dateStr);
  const day   = dayFromDate(dateStr);
  if (!month || !day) return;
  if (!data.timeRecords) data.timeRecords = {};
  const key = `${empId}|${month}`;
  if (!data.timeRecords[key]) data.timeRecords[key] = {};
  data.timeRecords[key][day] = { ...((data.timeRecords[key][day]) || {}), ...record };
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function fmt(amount) {
  const n = parseFloat(amount) || 0;
  return '\u09F3' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtPDF(amount) {
  const n = parseFloat(amount) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMonth(ms) {
  if (!ms) return '';
  const [y, m] = ms.split('-');
  const names = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
  return names[parseInt(m, 10) - 1] + ' ' + y;
}

function formatOtHours(hours) {
  return (parseFloat(hours) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function getLast6Months() {
  const months = [];
  const now    = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function initials(name) {
  return (name || '').split(' ').filter(n => n).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

const TOAST_ICONS = {
  success: 'fa-check-circle',
  error:   'fa-times-circle',
  warning: 'fa-exclamation-triangle',
  info:    'fa-info-circle',
};

function showToast(msg, type = 'success') {
  const t   = document.getElementById('toast');
  const tm  = document.getElementById('toastMessage');
  const ico = document.getElementById('toastIcon');
  tm.textContent = msg;
  ico.className  = `toast-icon fas ${TOAST_ICONS[type] || TOAST_ICONS.success}`;
  t.className    = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

// Compress & resize image to ≤200px for faster cloud sync
function compressImage(dataUrl, cb) {
  const img = new Image();
  img.onload = () => {
    const maxSize = 200;
    let w = img.width, h = img.height;
    if (w > h && w > maxSize) { h = (h * maxSize) / w; w = maxSize; }
    else if (h >= w && h > maxSize) { w = (w * maxSize) / h; h = maxSize; }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    cb(c.toDataURL('image/jpeg', 0.75));
  };
  img.src = dataUrl;
}

// ─── App Object ────────────────────────────────────────────────────────────────

const app = {
  _photo:           null,
  _editEmpId:       null,
  _chart:           null,
  _tempAttendance:  {},
  _attEmpId:        null,
  _attMonth:        null,
  _attMgmtDate:     null,

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  async init() {
    document.getElementById('currentDate').textContent =
      new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = formatAsYYYYMMDD(now);
    document.getElementById('se-month').value      = thisMonth;
    document.getElementById('summary-month').value = thisMonth;
    document.getElementById('att-man-month').value = thisMonth;
    document.getElementById('att-man-date').value  = today;
    this._attMgmtDate = today;

    document.getElementById('companyNameInput').addEventListener('change', async e => {
      const d = loadData();
      d.companyName = e.target.value.trim() || 'TRACS APPAREL';
      await saveData(d);
    });

    const tiffinRateInput = document.getElementById('tiffinRateInput');
    if (tiffinRateInput) {
      tiffinRateInput.addEventListener('change', async e => {
        const d = loadData();
        d.tiffinBillRate = Math.max(0, parseFloat(e.target.value) || 50);
        await saveData(d);
        showToast('Tiffin rate updated!', 'info');
      });
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', e => this.login(e));

    // Sidebar nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        this.navigateTo(item.dataset.view);
      });
    });

    // Mobile sidebar toggle
    document.getElementById('sidebarToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebarOverlay').classList.toggle('show');
    });
    document.getElementById('sidebarOverlay').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('show');
    });

    // Keyboard: close modals with Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.closeEmployeeModal();
        this.closeConfirmModal();
        this.closeAttendanceModal();
        this.closeEmpHistoryModal();
      }
    });

    this._setAppAccess(false);
    this._showLogin(true);

    // Restore session if previously logged in
    if (sessionStorage.getItem('tracsLoggedIn') === '1') {
      await this._bootstrapSession();
    }
  },

  async _bootstrapSession() {
    try {
      await loadDataFromCloud();
      this._syncCompanyNameInput();
      this._applyAuthHeader(true);
      this._showLogin(false);
      this._setAppAccess(true);
      this.navigateTo('dashboard');
    } catch (err) {
      console.error('Session bootstrap failed:', err);
      sessionStorage.removeItem('tracsLoggedIn');
      showToast('Failed to load data. Please sign in again.', 'error');
    }
  },

  _syncCompanyNameInput() {
    const data = loadData();
    const input = document.getElementById('companyNameInput');
    if (input) input.value = data.companyName || 'TRACS APPAREL';
    const tiffinEl = document.getElementById('tiffinRateInput');
    if (tiffinEl) tiffinEl.value = data.tiffinBillRate !== undefined ? data.tiffinBillRate : 50;
  },

  _showLogin(show) {
    const modal = document.getElementById('loginModal');
    if (!modal) return;
    modal.classList.toggle('show', !!show);
  },

  _setAppAccess(isAllowed) {
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('mainContent');
    const toggle = document.getElementById('sidebarToggle');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.style.display = isAllowed ? 'flex' : 'none';
    if (main) main.style.display = isAllowed ? 'flex' : 'none';
    if (toggle) toggle.style.display = isAllowed ? '' : 'none';
    if (overlay && !isAllowed) overlay.classList.remove('show');
  },

  _applyAuthHeader(isLoggedIn) {
    const badge = document.getElementById('authUserBadge');
    const logoutBtn = document.getElementById('logoutBtn');
    if (!badge || !logoutBtn) return;
    if (!isLoggedIn) {
      badge.style.display = 'none';
      logoutBtn.style.display = 'none';
      return;
    }
    badge.textContent = 'ADMIN';
    badge.style.display = 'inline-flex';
    logoutBtn.style.display = 'inline-flex';
  },

  toggleLoginPassword() {
    const input = document.getElementById('loginPassword');
    const icon  = document.getElementById('loginEyeIcon');
    if (!input || !icon) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    icon.className = isHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
  },

  async login(evt) {
    evt.preventDefault();
    const password = document.getElementById('loginPassword').value;
    const errorEl  = document.getElementById('loginError');
    if (password !== STATIC_PASSWORD) {
      if (errorEl) errorEl.style.display = 'flex';
      return;
    }
    if (errorEl) errorEl.style.display = 'none';
    sessionStorage.setItem('tracsLoggedIn', '1');
    try {
      await loadDataFromCloud();
      this._syncCompanyNameInput();
      this._applyAuthHeader(true);
      this._showLogin(false);
      this._setAppAccess(true);
      this.navigateTo('dashboard');
      showToast('Signed in successfully.');
    } catch (err) {
      console.error('Login bootstrap failed:', err);
      sessionStorage.removeItem('tracsLoggedIn');
      showToast('Failed to load data. Please try again.', 'error');
    }
  },

  logout() {
    sessionStorage.removeItem('tracsLoggedIn');
    dataCache = defaultData();
    this._applyAuthHeader(false);
    this._setAppAccess(false);
    this._showLogin(true);
    const pwInput = document.getElementById('loginPassword');
    if (pwInput) pwInput.value = '';
    showToast('Logged out.', 'info');
  },

  navigateTo(view) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`view-${view}`);
    if (el) el.classList.add('active');

    const titles = {
      dashboard:         'Dashboard',
      employees:         'Employees',
      'salary-entry':    'Salary Entry',
      attendance:        'Attendance',
      history:           'History',
      'monthly-summary': 'Monthly Summary',
      'payroll-reports': 'Payroll Reports',
    };
    document.getElementById('pageTitle').textContent = titles[view] || view;

    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');

    if (view === 'dashboard')       this.renderDashboard();
    if (view === 'employees')       this.renderEmployees();
    if (view === 'salary-entry')    this.loadSalaryEntrySelects();
    if (view === 'attendance')      this.renderAttendanceManagement();
    if (view === 'history')         this.renderHistory();
    if (view === 'monthly-summary') { /* user clicks Load */ }
    if (view === 'payroll-reports') this.renderPayrollReports();
  },

  // ── Dashboard ──────────────────────────────────────────────────────────────

  renderDashboard() {
    const data = loadData();
    const now  = new Date();
    const tm   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = formatAsYYYYMMDD(now);
    const recs = data.salaryRecords.filter(r => r.month === tm);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    let presentCount = 0;
    let absentCount = 0;
    data.employees.forEach(emp => {
      const st = getAttendanceStatus(data, emp.id, today);
      if (st === 'A') absentCount++;
      else presentCount++;
    });

    const weekOt = data.salaryRecords
      .filter(r => r.createdAt && r.createdAt >= weekStart.getTime() && r.createdAt <= weekEnd.getTime())
      .reduce((s, r) => s + (r.otHours || 0), 0);

    document.getElementById('stat-total-employees').textContent    = data.employees.length;
    document.getElementById('stat-this-month-payroll').textContent = fmt(recs.reduce((s, r) => s + r.totalSalary, 0));
    document.getElementById('stat-today-attendance').textContent   = `P: ${presentCount} | A: ${absentCount}`;
    document.getElementById('stat-week-ot').textContent            = `${formatOtHours(weekOt)} hours`;

    const recent = [...data.salaryRecords].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
    const tbody  = document.getElementById('recent-entries-tbody');
    if (!recent.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No records yet</td></tr>';
    } else {
      tbody.innerHTML = recent.map(r => {
        const emp = data.employees.find(e => e.id === r.employeeId);
        return `<tr>
          <td>${emp ? esc(emp.name) : 'Unknown'}</td>
          <td>${fmtMonth(r.month)}</td>
          <td>${fmt(r.basicSalary)}</td>
          <td class="amount-positive">${fmt(r.totalSalary)}</td>
        </tr>`;
      }).join('');
    }

    this._renderChart(data);
  },

  _renderChart(data) {
    const months = getLast6Months();
    const labels = months.map(m => {
      const [y, mo] = m.split('-');
      const names   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return names[parseInt(mo, 10) - 1] + " '" + y.slice(2);
    });

    const payrollData = months.map(m =>
      data.salaryRecords.filter(r => r.month === m).reduce((s, r) => s + r.totalSalary, 0)
    );

    const presentWorkersData = months.map(m =>
      [...new Set(data.salaryRecords.filter(r => r.month === m).map(r => r.employeeId))].length
    );

    const ctx = document.getElementById('dashboardChart');
    if (!ctx) return;

    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }

    this._chart = new Chart(ctx, {
      data: {
        labels,
        datasets: [
          {
            type:            'bar',
            label:           'Total Salary Payout (BDT)',
            data:            payrollData,
            backgroundColor: 'rgba(13,115,119,.65)',
            borderColor:     '#0d7377',
            borderWidth:     1,
            borderRadius:    4,
            yAxisID:         'y',
          },
          {
            type:            'line',
            label:           'Present Workers',
            data:            presentWorkersData,
            borderColor:     '#32e0c4',
            backgroundColor: 'rgba(50,224,196,.15)',
            borderWidth:     2.5,
            pointRadius:     5,
            pointBackgroundColor: '#32e0c4',
            tension:         0.35,
            fill:            true,
            yAxisID:         'y1',
          },
        ],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction:         { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 }, usePointStyle: true } },
          tooltip: {
            callbacks: {
              label(ctx) {
                if (ctx.datasetIndex === 0) return ` \u09F3${ctx.parsed.y.toLocaleString('en-US')}`;
                return ` ${ctx.parsed.y} worker${ctx.parsed.y !== 1 ? 's' : ''}`;
              },
            },
          },
        },
        scales: {
          y: {
            type:     'linear',
            position: 'left',
            title:    { display: true, text: 'Salary Payout (BDT)', color: '#64748b', font: { size: 11 } },
            grid:     { color: 'rgba(0,0,0,.05)' },
            ticks:    { color: '#64748b', font: { size: 11 } },
          },
          y1: {
            type:     'linear',
            position: 'right',
            title:    { display: true, text: 'Workers', color: '#64748b', font: { size: 11 } },
            grid:     { drawOnChartArea: false },
            ticks:    { color: '#64748b', font: { size: 11 }, stepSize: 1, precision: 0 },
            min:      0,
          },
          x: {
            grid:  { color: 'rgba(0,0,0,.04)' },
            ticks: { color: '#64748b', font: { size: 11 } },
          },
        },
      },
    });
  },

  // ── Employees ──────────────────────────────────────────────────────────────

  renderEmployees(filter = '') {
    const data = loadData();
    const lf   = filter.toLowerCase();
    const list = data.employees.filter(e =>
      e.name.toLowerCase().includes(lf) || e.id.toLowerCase().includes(lf)
    );

    const grid = document.getElementById('employee-grid');
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state-full"><i class="fas fa-users"></i>
        <p>${filter ? 'No employees match your search.' : 'No employees yet. Add your first employee!'}</p></div>`;
      return;
    }

    grid.innerHTML = list.map(emp => `
      <div class="employee-card">
        <div class="emp-card-header">
          <div class="emp-card-actions">
            <button class="icon-btn edit" onclick="app.openEditEmployee('${esc(emp.id)}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="icon-btn delete" onclick="app.confirmDeleteEmployee('${esc(emp.id)}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
          <div class="emp-avatar">
            ${emp.photo ? `<img src="${esc(emp.photo)}" alt="${esc(emp.name)}">` : `<span>${initials(emp.name)}</span>`}
          </div>
        </div>
        <div class="emp-card-body">
          <h3>${esc(emp.name)}</h3>
          <p class="emp-id"><i class="fas fa-id-badge"></i> ${esc(emp.id)}</p>
          ${emp.department ? `<p><i class="fas fa-building"></i> ${esc(emp.department)}</p>` : ''}
          <p class="emp-salary"><i class="fas fa-money-bill"></i> Basic: ${fmt(emp.basicSalary)}</p>
          <p class="emp-loan"><i class="fas fa-hand-holding-usd"></i> Loan Balance: <span class="${(emp.loanBalance || 0) > 0 ? 'amount-negative' : ''}">${fmt(emp.loanBalance || 0)}</span></p>
        </div>
        <div class="emp-card-footer">
          <button class="btn btn-sm btn-primary" onclick="app.openSalaryEntry('${esc(emp.id)}')">
            <i class="fas fa-calculator"></i> Add Salary
          </button>
          <button class="btn-history" onclick="app.openEmpHistoryModal('${esc(emp.id)}')">
            <i class="fas fa-history"></i> History
          </button>
        </div>
      </div>
    `).join('');
  },

  filterEmployees() {
    this.renderEmployees(document.getElementById('employeeSearch').value);
  },

  openAddEmployee() {
    this._editEmpId = null;
    this._photo     = null;
    document.getElementById('employeeModalTitle').textContent = 'Add Employee';
    document.getElementById('employeeForm').reset();
    document.getElementById('emp-edit-id').value = '';
    const loanEl = document.getElementById('emp-loan-balance');
    if (loanEl) loanEl.value = '0';
    document.getElementById('photoPreview').innerHTML = '<i class="fas fa-user"></i>';
    document.getElementById('employeeModal').classList.add('show');
  },

  openEditEmployee(id) {
    const data = loadData();
    const emp  = data.employees.find(e => e.id === id);
    if (!emp) return;

    this._editEmpId = id;
    this._photo     = emp.photo || null;

    document.getElementById('employeeModalTitle').textContent = 'Edit Employee';
    document.getElementById('emp-name').value       = emp.name;
    document.getElementById('emp-id').value         = emp.id;
    document.getElementById('emp-basic').value      = emp.basicSalary;
    document.getElementById('emp-department').value = emp.department || '';
    document.getElementById('emp-edit-id').value    = id;
    const loanEl = document.getElementById('emp-loan-balance');
    if (loanEl) loanEl.value = emp.loanBalance || 0;

    const prev = document.getElementById('photoPreview');
    prev.innerHTML = emp.photo
      ? `<img src="${emp.photo}" alt="${esc(emp.name)}">`
      : `<span>${initials(emp.name)}</span>`;

    document.getElementById('employeeModal').classList.add('show');
  },

  closeEmployeeModal() {
    document.getElementById('employeeModal').classList.remove('show');
  },

  handlePhotoUpload(evt) {
    const file = evt.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5 MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      compressImage(e.target.result, compressed => {
        this._photo = compressed;
        document.getElementById('photoPreview').innerHTML = `<img src="${compressed}" alt="Preview">`;
      });
    };
    reader.readAsDataURL(file);
  },

  removePhoto() {
    this._photo = null;
    document.getElementById('photoPreview').innerHTML = '<i class="fas fa-user"></i>';
    document.getElementById('photoInput').value = '';
  },

  async saveEmployee(evt) {
    evt.preventDefault();
    const data       = loadData();
    const name       = document.getElementById('emp-name').value.trim();
    const id         = document.getElementById('emp-id').value.trim();
    const basic      = parseFloat(document.getElementById('emp-basic').value) || 0;
    const dept       = document.getElementById('emp-department').value.trim();
    const editId     = document.getElementById('emp-edit-id').value;
    const loanEl     = document.getElementById('emp-loan-balance');
    const loanBalance = loanEl ? (parseFloat(loanEl.value) || 0) : 0;

    if (data.employees.some(e => e.id === id && e.id !== editId)) {
      showToast('Employee ID already exists!', 'error');
      document.getElementById('emp-id').focus();
      return;
    }

    if (editId) {
      const idx = data.employees.findIndex(e => e.id === editId);
      if (idx !== -1) {
        data.employees[idx] = { ...data.employees[idx], name, id, basicSalary: basic, department: dept, photo: this._photo, loanBalance };
        if (editId !== id) {
          data.salaryRecords.forEach(r => { if (r.employeeId === editId) r.employeeId = id; });
          const attKeys = Object.keys(data.attendance || {}).filter(k => k.startsWith(editId + '|'));
          attKeys.forEach(oldKey => {
            const newKey = id + '|' + oldKey.split('|')[1];
            data.attendance[newKey] = data.attendance[oldKey];
            delete data.attendance[oldKey];
          });
          const trKeys = Object.keys(data.timeRecords || {}).filter(k => k.startsWith(editId + '|'));
          trKeys.forEach(oldKey => {
            const newKey = id + '|' + oldKey.split('|')[1];
            data.timeRecords[newKey] = data.timeRecords[oldKey];
            delete data.timeRecords[oldKey];
          });
        }
      }
      showToast('Employee updated!');
    } else {
      data.employees.push({ name, id, basicSalary: basic, department: dept, photo: this._photo, loanBalance, createdAt: Date.now() });
      showToast('Employee added!');
    }

    await saveData(data);
    this.closeEmployeeModal();
    this.renderEmployees();
    this.renderAttendanceManagement();
    this.renderPayrollReports();
  },

  confirmDeleteEmployee(id) {
    const data = loadData();
    const emp  = data.employees.find(e => e.id === id);
    if (!emp) return;
    document.getElementById('confirmMessage').textContent =
      `Delete "${emp.name}"? All their salary records will also be removed.`;
    document.getElementById('confirmBtn').onclick = () => this.deleteEmployee(id);
    document.getElementById('confirmModal').classList.add('show');
  },

  async deleteEmployee(id) {
    const data = loadData();
    data.employees     = data.employees.filter(e => e.id !== id);
    data.salaryRecords = data.salaryRecords.filter(r => r.employeeId !== id);
    Object.keys(data.attendance || {}).forEach(k => {
      if (k.startsWith(id + '|')) delete data.attendance[k];
    });
    Object.keys(data.timeRecords || {}).forEach(k => {
      if (k.startsWith(id + '|')) delete data.timeRecords[k];
    });
    await saveData(data);
    this.closeConfirmModal();
    this.renderEmployees();
    this.renderAttendanceManagement();
    this.renderPayrollReports();
    showToast('Employee deleted!');
  },

  closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('show');
  },

  // ── Employee History Modal ──────────────────────────────────────────────────

  openEmpHistoryModal(empId) {
    const data = loadData();
    const emp  = data.employees.find(e => e.id === empId);
    if (!emp) return;

    document.getElementById('empHistoryTitle').textContent = emp.name + ' \u2014 Salary History';

    const records = data.salaryRecords
      .filter(r => r.employeeId === empId)
      .sort((a, b) => b.month.localeCompare(a.month));

    const tbody = document.getElementById('emp-history-tbody');
    if (!records.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No records</td></tr>';
    } else {
      tbody.innerHTML = records.map(r => {
        const totalDed = (r.absentDeduction || 0) + r.deductions + r.advance;
        return `<tr>
          <td>${fmtMonth(r.month)}</td>
          <td>${fmt(r.basicSalary)}</td>
          <td>${r.otHours}</td>
          <td>${fmt(r.otAmount)}</td>
          <td>${fmt(r.bonus)}</td>
          <td>${fmt(r.festivalBonus || 0)}</td>
          <td>${r.absentDays || 0}</td>
          <td class="amount-negative">${fmt(totalDed)}</td>
          <td class="amount-positive"><strong>${fmt(r.totalSalary)}</strong></td>
          <td>
            <button class="icon-btn primary" onclick="app.generateSlipPDF('${r.id}')" title="Download Slip">
              <i class="fas fa-download"></i>
            </button>
          </td>
        </tr>`;
      }).join('');
    }

    document.getElementById('empHistoryModal').classList.add('show');
  },

  closeEmpHistoryModal() {
    document.getElementById('empHistoryModal').classList.remove('show');
  },

  // ── Salary Entry ────────────────────────────────────────────────────────────

  openSalaryEntry(empId) {
    this.navigateTo('salary-entry');
    setTimeout(() => {
      document.getElementById('se-employee').value = empId;
      this.onEmployeeSelect();
    }, 50);
  },

  loadSalaryEntrySelects() {
    const data = loadData();
    const sel  = document.getElementById('se-employee');
    const cur  = sel.value;
    sel.innerHTML = '<option value="">— Select Employee —</option>' +
      data.employees.map(e => `<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.id)})</option>`).join('');
    if (cur) sel.value = cur;

    this._populateHistoryFilters(data);
    this._updateAttendanceRow();
  },

  onEmployeeSelect() {
    const data  = loadData();
    const empId = document.getElementById('se-employee').value;
    const emp   = data.employees.find(e => e.id === empId);
    document.getElementById('se-basic').value = emp ? emp.basicSalary : '';
    // Show loan balance
    const loanEl = document.getElementById('se-loan-balance');
    if (loanEl) loanEl.textContent = emp ? fmt(emp.loanBalance || 0) : fmt(0);
    this._syncAbsentDays();
    this.calcPreview();
  },

  onMonthChange() {
    this._syncAbsentDays();
    this.calcPreview();
  },

  _syncAbsentDays() {
    const data  = loadData();
    const empId = document.getElementById('se-employee').value;
    const month = document.getElementById('se-month').value;

    if (empId && month) {
      const stats  = getMonthTimeStats(data, empId, month);
      const days   = getDaysInMonth(month);

      document.getElementById('se-absent-days').value         = stats.effectiveAbsentDays;
      document.getElementById('att-absent-count').textContent = stats.effectiveAbsentDays;
      document.getElementById('att-month-days').textContent   = `/ ${days} days in month`;

      // Auto-fill OT hours, penalty absents, tiffin bills
      const otEl      = document.getElementById('se-ot-hours');
      const tiffinEl  = document.getElementById('se-tiffin-bills');
      const penaltyEl = document.getElementById('se-penalty-absents');
      if (otEl && !parseFloat(otEl.value)) otEl.value = stats.totalOtHours.toFixed(2);
      if (tiffinEl) tiffinEl.value = stats.totalTiffinBills.toFixed(2);
      if (penaltyEl) penaltyEl.value = stats.penaltyAbsents;
    } else {
      document.getElementById('se-absent-days').value         = 0;
      document.getElementById('att-absent-count').textContent = '0';
      document.getElementById('att-month-days').textContent   = '';
      const tiffinEl  = document.getElementById('se-tiffin-bills');
      const penaltyEl = document.getElementById('se-penalty-absents');
      if (tiffinEl)  tiffinEl.value  = '0';
      if (penaltyEl) penaltyEl.value = '0';
    }
  },

  _updateAttendanceRow() {
    const month = document.getElementById('se-month').value;
    if (month) {
      const days = getDaysInMonth(month);
      document.getElementById('att-month-days').textContent = `/ ${days} days in month`;
    }
  },

  calcPreview() {
    const basic         = parseFloat(document.getElementById('se-basic').value)          || 0;
    const otHours       = parseFloat(document.getElementById('se-ot-hours').value)       || 0;
    const bonus         = parseFloat(document.getElementById('se-bonus').value)          || 0;
    const festivalBonus = parseFloat(document.getElementById('se-festival-bonus').value) || 0;
    const deductions    = parseFloat(document.getElementById('se-deductions').value)     || 0;
    const advance       = parseFloat(document.getElementById('se-advance').value)        || 0;
    const absentDays    = parseInt(document.getElementById('se-absent-days').value)      || 0;
    const tiffinBills   = parseFloat(document.getElementById('se-tiffin-bills')?.value)  || 0;
    const month         = document.getElementById('se-month').value;
    const daysInMonth   = month ? getDaysInMonth(month) : 30;

    const { otAmount, absentDeduction, total } =
      calcSalary(basic, otHours, bonus, festivalBonus, absentDays, daysInMonth, deductions, advance, tiffinBills);

    document.getElementById('prev-basic').textContent          = fmt(basic);
    document.getElementById('prev-ot').textContent             = fmt(otAmount);
    document.getElementById('prev-bonus').textContent          = fmt(bonus);
    document.getElementById('prev-festival-bonus').textContent = fmt(festivalBonus);
    document.getElementById('prev-tiffin-bills').textContent   = fmt(tiffinBills);
    document.getElementById('prev-absent-ded').textContent     = fmt(absentDeduction);
    document.getElementById('prev-deductions').textContent     = fmt(deductions);
    document.getElementById('prev-advance').textContent        = fmt(advance);
    document.getElementById('prev-total').textContent          = fmt(total);
  },

  async saveSalaryEntry(evt) {
    evt.preventDefault();
    const data          = loadData();
    const empId         = document.getElementById('se-employee').value;
    const month         = document.getElementById('se-month').value;
    const basic         = parseFloat(document.getElementById('se-basic').value)          || 0;
    const otHours       = parseFloat(document.getElementById('se-ot-hours').value)       || 0;
    const bonus         = parseFloat(document.getElementById('se-bonus').value)          || 0;
    const festivalBonus = parseFloat(document.getElementById('se-festival-bonus').value) || 0;
    const deductions    = parseFloat(document.getElementById('se-deductions').value)     || 0;
    const advance       = parseFloat(document.getElementById('se-advance').value)        || 0;
    const absentDays    = parseInt(document.getElementById('se-absent-days').value)      || 0;
    const tiffinBills   = parseFloat(document.getElementById('se-tiffin-bills')?.value)  || 0;
    const penaltyAbsents = parseInt(document.getElementById('se-penalty-absents')?.value) || 0;
    const daysInMonth   = month ? getDaysInMonth(month) : 30;

    if (!empId || !month) { showToast('Select employee and month!', 'error'); return; }

    const { otAmount, absentDeduction, total } =
      calcSalary(basic, otHours, bonus, festivalBonus, absentDays, daysInMonth, deductions, advance, tiffinBills);

    const existIdx = data.salaryRecords.findIndex(r => r.employeeId === empId && r.month === month);

    const record = {
      id:               existIdx !== -1 ? data.salaryRecords[existIdx].id : getNextSalaryRecordId(),
      employeeId:       empId,
      month,
      basicSalary:      basic,
      otHours,
      otAmount,
      bonus,
      festivalBonus,
      absentDays,
      absentDeduction,
      tiffinBills,
      penaltyAbsents,
      deductions,
      advance,
      totalSalary:      total,
      createdAt:        Date.now(),
    };

    if (existIdx !== -1) {
      data.salaryRecords[existIdx] = record;
      showToast('Record updated!');
    } else {
      data.salaryRecords.push(record);
      showToast('Record saved!');
    }

    // Update loan balance if advance deducted
    if (advance > 0) {
      const empIdx = data.employees.findIndex(e => e.id === empId);
      if (empIdx !== -1) {
        const prev = data.employees[empIdx].loanBalance || 0;
        data.employees[empIdx].loanBalance = Math.max(0, prev - advance);
      }
    }

    await saveData(data);
    this.resetSalaryForm();
    this.renderPayrollReports();
  },

  resetSalaryForm() {
    const zeroFields = ['se-ot-hours', 'se-bonus', 'se-festival-bonus', 'se-deductions', 'se-advance', 'se-tiffin-bills', 'se-penalty-absents'];
    document.getElementById('se-employee').value            = '';
    document.getElementById('se-basic').value               = '';
    document.getElementById('se-absent-days').value         = '0';
    document.getElementById('att-absent-count').textContent = '0';
    document.getElementById('att-month-days').textContent   = '';
    zeroFields.forEach(id => { const el = document.getElementById(id); if (el) el.value = '0'; });
    const loanEl = document.getElementById('se-loan-balance');
    if (loanEl) loanEl.textContent = fmt(0);
    this.calcPreview();
  },

  // ── Attendance Modal ────────────────────────────────────────────────────────

  openAttendanceModal() {
    const empId = document.getElementById('se-employee').value;
    const month = document.getElementById('se-month').value;

    if (!empId) { showToast('Please select an employee first!', 'warning'); return; }
    if (!month) { showToast('Please select a month first!', 'warning'); return; }

    this._attEmpId = empId;
    this._attMonth = month;

    const data = loadData();
    const key  = `${empId}|${month}`;
    this._tempAttendance = Object.assign({}, (data.attendance || {})[key] || {});

    const emp = data.employees.find(e => e.id === empId);
    document.getElementById('attModalTitle').textContent =
      'Attendance \u2014 ' + (emp ? emp.name : empId) + ' (' + fmtMonth(month) + ')';

    this._renderAttCalendar();
    document.getElementById('attendanceModal').classList.add('show');
  },

  _renderAttCalendar() {
    const month       = this._attMonth;
    const [y, m]      = month.split('-').map(Number);
    const daysInMonth = getDaysInMonth(month);
    const firstDay    = new Date(y, m - 1, 1).getDay();

    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div class="att-day-empty"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const status = (this._tempAttendance[day] || 'P');
      html += `<div class="att-day att-${status.toLowerCase()}" data-day="${day}" onclick="app.toggleAttDay(${day})">
        <span class="att-day-num">${day}</span>
        <span class="att-day-label">${status}</span>
      </div>`;
    }

    document.getElementById('attGrid').innerHTML = html;
    this._updateAttSummary();
  },

  toggleAttDay(day) {
    const cycle = { P: 'A', A: 'H', H: 'L', L: 'SL', SL: 'CL', CL: 'P' };
    const current = this._tempAttendance[day] || 'P';
    const next    = cycle[current] || 'P';
    this._tempAttendance[day] = next;

    const cell = document.querySelector(`.att-day[data-day="${day}"]`);
    if (cell) {
      cell.className = `att-day att-${next.toLowerCase()}`;
      cell.querySelector('.att-day-label').textContent = next;
    }
    this._updateAttSummary();
  },

  _updateAttSummary() {
    const days = getDaysInMonth(this._attMonth);
    let p = 0, a = 0, h = 0, l = 0, sl = 0, cl = 0;
    for (let d = 1; d <= days; d++) {
      const s = this._tempAttendance[d] || 'P';
      if      (s === 'P')  p++;
      else if (s === 'A')  a++;
      else if (s === 'H')  h++;
      else if (s === 'L')  l++;
      else if (s === 'SL') sl++;
      else if (s === 'CL') cl++;
    }
    document.getElementById('att-sum-p').textContent  = p;
    document.getElementById('att-sum-a').textContent  = a;
    document.getElementById('att-sum-h').textContent  = h;
    const lEl  = document.getElementById('att-sum-l');
    const slEl = document.getElementById('att-sum-sl');
    const clEl = document.getElementById('att-sum-cl');
    if (lEl)  lEl.textContent  = l;
    if (slEl) slEl.textContent = sl;
    if (clEl) clEl.textContent = cl;
  },

  async saveAttendance() {
    const data = loadData();
    if (!data.attendance) data.attendance = {};
    const key = `${this._attEmpId}|${this._attMonth}`;
    data.attendance[key] = { ...this._tempAttendance };
    await saveData(data);

    const stats = getMonthTimeStats(data, this._attEmpId, this._attMonth);
    const days  = getDaysInMonth(this._attMonth);
    document.getElementById('se-absent-days').value         = stats.effectiveAbsentDays;
    document.getElementById('att-absent-count').textContent = stats.effectiveAbsentDays;
    document.getElementById('att-month-days').textContent   = `/ ${days} days in month`;
    const penaltyEl = document.getElementById('se-penalty-absents');
    if (penaltyEl) penaltyEl.value = stats.penaltyAbsents;
    this.calcPreview();

    this.closeAttendanceModal();
    this.renderAttendanceManagement();
    this.renderPayrollReports();
    showToast('Attendance saved!');
  },

  closeAttendanceModal() {
    document.getElementById('attendanceModal').classList.remove('show');
  },

  // ── Attendance Management View ───────────────────────────────────────────────

  renderAttendanceManagement() {
    const data = loadData();
    const monthInput = document.getElementById('att-man-month');
    const dateInput  = document.getElementById('att-man-date');
    if (!monthInput || !dateInput) return;

    if (!monthInput.value) {
      const now = new Date();
      monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const activeMonth = monthInput.value;
    if (!dateInput.value || monthFromDate(dateInput.value) !== activeMonth) {
      dateInput.value = `${activeMonth}-01`;
    }
    this._attMgmtDate = dateInput.value;
    this._renderAttendanceManagementRows(data);
  },

  onAttendanceMonthChange() {
    const month = document.getElementById('att-man-month').value;
    const dateEl = document.getElementById('att-man-date');
    if (!month || !dateEl) return;
    const days = getDaysInMonth(month);
    let day = dayFromDate(dateEl.value) || 1;
    day = Math.min(Math.max(day, 1), days);
    dateEl.value = `${month}-${String(day).padStart(2, '0')}`;
    this._attMgmtDate = dateEl.value;
    this.renderAttendanceManagement();
  },

  onAttendanceDateChange() {
    const dateEl  = document.getElementById('att-man-date');
    const monthEl = document.getElementById('att-man-month');
    if (!dateEl || !monthEl || !dateEl.value) return;
    monthEl.value = monthFromDate(dateEl.value);
    this._attMgmtDate = dateEl.value;
    this.renderAttendanceManagement();
  },

  _renderAttendanceManagementRows(data) {
    const dateStr    = this._attMgmtDate || document.getElementById('att-man-date').value;
    const tbody      = document.getElementById('attendance-list-tbody');
    const tiffinRate = data.tiffinBillRate || 50;
    if (!tbody) return;

    if (!data.employees.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No employees found</td></tr>';
      document.getElementById('att-man-p').textContent  = '0';
      document.getElementById('att-man-a').textContent  = '0';
      document.getElementById('att-man-h').textContent  = '0';
      const lEl = document.getElementById('att-man-l');
      if (lEl) lEl.textContent = '0';
      return;
    }

    let p = 0, a = 0, h = 0, l = 0;
    tbody.innerHTML = data.employees.map(emp => {
      const status = getAttendanceStatus(data, emp.id, dateStr);
      const tr     = getTimeRecord(data, emp.id, dateStr);
      if      (status === 'A') a++;
      else if (status === 'H') h++;
      else if (status === 'L') l++;
      else p++;

      const inVal      = tr.inTime      || '';
      const outVal     = tr.outTime     || '';
      const wdChecked  = tr.isWeekendDuty ? 'checked' : '';
      const otHrsDisp  = tr.otHours     !== undefined ? tr.otHours.toFixed(2)  : '0.00';
      const tiffinDisp = tr.tiffinBill  !== undefined ? tr.tiffinBill.toFixed(2) : '0.00';

      return `<tr>
        <td>${esc(emp.name)}</td>
        <td>${esc(emp.id)}</td>
        <td>
          <select class="att-status-select" onchange="app.setAttendanceForDate('${esc(emp.id)}', this.value)">
            <option value="P"  ${status === 'P'  ? 'selected' : ''}>Present</option>
            <option value="A"  ${status === 'A'  ? 'selected' : ''}>Absent</option>
            <option value="H"  ${status === 'H'  ? 'selected' : ''}>Company Holiday</option>
            <option value="L"  ${status === 'L'  ? 'selected' : ''}>Late</option>
            <option value="SL" ${status === 'SL' ? 'selected' : ''}>Sick Leave (SL)</option>
            <option value="CL" ${status === 'CL' ? 'selected' : ''}>Casual Leave (CL)</option>
          </select>
        </td>
        <td>
          <div class="time-inputs-row">
            <input type="time" class="time-input" value="${esc(inVal)}" placeholder="In"
              onchange="app.onTimeChange('${esc(emp.id)}', 'inTime', this.value)" title="In Time">
            <input type="time" class="time-input" value="${esc(outVal)}" placeholder="Out"
              onchange="app.onTimeChange('${esc(emp.id)}', 'outTime', this.value)" title="Out Time">
            <label class="wd-label" title="Weekend/Friday Duty — all worked hours count as OT">
              <input type="checkbox" ${wdChecked}
                onchange="app.onWeekendDutyChange('${esc(emp.id)}', this.checked)"> FD
            </label>
          </div>
        </td>
        <td class="att-ot-cell">${otHrsDisp} hrs</td>
        <td class="att-tiffin-cell">${fmt(tiffinDisp)}</td>
      </tr>`;
    }).join('');

    document.getElementById('att-man-p').textContent  = p;
    document.getElementById('att-man-a').textContent  = a;
    document.getElementById('att-man-h').textContent  = h;
    const lEl = document.getElementById('att-man-l');
    if (lEl) lEl.textContent = l;
  },

  async setAttendanceForDate(empId, status) {
    const data    = loadData();
    const dateStr = document.getElementById('att-man-date').value;
    // If status is L (Late) and no inTime set yet, mark as L (arrival was late)
    setAttendanceStatus(data, empId, dateStr, status);
    await saveData(data);
    this._attMgmtDate = dateStr;
    this._renderAttendanceManagementRows(data);
    this._syncAbsentDays();
    this.calcPreview();
    this.renderDashboard();
    this.renderPayrollReports();
  },

  async onTimeChange(empId, field, value) {
    const data    = loadData();
    const dateStr = document.getElementById('att-man-date').value;
    const tiffinRate = data.tiffinBillRate || 50;

    const tr = getTimeRecord(data, empId, dateStr);
    tr[field] = value;

    // Auto-compute isLate when inTime changes
    if (field === 'inTime') {
      tr.isLate = isLateArrival(value);
      // Auto-mark status as Late if currently Present
      const currentStatus = getAttendanceStatus(data, empId, dateStr);
      if (tr.isLate && currentStatus === 'P') {
        setAttendanceStatus(data, empId, dateStr, 'L');
      } else if (!tr.isLate && currentStatus === 'L') {
        setAttendanceStatus(data, empId, dateStr, 'P');
      }
    }

    // Auto-compute OT and Tiffin when outTime changes
    if (field === 'outTime') {
      const currentTr = getTimeRecord(data, empId, dateStr);
      const merged = { ...currentTr, ...tr };
      tr.otHours   = parseFloat(calcOtHours(merged.inTime, value, merged.isWeekendDuty || false).toFixed(2));
      tr.tiffinBill = calcTiffinBill(value, tiffinRate);
    }

    setTimeRecord(data, empId, dateStr, tr);
    await saveData(data);
    this._attMgmtDate = dateStr;
    this._renderAttendanceManagementRows(data);
    this._syncAbsentDays();
    this.calcPreview();
  },

  async onWeekendDutyChange(empId, checked) {
    const data    = loadData();
    const dateStr = document.getElementById('att-man-date').value;
    const tr      = getTimeRecord(data, empId, dateStr);
    tr.isWeekendDuty = checked;
    // Recalculate OT
    if (tr.outTime) {
      tr.otHours = parseFloat(calcOtHours(tr.inTime, tr.outTime, checked).toFixed(2));
    }
    setTimeRecord(data, empId, dateStr, tr);
    await saveData(data);
    this._attMgmtDate = dateStr;
    this._renderAttendanceManagementRows(data);
    this._syncAbsentDays();
    this.calcPreview();
  },

  // ── Payroll Reports ──────────────────────────────────────────────────────────

  renderPayrollReports() {
    const periodEl = document.getElementById('pr-period');
    const startEl  = document.getElementById('pr-start-date');
    const endEl    = document.getElementById('pr-end-date');
    if (!periodEl || !startEl || !endEl) return;
    if (!startEl.value || !endEl.value) this.onPayrollPeriodChange();
  },

  onPayrollPeriodChange() {
    const period = document.getElementById('pr-period').value;
    const startEl = document.getElementById('pr-start-date');
    const endEl   = document.getElementById('pr-end-date');
    const base = startEl.value ? dateStringToMidnight(startEl.value) : new Date();
    let start = new Date(base);
    let end   = new Date(base);

    if (period === 'daily') {
      // start/end stay same day
    } else if (period === 'weekly') {
      start.setDate(base.getDate() - base.getDay());
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else {
      start = new Date(base.getFullYear(), base.getMonth(), 1);
      end   = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    }

    startEl.value = formatAsYYYYMMDD(start);
    endEl.value   = formatAsYYYYMMDD(end);
  },

  loadPayrollReport() {
    const data     = loadData();
    const startStr = document.getElementById('pr-start-date').value;
    const endStr   = document.getElementById('pr-end-date').value;
    const tbody    = document.getElementById('pr-tbody');
    const tfoot    = document.getElementById('pr-tfoot');
    if (!startStr || !endStr) { showToast('Select start and end dates!', 'error'); return; }

    const start = dateStringToMidnight(startStr);
    const end   = dateStringToMidnight(endStr);
    if (start > end) { showToast('Start date must be before end date!', 'error'); return; }

    if (!data.employees.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No employees found</td></tr>';
      tfoot.innerHTML = '';
      document.getElementById('pr-total-attendance').textContent = '0 / 0 / 0';
      document.getElementById('pr-total-salary').textContent = fmt(0);
      return;
    }

    const salaryRecordsByEmployee = data.salaryRecords.reduce((acc, record) => {
      if (!acc[record.employeeId]) acc[record.employeeId] = [];
      acc[record.employeeId].push(record);
      return acc;
    }, {});

    let totalP = 0, totalA = 0, totalH = 0, totalOt = 0, totalSalary = 0;
    const rows = data.employees.map(emp => {
      let p = 0, a = 0, h = 0, salary = 0, ot = 0;

      const startUTC = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
      const endUTC   = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
      for (let ts = startUTC; ts <= endUTC; ts += MS_PER_DAY) {
        const dateStr = formatAsYYYYMMDD(new Date(ts));
        const status = getAttendanceStatus(data, emp.id, dateStr);
        if (status === 'A') a++;
        else if (status === 'H') h++;
        else p++;
      }

      (salaryRecordsByEmployee[emp.id] || []).forEach(r => {
          const daysInMonth = getDaysInMonth(r.month);
          const monthStart = dateStringToMidnight(`${r.month}-01`);
          const monthEnd   = dateStringToMidnight(`${r.month}-${String(daysInMonth).padStart(2, '0')}`);
          const overlapStart = monthStart > start ? monthStart : start;
          const overlapEnd   = monthEnd < end ? monthEnd : end;
          if (overlapStart > overlapEnd) return;
          const overlapDays = daysBetweenInclusive(overlapStart, overlapEnd);
          const factor = overlapDays / daysInMonth;
          salary += (r.totalSalary || 0) * factor;
          ot += (r.otHours || 0) * factor;
        });

      totalP += p;
      totalA += a;
      totalH += h;
      totalOt += ot;
      totalSalary += salary;

      return `<tr>
        <td>${esc(emp.name)}</td>
        <td>${esc(emp.id)}</td>
        <td>${p}</td>
        <td>${a}</td>
        <td>${h}</td>
        <td>${formatOtHours(ot)}</td>
        <td class="amount-positive"><strong>${fmt(salary)}</strong></td>
      </tr>`;
    });

    tbody.innerHTML = rows.join('');
    tfoot.innerHTML = `<tr>
      <td colspan="2"><strong>TOTALS (${data.employees.length} employees)</strong></td>
      <td><strong>${totalP}</strong></td>
      <td><strong>${totalA}</strong></td>
      <td><strong>${totalH}</strong></td>
      <td><strong>${formatOtHours(totalOt)}</strong></td>
      <td class="amount-positive"><strong>${fmt(totalSalary)}</strong></td>
    </tr>`;

    document.getElementById('pr-total-attendance').textContent = `${totalP} / ${totalA} / ${totalH}`;
    document.getElementById('pr-total-salary').textContent = fmt(totalSalary);
  },

  // ── History ─────────────────────────────────────────────────────────────────

  _populateHistoryFilters(data) {
    const empSel   = document.getElementById('hist-employee');
    const mthSel   = document.getElementById('hist-month');
    const curEmp   = empSel.value;
    const curMonth = mthSel.value;

    empSel.innerHTML = '<option value="">All Employees</option>' +
      data.employees.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');

    const months = [...new Set(data.salaryRecords.map(r => r.month))].sort().reverse();
    mthSel.innerHTML = '<option value="">All Months</option>' +
      months.map(m => `<option value="${m}">${fmtMonth(m)}</option>`).join('');

    if (curEmp)   empSel.value = curEmp;
    if (curMonth) mthSel.value = curMonth;
  },

  renderHistory() {
    const data = loadData();
    this._populateHistoryFilters(data);
    this.filterHistory();
  },

  filterHistory() {
    const data     = loadData();
    const empF     = document.getElementById('hist-employee').value;
    const mthF     = document.getElementById('hist-month').value;
    let   records  = data.salaryRecords;

    if (empF) records = records.filter(r => r.employeeId === empF);
    if (mthF) records = records.filter(r => r.month === mthF);

    records.sort((a, b) => b.month.localeCompare(a.month) || a.employeeId.localeCompare(b.employeeId));

    const tbody = document.getElementById('history-tbody');
    if (!records.length) {
      tbody.innerHTML = '<tr><td colspan="14" class="empty-state">No records found</td></tr>';
      return;
    }

    tbody.innerHTML = records.map(r => {
      const emp = data.employees.find(e => e.id === r.employeeId);
      return `<tr>
        <td>${emp ? esc(emp.name) : 'Unknown'}</td>
        <td>${esc(r.employeeId)}</td>
        <td>${fmtMonth(r.month)}</td>
        <td>${fmt(r.basicSalary)}</td>
        <td>${r.otHours}</td>
        <td>${fmt(r.otAmount)}</td>
        <td>${fmt(r.bonus)}</td>
        <td>${fmt(r.festivalBonus || 0)}</td>
        <td>${r.absentDays || 0}</td>
        <td class="amount-negative">${fmt(r.absentDeduction || 0)}</td>
        <td class="amount-negative">${fmt(r.deductions)}</td>
        <td class="amount-negative">${fmt(r.advance)}</td>
        <td class="amount-positive"><strong>${fmt(r.totalSalary)}</strong></td>
        <td>
          <button class="icon-btn primary" onclick="app.generateSlipPDF('${r.id}')" title="Salary Slip PDF"><i class="fas fa-download"></i></button>
          <button class="icon-btn delete"  onclick="app.confirmDeleteRecord('${r.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  },

  confirmDeleteRecord(id) {
    document.getElementById('confirmMessage').textContent = 'Delete this salary record? This cannot be undone.';
    document.getElementById('confirmBtn').onclick = () => this.deleteRecord(id);
    document.getElementById('confirmModal').classList.add('show');
  },

  async deleteRecord(id) {
    const data = loadData();
    data.salaryRecords = data.salaryRecords.filter(r => r.id !== id);
    await saveData(data);
    this.closeConfirmModal();
    this.filterHistory();
    showToast('Record deleted!');
  },

  // ── Monthly Summary ─────────────────────────────────────────────────────────

  loadSummary() {
    const month = document.getElementById('summary-month').value;
    if (!month) { showToast('Please select a month!', 'error'); return; }

    const data    = loadData();
    const records = data.salaryRecords.filter(r => r.month === month);
    const tbody   = document.getElementById('summary-tbody');
    const tfoot   = document.getElementById('summary-tfoot');

    if (!records.length) {
      tbody.innerHTML = `<tr><td colspan="12" class="empty-state">No records for ${esc(fmtMonth(month))}</td></tr>`;
      tfoot.innerHTML = '';
      return;
    }

    let totBasic = 0, totOtHrs = 0, totOtAmt = 0, totBonus = 0, totFest = 0,
        totAbsentDays = 0, totDed = 0, totNet = 0;

    tbody.innerHTML = records.map((r, i) => {
      const emp      = data.employees.find(e => e.id === r.employeeId);
      const totalDed = (r.absentDeduction || 0) + r.deductions + r.advance;
      totBasic      += r.basicSalary;
      totOtHrs      += r.otHours;
      totOtAmt      += r.otAmount;
      totBonus      += r.bonus;
      totFest       += (r.festivalBonus || 0);
      totAbsentDays += (r.absentDays || 0);
      totDed        += totalDed;
      totNet        += r.totalSalary;

      return `<tr>
        <td>${i + 1}</td>
        <td>${emp ? esc(emp.name) : 'Unknown'}</td>
        <td>${esc(r.employeeId)}</td>
        <td>${fmt(r.basicSalary)}</td>
        <td>${r.otHours}</td>
        <td>${fmt(r.otAmount)}</td>
        <td>${fmt(r.bonus)}</td>
        <td>${fmt(r.festivalBonus || 0)}</td>
        <td>${r.absentDays || 0}</td>
        <td class="amount-negative">${fmt(totalDed)}</td>
        <td class="amount-positive"><strong>${fmt(r.totalSalary)}</strong></td>
        <td>
          <button class="icon-btn primary" onclick="app.generateSlipPDF('${r.id}')" title="Salary Slip PDF"><i class="fas fa-file-pdf"></i></button>
        </td>
      </tr>`;
    }).join('');

    tfoot.innerHTML = `<tr>
      <td colspan="3"><strong>TOTALS (${records.length} employees)</strong></td>
      <td><strong>${fmt(totBasic)}</strong></td>
      <td><strong>${totOtHrs}</strong></td>
      <td><strong>${fmt(totOtAmt)}</strong></td>
      <td><strong>${fmt(totBonus)}</strong></td>
      <td><strong>${fmt(totFest)}</strong></td>
      <td><strong>${totAbsentDays}</strong></td>
      <td class="amount-negative"><strong>${fmt(totDed)}</strong></td>
      <td class="amount-positive"><strong>${fmt(totNet)}</strong></td>
      <td></td>
    </tr>`;
  },

  // ── PDF: Individual Salary Slip ─────────────────────────────────────────────

  generateSlipPDF(recordId) {
    const data   = loadData();
    const record = data.salaryRecords.find(r => r.id === recordId);
    if (!record) { showToast('Record not found!', 'error'); return; }

    const emp = data.employees.find(e => e.id === record.employeeId);
    if (!emp)  { showToast('Employee not found!', 'error'); return; }

    const { jsPDF } = window.jspdf;
    const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW  = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 0;

    const headerColor = [13, 115, 119];

    // ── Header banner
    doc.setFillColor(...headerColor);
    doc.rect(0, 0, pageW, 38, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(data.companyName || 'TRACS APPAREL', pageW / 2, 13, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('EMPLOYEE SALARY SLIP', pageW / 2, 22, { align: 'center' });

    doc.setFontSize(9);
    doc.text(fmtMonth(record.month), pageW / 2, 30, { align: 'center' });

    y = 44;

    if (emp.photo) {
      try { doc.addImage(emp.photo, 'JPEG', margin, y, 22, 22); } catch (e) { /* ignore */ }
    }

    const detailX = emp.photo ? margin + 26 : margin;
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 252, 252);
    doc.setDrawColor(200, 230, 230);
    doc.roundedRect(margin, y, pageW - margin * 2, 30, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const labelX  = detailX + 2;
    const valueX  = detailX + 32;
    const label2X = pageW / 2 + 5;
    const value2X = pageW / 2 + 35;

    const penaltyStr = record.penaltyAbsents ? `${record.absentDays || 0} (+${record.penaltyAbsents} late penalty)` : String(record.absentDays || 0);
    const infoRows = [
      ['Name:',         emp.name,                              'Pay Period:',  fmtMonth(record.month)],
      ['Employee ID:',  emp.id,                                'Department:',  emp.department || 'N/A'],
      ['Basic Salary:', 'BDT ' + fmtPDF(record.basicSalary),  'Absent Days:', penaltyStr],
    ];
    infoRows.forEach((row, i) => {
      const ry = y + 7 + i * 8;
      doc.setFont('helvetica', 'bold');   doc.text(row[0], labelX, ry);
      doc.setFont('helvetica', 'normal'); doc.text(row[1], valueX, ry);
      if (row[2]) { doc.setFont('helvetica', 'bold');   doc.text(row[2], label2X, ry); }
      if (row[3]) { doc.setFont('helvetica', 'normal'); doc.text(row[3], value2X, ry); }
    });

    y += 36;

    const festBonus   = record.festivalBonus || 0;
    const tiffinBills = record.tiffinBills   || 0;
    const absentDed   = record.absentDeduction || 0;
    const gross       = record.basicSalary + record.otAmount + record.bonus + festBonus + tiffinBills;
    const totalDed    = absentDed + record.deductions + record.advance;

    doc.autoTable({
      startY: y,
      head:   [['EARNINGS', 'Amount (BDT)']],
      body:   [
        ['Basic Salary',                            fmtPDF(record.basicSalary)],
        [`Overtime (${record.otHours} hrs)`,        fmtPDF(record.otAmount)],
        ['Regular Bonus',                           fmtPDF(record.bonus)],
        ['Festival Bonus',                          fmtPDF(festBonus)],
        ['Tiffin / Night Allowance',                fmtPDF(tiffinBills)],
        ['Gross Earnings',                          fmtPDF(gross)],
      ],
      theme:        'grid',
      headStyles:   { fillColor: headerColor, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles:       { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' } },
      margin:       { left: margin, right: pageW / 2 + 2 },
    });

    const earningsY = doc.lastAutoTable.finalY;

    const loanBalance = emp.loanBalance || 0;
    doc.autoTable({
      startY: y,
      head:   [['DEDUCTIONS', 'Amount (BDT)']],
      body:   [
        ['Absent Deduction',         fmtPDF(absentDed)],
        ['General Deductions',       fmtPDF(record.deductions)],
        ['Advance (this month)',      fmtPDF(record.advance)],
        ['Total Deductions',         fmtPDF(totalDed)],
        ['Remaining Loan Balance',   fmtPDF(loanBalance)],
      ],
      theme:        'grid',
      headStyles:   { fillColor: [180, 50, 50], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles:       { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' } },
      margin:       { left: pageW / 2 + 2, right: margin },
    });

    y = Math.max(earningsY, doc.lastAutoTable.finalY) + 5;

    doc.setFillColor(...headerColor);
    doc.rect(margin, y, pageW - margin * 2, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('NET PAY:', margin + 5, y + 9);
    doc.text('BDT ' + fmtPDF(record.totalSalary), pageW - margin - 5, y + 9, { align: 'right' });

    y += 22;

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Employee Signature: _______________________', margin, y);
    doc.text('Authorized Signature: _______________________', pageW - margin, y, { align: 'right' });

    y += 6;
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text('This is a system-generated document.', pageW / 2, y, { align: 'center' });

    doc.setFillColor(240, 245, 245);
    doc.rect(0, 283, pageW, 14, 'F');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Generated on ' + new Date().toLocaleDateString() + ' | ' + data.companyName, pageW / 2, 291, { align: 'center' });

    doc.save('Salary_Slip_' + emp.name.replace(/\s+/g, '_') + '_' + record.month + '.pdf');
    showToast('Salary slip downloaded!', 'info');
  },

  // ── PDF: Monthly Summary Sheet ──────────────────────────────────────────────

  generateSummaryPDF() {
    const month = document.getElementById('summary-month').value;
    if (!month) { showToast('Please select a month!', 'error'); return; }

    const data    = loadData();
    const records = data.salaryRecords.filter(r => r.month === month);
    if (!records.length) { showToast('No records for selected month!', 'error'); return; }

    const { jsPDF } = window.jspdf;
    const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const headerColor = [13, 115, 119];

    doc.setFillColor(...headerColor);
    doc.rect(0, 0, pageW, 32, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(data.companyName || 'TRACS APPAREL', pageW / 2, 11, { align: 'center' });

    doc.setFontSize(11);
    doc.text('MONTHLY SALARY SUMMARY SHEET', pageW / 2, 20, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(fmtMonth(month), pageW / 2, 28, { align: 'center' });

    let totBasic = 0, totOtHrs = 0, totOtAmt = 0, totBonus = 0, totFest = 0,
        totTiffin = 0, totAbsent = 0, totDed = 0, totNet = 0;

    const tableRows = records.map((r, i) => {
      const emp      = data.employees.find(e => e.id === r.employeeId);
      const tiffin   = r.tiffinBills   || 0;
      const totalDed = (r.absentDeduction || 0) + r.deductions + r.advance;
      totBasic  += r.basicSalary;
      totOtHrs  += r.otHours;
      totOtAmt  += r.otAmount;
      totBonus  += r.bonus;
      totFest   += (r.festivalBonus || 0);
      totTiffin += tiffin;
      totAbsent += (r.absentDays || 0);
      totDed    += totalDed;
      totNet    += r.totalSalary;

      return [
        i + 1,
        emp ? emp.name : 'Unknown',
        r.employeeId,
        fmtPDF(r.basicSalary),
        r.otHours,
        fmtPDF(r.otAmount),
        fmtPDF(r.bonus),
        fmtPDF(r.festivalBonus || 0),
        fmtPDF(tiffin),
        r.absentDays || 0,
        fmtPDF(totalDed),
        fmtPDF(r.totalSalary),
      ];
    });

    const totalRow = [
      '', 'TOTAL', '',
      fmtPDF(totBasic), fmtPDF(totOtHrs), fmtPDF(totOtAmt),
      fmtPDF(totBonus), fmtPDF(totFest), fmtPDF(totTiffin), totAbsent,
      fmtPDF(totDed),   fmtPDF(totNet),
    ];
    tableRows.push(totalRow);

    doc.autoTable({
      startY: 38,
      head:   [['#', 'Employee Name', 'ID', 'Basic (BDT)', 'OT Hrs', 'OT Amt', 'Bonus', 'Fest. Bonus', 'Tiffin', 'Absent Days', 'Total Deduction', 'Net Salary (BDT)']],
      body:   tableRows,
      theme:  'grid',
      headStyles:  { fillColor: headerColor, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      styles:      { fontSize: 7.5, cellPadding: 2 },
      columnStyles: {
        0:  { cellWidth: 7,  halign: 'center' },
        1:  { cellWidth: 36 },
        2:  { cellWidth: 16, halign: 'center' },
        3:  { halign: 'right' },
        4:  { cellWidth: 11, halign: 'center' },
        5:  { halign: 'right' },
        6:  { halign: 'right' },
        7:  { halign: 'right' },
        8:  { halign: 'right' },
        9:  { cellWidth: 13, halign: 'center' },
        10: { halign: 'right' },
        11: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell(hook) {
        if (hook.row.index === tableRows.length - 1) {
          hook.cell.styles.fillColor = [210, 245, 240];
          hook.cell.styles.fontStyle = 'bold';
          hook.cell.styles.fontSize  = 8.5;
        }
      },
    });

    const fy = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Total Employees: ' + records.length + '  |  Generated: ' + new Date().toLocaleDateString(), 14, fy);
    doc.text('Authorized Signature: _______________________', pageW - 14, fy, { align: 'right' });

    doc.save('Monthly_Summary_' + month + '.pdf');
    showToast('Monthly summary PDF downloaded!', 'info');
  },
};

// ─── HTML escape helper ────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Boot ──────────────────────────────────────────────────────────────────────

window.app = app;
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await app.init();
  } catch (err) {
    console.error('App initialization failed:', err);
    showToast('Failed to initialize app.', 'error');
  }
});
