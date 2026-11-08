import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const root = fileURLToPath(new URL('../', import.meta.url))
const data = join(root, 'data')
const cluster = join(data, 'postgres')
const configFile = join(data, 'local-postgres.json')
const bin = process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/16/bin'
const command = process.argv[2] ?? 'start'
if (!['start', 'stop', 'status'].includes(command)) throw new Error('Use start, stop, or status.')
mkdirSync(data, { recursive: true })
function run(name, args, required = true) {
  const result = spawnSync(join(bin, name + '.exe'), args, { encoding: 'utf8', windowsHide: true, stdio: args.includes('start') ? 'ignore' : 'pipe' })
  if (required && result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message)
  return result
}
if (command !== 'start') {
  const result = run('pg_ctl', ['-D', cluster, command, ...(command === 'stop' ? ['-m', 'fast', '-w'] : [])], false)
  console.log(result.stdout || result.stderr)
  process.exitCode = result.status ?? 1
} else {
  let config
  if (existsSync(configFile)) config = JSON.parse(readFileSync(configFile, 'utf8'))
  else {
    config = { port: 5433, adminPassword: randomBytes(32).toString('hex'), appPassword: randomBytes(32).toString('hex') }
    writeFileSync(configFile, JSON.stringify(config), { mode: 0o600 })
  }
  if (!existsSync(join(cluster, 'PG_VERSION'))) {
    if (existsSync(cluster)) throw new Error('An incomplete PostgreSQL cluster exists. Inspect data/postgres before retrying.')
    const passwordFile = join(data, '.init-password')
    writeFileSync(passwordFile, config.adminPassword, { mode: 0o600 })
    try {
      run('initdb', ['-D', cluster, '-U', 'peopleops_owner', '--pwfile=' + passwordFile, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C'])
      writeFileSync(join(cluster, 'postgresql.auto.conf'), "listen_addresses = '127.0.0.1'\nport = " + config.port + "\npassword_encryption = 'scram-sha-256'\n")
    } finally { unlinkSync(passwordFile) }
  }
  if (run('pg_ctl', ['-D', cluster, 'status'], false).status !== 0) {
    run('pg_ctl', ['-D', cluster, '-l', join(data, 'postgres.log'), '-w', 'start'])
  }
  const admin = new pg.Client({ host: '127.0.0.1', port: config.port, user: 'peopleops_owner', password: config.adminPassword, database: 'postgres' })
  await admin.connect()
  try {
    if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname='peopleops_app'")).rowCount) {
      await admin.query("CREATE ROLE peopleops_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '" + config.appPassword + "'")
    }
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='peopleops'")).rowCount) {
      await admin.query('CREATE DATABASE peopleops OWNER peopleops_app')
    }
    const env = join(root, '.env')
    if (!existsSync(env)) writeFileSync(env, 'DATABASE_URL=postgresql://peopleops_app:' + config.appPassword + '@127.0.0.1:' + config.port + '/peopleops\n', { mode: 0o600 })
    console.log('PeopleOps PostgreSQL is ready at 127.0.0.1:' + config.port + '/peopleops')
  } finally { await admin.end() }
}


