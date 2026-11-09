import express from 'express'
import helmet from 'helmet'
import { auth } from './auth.mjs'
import { annualAllowance, departments, leaveDays, passwordHash, roles, today } from './db.mjs'
import { annualUsed, canManage, canReview, leads, snapshot } from './workspace.mjs'

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !value.startsWith('0000-') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const text = (value, max) => typeof value === 'string' && value.trim().length <= max ? value.trim() : ''
const fail = (res, status, error) => res.status(status).json({ error })
const problem = (status, message) => Object.assign(new Error(message), { status })
const validId = value => Number.isInteger(value) && value > 0 && value <= 2147483647

function taskFields(input) {
  const title = text(input?.title, 120)
  const { notes = '', dueOn = null, priority = 'normal' } = input ?? {}
  if (!title || title.includes('\0') || typeof notes !== 'string' || notes.length > 1000 || notes.includes('\0')
    || (dueOn !== null && !validDate(dueOn)) || !['low', 'normal', 'high'].includes(priority)) {
    throw problem(400, 'Enter a task title, valid due date and priority, and up to 1,000 characters of notes.')
  }
  return [title, notes.trim(), dueOn, priority]
}

async function profile(db, input, employeeId) {
  const name = text(input?.name, 90)
  const title = text(input?.title, 90)
  const email = text(input?.email, 150).toLowerCase()
  const department = input?.department
  const manager = input?.managerId ?? null
  if (!name || !title || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !departments.includes(department)) return null
  if (manager !== null && (!validId(manager) || manager === employeeId)) return null
  let parent = manager === null ? null : await db.one('SELECT id,role,manager_id FROM employees WHERE id=$1', [manager])
  if (manager !== null && parent?.role !== 'manager') return null
  const seen = new Set()
  while (parent) {
    if (parent.id === employeeId || seen.has(parent.id)) return null
    seen.add(parent.id)
    parent = parent.manager_id === null ? null : await db.one('SELECT id,manager_id FROM employees WHERE id=$1', [parent.manager_id])
  }
  return [name, email, title, department, manager]
}

export function createApp(db, assets) {
  const app = express()
  const sessions = auth(db)
  const streams = new Set()
  // Events contain no employee data. Every client reloads its authorized snapshot.
  const push = employeeId => {
    for (const stream of streams) {
      if (!stream.res.destroyed && (employeeId === undefined || employeeId === stream.employeeId)) {
        stream.res.write('event: refresh\ndata: {}\n\n')
      }
    }
  }
  app.disable('x-powered-by')
  app.use(helmet({ strictTransportSecurity: false, contentSecurityPolicy: { directives: { upgradeInsecureRequests: null, styleSrc: ["'self'", "'unsafe-inline'"] } } }))
  app.use((req, res, next) => {
    if (!['127.0.0.1', 'localhost'].includes(req.hostname)) return fail(res, 403, 'Use the local workspace address.')
    next()
  })
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (!['GET', 'HEAD'].includes(req.method)) {
      const origin = req.get('origin')
      if (req.get('x-peopleops') !== '1' || (origin && origin !== 'http://' + req.get('host'))) {
        return fail(res, 403, 'This request must come from the local workspace.')
      }
    }
    next()
  }, express.json({ limit: '12kb' }))

  app.get('/api/health', async (_req, res) => {
    try {
      await db.query('SELECT 1 FROM employees LIMIT 1')
      res.json({ ok: true, database: 'postgresql', connected: true })
    } catch { res.status(503).json({ ok: false, database: 'postgresql', connected: false }) }
  })
  app.post('/api/login', sessions.login)
  app.post('/api/logout', async (req, res) => {
    await sessions.logout(req, res)
    push()
  })
  app.use('/api', async (req, res, next) => {
    req.user = await sessions.identify(req)
    if (!req.user) return fail(res, 401, 'Sign in to continue.')
    next()
  })
  app.get('/api/workspace', async (req, res) => {
    res.json(await db.transaction(tx => snapshot(tx, req.user), 'REPEATABLE READ READ ONLY'))
  })
  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' })
    res.flushHeaders()
    res.write('retry: 2000\nevent: ready\ndata: {}\n\n')
    const stream = { res, employeeId: req.user.id }
    streams.add(stream)
    const timer = setInterval(async () => {
      try {
        if (!await sessions.identify(req)) res.end()
        else if (!res.destroyed) res.write('event: heartbeat\ndata: ' + JSON.stringify({ day: today() }) + '\n\n')
      } catch { res.end() }
    }, 15000)
    res.on('close', () => { clearInterval(timer); streams.delete(stream) })
  })
  app.post('/api/tasks', async (req, res) => {
    const task = await db.one(`
      INSERT INTO personal_tasks (title,notes,due_on,priority,employee_id)
      VALUES ($1,$2,$3,$4,$5) RETURNING id
    `, [...taskFields(req.body), req.user.id])
    push(req.user.id)
    res.status(201).json(task)
  })
  app.patch('/api/tasks/:id', async (req, res) => {
    const id = Number(req.params.id)
    if (!validId(id)) return fail(res, 400, 'Choose a valid task.')
    let result
    if (Object.hasOwn(req.body ?? {}, 'completed')) {
      if (typeof req.body.completed !== 'boolean') return fail(res, 400, 'Choose a valid task status.')
      result = await db.query('UPDATE personal_tasks SET completed=$1 WHERE id=$2 AND employee_id=$3',
        [req.body.completed, id, req.user.id])
    } else {
      result = await db.query('UPDATE personal_tasks SET title=$1,notes=$2,due_on=$3,priority=$4 WHERE id=$5 AND employee_id=$6',
        [...taskFields(req.body), id, req.user.id])
    }
    if (!result.rowCount) return fail(res, 404, 'Task not found.')
    push(req.user.id)
    res.json({ ok: true })
  })
  app.delete('/api/tasks/:id', async (req, res) => {
    const id = Number(req.params.id)
    if (!validId(id)) return fail(res, 400, 'Choose a valid task.')
    const result = await db.query('DELETE FROM personal_tasks WHERE id=$1 AND employee_id=$2', [id, req.user.id])
    if (!result.rowCount) return fail(res, 404, 'Task not found.')
    push(req.user.id)
    res.json({ ok: true })
  })
  app.post('/api/attendance/:action', async (req, res) => {
    const id = req.user.id
    const now = new Date().toISOString()
    let change
    if (req.params.action === 'check-in') {
      change = await db.query('INSERT INTO attendance(employee_id,day,clock_in) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, today(), now])
      if (!change.rowCount) return fail(res, 409, 'You already have a shift today or an open shift.')
    } else if (req.params.action === 'check-out') {
      change = await db.query('UPDATE attendance SET clock_out=$1 WHERE employee_id=$2 AND clock_out IS NULL', [now, id])
      if (!change.rowCount) return fail(res, 409, 'Check in before checking out.')
    } else return fail(res, 404, 'Attendance action not found.')
    push()
    res.json({ ok: true })
  })
  app.post('/api/leave', async (req, res) => {
    const { type, start, end } = req.body ?? {}
    const reason = text(req.body?.reason, 500)
    if (!['Annual', 'Sick', 'Personal'].includes(type) || !validDate(start) || !validDate(end)
      || start < today() || start > end || leaveDays(start, end) > 60 || !reason) {
      return fail(res, 400, 'Choose a valid leave type, dates from today onward (up to 60 days), and a reason.')
    }
    if (type === 'Annual' && start.slice(0, 4) !== end.slice(0, 4)) return fail(res, 400, 'Submit separate annual requests for each calendar year.')
    await db.transaction(async tx => {
      // Serialize requests per employee so overlap and allowance checks remain atomic.
      await tx.query('SELECT id FROM employees WHERE id=$1 FOR UPDATE', [req.user.id])
      const overlap = await tx.one("SELECT id FROM leave_requests WHERE employee_id=$1 AND status IN ('Pending','Approved') AND start_date<=$2 AND end_date>=$3", [req.user.id, end, start])
      if (overlap) throw problem(409, 'A pending or approved request already covers those dates.')
      if (type === 'Annual' && await annualUsed(tx, req.user.id, start.slice(0, 4), true) + leaveDays(start, end) > annualAllowance) {
        throw problem(409, 'This request exceeds your annual leave allowance, including pending requests.')
      }
      await tx.query('INSERT INTO leave_requests(employee_id,type,start_date,end_date,reason,submitted_at) VALUES ($1,$2,$3,$4,$5,$6)', [req.user.id, type, start, end, reason, new Date().toISOString()])
    })
    push()
    res.status(201).json({ ok: true })
  })
  app.patch('/api/leave/:id', async (req, res) => {
    const id = Number(req.params.id)
    const { decision } = req.body ?? {}
    if (!validId(id) || !['Approved', 'Rejected'].includes(decision)) return fail(res, 400, 'Choose an approval decision.')
    await db.transaction(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(704113)')
      const employee = await tx.one('SELECT e.id,e.role,e.manager_id FROM employees e JOIN leave_requests l ON l.employee_id=e.id WHERE l.id=$1', [id])
      if (!employee || !canReview(req.user, employee)) throw problem(404, 'Reviewable request not found.')
      await tx.query('SELECT id FROM employees WHERE id=$1 FOR UPDATE', [employee.id])
      const result = await tx.query("UPDATE leave_requests SET status=$1,reviewed_at=$2,reviewer_id=$3 WHERE id=$4 AND status='Pending'", [decision, new Date().toISOString(), req.user.id, id])
      if (!result.rowCount) throw problem(409, 'This request has already been reviewed.')
    })
    push()
    res.json({ ok: true })
  })
  app.post('/api/employees', async (req, res) => {
    const { role, password } = req.body ?? {}
    if (!leads(req.user) || !canManage(req.user, role)) return fail(res, 403, 'You cannot create this role.')
    if (!roles.includes(role) || typeof password !== 'string' || password.length < 12 || password.length > 128) {
      return fail(res, 400, 'Complete the profile and use a password of 12 to 128 characters.')
    }
    const hash = await passwordHash(password)
    await db.transaction(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(704113)')
      const fields = await profile(tx, req.body)
      if (!fields) throw problem(400, 'Enter a valid profile and reporting manager.')
      const result = await tx.query('INSERT INTO employees(name,email,title,department,manager_id,role,joined_on,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(email) DO NOTHING', [...fields, role, today(), hash])
      if (!result.rowCount) throw problem(409, 'That work email is already in the directory.')
    })
    push()
    res.status(201).json({ ok: true })
  })
  app.patch('/api/employees/:id', async (req, res) => {
    if (!leads(req.user)) return fail(res, 403, 'You cannot edit employee profiles.')
    const id = Number(req.params.id)
    if (!validId(id)) return fail(res, 400, 'Choose a valid employee.')
    await db.transaction(async tx => {
      // Both sides of a simultaneous manager reassignment must use one hierarchy lock.
      await tx.query('SELECT pg_advisory_xact_lock(704113)')
      const employee = await tx.one('SELECT id,role FROM employees WHERE id=$1', [id])
      if (!employee) throw problem(404, 'Employee not found.')
      if (!canManage(req.user, employee.role)) throw problem(403, 'You cannot edit this role.')
      const fields = await profile(tx, req.body, id)
      if (!fields) throw problem(400, 'Enter a valid profile and reporting manager.')
      const duplicate = await tx.one('SELECT id FROM employees WHERE email=$1 AND id<>$2', [fields[1], id])
      if (duplicate) throw problem(409, 'That work email is already in the directory.')
      await tx.query('UPDATE employees SET name=$1,email=$2,title=$3,department=$4,manager_id=$5 WHERE id=$6', [...fields, id])
    })
    push()
    res.json({ ok: true })
  })
  app.use('/api', (_req, res) => fail(res, 404, 'This API endpoint does not exist.'))
  if (assets) {
    app.use(express.static(assets))
    app.get('/', (_req, res) => res.sendFile('index.html', { root: assets }))
  }
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error)
    if (error.type === 'entity.too.large') return fail(res, 413, 'This request is too large.')
    if (error.type === 'entity.parse.failed') return fail(res, 400, 'This request contains invalid JSON.')
    if ([400, 403, 404, 409].includes(error.status)) return fail(res, error.status, error.message)
    if (['ECONNREFUSED', 'ECONNRESET', '57P01', '57P03', '53300', '08006'].includes(error.code)) {
      return fail(res, 503, 'The database is temporarily unavailable. Try again.')
    }
    console.error('Request failed:', error.code ?? error.name)
    fail(res, 500, 'Something went wrong. Try again.')
  })
  return app
}
