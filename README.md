# Garment EMS — Employee Management System

A web application for managing garment factory employee salaries using local browser storage.

## Features

- **Employee Profiles** — Add/edit/delete workers with photo upload, name, ID, basic salary, and department.
- **Salary Calculation** — Formula: `Total = Basic + (OT Hours × Basic × 0.5 / 100) + Bonus − Deductions − Advance`
- **Salary History** — Filterable table of all salary records per employee / per month.
- **Monthly Summary Sheet** — Table view of all workers' data for a selected month with totals row.
- **Attendance Management** — Dedicated Attendance tab for date-wise Present / Absent / Company Holiday marking for all employees.
- **Payroll Reports** — Daily / Weekly / Monthly filtering with custom date range, attendance totals, and salary totals.
- **PDF Generation** — Individual salary slip PDF per worker + a Monthly Summary Sheet PDF (landscape, table format).
- **Local Storage Data** — Worker profiles, attendance, salary records, and production data are saved locally in the browser.
- **Local ID/Password Login** — Admin login works fully offline with local credentials.
- **Backup & Restore** — Download backup JSON files and restore them on any device.
- **Responsive Design** — Professional dashboard with collapsible sidebar; mobile-friendly tables.

## Usage

Open `index.html` in any modern browser — no build step or server required.

1. Set your **Company Name** in the sidebar footer (used in PDF headers).
2. Sign in with your local Admin ID and password.
3. Go to **Employees** → Add Employee to create worker profiles.
4. Go to **Salary Entry** → select an employee, fill OT hours / bonus / deductions, and save.
5. Go to **Attendance** → choose date/month and mark employee attendance (Present/Absent/Company Holiday).
6. Go to **Payroll Reports** → choose Daily/Weekly/Monthly, set date range, and load totals.
7. Go to **Monthly Summary** → pick a month → Load → Export PDF.
8. Individual salary slips can be downloaded from the **History** or **Monthly Summary** views.
9. Use **Backup** and **Restore** buttons in the top bar to move data between devices.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell — sidebar, views, modals |
| `style.css`  | All styling (CSS variables, responsive grid) |
| `app.js`     | Application logic — CRUD, calculations, PDF generation |

## Dependencies (CDN, no install needed)

- [Font Awesome 6](https://fontawesome.com/) — icons
- [jsPDF 2.5](https://github.com/parallax/jsPDF) — PDF generation
- [jsPDF-AutoTable 3.8](https://github.com/simonbengtsson/jsPDF-AutoTable) — table support in PDFs
