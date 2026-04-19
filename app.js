/* app.js — Garment EMS */
'use strict';

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'garmentEMS_v1';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { companyName: 'Garment Factory Ltd.', employees: [], salaryRecords: [] };
    return JSON.parse(raw);
  } catch (e) {
    return { companyName: 'Garment Factory Ltd.', employees: [], salaryRecords: [] };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ─── Salary Calculation ────────────────────────────────────────────────────────

function calcSalary(basic, otHours, bonus, deductions, advance) {
  const otAmount = otHours * (basic * 0.5 / 100);
  const total    = basic + otAmount + bonus - deductions - advance;
  return { otAmount, total };
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

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function initials(name) {
  return (name || '').split(' ').filter(n => n).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function showToast(msg, type = 'success') {
  const t  = document.getElementById('toast');
  const tm = document.getElementById('toastMessage');
  tm.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// Compress & resize image to ≤200px for localStorage friendliness
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
  _photo: null,
  _editEmpId: null,

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  init() {
    document.getElementById('currentDate').textContent =
      new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('se-month').value      = thisMonth;
    document.getElementById('summary-month').value = thisMonth;

    // Company name
    const data = loadData();
    document.getElementById('companyNameInput').value = data.companyName || 'Garment Factory Ltd.';
    document.getElementById('companyNameInput').addEventListener('change', e => {
      const d = loadData();
      d.companyName = e.target.value.trim() || 'Garment Factory Ltd.';
      saveData(d);
    });

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
      }
    });

    this.navigateTo('dashboard');
  },

  navigateTo(view) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`view-${view}`);
    if (el) el.classList.add('active');

    const titles = {
      dashboard: 'Dashboard', employees: 'Employees',
      'salary-entry': 'Salary Entry', history: 'History', 'monthly-summary': 'Monthly Summary'
    };
    document.getElementById('pageTitle').textContent = titles[view] || view;

    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');

    if (view === 'dashboard')       this.renderDashboard();
    if (view === 'employees')       this.renderEmployees();
    if (view === 'salary-entry')    this.loadSalaryEntrySelects();
    if (view === 'history')         this.renderHistory();
    if (view === 'monthly-summary') { /* user clicks Load */ }
  },

  // ── Dashboard ──────────────────────────────────────────────────────────────

  renderDashboard() {
    const data = loadData();
    const now  = new Date();
    const tm   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const recs = data.salaryRecords.filter(r => r.month === tm);

    document.getElementById('stat-total-employees').textContent   = data.employees.length;
    document.getElementById('stat-this-month-payroll').textContent = fmt(recs.reduce((s, r) => s + r.totalSalary, 0));
    document.getElementById('stat-ot-hours').textContent           = recs.reduce((s, r) => s + r.otHours, 0);
    document.getElementById('stat-salary-records').textContent     = data.salaryRecords.length;

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
        </div>
        <div class="emp-card-footer">
          <button class="btn btn-sm btn-primary" onclick="app.openSalaryEntry('${esc(emp.id)}')">
            <i class="fas fa-calculator"></i> Add Salary
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

  saveEmployee(evt) {
    evt.preventDefault();
    const data   = loadData();
    const name   = document.getElementById('emp-name').value.trim();
    const id     = document.getElementById('emp-id').value.trim();
    const basic  = parseFloat(document.getElementById('emp-basic').value) || 0;
    const dept   = document.getElementById('emp-department').value.trim();
    const editId = document.getElementById('emp-edit-id').value;

    if (data.employees.some(e => e.id === id && e.id !== editId)) {
      showToast('Employee ID already exists!', 'error');
      document.getElementById('emp-id').focus();
      return;
    }

    if (editId) {
      const idx = data.employees.findIndex(e => e.id === editId);
      if (idx !== -1) {
        data.employees[idx] = { ...data.employees[idx], name, id, basicSalary: basic, department: dept, photo: this._photo };
        // update employeeId in records if ID changed
        if (editId !== id) {
          data.salaryRecords.forEach(r => { if (r.employeeId === editId) r.employeeId = id; });
        }
      }
      showToast('Employee updated!');
    } else {
      data.employees.push({ name, id, basicSalary: basic, department: dept, photo: this._photo, createdAt: Date.now() });
      showToast('Employee added!');
    }

    saveData(data);
    this.closeEmployeeModal();
    this.renderEmployees();
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

  deleteEmployee(id) {
    const data = loadData();
    data.employees     = data.employees.filter(e => e.id !== id);
    data.salaryRecords = data.salaryRecords.filter(r => r.employeeId !== id);
    saveData(data);
    this.closeConfirmModal();
    this.renderEmployees();
    showToast('Employee deleted!');
  },

  closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('show');
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

    // Populate history filter too (pre-load for when user navigates)
    this._populateHistoryFilters(data);
  },

  onEmployeeSelect() {
    const data  = loadData();
    const empId = document.getElementById('se-employee').value;
    const emp   = data.employees.find(e => e.id === empId);
    document.getElementById('se-basic').value = emp ? emp.basicSalary : '';
    this.calcPreview();
  },

  calcPreview() {
    const basic      = parseFloat(document.getElementById('se-basic').value)      || 0;
    const otHours    = parseFloat(document.getElementById('se-ot-hours').value)   || 0;
    const bonus      = parseFloat(document.getElementById('se-bonus').value)      || 0;
    const deductions = parseFloat(document.getElementById('se-deductions').value) || 0;
    const advance    = parseFloat(document.getElementById('se-advance').value)    || 0;

    const { otAmount, total } = calcSalary(basic, otHours, bonus, deductions, advance);

    document.getElementById('prev-basic').textContent      = fmt(basic);
    document.getElementById('prev-ot').textContent         = fmt(otAmount);
    document.getElementById('prev-bonus').textContent      = fmt(bonus);
    document.getElementById('prev-deductions').textContent = fmt(deductions);
    document.getElementById('prev-advance').textContent    = fmt(advance);
    document.getElementById('prev-total').textContent      = fmt(total);
  },

  saveSalaryEntry(evt) {
    evt.preventDefault();
    const data       = loadData();
    const empId      = document.getElementById('se-employee').value;
    const month      = document.getElementById('se-month').value;
    const basic      = parseFloat(document.getElementById('se-basic').value)      || 0;
    const otHours    = parseFloat(document.getElementById('se-ot-hours').value)   || 0;
    const bonus      = parseFloat(document.getElementById('se-bonus').value)      || 0;
    const deductions = parseFloat(document.getElementById('se-deductions').value) || 0;
    const advance    = parseFloat(document.getElementById('se-advance').value)    || 0;

    if (!empId || !month) { showToast('Select employee and month!', 'error'); return; }

    const { otAmount, total } = calcSalary(basic, otHours, bonus, deductions, advance);
    const existIdx = data.salaryRecords.findIndex(r => r.employeeId === empId && r.month === month);

    const record = {
      id:          existIdx !== -1 ? data.salaryRecords[existIdx].id : uid(),
      employeeId:  empId,
      month,
      basicSalary: basic,
      otHours,
      otAmount,
      bonus,
      deductions,
      advance,
      totalSalary: total,
      createdAt:   Date.now(),
    };

    if (existIdx !== -1) {
      data.salaryRecords[existIdx] = record;
      showToast('Record updated!');
    } else {
      data.salaryRecords.push(record);
      showToast('Record saved!');
    }

    saveData(data);
    this.resetSalaryForm();
  },

  resetSalaryForm() {
    const zeroFields = ['se-ot-hours', 'se-bonus', 'se-deductions', 'se-advance'];
    document.getElementById('se-employee').value = '';
    document.getElementById('se-basic').value    = '';
    zeroFields.forEach(id => { document.getElementById(id).value = '0'; });
    this.calcPreview();
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
      tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No records found</td></tr>';
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

  deleteRecord(id) {
    const data = loadData();
    data.salaryRecords = data.salaryRecords.filter(r => r.id !== id);
    saveData(data);
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
      tbody.innerHTML = `<tr><td colspan="11" class="empty-state">No records for ${esc(fmtMonth(month))}</td></tr>`;
      tfoot.innerHTML = '';
      return;
    }

    let totBasic = 0, totOtHrs = 0, totOtAmt = 0, totBonus = 0, totDed = 0, totAdv = 0, totNet = 0;

    tbody.innerHTML = records.map((r, i) => {
      const emp = data.employees.find(e => e.id === r.employeeId);
      totBasic  += r.basicSalary;
      totOtHrs  += r.otHours;
      totOtAmt  += r.otAmount;
      totBonus  += r.bonus;
      totDed    += r.deductions;
      totAdv    += r.advance;
      totNet    += r.totalSalary;

      return `<tr>
        <td>${i + 1}</td>
        <td>${emp ? esc(emp.name) : 'Unknown'}</td>
        <td>${esc(r.employeeId)}</td>
        <td>${fmt(r.basicSalary)}</td>
        <td>${r.otHours}</td>
        <td>${fmt(r.otAmount)}</td>
        <td>${fmt(r.bonus)}</td>
        <td>${fmt(r.deductions)}</td>
        <td>${fmt(r.advance)}</td>
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
      <td><strong>${fmt(totDed)}</strong></td>
      <td><strong>${fmt(totAdv)}</strong></td>
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
    if (!emp) { showToast('Employee not found!', 'error'); return; }

    const { jsPDF } = window.jspdf;
    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 0;

    // ── Header banner
    doc.setFillColor(26, 60, 107);
    doc.rect(0, 0, pageW, 38, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(data.companyName || 'GARMENT FACTORY LTD.', pageW / 2, 13, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('EMPLOYEE SALARY SLIP', pageW / 2, 22, { align: 'center' });

    doc.setFontSize(9);
    doc.text(fmtMonth(record.month), pageW / 2, 30, { align: 'center' });

    y = 44;

    // ── Employee photo (if available)
    const photoX = margin;
    if (emp.photo) {
      try {
        doc.addImage(emp.photo, 'JPEG', photoX, y, 22, 22);
      } catch (e) { /* ignore */ }
    }

    // ── Employee details box
    const detailX = emp.photo ? photoX + 26 : photoX;
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(margin, y, pageW - margin * 2, 30, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const labelX  = detailX + 2;
    const valueX  = detailX + 32;
    const label2X = pageW / 2 + 5;
    const value2X = pageW / 2 + 32;

    const rows = [
      ['Name:',        emp.name,                 'Pay Period:', fmtMonth(record.month)],
      ['Employee ID:', emp.id,                   'Department:', emp.department || 'N/A'],
      ['Basic Salary:',`BDT ${fmtPDF(record.basicSalary)}`, '', ''],
    ];
    rows.forEach((row, i) => {
      const ry = y + 7 + i * 8;
      doc.setFont('helvetica', 'bold'); doc.text(row[0], labelX, ry);
      doc.setFont('helvetica', 'normal'); doc.text(row[1], valueX, ry);
      if (row[2]) { doc.setFont('helvetica', 'bold'); doc.text(row[2], label2X, ry); }
      if (row[3]) { doc.setFont('helvetica', 'normal'); doc.text(row[3], value2X, ry); }
    });

    y += 36;

    // ── Earnings / Deductions side-by-side
    const gross    = record.basicSalary + record.otAmount + record.bonus;
    const totalDed = record.deductions + record.advance;
    const halfW    = (pageW - margin * 2 - 4) / 2;

    doc.autoTable({
      startY: y,
      head:   [['EARNINGS', 'Amount (BDT)']],
      body:   [
        ['Basic Salary',                            fmtPDF(record.basicSalary)],
        [`Overtime (${record.otHours} hrs)`,        fmtPDF(record.otAmount)],
        ['Bonus',                                   fmtPDF(record.bonus)],
        ['Gross Earnings',                          fmtPDF(gross)],
      ],
      theme:       'grid',
      headStyles:  { fillColor: [26, 60, 107], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles:      { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' } },
      margin:      { left: margin, right: pageW / 2 + 2 },
    });

    const earningsY = doc.lastAutoTable.finalY;

    doc.autoTable({
      startY: y,
      head:   [['DEDUCTIONS', 'Amount (BDT)']],
      body:   [
        ['General Deductions', fmtPDF(record.deductions)],
        ['Advance',            fmtPDF(record.advance)],
        ['Total Deductions',   fmtPDF(totalDed)],
      ],
      theme:       'grid',
      headStyles:  { fillColor: [180, 50, 50], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles:      { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' } },
      margin:      { left: pageW / 2 + 2, right: margin },
    });

    y = Math.max(earningsY, doc.lastAutoTable.finalY) + 5;

    // ── Net Pay banner
    doc.setFillColor(26, 60, 107);
    doc.rect(margin, y, pageW - margin * 2, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('NET PAY:', margin + 5, y + 9);
    doc.text(`BDT ${fmtPDF(record.totalSalary)}`, pageW - margin - 5, y + 9, { align: 'right' });

    y += 22;

    // ── Signature line
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Employee Signature: _______________________', margin, y);
    doc.text('Authorized Signature: _______________________', pageW - margin, y, { align: 'right' });

    y += 6;
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text('This is a system-generated document.', pageW / 2, y, { align: 'center' });

    // ── Footer
    doc.setFillColor(240, 240, 240);
    doc.rect(0, 283, pageW, 14, 'F');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated on ${new Date().toLocaleDateString()} | ${data.companyName}`, pageW / 2, 291, { align: 'center' });

    doc.save(`Salary_Slip_${emp.name.replace(/\s+/g, '_')}_${record.month}.pdf`);
    showToast('Salary slip downloaded!');
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

    // ── Header
    doc.setFillColor(26, 60, 107);
    doc.rect(0, 0, pageW, 32, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(data.companyName || 'GARMENT FACTORY LTD.', pageW / 2, 11, { align: 'center' });

    doc.setFontSize(11);
    doc.text('MONTHLY SALARY SUMMARY SHEET', pageW / 2, 20, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(fmtMonth(month), pageW / 2, 28, { align: 'center' });

    let totBasic = 0, totOtHrs = 0, totOtAmt = 0, totBonus = 0, totDed = 0, totAdv = 0, totNet = 0;

    const tableRows = records.map((r, i) => {
      const emp = data.employees.find(e => e.id === r.employeeId);
      totBasic  += r.basicSalary;
      totOtHrs  += r.otHours;
      totOtAmt  += r.otAmount;
      totBonus  += r.bonus;
      totDed    += r.deductions;
      totAdv    += r.advance;
      totNet    += r.totalSalary;

      return [
        i + 1,
        emp ? emp.name : 'Unknown',
        r.employeeId,
        fmtPDF(r.basicSalary),
        r.otHours,
        fmtPDF(r.otAmount),
        fmtPDF(r.bonus),
        fmtPDF(r.deductions),
        fmtPDF(r.advance),
        fmtPDF(r.totalSalary),
      ];
    });

    // Totals row (appended at the end via didParseCell)
    const totalRow = [
      '', 'TOTAL', '',
      fmtPDF(totBasic), totOtHrs, fmtPDF(totOtAmt),
      fmtPDF(totBonus), fmtPDF(totDed), fmtPDF(totAdv), fmtPDF(totNet),
    ];
    tableRows.push(totalRow);

    doc.autoTable({
      startY: 38,
      head:   [['#', 'Employee Name', 'ID', 'Basic (BDT)', 'OT Hrs', 'OT Amt (BDT)', 'Bonus (BDT)', 'Deductions (BDT)', 'Advance (BDT)', 'Net Salary (BDT)']],
      body:   tableRows,
      theme:  'grid',
      headStyles:  { fillColor: [26, 60, 107], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      styles:      { fontSize: 8, cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 8,  halign: 'center' },
        1: { cellWidth: 45 },
        2: { cellWidth: 20, halign: 'center' },
        3: { halign: 'right' },
        4: { cellWidth: 14, halign: 'center' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell(hook) {
        if (hook.row.index === tableRows.length - 1) {
          hook.cell.styles.fillColor  = [220, 235, 255];
          hook.cell.styles.fontStyle  = 'bold';
          hook.cell.styles.fontSize   = 9;
        }
      },
    });

    const fy = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Total Employees: ${records.length}  |  Generated: ${new Date().toLocaleDateString()}`, 14, fy);
    doc.text('Authorized Signature: _______________________', pageW - 14, fy, { align: 'right' });

    doc.save(`Monthly_Summary_${month}.pdf`);
    showToast('Monthly summary PDF downloaded!');
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

document.addEventListener('DOMContentLoaded', () => app.init());
