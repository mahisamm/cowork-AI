# PeopleOps AI

A local HR workspace for Northstar Studio, with a React frontend, Express API, and PostgreSQL storage.

## Start on this computer

Requires Node.js 22.16 or newer and the installed PostgreSQL 16 binaries.

```powershell
npm.cmd ci
npm.cmd run db:start
npm.cmd run dev
```

The frontend opens at http://127.0.0.1:5173. The API runs at http://127.0.0.1:4310.
The database runs at 127.0.0.1:5433 with database name peopleops.

`db:start` creates a dedicated cluster under `data/postgres` on its first run.
It configures loopback access and SCRAM password authentication, creates a dedicated application role, and writes the connection URL to the ignored `.env` file.
Later runs reuse the existing database. Set `PG_BIN` to use a different PostgreSQL installation.
`npm.cmd run db:status` checks this cluster. `npm.cmd run db:stop` stops it.

For an existing PostgreSQL database, set `DATABASE_URL` in the environment or project `.env` and start the app.
Tables are initialized transactionally. Demo data is inserted only when the employee table is empty.

To serve a built copy through Express, run `npm.cmd run build` followed by `npm.cmd start`, then open http://127.0.0.1:4173.
`PEOPLEOPS_PORT` changes that Express port.

## Demo sign-in

All four accounts use `PeopleOps2026!`. The login cards fill in these credentials.

| Role | Email | Access |
| --- | --- | --- |
| Admin | admin@northstar.demo | Organization records and management of all account roles |
| HR | hr@northstar.demo | Organization records and management of Employee and Manager profiles |
| Manager | manager@northstar.demo | Own records and direct reports, with leave decisions for direct reports |
| Employee | employee@northstar.demo | Own attendance and leave |

Everyone can view the basic employee directory. Reviewers cannot approve their own requests.
Use separate browser profiles or a private window to demonstrate different roles simultaneously.

## Workflows

**My tasks** is available to every role. Open it from the sidebar, dashboard, or Spotlight. Add a title, optional due date and notes, and a priority. The Due & overdue filter surfaces open tasks that need attention. Complete or reopen items and track progress. Task records and live updates are scoped to the signed-in account.

1. Sign in as Employee and check in. A Manager or HR session receives a live update.
2. Check out and confirm the shift becomes Completed.
3. Submit annual leave. Approve it as Manager and watch the employee's status and balance update.
4. Create and edit an employee as Admin or HR, then sign in with the initial password.

Attendance uses India time. Annual leave has a 20-calendar-day demo allowance per year.
Pending requests reserve days during validation. The displayed balance deducts approved requests.
Account roles are assigned at creation.

## Data and connections

PostgreSQL stores employees, salted scrypt password hashes, session token hashes, attendance, and leave requests.
The browser uses an HttpOnly SameSite cookie. Requests use parameterized SQL and a bounded connection pool.
Writes requiring several checks use one transaction and one connection.
Employee locks serialize leave requests. Unique indexes prevent duplicate attendance.
A shared hierarchy lock prevents concurrent manager edits from creating reporting cycles.
Dashboard snapshots use a consistent read transaction.

The API health endpoint is `/api/health`. It checks a real database query and returns HTTP 503 when the database is unavailable.
The pool reconnects after PostgreSQL returns. Server-sent events refresh connected sessions after changes.
Clients also refresh every 15 seconds, including when separate API processes serve the same database.

## SQLite migration

The active demo data was migrated to PostgreSQL. The earlier SQLite files remain available for rollback.
To import another existing database, stop its writers and use an empty PostgreSQL destination.

```powershell
npm.cmd run db:import -- "C:\path\to\peopleops.sqlite"
```

The importer reads a consistent SQLite snapshot, copies all four tables, restores reporting relationships and sequences,
and compares every value before committing. Repeating the identical import succeeds without adding duplicates.
It refuses to overwrite a populated destination. Use a separate PostgreSQL database to import a different snapshot.

## Verification

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

API and browser tests use unique PostgreSQL schemas and remove only their own test schemas afterward.
They cover role access, session expiry, persistence, concurrent writes, leave limits, manager cycles,
malformed input, and desktop/mobile employee workflows.
Browser tests use Microsoft Edge by default. Set `PEOPLEOPS_BROWSER=chrome` for Chrome.

The 3D scene loads separately from the application interface. Reduced-motion preferences are respected,
and a static background is used if WebGL is unavailable.
