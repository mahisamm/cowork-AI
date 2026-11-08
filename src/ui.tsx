import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Asterisk, Check, CircleAlert, Clock3, X } from 'lucide-react'
import { initials } from './model'

export function Mark() {
  return <div className="mark"><Asterisk aria-hidden size={28} strokeWidth={2.65} /></div>
}

export function Avatar({ name, id, small = false }: { name: string; id: number; small?: boolean }) {
  return <span aria-hidden className={'avatar tone-' + id % 6 + (small ? ' avatar-small' : '')}>{initials(name)}</span>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  const Icon = tone === 'positive' ? Check : tone === 'pending' ? Clock3 : tone === 'negative' ? X : null
  return <span className={'badge badge-' + tone}>{Icon && <Icon size={12} aria-hidden />}{children}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  const Icon = error ? CircleAlert : Check
  return <div className={'notice ' + (error ? 'notice-error' : '')} role={error ? 'alert' : 'status'}><Icon size={17} aria-hidden />{children}</div>
}

export function Dialog({ title, description, close, children }: { title: string; description: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog className="dialog" ref={ref} onCancel={event => { event.preventDefault(); close() }} aria-labelledby="dialog-title" aria-describedby="dialog-description">
    <div className="dialog-header">
      <div><h2 id="dialog-title">{title}</h2><p id="dialog-description">{description}</p></div>
      <button type="button" className="icon-button" aria-label="Close dialog" onClick={close}><X size={19} /></button>
    </div>
    {children}
  </dialog>
}

export function Orbit({ login = false }: { login?: boolean }) {
  return <svg className={'orbit' + (login ? ' orbit-login' : '')} viewBox="0 0 600 320" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={login ? 'login-orbit' : 'hero-orbit'} x1="100" y1="295" x2="550" y2="18" gradientUnits="userSpaceOnUse">
        <stop stopColor="#a5f5b8" stopOpacity=".08"/><stop offset=".55" stopColor="#a5f5b8" stopOpacity=".55"/><stop offset="1" stopColor="#e6f7ad" stopOpacity=".14"/>
      </linearGradient>
    </defs>
    <g stroke={'url(#' + (login ? 'login-orbit' : 'hero-orbit') + ')'} transform="rotate(-27 380 160)">
      {[48, 63, 78, 93, 108, 123, 138, 153].map((radius, index) => <ellipse key={radius} cx={386 - index * 5} cy={159 + index * 2} rx={radius * 1.28} ry={radius * .75} />)}
    </g>
    <g fill="#d7f9af"><circle cx="333" cy="107" r="3"/><circle cx="485" cy="202" r="3" opacity=".74"/><circle cx="232" cy="219" r="2.5" opacity=".55"/><path d="M428 58v22m-11-11h22" stroke="#d7f9af" opacity=".78"/><path d="M518 111v12m-6-6h12" stroke="#d7f9af" opacity=".72"/></g>
  </svg>
}

export function Trend({ current, previous }: { current: number; previous: number }) {
  const delta = current - previous
  if (!delta) return <span className="chart-trend">Same as yesterday</span>
  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight
  return <span className="chart-trend"><Icon size={14} aria-hidden />{Math.abs(delta)} {delta > 0 ? 'more' : 'fewer'} than yesterday</span>
}
