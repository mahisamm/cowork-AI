import assert from 'node:assert/strict'
import { test } from 'node:test'
import { connect, offsetDay } from '../server/db.mjs'
import { client, testServer, testSchema } from './helpers.mjs'

test('sessions and role scopes protect employee and workforce records', async t => {
  const base = await testServer(t)
  const guest = client(base)
  assert.equal((await guest.send('/workspace')).status, 401)
  assert.equal((await guest.send('/events')).status, 401)
  assert.equal((await guest.login('admin', 'incorrect')).status, 401)
  const employee = client(base), manager = client(base), hr = client(base), admin = client(base)
  for (const [role, account] of Object.entries({ employee, manager, hr, admin })) {
    const result = await account.login(role)
    assert.equal(result.status, 200)
    assert.match(result.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/)
    const data = await account.read()
    assert.equal(data.user.role, role)
    assert.equal(data.directory.length, 12)
    assert(!JSON.stringify(data).includes('password_hash'))
    if (role === 'employee') {
      assert(data.attendance.every(row => row.employee_id === data.user.id))
      assert(data.leaves.every(row => row.employee_id === data.user.id))
    } else if (role === 'manager') {
      const visible = new Set(data.directory.filter(row => row.id === data.user.id || row.manager_id === data.user.id).map(row => row.id))
      assert(data.attendance.every(row => visible.has(row.employee_id)))
      assert(data.leaves.every(row => visible.has(row.employee_id)))
    }
  }
  assert.equal((await employee.write('/employees', {})).status, 403)
  assert.equal((await manager.write('/leave/3', { decision: 'Approved' }, 'PATCH')).status, 404)
  assert.equal((await hr.write('/employees', { role: 'admin' })).status, 403)
  assert.equal((await hr.write('/employees/1', {}, 'PATCH')).status, 403)
  assert.equal((await employee.send('/attendance/check-in', { method: 'POST', headers: { Origin: 'https://example.org' } })).status, 403)
  assert.equal((await employee.write('/logout')).status, 200)
  assert.equal((await employee.send('/workspace')).status, 401)
})

test('attendance and leave changes reach other sessions and enforce state transitions', { timeout: 12000 }, async t => {
  const base = await testServer(t)
  const employee = client(base), manager = client(base), hr = client(base)
  for (const [role, account] of Object.entries({ employee, manager, hr })) assert.equal((await account.login(role)).status, 200)
  const initial = await employee.read()
  const stream = await manager.send('/events')
  const reader = stream.body.getReader()
  const decoder = new TextDecoder()
  assert.match(decoder.decode((await reader.read()).value), /event: ready/)
  assert.equal((await employee.write('/attendance/check-out')).status, 409)
  const attempts = await Promise.all([employee.write('/attendance/check-in'), employee.write('/attendance/check-in')])
  assert.deepEqual(attempts.map(response => response.status).sort(), [200, 409])
  assert.match(decoder.decode((await reader.read()).value), /event: refresh/)
  assert((await hr.read()).attendance.some(row => row.day === initial.day && row.employee_id === initial.user.id && row.clock_out === null))
  assert.equal((await employee.write('/attendance/check-out')).status, 200)
  assert.equal((await employee.write('/attendance/check-in')).status, 409)
  assert((await employee.read()).shift.clock_out)
  const day = initial.day
  const reason = 'API demo request'
  const leave = { type: 'Annual', start: day, end: day, reason }
  assert.equal((await employee.write('/leave', { ...leave, start: '2026-02-30' })).status, 400)
  assert.equal((await employee.write('/leave', { ...leave, end: offsetDay(day, 20), type: 'Sick', start: offsetDay(day, -1) })).status, 400)
  const nextYear = String(Number(day.slice(0, 4)) + 1)
  assert.equal((await employee.write('/leave', { ...leave, start: nextYear + '-01-01', end: nextYear + '-01-21' })).status, 409)
  assert.equal((await employee.write('/leave', leave)).status, 201)
  assert.equal((await employee.write('/leave', leave)).status, 409)
  const pending = (await manager.read()).leaves.find(item => item.reason === reason)
  assert.equal(pending.reviewable, true)
  assert.equal((await employee.write('/leave/' + pending.id, { decision: 'Approved' }, 'PATCH')).status, 404)
  const decisions = await Promise.all([manager.write('/leave/' + pending.id, { decision: 'Approved' }, 'PATCH'),
    hr.write('/leave/' + pending.id, { decision: 'Approved' }, 'PATCH')])
  assert.deepEqual(decisions.map(response => response.status).sort(), [200, 409])
  const updated = await employee.read()
  assert.equal(updated.leaves.find(item => item.id === pending.id).status, 'Approved')
  assert.equal(updated.metrics.annualRemaining, initial.metrics.annualRemaining - 1)
  await reader.cancel()
})

test('new employee signs in, and profile and attendance persist in PostgreSQL', async t => {
  const schema = testSchema()
  const base = await testServer(t, false, { schema })
  const hr = client(base), hire = client(base)
  assert.equal((await hr.login('hr')).status, 200)
  const profile = { name: 'Taylor Reed', email: 'taylor@northstar.demo', title: 'Studio Coordinator', department: 'Operations', role: 'employee', managerId: 3, password: 'TaylorDemo2026!' }
  assert.equal((await hr.write('/employees', profile)).status, 201)
  assert.equal((await hr.write('/employees', profile)).status, 409)
  const added = (await hr.read()).directory.find(item => item.email === profile.email)
  assert.equal((await hr.write('/employees/' + added.id, { ...profile, title: 'Studio Lead' }, 'PATCH')).status, 200)
  assert.equal((await hire.login('taylor', profile.password)).status, 200)
  assert.equal((await hire.write('/attendance/check-in')).status, 200)
  const reopened = await connect({ schema, seed: false })
  try {
    assert.equal((await reopened.one('SELECT title FROM employees WHERE id=$1', [added.id])).title, 'Studio Lead')
    assert.equal((await reopened.one('SELECT count(*) AS n FROM attendance WHERE employee_id=$1', [added.id])).n, 1)
    assert.equal((await reopened.one('SELECT count(*) AS n FROM employees')).n, 13)
  } finally { await reopened.close() }
})
