import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { connect, demoPassword } from '../server/db.mjs'
import { createApp } from '../server/app.mjs'
import { randomUUID } from 'node:crypto'

export const testSchema = () => 'peopleops_test_' + randomUUID().replaceAll('-', '')
export async function testServer(t, serveUi = false, options = {}) {
  const schema = options.schema ?? testSchema()
  if (!/^peopleops_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Tests require an isolated test schema.')
  const db = await connect({ schema })
  const assets = serveUi ? fileURLToPath(new URL('../dist', import.meta.url)) : undefined
  const server = createApp(db, assets).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    const closed = new Promise(resolve => server.close(resolve))
    server.closeAllConnections()
    await closed
    try { await db.query('DROP SCHEMA "' + schema + '" CASCADE') }
    finally { await db.close() }
  })
  return 'http://127.0.0.1:' + server.address().port
}

export function client(base) {
  let cookie = ''
  async function send(path, { method = 'GET', body, headers } = {}) {
    const result = await fetch(base + '/api' + path, {
      method,
      headers: { Cookie: cookie, 'X-PeopleOps': '1', 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const nextCookie = result.headers.get('set-cookie')
    if (nextCookie) cookie = nextCookie.split(';')[0]
    return result
  }
  const write = (path, body, method = 'POST') => send(path, { method, body })
  return { send, write, login: (role, password = demoPassword) => write('/login', { email: role + '@northstar.demo', password }),
    read: async () => (await send('/workspace')).json() }
}

