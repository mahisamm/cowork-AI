import { fileURLToPath } from 'node:url'
import { connect } from './db.mjs'
import { createApp } from './app.mjs'

const assets = fileURLToPath(new URL('../dist', import.meta.url))
const port = Number(process.env.PEOPLEOPS_PORT ?? 4173)
const db = await connect()
const server = createApp(db, assets).listen(port, '127.0.0.1', () => {
  console.log('PeopleOps AI with PostgreSQL is running at http://127.0.0.1:' + port + ' (PID ' + process.pid + ')')
})
server.on('error', async error => {
  console.error('Server startup failed:', error.code)
  await db.close()
  process.exitCode = 1
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => { void db.close() })
    server.closeAllConnections()
  })
}
