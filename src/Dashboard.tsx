import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, CalendarDays, CalendarPlus, CheckCircle2, Clock3, ClipboardList, Layers, ListTodo, LogIn, LogOut, Sparkles, UsersRound } from 'lucide-react'
import { dateLabel, daysLabel, firstName, leads, roleNames, taskNeedsAttention, timeLabel, type Workspace } from './model'
import { Avatar, Badge, Empty, Orbit, Trend } from './ui'

export type Page = 'Overview' | 'Directory' | 'Attendance' | 'Leave' | 'My tasks'
const dashboardCopy = {
  admin: ['Organization overview', 'Monitor attendance, people records, and leave across Northstar Studio.'],
  hr: ['People operations', 'Keep track of your people, today’s attendance, and leave requests.'],
  manager: ['Team overview', 'See how your team is doing and stay on top of leave requests.'],
  employee: ['My workspace', 'Check your attendance, request time off, and track decisions in one place.'],
} as const

export function formatDuration(startIso: string, endIso?: string | null, nowMs = Date.now()) {
  const diff = Math.max(0, (endIso ? Date.parse(endIso) : nowMs) - Date.parse(startIso))
  const totalMinutes = Math.floor(diff / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`
}

export function ShiftAction({ data, busy, clock }: { data: Workspace; busy: boolean; clock: (action: 'check-in' | 'check-out') => void }) {
  if (data.shift?.clock_out) return <span className="shift-completed"><CheckCircle2 size={17} /> Shift completed</span>
  const action = data.shift ? 'check-out' : 'check-in'
  const Icon = data.shift ? LogOut : LogIn
  return <button className="button primary" disabled={busy} onClick={() => clock(action)}><Icon size={17} />{data.shift ? 'Check out' : 'Check in'}</button>
}

function WorkdayCore({ data }: { data: Workspace }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const { shift, metrics } = data
  const istClock = new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
  }).format(new Date(now))
  const elapsedMs = shift ? Math.max(0, (shift.clock_out ? Date.parse(shift.clock_out) : now) - Date.parse(shift.clock_in)) : 0
  const shiftProgress = shift?.clock_out ? 100 : shift ? Math.min(100, Math.max(12, Math.round(elapsedMs / (8 * 3600000) * 100))) : 0
  const circumference = 2 * Math.PI * 52
  const dashOffset = circumference - (shiftProgress / 100) * circumference
  const statusLabel = shift?.clock_out ? 'COMPLETE' : shift ? 'ON CLOCK' : 'STANDBY'

  return (
    <div className="chrono-core" aria-hidden="true">
      <div className="chrono-rings">
        <div className="chrono-ring chrono-ring-outer" />
        <div className="chrono-ring chrono-ring-mid" />
        <svg className="chrono-Dial" viewBox="0 0 128 128">
          <defs>
            <linearGradient id="chrono-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffd2a7" />
              <stop offset="55%" stopColor="#ffb486" />
              <stop offset="100%" stopColor="#94e2c6" />
            </linearGradient>
          </defs>
          <circle cx="64" cy="64" r="52" className="chrono-track" />
          <circle
            cx="64" cy="64" r="52"
            className="chrono-progress"
            stroke="url(#chrono-grad)"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="chrono-center">
          <span className={'chrono-state ' + (shift && !shift.clock_out ? 'active' : '')}>{statusLabel}</span>
          <strong className="chrono-time">{istClock}</strong>
          <small className="chrono-sub">{shift ? formatDuration(shift.clock_in, shift.clock_out, now) + ' shift' : 'IST STUDIO TIME'}</small>
        </div>
      </div>
      <div className="chrono-satellites">
        <div className="chrono-pill">
          <span className="chrono-dot mint" />
          <div><small>Active now</small><strong>{metrics.checkedIn}/{metrics.people}</strong></div>
        </div>
        <div className="chrono-pill">
          <span className="chrono-dot amber" />
          <div><small>Leave balance</small><strong>{metrics.annualRemaining}d</strong></div>
        </div>
      </div>
    </div>
  )
}

export function Dashboard({ data, go, request, busy, clock }: {
  data: Workspace; go: (page: Page) => void; request: () => void; busy: boolean; clock: (action: 'check-in' | 'check-out') => void
}) {
  const { user, day, metrics, series, activity, shift, directory, departments, attendance, leaves } = data
  const [scope, description] = dashboardCopy[user.role]
  const [selectedIdx, setSelectedIdx] = useState(6)
  const [activeDept, setActiveDept] = useState<string>('All')
  const person = user.role === 'employee'
  const openTasks = data.tasks.filter(task => !task.completed).length
  const dueTasks = data.tasks.filter(task => taskNeedsAttention(task, day)).length
  const stats = person ? [
    { label: 'My attendance', value: !shift ? 'Not checked in' : shift.clock_out ? 'Completed' : 'Checked in', hint: !shift ? 'Ready for your next shift' : shift.clock_out ? timeLabel(shift.clock_in) + ' – ' + timeLabel(shift.clock_out) + ' IST' : 'Since ' + timeLabel(shift.clock_in) + ' IST', icon: Clock3, tone: 'mint', link: 'Attendance' },
    { label: 'Annual leave left', value: metrics.annualRemaining, hint: 'Of ' + daysLabel(metrics.annualAllowance) + ' this year', icon: CalendarDays, tone: 'lavender', link: 'Leave' },
    { label: 'Pending requests', value: metrics.pending, hint: 'Awaiting a decision', icon: ClipboardList, tone: 'peach', link: 'Leave' },
  ] as const : [
    { label: leads(user.role) ? 'Total employees' : 'Team members', value: metrics.people, hint: leads(user.role) ? 'In your organization' : 'Including you', icon: UsersRound, tone: 'mint', link: 'Directory' },
    { label: 'Attended today', value: metrics.attended, hint: metrics.checkedIn + ' currently checked in', icon: Clock3, tone: 'blue', link: 'Attendance' },
    { label: 'Pending review', value: metrics.reviewable, hint: 'Requests you can review', icon: ClipboardList, tone: 'peach', link: 'Leave' },
    { label: 'On leave today', value: metrics.out, hint: 'Approved time off', icon: CalendarDays, tone: 'lavender', link: 'Leave' },
  ] as const
  const max = Math.max(metrics.people, 1, ...series.map(item => item.count))
  const activePoint = series[selectedIdx] ?? series[6]
  const presencePct = Math.round((activePoint.count / Math.max(metrics.people, 1)) * 100)

  const checkedInTodayIds = new Set(
    attendance.filter(item => item.day === day && !item.clock_out).map(item => item.employee_id)
  )
  const completedTodayIds = new Set(
    attendance.filter(item => item.day === day && item.clock_out).map(item => item.employee_id)
  )
  const onLeaveTodayIds = new Set(
    leaves.filter(item => item.status === 'Approved' && item.start_date <= day && item.end_date >= day).map(item => item.employee_id)
  )

  const sparkPoints = series.map((item, idx) => {
    const x = (idx / 6) * 280 + 20
    const y = 86 - (item.count / max) * 64
    return `${x},${y}`
  }).join(' ')

  const deptStats = departments.map(dept => {
    const members = directory.filter(item => item.department === dept)
    const activeCount = members.filter(m => checkedInTodayIds.has(m.id) || completedTodayIds.has(m.id)).length
    return { dept, members, count: members.length, activeCount }
  })
  const spotlightPeople = (activeDept === 'All' ? directory : directory.filter(p => p.department === activeDept)).slice(0, 6)

  return <>
    <div className="page-heading dashboard-heading">
      <div><div className="eyebrow">{scope}</div><h1>Welcome back, {firstName(user.name)}<span className="heading-period">.</span></h1><p>{description}</p></div>
      <div className="date-chip"><CalendarDays size={17} />{dateLabel(day, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
    </div>
    <section className="hero" aria-label="Your workday">
      <Orbit />
      <div className="hero-layout">
        <div className="hero-content">
          <span className="hero-tag"><span /> YOUR WORKDAY</span>
          <h2>{shift?.clock_out ? 'You’re done for today.' : shift ? 'You’re on the clock.' : 'Ready to start your day?'}</h2>
          <p>{shift?.clock_out ? 'Checked out at ' + timeLabel(shift.clock_out) + ' IST.' : shift ? 'Checked in at ' + timeLabel(shift.clock_in) + ' IST.' : 'Track your time or plan your next day off.'}</p>
          <div className="hero-actions"><ShiftAction data={data} busy={busy} clock={clock} />
            <button className="button hero-secondary" onClick={request}><CalendarPlus size={16} /> Request leave</button>
          </div>
        </div>
        <WorkdayCore data={data} />
      </div>
    </section>
    <div className="section-label"><h2>{person ? 'My snapshot' : leads(user.role) ? 'Organization snapshot' : 'Team snapshot'}</h2><span>AS OF TODAY · IST</span></div>
    <div className={'stats ' + (person ? 'stats-three' : '')}>
      {stats.map(({ label, value, hint, icon: Icon, tone, link }) => <button className="stat panel" key={label} onClick={() => go(link)}>
        <span className="stat-top"><span className={'tile-icon ' + tone}><Icon size={19} /></span><ArrowUpRight className="stat-arrow" size={17} /></span>
        <span className="stat-label">{label}</span><strong className={typeof value === 'string' ? 'stat-word' : ''}>{value}</strong><span className="stat-hint">{hint}</span>
      </button>)}
    </div>
    <section className="panel callout task-shortcut" aria-label="Personal task summary">
      <span className="tile-icon lavender"><ListTodo size={22} aria-hidden /></span>
      <div><h2>My tasks</h2><p>{openTasks} open · {dueTasks} due today or overdue</p></div>
      <button type="button" className="button secondary" onClick={() => go('My tasks')}>Open my tasks <ArrowRight size={16} aria-hidden /></button>
    </section>
    <div className="dashboard-grid">
      <section className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <h2>Attendance trend</h2>
            <p>{person ? 'Your recorded shifts · Last 7 days' : 'People with a recorded shift · Last 7 days'}</p>
          </div>
          <div className="chart-badges">
            <span className="chart-focus-pill">
              <Sparkles size={12} aria-hidden />
              {dateLabel(activePoint.date, { weekday: 'short', month: 'short', day: 'numeric' })}: {activePoint.count} ({presencePct}%)
            </span>
            <Trend current={series[6].count} previous={series[5].count} />
          </div>
        </div>
        <div className="chart-stage">
          <svg className="chart-sparkline" viewBox="0 0 320 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline fill="none" stroke="rgba(255, 196, 150, 0.38)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={sparkPoints} />
          </svg>
          <div className="chart" aria-label="Seven-day attendance chart">
            {series.map((item, index) => <div
              className={'chart-col ' + (selectedIdx === index ? 'chart-col-selected' : '')}
              key={item.date}
              onPointerEnter={() => setSelectedIdx(index)}
              onClick={() => setSelectedIdx(index)}
            >
              <div className="chart-track"><div className={'chart-bar ' + (index === 6 ? 'chart-current' : '')} style={{ height: (item.count / max * 100) + '%' }}><span>{item.count}</span></div></div>
              <span className="chart-day">{dateLabel(item.date, { weekday: 'short' })}</span>
            </div>)}
          </div>
        </div>
      </section>
      <section className="panel activity-panel">
        <div className="panel-heading"><div><h2>Recent activity</h2><p>Latest updates in your workspace</p></div><button className="icon-button" title="Open attendance" aria-label="Open attendance" onClick={() => go('Attendance')}><ArrowRight size={18} /></button></div>
        {activity.length === 0 ? <Empty>Activity will appear here as you use the workspace.</Empty> :
          <ul className="activity-list">{activity.slice(0, 4).map(item => {
            const Icon = item.kind === 'attendance' ? Clock3 : item.kind === 'leave' ? CalendarDays : CheckCircle2
            return <li key={item.id}><span className={'tile-icon ' + (item.kind === 'attendance' ? 'mint' : 'lavender')}><Icon size={15} /></span>
              <div><p><strong>{item.name}</strong> {item.detail}</p><small>{dateLabel(new Intl.DateTimeFormat('en-CA', { timeZone: data.organization.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(item.at)))} · {timeLabel(item.at)} IST</small></div>
            </li>
          })}</ul>}
      </section>
    </div>

    <div className="section-label">
      <h2><Layers size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} aria-hidden />Studio pulse & departments</h2>
      <span>INTERACTIVE CONSTELLATION · {directory.length} PEOPLE</span>
    </div>
    <section className="panel pulse-panel" aria-label="Studio departments">
      <div className="pulse-grid">
        {deptStats.map(({ dept, members, count, activeCount }) => {
          const isSelected = activeDept === dept
          const fillPct = count ? Math.round((activeCount / count) * 100) : 0
          return (
            <button
              type="button"
              key={dept}
              className={'pulse-card ' + (isSelected ? 'selected' : '')}
              onClick={() => setActiveDept(isSelected ? 'All' : dept)}
              aria-pressed={isSelected}
            >
              <div className="pulse-card-top">
                <strong>{dept}</strong>
                <Badge>{count}</Badge>
              </div>
              <div className="pulse-meter">
                <div className="pulse-meter-fill" style={{ width: `${Math.max(fillPct, 12)}%` }} />
              </div>
              <div className="pulse-card-foot">
                <div className="pulse-avatars">
                  {members.slice(0, 4).map(m => (
                    <span key={m.id} className="pulse-avatar-wrap" title={m.name}>
                      <Avatar id={m.id} name={m.name} small />
                      <span className={'presence-dot ' + (checkedInTodayIds.has(m.id) ? 'online' : onLeaveTodayIds.has(m.id) ? 'away' : completedTodayIds.has(m.id) ? 'done' : '')} />
                    </span>
                  ))}
                </div>
                <small>{person ? `${count} in dept` : `${activeCount} active today`}</small>
              </div>
            </button>
          )
        })}
      </div>
      <div className="pulse-roster">
        <div className="pulse-roster-head">
          <span>Showing <strong>{activeDept === 'All' ? 'All departments' : activeDept}</strong> · Quick directory preview</span>
          {activeDept !== 'All' && <button type="button" className="pulse-reset" onClick={() => setActiveDept('All')}>Reset filter</button>}
        </div>
        <div className="pulse-chips">
          {spotlightPeople.map(member => {
            const state = checkedInTodayIds.has(member.id) ? 'Checked in' : onLeaveTodayIds.has(member.id) ? 'On leave' : completedTodayIds.has(member.id) ? 'Shift done' : roleNames[member.role]
            const tone = checkedInTodayIds.has(member.id) ? 'online' : onLeaveTodayIds.has(member.id) ? 'away' : ''
            return (
              <button type="button" key={member.id} className="person-pill" onClick={() => go('Directory')}>
                <Avatar id={member.id} name={member.name} small />
                <div>
                  <strong>{member.name}</strong>
                  <small>{member.title} · <span className={'pill-state ' + tone}>{state}</span></small>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  </>
}

