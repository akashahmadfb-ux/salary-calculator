# Garment EMS — Employee Management System

A fully client-side web application for managing garment factory employee salaries.

## Features

- **Employee Profiles** — Add/edit/delete workers with photo upload, name, ID, basic salary, and department.
- **Salary Calculation** — Formula: `Total = Basic + (OT Hours × Basic × 0.5 / 100) + Bonus − Deductions − Advance`
- **Salary History** — Filterable table of all salary records per employee / per month.
- **Monthly Summary Sheet** — Table view of all workers' data for a selected month with totals row.
- **Attendance Management** — Dedicated Attendance tab for date-wise Present / Absent / Company Holiday marking for all employees.
- **Payroll Reports** — Daily / Weekly / Monthly filtering with custom date range, attendance totals, and salary totals.
- **PDF Generation** — Individual salary slip PDF per worker + a Monthly Summary Sheet PDF (landscape, table format).
- **Local Storage** — All data persists in the browser with no backend required.
- **Responsive Design** — Professional dashboard with collapsible sidebar; mobile-friendly tables.

## Usage

Open `index.html` in any modern browser — no build step or server required.

1. Set your **Company Name** in the sidebar footer (used in PDF headers).
2. Go to **Employees** → Add Employee to create worker profiles.
3. Go to **Salary Entry** → select an employee, fill OT hours / bonus / deductions, and save.
4. Go to **Attendance** → choose date/month and mark employee attendance (Present/Absent/Company Holiday).
5. Go to **Payroll Reports** → choose Daily/Weekly/Monthly, set date range, and load totals.
6. Go to **Monthly Summary** → pick a month → Load → Export PDF.
7. Individual salary slips can be downloaded from the **History** or **Monthly Summary** views.

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
