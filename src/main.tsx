import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CalendarDays, CalendarPlus, ChevronDown, Clock3, Command, LayoutGrid, LogOut, Menu, Plus, Radio, Search, UsersRound, X } from 'lucide-react'
import { ApiError, api, leads, roleNames, type Leave, type Person, type Workspace } from './model'
import { Dashboard, type Page } from './Dashboard'
import { Attendance, Directory, LeavePage } from './Views'
import { LeaveForm, PersonForm, ReviewForm } from './Forms'
import { Login } from './Login'
import { Avatar, Badge, Dialog, Mark, Notice } from './ui'
import './styles.css'
import './liquid-theme.css'
const GlassScene = lazy(() => import('./GlassScene'))

const pages = [
  { label: 'Overview', icon: LayoutGrid },
  { label: 'Directory', icon: UsersRound },
  { label: 'Attendance', icon: Clock3 },
  { label: 'Leave', icon: CalendarDays },
] as const
const pageFromUrl = (): Page => pages.find(item => '#' + item.label.toLowerCase() === window.location.hash)?.label ?? 'Overview'
type Modal = { kind: 'leave' } | { kind: 'person'; person?: Person } | { kind: 'review'; item: Leave; decision: 'Approved' | 'Rejected' } | { kind: 'command' }
type Toast = { message: string; error?: boolean }

function CommandPalette({ data, close, go, openModal }: {
  data: Workspace; close: () => void; go: (page: Page) => void; openModal: (modal: Modal) => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const matchedPeople = data.directory.filter(p =>
    [p.name, p.title, p.department, p.email].some(v => v.toLowerCase().includes(needle))
  ).slice(0, 5)
  return (
    <Dialog title="Command spotlight" description="Jump to any workspace view, action, or person." close={close}>
      <div className="cmd-palette">
        <label className="cmd-search">
          <Search size={17} />
          <input
            autoFocus
            placeholder="Type a command, department, or teammate name…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
        <div className="cmd-section">
          <span className="cmd-heading">NAVIGATION & QUICK ACTIONS</span>
          <div className="cmd-grid">
            {pages.map(({ label, icon: Icon }) => (
              <button type="button" key={label} className="cmd-item" onClick={() => { close(); go(label) }}>
                <Icon size={16} /><span>Go to {label}</span>
              </button>
            ))}
            <button type="button" className="cmd-item" onClick={() => openModal({ kind: 'leave' })}>
              <CalendarPlus size={16} /><span>New leave request</span>
            </button>
            {leads(data.user.role) && (
              <button type="button" className="cmd-item" onClick={() => openModal({ kind: 'person' })}>
                <Plus size={16} /><span>Onboard employee</span>
              </button>
            )}
          </div>
        </div>
        <div className="cmd-section">
          <span className="cmd-heading">DIRECTORY SPOTLIGHT</span>
          <div className="cmd-list">
            {matchedPeople.map(person => (
              <button type="button" key={person.id} className="cmd-person" onClick={() => openModal({ kind: 'person', person })}>
                <Avatar id={person.id} name={person.name} small />
                <div>
                  <strong>{person.name}</strong>
                  <small>{person.title} · {person.department}</small>
                </div>
                <Badge>{roleNames[person.role]}</Badge>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [live, setLive] = useState(false)
  const [page, setPage] = useState(pageFromUrl)
  const [menu, setMenu] = useState(false)
  const [modal, setModal] = useState<Modal | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [busy, setBusy] = useState(false)
  const version = useRef(0)
  const accountRef = useRef<HTMLDetailsElement>(null)

  const load = useCallback(async () => {
    const current = ++version.current
    try {
      const data = await api<Workspace>('/workspace')
      if (version.current === current) {
        setWorkspace(data)
        setProblem('')
      }
    } catch (failure) {
      if (version.current !== current) return
      if (failure instanceof ApiError && failure.status === 401) {
        setWorkspace(null)
        setModal(null)
        setToast(null)
        setProblem('')
        return
      }
      setProblem('The workspace connection is unavailable. Try again.')
      throw failure
    } finally {
      if (version.current === current) setLoading(false)
    }
  }, [])

  useEffect(() => { void load().catch(() => {}) }, [load])
  const userId = workspace?.user.id
  useEffect(() => {
    if (!userId) return
    const refresh = () => { void load().catch(() => {}) }
    const events = new EventSource('/api/events')
    events.addEventListener('ready', () => { setLive(true); refresh() })
    events.addEventListener('heartbeat', () => setLive(true))
    events.addEventListener('refresh', refresh)
    events.onerror = () => { setLive(false); refresh() }
    const timer = window.setInterval(refresh, 15000)
    return () => {
      events.close()
      window.clearInterval(timer)
      setLive(false)
    }
  }, [userId, load])

  useEffect(() => {
    function onHashChange() {
      setPage(pageFromUrl())
      setMenu(false)
      accountRef.current?.removeAttribute('open')
    }
    function onPointerDown(event: PointerEvent) {
      if (accountRef.current?.open && event.target instanceof Node && !accountRef.current.contains(event.target)) {
        accountRef.current.removeAttribute('open')
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && accountRef.current?.open) {
        accountRef.current.removeAttribute('open')
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setModal(current => current?.kind === 'command' ? null : { kind: 'command' })
      }
    }
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), toast.error ? 8000 : 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  function go(next: Page) {
    setPage(next)
    setMenu(false)
    accountRef.current?.removeAttribute('open')
    window.location.hash = next.toLowerCase()
    window.scrollTo(0, 0)
  }
  async function save(path: string, method: string, body: unknown, message: string) {
    try {
      await api(path, method, body)
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) await load().catch(() => {})
      throw failure
    }
    setToast({ message })
    await load().catch(() => {})
  }
  async function clock(action: 'check-in' | 'check-out') {
    setBusy(true)
    try {
      await save('/attendance/' + action, 'POST', undefined, action === 'check-in' ? 'You’re checked in.' : 'You’re checked out.')
    } catch (failure) {
      setToast({ message: failure instanceof Error ? failure.message : 'Attendance could not be saved.', error: true })
      await load().catch(() => {})
    } finally { setBusy(false) }
  }
  async function logout() {
    try {
      await api('/logout', 'POST')
      version.current++
      setWorkspace(null)
      setModal(null)
      setToast(null)
      setProblem('')
      go('Overview')
    } catch {
      setToast({ message: 'Could not sign out. Try again.', error: true })
    }
  }
  if (loading) return <main className="startup"><Mark /><p>Loading PeopleOps AI…</p></main>
  if (!workspace) return problem ? <main className="startup"><Mark /><Notice error>{problem}</Notice><button className="button primary" onClick={() => { void load().catch(() => {}) }}>Retry</button></main> :
    <Login onLogin={async () => { go('Overview'); await load() }} />

  const { user, organization, metrics } = workspace
  const request = () => setModal({ kind: 'leave' })
  const close = () => setModal(null)
  const scope = leads(user.role) ? 'Organization access' : user.role === 'manager' ? 'Direct reports' : 'Personal access'
  return <div className="shell">
    <a className="skip-link" href="#workspace-main" onClick={event => { event.preventDefault(); document.getElementById('workspace-main')?.focus() }}>Skip to workspace</a>
    {menu && <button className="rail-overlay" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside className={'rail ' + (menu ? 'rail-open' : '')} id="workspace-navigation">
      <div className="brand"><Mark /><div><strong>PeopleOps AI</strong><small>PEOPLE WORKSPACE</small></div></div>
      <div className="org"><span className="org-icon">N</span><div><strong>{organization.name}</strong><small>Demo organization</small></div></div>
      <div className="rail-label">WORKSPACE</div>
      <nav aria-label="Workspace navigation">
        {pages.map(({ label, icon: Icon }) => <button key={label} onClick={() => go(label)} aria-current={label === page ? 'page' : undefined}>
          <Icon size={18} /><span>{label}</span>{label === 'Leave' && metrics.reviewable > 0 && <span className="nav-count">{metrics.reviewable}</span>}
        </button>)}
      </nav>
      <div className="rail-footer">
        <div className="environment"><span className="environment-dot" /><div><strong>Demo workspace</strong><small>{scope}</small></div></div>
        <button className="rail-logout" onClick={() => void logout()}><LogOut size={17} /> Sign out</button>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb">
          <button className="icon-button mobile-menu" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} aria-controls="workspace-navigation" onClick={() => setMenu(!menu)}>{menu ? <X size={21} /> : <Menu size={21} />}</button>
          <span className="bread-parent">Workspace</span><span className="bread-slash">/</span><strong>{page}</strong>
        </div>
        <div className="top-right">
          <button type="button" className="cmd-trigger" aria-label="Command palette" onClick={() => setModal({ kind: 'command' })}>
            <Command size={13} /><span>Spotlight</span><kbd>Ctrl K</kbd>
          </button>
          <div className={'live ' + (live ? 'online' : '')} aria-live="polite"><Radio size={15} /><span>{live ? 'Live updates' : 'Reconnecting'}</span></div>
          <span className="top-separator" />
          <details className="account" ref={accountRef}>
            <summary aria-label="Account menu"><Avatar name={user.name} id={user.id} small /><span><strong>{user.name}</strong><small>{roleNames[user.role]}</small></span><ChevronDown size={14} /></summary>
            <div className="account-menu"><small>{user.email}</small><button className="button small secondary" onClick={() => void logout()}><LogOut size={15} /> Sign out</button></div>
          </details>
        </div>
      </header>
      <main id="workspace-main" tabIndex={-1} className="content">
        {problem && <Notice error>{problem}</Notice>}
        {page === 'Overview' && <Dashboard data={workspace} go={go} request={request} busy={busy} clock={clock} />}
        {page === 'Directory' && <Directory data={workspace} open={person => setModal({ kind: 'person', person })} />}
        {page === 'Attendance' && <Attendance data={workspace} busy={busy} clock={clock} />}
        {page === 'Leave' && <LeavePage data={workspace} busy={busy} request={request} decide={(item, decision) => setModal({ kind: 'review', item, decision })} />}
        <footer className="page-footer"><span>PeopleOps AI <span className="footer-dot">·</span> {organization.name}</span><span>PHASE 01 / PEOPLE OPERATIONS</span></footer>
      </main>
    </div>
    {toast && <div className="toast"><Notice error={toast.error}>{toast.message}</Notice><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={16} /></button></div>}
    {modal?.kind === 'leave' && <LeaveForm data={workspace} close={close} save={save} />}
    {modal?.kind === 'person' && <PersonForm data={workspace} close={close} save={save} person={modal.person} />}
    {modal?.kind === 'review' && <ReviewForm close={close} save={save} item={modal.item} decision={modal.decision} />}
    {modal?.kind === 'command' && <CommandPalette data={workspace} close={close} go={go} openModal={setModal} />}
  </div>
}

createRoot(document.getElementById('root')!).render(<><Suspense fallback={null}><GlassScene /></Suspense><App /></>)


