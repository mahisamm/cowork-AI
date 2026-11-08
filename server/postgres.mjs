import pg from 'pg'
import { readFileSync } from 'node:fs'
import { databaseUrl } from './config.mjs'

function queries(executor) {
  return {
    query: (sql, values = []) => executor.query(sql, values),
    one: async (sql, values = []) => (await executor.query(sql, values)).rows[0],
    all: async (sql, values = []) => (await executor.query(sql, values)).rows,
  }
}

export function openDatabase({ schema = 'public' } = {}) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema.')
  const pool = new pg.Pool({
    connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000, statement_timeout: 10000,
    options: '-c search_path=' + schema + ' -c timezone=UTC',
    types: {
      getTypeParser(oid, format) {
        if (oid === 1082) return value => value
        if (oid === 1184) return value => new Date(value).toISOString()
        if (oid === 20) return value => Number(value)
        return pg.types.getTypeParser(oid, format)
      },
    },
  })
  pool.on('error', error => console.error('PostgreSQL connection error:', error.code ?? 'unavailable'))
  return {
    ...queries(pool),
    schema,
    async transaction(work, mode = '') {
      if (!['', 'REPEATABLE READ READ ONLY'].includes(mode)) throw new Error('Invalid transaction mode.')
      const connection = await pool.connect()
      try {
        await connection.query('BEGIN' + (mode ? ' ISOLATION LEVEL ' + mode : ''))
        const result = await work(queries(connection))
        await connection.query('COMMIT')
        return result
      } catch (error) {
        await connection.query('ROLLBACK')
        throw error
      } finally { connection.release() }
    },
    close: () => pool.end(),
  }
}

export async function initialize(db, seed) {
  await db.transaction(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(704112)')
    await tx.query('CREATE SCHEMA IF NOT EXISTS "' + db.schema + '"')
    await tx.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
    if (seed && !(await tx.one('SELECT id FROM employees LIMIT 1'))) await seed(tx)
  })
}
