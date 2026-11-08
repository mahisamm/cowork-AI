import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromium } from 'playwright'
import { testServer } from './helpers.mjs'

test('desktop and mobile demo across four isolated browser sessions', { timeout: 90000 }, async t => {
  const base = await testServer(t, true)
  const browser = await chromium.launch({ channel: process.env.PEOPLEOPS_BROWSER ?? 'msedge' })
  t.after(() => browser.close())
  const errors = []
  async function open(role, name, viewport = { width: 1440, height: 960 }) {
    const page = await browser.newPage({ viewport })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('button', { name: new RegExp('^' + role + ' ') }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('heading', { name: 'Welcome back, ' + name + '.' }).waitFor()
    await page.getByText('Live updates', { exact: true }).waitFor()
    return page
  }
  const admin = await open('Admin', 'Anika')
  const hr = await open('HR', 'Priya')
  const manager = await open('Manager', 'Jordan')
  const employee = await open('Employee', 'Maya', { width: 390, height: 844 })
  if (process.env.PEOPLEOPS_SHOTS) {
    await admin.screenshot({ path: process.env.PEOPLEOPS_SHOTS + '/desktop.png', fullPage: true })
    await employee.screenshot({ path: process.env.PEOPLEOPS_SHOTS + '/mobile.png', fullPage: true })
  }

  const attendanceMetric = hr.getByRole('button', { name: /^Attended today/ })
  const attendedBefore = Number(await attendanceMetric.locator('strong').textContent())
  assert(await employee.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await employee.getByRole('button', { name: 'Check in', exact: true }).click()
  await employee.getByRole('heading', { name: 'You’re on the clock.' }).waitFor()
  await attendanceMetric.getByText(String(attendedBefore + 1), { exact: true }).waitFor()
  await hr.getByRole('navigation').getByRole('button', { name: 'Attendance' }).click()
  const shift = hr.getByRole('row').filter({ hasText: 'Maya Patel' })
  await shift.getByText('Checked in', { exact: true }).waitFor()
  await employee.getByRole('button', { name: 'Check out', exact: true }).click()
  await shift.getByText('Completed', { exact: true }).waitFor()

  await manager.getByRole('navigation').getByRole('button', { name: /^Leave/ }).click()
  assert.equal(await manager.getByRole('row').filter({ hasText: 'Sofia Cruz' }).count(), 0)
  const request = async (type, reason) => {
    await employee.getByRole('button', { name: 'Request leave', exact: true }).click()
    await employee.getByLabel('Leave type').selectOption(type)
    await employee.getByLabel('Reason').fill(reason)
    await employee.getByRole('button', { name: 'Submit request' }).click()
    await employee.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  await request('Annual', 'Demo browser approval')
  const approve = manager.getByRole('row').filter({ hasText: 'Demo browser approval' })
  await approve.getByText('Pending', { exact: true }).waitFor()
  await employee.getByRole('button', { name: 'Open menu' }).click()
  await employee.getByRole('navigation').getByRole('button', { name: 'Leave' }).click()
  const balance = employee.locator('.callout').getByText(/days remaining/)
  const beforeApproval = Number((await balance.textContent()).match(/^\d+/)[0])
  await approve.getByRole('button', { name: /Approve Maya/ }).click()
  await manager.getByRole('button', { name: 'Approve request', exact: true }).click()
  await employee.getByRole('row').filter({ hasText: 'Demo browser approval' }).getByText('Approved', { exact: true }).waitFor()
  await employee.getByText((beforeApproval - 1) + ' days remaining', { exact: false }).waitFor()

  await hr.getByRole('navigation').getByRole('button', { name: /^Leave/ }).click()
  const reject = hr.getByRole('row').filter({ hasText: 'Visiting family' })
  await reject.getByRole('button', { name: /Reject Sofia/ }).click()
  await hr.getByRole('button', { name: 'Reject request', exact: true }).click()
  await reject.getByText('Rejected', { exact: true }).waitFor()

  await admin.getByRole('navigation').getByRole('button', { name: 'Directory' }).click()
  await admin.getByRole('button', { name: 'Add employee' }).click()
  await admin.getByLabel('Full name').fill('Devon Brooks')
  await admin.getByLabel('Work email').fill('devon@northstar.demo')
  await admin.getByLabel('Job title').fill('Design Associate')
  await admin.getByRole('dialog').getByLabel(/^Department/).selectOption('Design')
  await admin.getByLabel('Reports to').selectOption({ label: 'Jordan Lee' })
  await admin.getByLabel('Initial password').fill('DevonDemo2026!')
  await admin.getByRole('button', { name: 'Create account' }).click()
  await admin.getByRole('dialog').waitFor({ state: 'hidden' })
  await admin.getByRole('textbox', { name: 'Search employees' }).fill('Devon')
  const hire = admin.getByRole('row').filter({ hasText: 'Devon Brooks' })
  await hire.getByRole('button', { name: 'Edit Devon Brooks' }).click()
  await admin.getByLabel('Job title').fill('Senior Design Associate')
  await admin.getByRole('button', { name: 'Save profile' }).click()
  await hire.getByText('Senior Design Associate').waitFor()
  await admin.getByRole('button', { name: 'Sign out', exact: true }).click()
  await admin.getByLabel('Work email').fill('devon@northstar.demo')
  await admin.getByLabel('Password', { exact: true }).fill('DevonDemo2026!')
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click()
  await admin.getByRole('heading', { name: 'Welcome back, Devon.' }).waitFor()
  await admin.reload()
  await admin.getByRole('heading', { name: 'Welcome back, Devon.' }).waitFor()
  assert.deepEqual(errors, [])
})
