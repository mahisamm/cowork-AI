import { annualAllowance, departments, leaveDays, offsetDay, organization, today } from './db.mjs'

export const leads = user => user.role === 'admin' || user.role === 'hr'
export const scoped = (user, employee) => leads(user) || employee.id === user.id || (user.role === 'manager' && employee.manager_id === user.id)
export const canReview = (user, employee) => employee.id !== user.id && scoped(user, employee)
export const canManage = (user, role) => user.role === 'admin' || (user.role === 'hr' && ['employee', 'manager'].includes(role))

export async function annualUsed(db, employeeId, year, includePending = false) {
  const requests = (await db.all(`
    SELECT start_date,end_date FROM leave_requests
    WHERE employee_id=$1 AND type='Annual' AND (status='Approved' OR ($2 AND status='Pending'))
      AND start_date<=$3 AND end_date>=$4
  `, [employeeId, includePending, year + '-12-31', year + '-01-01']))
  return requests.reduce((sum, item) => sum + leaveDays(
    item.start_date < year + '-01-01' ? year + '-01-01' : item.start_date,
    item.end_date > year + '-12-31' ? year + '-12-31' : item.end_date,
  ), 0)
}

export async function snapshot(db, user) {
  const day = today()
  const directory = (await db.all('SELECT id,name,email,title,department,role,manager_id,joined_on FROM employees ORDER BY name', []))
  const byId = new Map(directory.map(person => [person.id, person]))
  const people = directory.filter(person => scoped(user, person))
  const since = offsetDay(day, -29)
  const records = (await db.all(`
    SELECT id,employee_id,day,clock_in,clock_out FROM attendance
    WHERE day>=$1 OR clock_out IS NULL ORDER BY day DESC,clock_in DESC,id DESC
  `, [since])).filter(record => scoped(user, byId.get(record.employee_id)))
    .map(record => ({ ...record, name: byId.get(record.employee_id).name }))
  const leaves = (await db.all(`
    SELECT id,employee_id,type,start_date,end_date,reason,status,submitted_at,reviewed_at,reviewer_id
    FROM leave_requests ORDER BY submitted_at DESC,id DESC
  `, [])).filter(item => scoped(user, byId.get(item.employee_id)))
    .map(item => ({
      ...item, name: byId.get(item.employee_id).name, days: leaveDays(item.start_date, item.end_date),
      reviewer: byId.get(item.reviewer_id)?.name ?? null,
      reviewable: item.status === 'Pending' && canReview(user, byId.get(item.employee_id)),
    }))
  const shiftsToday = records.filter(record => record.day === day)
  const pending = leaves.filter(item => item.status === 'Pending')
  const outToday = new Set(leaves.filter(item => item.status === 'Approved' && item.start_date <= day && item.end_date >= day)
    .map(item => item.employee_id))
  const series = Array.from({ length: 7 }, (_, index) => {
    const date = offsetDay(day, index - 6)
    return { date, count: records.filter(record => record.day === date).length }
  })
  const activity = [
    ...records.flatMap(record => [
      { id: 'in-' + record.id, name: record.name, detail: 'checked in', at: record.clock_in, kind: 'attendance' },
      ...(record.clock_out ? [{ id: 'out-' + record.id, name: record.name, detail: 'checked out', at: record.clock_out, kind: 'attendance' }] : []),
    ]),
    ...leaves.flatMap(item => [
      { id: 'leave-' + item.id, name: item.name, detail: 'requested ' + item.type.toLowerCase() + ' leave', at: item.submitted_at, kind: 'leave' },
      ...(item.reviewed_at ? [{ id: 'review-' + item.id, name: item.name, detail: '· leave ' + item.status.toLowerCase(), at: item.reviewed_at, kind: 'review' }] : []),
    ]),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6)
  return {
    organization, departments, user: byId.get(user.id), day, directory, attendance: records, leaves, activity, series,
    shift: records.find(record => record.employee_id === user.id && !record.clock_out)
      ?? shiftsToday.find(record => record.employee_id === user.id) ?? null,
    metrics: {
      people: people.length, attended: shiftsToday.length, checkedIn: shiftsToday.filter(record => !record.clock_out).length,
      pending: pending.length, reviewable: pending.filter(item => item.reviewable).length, out: outToday.size,
      annualRemaining: annualAllowance - await annualUsed(db, user.id, day.slice(0, 4)), annualAllowance,
    },
  }
}

