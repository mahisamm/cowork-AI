import assert from 'node:assert/strict'
import { test } from 'node:test'
import { client, testServer, testSchema } from './helpers.mjs'
import { connect, offsetDay } from '../server/db.mjs'

test('PostgreSQL health and concurrent attendance reject duplicate writes', async t => {
  const base = await testServer(t)
  const health = await (await fetch(base + '/api/health')).json()
  assert.deepEqual(health, { ok: true, database: 'postgresql', connected: true })
  const employee = client(base)
  await employee.login('employee')
  const responses = await Promise.all(Array.from({ length: 8 }, () => employee.write('/attendance/check-in')))
  assert.equal(responses.filter(r => r.status === 200).length, 1)
  assert.equal(responses.filter(r => r.status === 409).length, 7)
  const checks = await Promise.all([employee.write('/attendance/check-out'), employee.write('/attendance/check-out')])
  assert.deepEqual(checks.map(r => r.status).sort(), [200, 409])
})

test('concurrent overlapping leave and annual allowance stay consistent', async t => {
  const base = await testServer(t)
  const employee = client(base)
  await employee.login('employee')
  const { day } = await employee.read()
  const request = { type: 'Sick', start: day, end: day, reason: 'Concurrent leave' }
  const overlap = await Promise.all(Array.from({ length: 5 }, () => employee.write('/leave', request)))
  assert.deepEqual(overlap.map(r => r.status).sort(), [201,409,409,409,409])
  const year = Number(day.slice(0,4)) + 1
  const a = { type: 'Annual', start: year + '-02-01', end: year + '-02-12', reason: 'Allowance A' }
  const b = { ...a, start: year + '-03-01', end: year + '-03-12', reason: 'Allowance B' }
  const annual = await Promise.all([employee.write('/leave', a), employee.write('/leave', b)])
  assert.deepEqual(annual.map(r => r.status).sort(), [201,409])
  assert.equal((await employee.read()).leaves.filter(l => l.reason.startsWith('Allowance')).length, 1)
  // A rejected transaction must release its connection and locks.
  assert.equal((await employee.write('/leave', { type: 'Personal', start: offsetDay(day, 2), end: offsetDay(day, 2), reason: 'After rollback' })).status, 201)
})

test('concurrent manager edits cannot create a reporting cycle or duplicate email', async t => {
  const base = await testServer(t)
  const admin = client(base)
  await admin.login('admin')
  const people = (await admin.read()).directory
  const jordan = people.find(p => p.id === 3), elena = people.find(p => p.id === 5)
  const cycle = await Promise.all([
    admin.write('/employees/3', { ...jordan, managerId: 5 }, 'PATCH'),
    admin.write('/employees/5', { ...elena, managerId: 3 }, 'PATCH'),
  ])
  assert.deepEqual(cycle.map(r => r.status).sort(), [200,400])
  const duplicate = await Promise.all([
    admin.write('/employees/3', { ...jordan, managerId: null, email: 'same@northstar.demo' }, 'PATCH'),
    admin.write('/employees/5', { ...elena, managerId: null, email: 'same@northstar.demo' }, 'PATCH'),
  ])
  assert.deepEqual(duplicate.map(r => r.status).sort(), [200,409])
})

test('own leave, expired sessions, malformed requests and foreign origins are rejected', async t => {
  const schema = testSchema()
  const base = await testServer(t, false, { schema })
  const admin = client(base)
  await admin.login('admin')
  const { day } = await admin.read()
  assert.equal((await admin.write('/leave', { type:'Personal',start:day,end:day,reason:'Own leave' })).status, 201)
  const own = (await admin.read()).leaves.find(l => l.reason === 'Own leave')
  assert.equal((await admin.write('/leave/' + own.id, { decision:'Approved' }, 'PATCH')).status, 404)
  assert.equal((await admin.write('/leave', { type:'Annual',start:'invalid',end:day,reason:'Bad date' })).status, 400)
  const malformed = await fetch(base + '/api/login', { method:'POST', headers:{'X-PeopleOps':'1','Content-Type':'application/json'},body:'{' })
  assert.equal(malformed.status, 400)
  const foreign = await fetch(base + '/api/login', { method:'POST',headers:{'X-PeopleOps':'1',Origin:'https://foreign.example','Content-Type':'application/json'},body:'{}' })
  assert.equal(foreign.status, 403)
  assert.equal((await admin.write('/employees/2147483648', {}, 'PATCH')).status, 400)
  assert.equal((await admin.write('/leave/2147483648', { decision:'Approved' }, 'PATCH')).status, 400)
  const person = (await admin.read()).directory.find(p => p.id === 3)
  assert.equal((await admin.write('/employees/3', { ...person, managerId:2147483648 }, 'PATCH')).status, 400)
  const db = await connect({ schema, seed:false })
  try { await db.query('UPDATE sessions SET expires=0') } finally { await db.close() }
  assert.equal((await admin.send('/workspace')).status, 401)
})
