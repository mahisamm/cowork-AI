import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { openDatabase, initialize } from './postgres.mjs'
export const organization = { name: 'Northstar Studio', timezone: 'Asia/Kolkata' }
export const departments = ['Design', 'Engineering', 'Operations', 'People', 'Product']
export const demoPassword = 'PeopleOps2026!'
export const roles = ['admin', 'hr', 'manager', 'employee']
export const annualAllowance = 20

const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: organization.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
const derive = promisify(scrypt)
export const today = () => businessDate.format(new Date())
export const offsetDay = (date, offset) => new Date(Date.parse(date) + offset * 86400000).toISOString().slice(0, 10)
export const leaveDays = (start, end) => (Date.parse(end) - Date.parse(start)) / 86400000 + 1

export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex')
  return salt + ':' + (await derive(password, salt, 64)).toString('hex')
}

export async function checkPassword(password, hash) {
  const [salt, key] = String(hash ?? '').split(':')
  const expected = Buffer.from(key ?? '', 'hex')
  if (!salt || expected.length !== 64) return false
  return timingSafeEqual(await derive(password, salt, 64), expected)
}


export async function connect(options = {}) {
  const db = openDatabase(options)
  try {
    await initialize(db, options.seed === false ? null : seed)
    return db
  } catch (error) {
    await db.close()
    throw error
  }
}
async function seed(db) {
  const people = [
    ['Anika Rao', 'admin', 'Workspace Administrator', 'Operations', 'admin', null],
    ['Priya Mehta', 'hr', 'People Operations Lead', 'People', 'hr', null],
    ['Jordan Lee', 'manager', 'Design Lead', 'Design', 'manager', null],
    ['Maya Patel', 'employee', 'Product Designer', 'Design', 'employee', 3],
    ['Elena Garcia', 'elena', 'Product Manager', 'Product', 'manager', null],
    ['Leo Chen', 'leo', 'Design Engineer', 'Design', 'employee', 3],
    ['Nia Williams', 'nia', 'UX Researcher', 'Design', 'employee', 3],
    ['Omar Ali', 'omar', 'Software Engineer', 'Engineering', 'employee', null],
    ['Sofia Cruz', 'sofia', 'Product Analyst', 'Product', 'employee', 5],
    ['Aarav Shah', 'aarav', 'Engineering Lead', 'Engineering', 'manager', null],
    ['Samira Das', 'samira', 'Software Engineer', 'Engineering', 'employee', 10],
    ['Noah Kim', 'noah', 'Operations Coordinator', 'Operations', 'employee', null],
  ]
  const date = today()
  const insertPerson = 'INSERT INTO employees(name,email,title,department,role,manager_id,joined_on,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)'
  for (const [index, [name, email, title, department, role, manager]] of people.entries()) {
    const salt = randomBytes(16).toString('hex')
    const password = index < 4 ? demoPassword : randomBytes(32).toString('hex')
    await db.query(insertPerson, [name, email + '@northstar.demo', title, department, role, manager, offsetDay(date, -160 + index * 7), salt + ':' + scryptSync(password, salt, 64).toString('hex')])
  }
  const insertShift = 'INSERT INTO attendance(employee_id,day,clock_in,clock_out) VALUES ($1,$2,$3,$4)'
  for (let age = 6; age >= 1; age--) {
    const day = offsetDay(date, -age)
    const count = [0, 9, 10, 7, 11, 8, 10][age]
    for (let id = 1; id <= count; id++) {
      await db.query(insertShift, [id, day, day + 'T03:30:00.000Z', day + 'T11:30:00.000Z'])
    }
  }
  const now = new Date().toISOString()
  for (const id of [2, 5, 6, 8, 9, 10, 12]) await db.query(insertShift, [id, date, now, null])

  const insertLeave = `
    INSERT INTO leave_requests(employee_id,type,start_date,end_date,reason,status,submitted_at,reviewer_id,reviewed_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  `
  await db.query(insertLeave, [6, 'Annual', offsetDay(date, 3), offsetDay(date, 4), 'Family travel', 'Pending', now, null, null])
  await db.query(insertLeave, [7, 'Personal', offsetDay(date, 6), offsetDay(date, 6), 'Personal appointment', 'Pending', now, null, null])
  await db.query(insertLeave, [9, 'Annual', offsetDay(date, 8), offsetDay(date, 10), 'Visiting family', 'Pending', now, null, null])
  await db.query(insertLeave, [11, 'Personal', date, date, 'Personal commitment', 'Approved', now, 10, now])
  const past = offsetDay(date, -10)
  await db.query(insertLeave, [4, 'Annual', past, past, 'Family event', 'Approved', past + 'T07:00:00.000Z', 3, past + 'T08:00:00.000Z'])
}

