import { useState } from 'react'
import { CalendarDays, Check, Circle, LockKeyhole, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { dateLabel, taskNeedsAttention, type Task, type Workspace } from './model'
import type { Save } from './Forms'
import { Badge, Empty, Notice } from './ui'

const filters = ['Open', 'Due & overdue', 'Completed'] as const
const priorityLabels = { low: 'Low', normal: 'Normal', high: 'High' } as const

export function TasksPage({ data, save, edit, remove }: {
  data: Workspace; save: Save; edit: (task?: Task) => void; remove: (task: Task) => void
}) {
  const [filter, setFilter] = useState<(typeof filters)[number]>('Open')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const open = data.tasks.filter(task => !task.completed)
  const lists = {
    Open: open,
    'Due & overdue': open.filter(task => taskNeedsAttention(task, data.day)),
    Completed: data.tasks.filter(task => task.completed),
  }
  const tasks = lists[filter]
  const done = lists.Completed.length

  async function toggle(task: Task) {
    setSaving(true)
    setError('')
    try {
      await save('/tasks/' + task.id, 'PATCH', { completed: !task.completed }, task.completed ? 'Task reopened.' : 'Task completed.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The task could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <div className="page-heading">
      <div><div className="eyebrow">Personal planner</div><h1>My tasks<span className="heading-period">.</span></h1>
        <p>Keep track of your own priorities, deadlines, and notes.</p></div>
      <button type="button" className="button primary" onClick={() => edit()}><Plus size={17} aria-hidden /> Add task</button>
    </div>
    <section className="panel callout task-progress" aria-label="Task progress">
      <span className="tile-icon lavender"><LockKeyhole size={21} aria-hidden /></span>
      <div><h2>Your private list</h2><p>{done} of {data.tasks.length} completed</p></div>
      <progress aria-label="Tasks completed" value={done} max={Math.max(data.tasks.length, 1)} />
    </section>
    <section className="panel list-panel" aria-label="Personal tasks">
      <div className="list-tools">
        <div className="segmented" role="group" aria-label="Filter tasks">
          {filters.map(item => <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>
            {item} <span aria-hidden>{lists[item].length}</span>
          </button>)}
        </div>
      </div>
      {error && <div className="task-error"><Notice error>{error}</Notice></div>}
      {tasks.length === 0 ? <Empty>{filter === 'Open' ? 'No open tasks. Add a task to plan your next step.' : filter === 'Completed' ? 'No completed tasks yet.' : 'Nothing due today or overdue.'}</Empty> :
        <ul className="task-list">
          {tasks.map(task => {
            const due = task.due_on
            const overdue = !task.completed && due !== null && due < data.day
            return <li className="task-row" key={task.id}>
              <button type="button" className="icon-button" disabled={saving} onClick={() => void toggle(task)}
                aria-label={(task.completed ? 'Reopen ' : 'Complete ') + task.title}>
                {task.completed ? <RotateCcw size={17} aria-hidden /> : <Circle size={17} aria-hidden />}
              </button>
              <div className="task-details">
                <strong>{task.title}</strong>
                {task.notes && <p>{task.notes}</p>}
                <div className="task-badges">
                  <Badge tone={task.priority === 'high' ? 'pending' : 'neutral'}>{priorityLabels[task.priority]} priority</Badge>
                  {due && <Badge tone={overdue ? 'negative' : 'neutral'}><CalendarDays size={13} aria-hidden />
                    {overdue ? 'Overdue · ' : !task.completed && due === data.day ? 'Due today · ' : 'Due · '}{dateLabel(due, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Badge>}
                  {task.completed && <Badge tone="positive"><Check size={13} aria-hidden /> Completed</Badge>}
                </div>
              </div>
              <div className="task-actions">
                <button type="button" className="icon-button" disabled={saving} aria-label={'Edit ' + task.title} onClick={() => edit(task)}><Pencil size={16} aria-hidden /></button>
                <button type="button" className="icon-button" disabled={saving} aria-label={'Delete ' + task.title} onClick={() => remove(task)}><Trash2 size={16} aria-hidden /></button>
              </div>
            </li>
          })}
        </ul>}
    </section>
  </>
}
