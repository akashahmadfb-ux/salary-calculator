# Garment EMS — Employee Management System

A fully client-side web application for managing garment factory employee salaries.

## Features

- **Employee Profiles** — Add/edit/delete workers with photo upload, name, ID, basic salary, and department.
- **Salary Calculation** — Formula: `Total = Basic + (OT Hours × Basic × 0.5 / 100) + Bonus − Deductions − Advance`
- **Salary History** — Filterable table of all salary records per employee / per month.
- **Monthly Summary Sheet** — Table view of all workers' data for a selected month with totals row.
- **Role-Based Login** — Admin and Worker sign-in flow (Firebase Auth-ready with placeholder config; demo fallback credentials included).
- **Attendance Management** — Dedicated Attendance tab for date-wise Present / Absent / Company Holiday plus daily In-Time / Out-Time and computed OT Hours.
- **Worker Dashboard** — Worker-only dashboard for profile view, attendance history, and daily in/out submission.
- **24-Hour Worker Edit Lock** — Workers can edit a given date only within 24 hours; admin can edit anytime.
- **Payroll Reports** — Daily / Weekly / Monthly filtering with custom date range, attendance totals, and salary totals.
- **PDF Generation** — Individual salary slip PDF per worker + a Monthly Summary Sheet PDF (landscape, table format).
- **Cloud-Ready Data Model** — Data layer prepared for Firebase Firestore (`tracs/appData` document). No LocalStorage usage.
- **Responsive Design** — Professional dashboard with collapsible sidebar; mobile-friendly tables.

## Usage

Open `index.html` in any modern browser — no build step or server required.

1. Sign in as Admin or Worker on the login page.
   - Demo admin: `admin@tracs.local` / `admin123`
   - Demo worker: `worker@tracs.local` / `worker123`
2. Set your **Company Name** in the sidebar footer (used in PDF headers).
3. Go to **Employees** → Add Employee to create worker profiles.
4. Go to **Salary Entry** → select an employee, fill OT hours / bonus / deductions, and save.
5. Go to **Attendance** → choose date/month, update status, in/out times, and OT.
6. Go to **Payroll Reports** → choose Daily/Weekly/Monthly, set date range, and load totals.
7. Go to **Monthly Summary** → pick a month → Load → Export PDF.
8. Individual salary slips can be downloaded from the **History** or **Monthly Summary** views.

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
