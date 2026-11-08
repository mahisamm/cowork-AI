import { useState, type FormEvent } from 'react'
import { ArrowRight, BriefcaseBusiness, Clock3, Eye, EyeOff, LockKeyhole, ShieldCheck, UsersRound } from 'lucide-react'
import { api, demoPassword, roleNames, type Role } from './model'
import { Mark, Notice } from './ui'
import './Login.css'

const accounts = [
  { role: 'admin', icon: ShieldCheck, hint: 'Manage the workspace' },
  { role: 'hr', icon: UsersRound, hint: 'Run people operations' },
  { role: 'manager', icon: BriefcaseBusiness, hint: 'Lead your team' },
  { role: 'employee', icon: Clock3, hint: 'Manage your workday' },
] as const

export function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selected, select] = useState<Role | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function fill(role: Role) {
    select(role)
    setEmail(role + '@northstar.demo')
    setPassword(demoPassword)
    setError('')
    setShowPassword(false)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/login', 'POST', { email, password })
      await onLogin()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sign-in failed.')
    } finally { setBusy(false) }
  }
  return <main className="glass-login">
    <header className="glass-header">
      <div className="brand"><Mark /><div><strong>PeopleOps AI</strong><small>PEOPLE WORKSPACE</small></div></div>
      <span className="glass-org"><span /> Northstar Studio</span>
    </header>
    <section className="glass-panel" aria-labelledby="login-title">
      <div className="glass-panel-top"><span className="glass-kicker">YOUR WORKSPACE, CONNECTED</span><LockKeyhole size={16} aria-hidden="true" /></div>
      <h1 id="login-title">Welcome back.</h1>
      <p className="glass-intro">A little less admin. A lot more human.</p>
      <div className="glass-tab">Sign in<span /></div>
      <form className="glass-form" onSubmit={submit}>
        <label>Work email<input type="email" placeholder="you@northstar.demo" autoComplete="username" required value={email} onChange={event => { setEmail(event.target.value); select(null) }} /></label>
        <label>Password<span className="glass-password"><input type={showPassword ? 'text' : 'password'} placeholder="Enter your password" autoComplete="current-password" required value={password} onChange={event => { setPassword(event.target.value); select(null) }} /><button type="button" className="glass-reveal" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></span></label>
        {error && <Notice error>{error}</Notice>}
        <button className="glass-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={18} aria-hidden="true" /></button>
      </form>
      <div className="glass-divider"><span>OR EXPLORE A DEMO ROLE</span></div>
      <div className="glass-roles">
        {accounts.map(({ role, icon: Icon, hint }) => <button key={role} className={'glass-role glass-role-' + role + (selected === role ? ' selected' : '')} disabled={busy} onClick={() => fill(role)} aria-pressed={selected === role}>
          <span className="glass-role-icon"><Icon size={19} aria-hidden="true" /></span><span><strong>{roleNames[role]}</strong><small>{hint}</small></span>
        </button>)}
      </div>
      <p className="glass-motion-hint">Move your cursor to explore the light.</p><p className="glass-demo-note">Choose a role to fill in the demo credentials.</p>
    </section>
    <footer className="glass-footer"><span>Good work starts with your people.</span><span>PeopleOps AI <span aria-hidden="true">·</span> Northstar Studio</span></footer>
  </main>
}

