import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { connect } from '../server/db.mjs'

const columns = {
  employees: ['id','name','email','title','department','role','manager_id','joined_on','password_hash'],
  sessions: ['token_hash','employee_id','expires'],
  attendance: ['id','employee_id','day','clock_in','clock_out'],
  leave_requests: ['id','employee_id','type','start_date','end_date','reason','status','submitted_at','reviewed_at','reviewer_id'],
}
export async function importSqlite(filename, options = {}) {
  const source = new DatabaseSync(resolve(filename), { readOnly: true })
  const records = {}
  try {
    source.exec('BEGIN')
    for (const [table, names] of Object.entries(columns)) {
      records[table] = source.prepare('SELECT ' + names.join(',') + ' FROM ' + table + ' ORDER BY ' + names[0]).all()
    }
    source.exec('COMMIT')
  } finally { source.close() }
  const hash = createHash('sha256').update(JSON.stringify(records)).digest('hex')
  const db = await connect({ ...options, seed: false })
  try {
    return await db.transaction(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(704112)')
      const imported = await tx.one('SELECT row_counts FROM data_imports WHERE source_hash=$1', [hash])
      if (imported) return { alreadyImported: true, counts: imported.row_counts }
      for (const table of Object.keys(columns)) {
        if ((await tx.one('SELECT count(*) AS count FROM ' + table)).count) throw new Error('Import requires empty PostgreSQL tables. Existing data was not replaced.')
      }
      for (const [table, names] of Object.entries(columns)) {
        for (const record of records[table]) {
          const values = names.map(name => table === 'employees' && name === 'manager_id' ? null : record[name])
          await tx.query('INSERT INTO ' + table + '(' + names.join(',') + ') VALUES (' + names.map((_, i) => '$' + (i + 1)).join(',') + ')', values)
        }
        if (names.includes('id')) {
          await tx.query("SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST(COALESCE((SELECT max(id) FROM " + table + "), 0), 1), EXISTS(SELECT 1 FROM " + table + '))', [table])
        }
      }
      for (const person of records.employees) {
        await tx.query('UPDATE employees SET manager_id=$1 WHERE id=$2', [person.manager_id, person.id])
      }
      // Compare every migrated value before committing, including hashes and dates.
      for (const [table, names] of Object.entries(columns)) {
        const migrated = await tx.all('SELECT ' + names.join(',') + ' FROM ' + table + ' ORDER BY ' + names[0])
        if (JSON.stringify(migrated) !== JSON.stringify(records[table])) throw new Error('Verification failed for ' + table)
      }
      const counts = Object.fromEntries(Object.entries(records).map(([table, rows]) => [table, rows.length]))
      await tx.query('INSERT INTO data_imports(source_hash,row_counts) VALUES ($1,$2)', [hash, counts])
      return { alreadyImported: false, counts }
    })
  } finally { await db.close() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Provide the SQLite file to import.')
  console.log(JSON.stringify(await importSqlite(process.argv[2])))
}
