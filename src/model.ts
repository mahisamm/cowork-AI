export type Role = 'admin' | 'hr' | 'manager' | 'employee'
export type Person = {
  id: number; name: string; email: string; title: string; department: string
  role: Role; manager_id: number | null; joined_on: string
}
export type Shift = {
  id: number; employee_id: number; name: string; day: string; clock_in: string; clock_out: string | null
}
export type Leave = {
  id: number; employee_id: number; name: string; type: 'Annual' | 'Sick' | 'Personal'
  start_date: string; end_date: string; days: number; reason: string
  status: 'Pending' | 'Approved' | 'Rejected'; reviewable: boolean; reviewer: string | null
}
export type Activity = { id: string; name: string; detail: string; at: string; kind: 'attendance' | 'leave' | 'review' }
export type Task = {
  id: number
  title: string
  notes: string
  due_on: string | null
  priority: 'low' | 'normal' | 'high'
  completed: boolean
}
export type Workspace = {
  organization: { name: string; timezone: string }
  departments: string[]; user: Person; day: string; directory: Person[]; attendance: Shift[]; leaves: Leave[]; shift: Shift | null
  activity: Activity[]; series: { date: string; count: number }[]
  tasks: Task[]
  metrics: { people: number; attended: number; checkedIn: number; pending: number; reviewable: number; out: number; annualRemaining: number; annualAllowance: number }
}
export const taskNeedsAttention = (task: Task, day: string) => !task.completed && task.due_on !== null && task.due_on <= day
export const demoPassword = 'PeopleOps2026!'
export const roleNames: Record<Role, string> = { admin: 'Admin', hr: 'HR', manager: 'Manager', employee: 'Employee' }
export const leads = (role: Role) => role === 'admin' || role === 'hr'
export const canEdit = (role: Role, target: Role) => role === 'admin' || (role === 'hr' && ['employee', 'manager'].includes(target))
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('')
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name
export const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'))
export const timeLabel = (iso: string) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
export const daysLabel = (days: number) => days + (days === 1 ? ' day' : ' days')
export const dateRange = (start: string, end: string) => dateLabel(start) + (start === end ? '' : ' – ' + dateLabel(end))

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method,
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json', 'X-PeopleOps': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, data?.error ?? 'The workspace could not respond.')
  return data as T
}

