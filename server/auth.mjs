import { createHash, randomBytes } from 'node:crypto'
import { checkPassword } from './db.mjs'

const cookie = 'peopleops_session'
const sessionMs = 8 * 60 * 60 * 1000
const cookieOptions = { httpOnly: true, sameSite: 'strict', path: '/' }
const dummyHash = randomBytes(16).toString('hex') + ':' + randomBytes(64).toString('hex')
const digest = value => createHash('sha256').update(value).digest('hex')

export function auth(db) {
  const attempts = new Map()
  function token(req) {
    return req.headers.cookie?.match(/(?:^|;\s*)peopleops_session=([a-f0-9]{64})(?:;|$)/)?.[1]
  }
  async function identify(req) {
    const value = token(req)
    if (!value) return null
    return (await db.one(`
      SELECT e.id,e.name,e.email,e.title,e.department,e.role,e.manager_id,e.joined_on,s.expires
      FROM sessions s JOIN employees e ON e.id=s.employee_id WHERE s.token_hash=$1 AND s.expires>$2
    `, [digest(value), Date.now()]))
  }
  async function login(req, res) {
    const now = Date.now()
    if (attempts.size > 200) {
      for (const [ip, entry] of attempts) if (entry.until <= now) attempts.delete(ip)
    }
    const key = req.ip
    const previous = attempts.get(key)
    const attempt = previous && previous.until > now ? previous : { count: 0, until: now + 600000 }
    if (attempt.count >= 20) {
      res.set('Retry-After', String(Math.ceil((attempt.until - now) / 1000)))
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' })
    }
    attempt.count += 1
    attempts.set(key, attempt)
    const { email, password } = req.body ?? {}
    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 150 || password.length > 128) {
      return res.status(400).json({ error: 'Enter a valid email and password.' })
    }
    const row = (await db.one('SELECT id,password_hash FROM employees WHERE email=$1', [email.trim().toLowerCase()]))
    if (!(await checkPassword(password, row?.password_hash ?? dummyHash)) || !row) {
      return res.status(401).json({ error: 'Email or password is incorrect.' })
    }
    const value = randomBytes(32).toString('hex')
    await db.transaction(async tx => {
      await tx.query('DELETE FROM sessions WHERE expires<=$1 OR token_hash=$2', [now, token(req) ? digest(token(req)) : ''])
      await tx.query('INSERT INTO sessions VALUES ($1,$2,$3)', [digest(value), row.id, now + sessionMs])
    })
    attempts.delete(key)
    res.cookie(cookie, value, { ...cookieOptions, maxAge: sessionMs })
    res.json({ ok: true })
  }
  async function logout(req, res) {
    const value = token(req)
    if (value) await db.query('DELETE FROM sessions WHERE token_hash=$1', [digest(value)])
    res.clearCookie(cookie, cookieOptions).json({ ok: true })
  }
  return { identify, login, logout }
}


