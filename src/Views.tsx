import { useState } from 'react'
import { CalendarDays, CalendarPlus, Check, Clock3, GitFork, LayoutGrid, List, Mail, Plus, Search, UserRound, UsersRound, X } from 'lucide-react'
import { formatDuration, ShiftAction } from './Dashboard'
import { canEdit, dateLabel, dateRange, daysLabel, leads, roleNames, timeLabel, type Leave, type Person, type Workspace } from './model'
import { Avatar, Badge, Empty } from './ui'

export function Directory({ data, open }: { data: Workspace; open: (person?: Person) => void }) {
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [view, setView] = useState<'table' | 'cards' | 'org'>('table')
  const [focusedId, setFocusedId] = useState<number>(data.user.id)
  const needle = query.trim().toLowerCase()
  const people = data.directory.filter(person =>
    (!department || person.department === department) && [person.name, person.email, person.title, person.department, roleNames[person.role]].some(value => value.toLowerCase().includes(needle)))

  const checkedInIds = new Set(data.attendance.filter(s => s.day === data.day && !s.clock_out).map(s => s.employee_id))
  const onLeaveIds = new Set(data.leaves.filter(l => l.status === 'Approved' && l.start_date <= data.day && l.end_date >= data.day).map(l => l.employee_id))
  const managers = data.directory.filter(p => data.directory.some(child => child.manager_id === p.id))
  const standalone = data.directory.filter(p => p.manager_id === null && !managers.some(m => m.id === p.id))
  const focusedPerson = data.directory.find(p => p.id === focusedId) ?? data.user

  return <>
    <div className="page-heading">
      <div><div className="eyebrow">PEOPLE</div><h1>Employee directory<span className="heading-period">.</span></h1><p>Find the people behind the work at {data.organization.name}.</p></div>
      {leads(data.user.role) && <button className="button primary" onClick={() => open()}><Plus size={18} /> Add employee</button>}
    </div>
    <section className="panel list-panel" aria-label="Employees">
      <div className="list-tools">
        <div className="list-title"><h2>People</h2><Badge>{people.length}</Badge></div>
        <div className="filters">
          <label className="search"><Search size={17} /><input aria-label="Search employees" placeholder="Search employees" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <select aria-label="Filter by department" value={department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{data.departments.map(item => <option key={item}>{item}</option>)}</select>
          <div className="segmented" aria-label="Directory layout">
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} title="Table view"><List size={14} /> Table</button>
            <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')} title="3D Holographic cards"><LayoutGrid size={14} /> 3D Cards</button>
            <button type="button" aria-pressed={view === 'org'} onClick={() => setView('org')} title="Org constellation"><GitFork size={14} /> Org Graph</button>
          </div>
        </div>
      </div>
      {people.length === 0 ? <Empty>No employees match these filters.</Empty> : view === 'table' ? (
        <div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Department</th><th>Workspace role</th><th>Reports to</th><th><span className="sr-only">Profile</span></th></tr></thead>
          <tbody>{people.map(person => <tr key={person.id}>
            <td><div className="table-person"><Avatar id={person.id} name={person.name} /><div><strong>{person.name}{person.id === data.user.id ? ' (you)' : ''}</strong><small>{person.title}</small></div></div></td>
            <td>{person.department}</td><td><Badge>{roleNames[person.role]}</Badge></td>
            <td>{data.directory.find(item => item.id === person.manager_id)?.name ?? '—'}</td>
            <td><button className="button small secondary" onClick={() => open(person)}>{canEdit(data.user.role, person.role) ? 'Edit' : 'View'}<span className="sr-only"> {person.name}</span></button></td>
          </tr>)}</tbody>
        </table></div>
      ) : view === 'cards' ? (
        <div className="holo-grid">
          {people.map(person => {
            const managerName = data.directory.find(item => item.id === person.manager_id)?.name ?? 'Independent'
            const isOnline = checkedInIds.has(person.id)
            const isAway = onLeaveIds.has(person.id)
            return (
              <article key={person.id} className="holo-card">
                <div className="holo-glare" aria-hidden="true" />
                <div className="holo-head">
                  <div className="holo-avatar-wrap">
                    <Avatar id={person.id} name={person.name} />
                    <span className={'presence-dot ' + (isOnline ? 'online' : isAway ? 'away' : '')} />
                  </div>
                  <div className="holo-badges">
                    <Badge tone={isOnline ? 'positive' : isAway ? 'pending' : 'neutral'}>
                      {isOnline ? 'On clock' : isAway ? 'On leave' : roleNames[person.role]}
                    </Badge>
                  </div>
                </div>
                <div className="holo-body">
                  <strong>{person.name}{person.id === data.user.id ? ' (you)' : ''}</strong>
                  <span>{person.title}</span>
                  <small><Mail size={11} aria-hidden /> {person.email}</small>
                </div>
                <div className="holo-meta">
                  <div><small>DEPARTMENT</small><strong>{person.department}</strong></div>
                  <div><small>REPORTS TO</small><strong>{managerName}</strong></div>
                </div>
                <div className="holo-foot">
                  <span>Joined {dateLabel(person.joined_on, { month: 'short', year: 'numeric' })}</span>
                  <button className="button small secondary" onClick={() => open(person)}>
                    {canEdit(data.user.role, person.role) ? 'Edit' : 'View'}<span className="sr-only"> {person.name}</span>
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="org-constellation">
          <div className="org-Inspector">
            <div className="table-person">
              <Avatar id={focusedPerson.id} name={focusedPerson.name} />
              <div>
                <strong>{focusedPerson.name}</strong>
                <small>{focusedPerson.title} · {focusedPerson.department}</small>
              </div>
              <Badge>{roleNames[focusedPerson.role]}</Badge>
            </div>
            <div className="org-inspector-actions">
              <small>{focusedPerson.email}</small>
              <button className="button small secondary" onClick={() => open(focusedPerson)}>
                {canEdit(data.user.role, focusedPerson.role) ? 'Edit profile' : 'Inspect profile'}
              </button>
            </div>
          </div>
          <div className="org-clusters">
            {managers.map(mgr => {
              const reports = data.directory.filter(p => p.manager_id === mgr.id)
              return (
                <div key={mgr.id} className="org-cluster">
                  <button
                    type="button"
                    className={'org-node org-node-lead ' + (focusedId === mgr.id ? 'selected' : '')}
                    onClick={() => setFocusedId(mgr.id)}
                  >
                    <Avatar id={mgr.id} name={mgr.name} small />
                    <div>
                      <strong>{mgr.name}</strong>
                      <small>{mgr.title} · {reports.length} reports</small>
                    </div>
                  </button>
                  <div className="org-branches">
                    {reports.map(rep => (
                      <button
                        type="button"
                        key={rep.id}
                        className={'org-node ' + (focusedId === rep.id ? 'selected' : '')}
                        onClick={() => setFocusedId(rep.id)}
                      >
                        <Avatar id={rep.id} name={rep.name} small />
                        <div>
                          <strong>{rep.name}</strong>
                          <small>{rep.title}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            {standalone.length > 0 && (
              <div className="org-cluster">
                <div className="org-cluster-label">OPERATIONS & SPECIALISTS</div>
                <div className="org-branches">
                  {standalone.map(node => (
                    <button
                      type="button"
                      key={node.id}
                      className={'org-node ' + (focusedId === node.id ? 'selected' : '')}
                      onClick={() => setFocusedId(node.id)}
                    >
                      <Avatar id={node.id} name={node.name} small />
                      <div>
                        <strong>{node.name}</strong>
                        <small>{node.title}</small>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  </>
}

export function Attendance({ data, clock, busy }: { data: Workspace; busy: boolean; clock: (action: 'check-in' | 'check-out') => void }) {
  const [filter, setFilter] = useState<'today' | 'history'>('today')
  const personal = data.user.role === 'employee'
  const rows = filter === 'today' ? data.attendance.filter(shift => shift.day === data.day || !shift.clock_out) : data.attendance
  return <>
    <div className="page-heading"><div><div className="eyebrow">TIME TRACKING</div><h1>Attendance<span className="heading-period">.</span></h1><p>{personal ? 'Track your workday and review your shifts.' : 'Track your workday and monitor attendance in your workspace.'}</p></div></div>
    <section className="panel callout">
      <span className="tile-icon mint"><Clock3 size={22} /></span>
      <div>
        <h2>My shift</h2>
        <p>{data.shift ? 'In at ' + timeLabel(data.shift.clock_in) + (data.shift.clock_out ? ' · Out at ' + timeLabel(data.shift.clock_out) : '') + ' IST · ' + formatDuration(data.shift.clock_in, data.shift.clock_out) : 'You haven’t checked in today.'}</p>
      </div>
      <ShiftAction data={data} busy={busy} clock={clock} />
    </section>
    <section className="panel list-panel" aria-label="Attendance records">
      <div className="list-tools"><div className="list-title"><h2>{personal ? 'My records' : 'Attendance records'}</h2><Badge>{rows.length}</Badge></div>
        <div className="segmented" aria-label="Attendance period">
          <button aria-pressed={filter === 'today'} onClick={() => setFilter('today')}>Today</button>
          <button aria-pressed={filter === 'history'} onClick={() => setFilter('history')}>Last 30 days</button>
        </div>
      </div>
      {!rows.length ? <Empty>No shifts for this period.</Empty> : <div className="table-wrap"><table>
        <thead><tr>{!personal && <th>Employee</th>}<th>Date</th><th>Check in (IST)</th><th>Check out (IST)</th><th>Status</th></tr></thead>
        <tbody>{rows.map(shift => <tr key={shift.id}>
          {!personal && <td><div className="table-person"><Avatar name={shift.name} id={shift.employee_id} small /><strong>{shift.name}</strong></div></td>}
          <td>{dateLabel(shift.day, { month: 'short', day: 'numeric', year: 'numeric' })}</td><td>{timeLabel(shift.clock_in)}</td><td>{shift.clock_out ? timeLabel(shift.clock_out) : '—'}<small>{formatDuration(shift.clock_in, shift.clock_out)}</small></td>
          <td><Badge tone={shift.clock_out ? 'neutral' : 'positive'}>{shift.clock_out ? 'Completed' : 'Checked in'}</Badge></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>
}

export function LeavePage({ data, busy, request, decide }: { data: Workspace; busy: boolean; request: () => void; decide: (leave: Leave, decision: 'Approved' | 'Rejected') => void }) {
  const employee = data.user.role === 'employee'
  const [filter, setFilter] = useState<'all' | 'mine' | 'review'>(employee ? 'mine' : 'all')
  const rows = data.leaves.filter(item => filter === 'all' || (filter === 'mine' ? item.employee_id === data.user.id : item.reviewable))
  const pct = Math.max(0, Math.min(100, Math.round((data.metrics.annualRemaining / Math.max(data.metrics.annualAllowance, 1)) * 100)))
  const circ = 2 * Math.PI * 19
  return <>
    <div className="page-heading"><div><div className="eyebrow">TIME OFF</div><h1>Leave requests<span className="heading-period">.</span></h1><p>{employee ? 'Request time off and follow each decision.' : 'Manage your time off and review requests in your workspace.'}</p></div>
      <button className="button primary" onClick={request}><CalendarPlus size={18} /> Request leave</button>
    </div>
    <section className="panel callout">
      <span className="tile-icon lavender"><CalendarDays size={22} /></span>
      <div><h2>My annual leave</h2><p>{daysLabel(data.metrics.annualRemaining)} remaining of {daysLabel(data.metrics.annualAllowance)} · {data.day.slice(0, 4)} calendar year</p></div>
      <div className="leave-ring-wrap" aria-hidden="true">
        <svg className="leave-ring" viewBox="0 0 46 46">
          <circle cx="23" cy="23" r="19" className="leave-ring-track" />
          <circle cx="23" cy="23" r="19" className="leave-ring-fill" strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ} />
        </svg>
        <span>{pct}%</span>
      </div>
    </section>
    <section className="panel list-panel" aria-label="Leave records">
      <div className="list-tools"><div className="list-title"><h2>{employee ? 'My requests' : 'Requests'}</h2><Badge>{rows.length}</Badge></div>
        {!employee && <div className="segmented" aria-label="Leave filter">
          <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{leads(data.user.role) ? 'Organization' : 'My team'}</button>
          <button aria-pressed={filter === 'mine'} onClick={() => setFilter('mine')}><UserRound size={15} /> Mine</button>
          <button aria-pressed={filter === 'review'} onClick={() => setFilter('review')}><UsersRound size={15} /> To review ({data.metrics.reviewable})</button>
        </div>}
      </div>
      {rows.length === 0 ? <Empty>{filter === 'review' ? 'You’re all caught up.' : 'No requests to show yet.'}</Empty> : <div className="table-wrap"><table className="leave-table">
        <thead><tr>{!employee && <th>Employee</th>}<th>Type & reason</th><th>Dates</th><th>Status</th>{!employee && <th>Decision</th>}</tr></thead>
        <tbody>{rows.map(item => <tr key={item.id}>
          {!employee && <td><div className="table-person"><Avatar name={item.name} id={item.employee_id} small /><strong>{item.name}</strong></div></td>}
          <td><strong>{item.type} leave</strong><small className="leave-reason">{item.reason}</small></td>
          <td>{dateRange(item.start_date, item.end_date)}<small>{daysLabel(item.days)}</small></td>
          <td><Badge tone={item.status === 'Approved' ? 'positive' : item.status === 'Rejected' ? 'negative' : 'pending'}>{item.status}</Badge>{item.reviewer && <small>By {item.reviewer}</small>}</td>
          {!employee && <td>{item.reviewable ? <div className="decision-actions">
            <button className="button small secondary" disabled={busy} onClick={() => decide(item, 'Approved')} aria-label={'Approve ' + item.name + '’s request'}><Check size={14} /> Approve</button>
            <button className="button small reject" disabled={busy} onClick={() => decide(item, 'Rejected')} aria-label={'Reject ' + item.name + '’s request'}><X size={14} /> Reject</button>
          </div> : '—'}</td>}
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>
}

