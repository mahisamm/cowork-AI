import { useState, type FormEvent } from 'react'
import { canEdit, dateLabel, dateRange, roleNames, type Leave, type Person, type Role, type Task, type Workspace } from './model'
import { Avatar, Badge, Dialog, Notice } from './ui'

export type Save = (path: string, method: string, body: unknown, success: string) => Promise<void>
type Props = { data: Workspace; close: () => void; save: Save }
const value = (form: FormData, name: string) => String(form.get(name) ?? '')

function useSubmit(save: Save, close: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(path: string, method: string, body: unknown, message: string) {
    setBusy(true)
    setError('')
    try {
      await save(path, method, body, message)
      close()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The change could not be saved.')
    } finally { setBusy(false) }
  }
  return { submit, busy, error }
}

function FormActions({ close, busy, label, danger = false }: { close: () => void; busy: boolean; label: string; danger?: boolean }) {
  return <div className="form-actions"><button type="button" className="button secondary" onClick={close} disabled={busy}>Cancel</button>
    <button className={'button ' + (danger ? 'danger' : 'primary')} disabled={busy}>{busy ? 'Saving…' : label}</button></div>
}

export function TaskForm({ task, remove = false, close, save }: { task?: Task; remove?: boolean; close: () => void; save: Save }) {
  const { submit, busy, error } = useSubmit(save, close)
  const dismiss = () => { if (!busy) close() }
  const path = task ? '/tasks/' + task.id : '/tasks'
  if (remove && task) return <Dialog title="Delete task" description="This removes the task from your list." close={dismiss}>
    <form className="dialog-form" onSubmit={event => { event.preventDefault(); void submit(path, 'DELETE', undefined, 'Task deleted.') }}>
      <p className="review-reason">{task.title}</p>
      {error && <Notice error>{error}</Notice>}
      <FormActions close={dismiss} busy={busy} label="Delete task" danger />
    </form>
  </Dialog>
  function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const input = { title: value(form, 'title'), notes: value(form, 'notes'), dueOn: value(form, 'dueOn') || null, priority: value(form, 'priority') }
    void submit(path, task ? 'PATCH' : 'POST', input, task ? 'Task updated.' : 'Task added.')
  }
  return <Dialog title={task ? 'Edit task' : 'Add task'} description="Plan something you want to get done." close={dismiss}>
    <form className="dialog-form" onSubmit={handle}>
      <label>Task title<input name="title" required maxLength={120} defaultValue={task?.title} /></label>
      <div className="form-grid">
        <label>Due date<input name="dueOn" type="date" min="0001-01-01" max="9999-12-31" defaultValue={task?.due_on ?? ''} /></label>
        <label>Priority<select name="priority" defaultValue={task?.priority ?? 'normal'}>
          <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
        </select></label>
      </div>
      <label>Notes<textarea name="notes" rows={3} maxLength={1000} defaultValue={task?.notes} /></label>
      {error && <Notice error>{error}</Notice>}
      <FormActions close={dismiss} busy={busy} label={task ? 'Save task' : 'Add task'} />
    </form>
  </Dialog>
}

export function LeaveForm({ data, close, save }: Props) {
  const { submit, busy, error } = useSubmit(save, close)
  const [start, setStart] = useState(data.day)
  const [end, setEnd] = useState(data.day)
  function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    void submit('/leave', 'POST', { type: value(form, 'type'), start, end, reason: value(form, 'reason') }, 'Leave request submitted.')
  }
  const dismiss = () => { if (!busy) close() }
  return <Dialog title="Request leave" description="Choose the days you’ll be away and add a short reason." close={dismiss}>
    <form className="dialog-form" onSubmit={handle}>
      <label>Leave type<select name="type"><option>Annual</option><option>Sick</option><option>Personal</option></select></label>
      <div className="form-grid">
        <label>Start date<input type="date" name="start" min={data.day} value={start} onChange={event => {
          const next = event.target.value
          setStart(next)
          if (end < next) setEnd(next)
        }} required /></label>
        <label>End date<input type="date" name="end" min={start || data.day} value={end} onChange={event => setEnd(event.target.value)} required /></label>
      </div>
      <label>Reason<textarea name="reason" rows={3} maxLength={500} required placeholder="Add a short note for your reviewer" /></label>
      {error && <Notice error>{error}</Notice>}
      <FormActions close={dismiss} busy={busy} label="Submit request" />
    </form>
  </Dialog>
}

export function ReviewForm({ close, save, item, decision }: { close: () => void; save: Save; item: Leave; decision: 'Approved' | 'Rejected' }) {
  const { submit, busy, error } = useSubmit(save, close)
  const approve = decision === 'Approved'
  const action = approve ? 'Approve' : 'Reject'
  const dismiss = () => { if (!busy) close() }
  return <Dialog title={action + ' leave request'} description={item.name + ' · ' + item.type + ' leave · ' + dateRange(item.start_date, item.end_date)} close={dismiss}>
    <form className="dialog-form" onSubmit={event => {
      event.preventDefault()
      void submit('/leave/' + item.id, 'PATCH', { decision }, 'Leave request ' + decision.toLowerCase() + '.')
    }}>
      <div className="review-reason"><span className="eyebrow">REQUEST REASON</span><p>{item.reason}</p></div>
      {error && <Notice error>{error}</Notice>}
      <FormActions close={dismiss} busy={busy} label={action + ' request'} danger={!approve} />
    </form>
  </Dialog>
}

export function PersonForm({ data, close, save, person }: Props & { person?: Person }) {
  const { submit, busy, error } = useSubmit(save, close)
  const editing = Boolean(person)
  const writable = !person || canEdit(data.user.role, person.role)
  const roleOptions: Role[] = data.user.role === 'admin' ? ['employee', 'manager', 'hr', 'admin'] : ['employee', 'manager']
  const dismiss = () => { if (!busy) close() }
  const byId = new Map(data.directory.map(item => [item.id, item]))
  const canReportTo = (managerId: number) => {
    if (!person) return true
    const seen = new Set<number>()
    let current: Person | undefined = byId.get(managerId)
    while (current) {
      if (current.id === person.id || seen.has(current.id)) return false
      seen.add(current.id)
      current = current.manager_id === null ? undefined : byId.get(current.manager_id)
    }
    return true
  }
  function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const input = {
      name: value(form, 'name'), email: value(form, 'email'), title: value(form, 'title'),
      department: value(form, 'department'), managerId: Number(value(form, 'manager')) || null,
      ...(editing ? {} : { role: value(form, 'role'), password: value(form, 'password') }),
    }
    void submit('/employees' + (person ? '/' + person.id : ''), editing ? 'PATCH' : 'POST', input, editing ? 'Employee profile updated.' : 'Employee account created.')
  }
  if (person && !writable) return <Dialog title="Employee profile" description={data.organization.name} close={close}>
    <div className="profile-view">
      <div className="table-person"><Avatar name={person.name} id={person.id} /><div><strong>{person.name}</strong><small>{person.title}</small></div><Badge>{roleNames[person.role]}</Badge></div>
      <dl><dt>Work email</dt><dd>{person.email}</dd><dt>Department</dt><dd>{person.department}</dd><dt>Reports to</dt><dd>{data.directory.find(item => item.id === person.manager_id)?.name ?? '—'}</dd><dt>Joined</dt><dd>{dateLabel(person.joined_on, { month: 'long', day: 'numeric', year: 'numeric' })}</dd></dl>
    </div>
  </Dialog>
  return <Dialog title={editing ? 'Edit employee' : 'Add employee'} description={editing ? 'Update this employee’s profile and reporting manager.' : 'Create a profile and a sign-in for a new teammate.'} close={dismiss}>
    <form className="dialog-form" onSubmit={handle}>
      <div className="form-grid">
        <label>Full name<input name="name" required maxLength={90} defaultValue={person?.name} /></label>
        <label>Work email<input name="email" type="email" required maxLength={150} defaultValue={person?.email} /></label>
        <label>Job title<input name="title" required maxLength={90} defaultValue={person?.title} /></label>
        <label>Department<select name="department" defaultValue={person?.department ?? ''} required><option value="" disabled>Choose a department</option>{data.departments.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Reports to<select name="manager" defaultValue={person?.manager_id ?? ''}><option value="">No manager</option>{data.directory.filter(item => item.role === 'manager' && canReportTo(item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Workspace role<select name="role" disabled={editing} defaultValue={person?.role ?? 'employee'}>{(person ? [person.role] : roleOptions).map(role => <option key={role} value={role}>{roleNames[role]}</option>)}</select></label>
      </div>
      {!editing && <label>Initial password<input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required placeholder="At least 12 characters" /></label>}
      {error && <Notice error>{error}</Notice>}
      <FormActions close={dismiss} busy={busy} label={editing ? 'Save profile' : 'Create account'} />
    </form>
  </Dialog>
}

