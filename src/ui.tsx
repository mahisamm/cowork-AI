import { useEffect, useId, useRef, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Check, CircleAlert, Clock3, X } from 'lucide-react'
import { initials } from './model'

export function Mark() {
  const id = useId()
  const amber = `mark-amber-${id}`
  const mint = `mark-mint-${id}`
  return (
    <div className="mark" aria-hidden="true">
      <svg className="mark-svg" viewBox="0 0 40 40" fill="none">
        <defs>
          <linearGradient id={amber} x1="6" y1="5" x2="34" y2="35" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffe5cc" />
            <stop offset="52%" stopColor="#ffb486" />
            <stop offset="100%" stopColor="#ea7e49" />
          </linearGradient>
          <linearGradient id={mint} x1="8" y1="32" x2="32" y2="8" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#8ce8c2" />
            <stop offset="100%" stopColor="#b8ceff" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="14.5" stroke={`url(#${mint})`} strokeWidth="1.2" strokeDasharray="4 3" opacity="0.5" />
        <path d="M11.5 26.5C11.5 22.4 15.2 19.8 20 19.8C24.8 19.8 28.5 22.4 28.5 26.5" stroke={`url(#${amber})`} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M7.8 29C7.8 25.9 10.3 23.9 13.5 23.9" stroke={`url(#${mint})`} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
        <path d="M32.2 29C32.2 25.9 29.7 23.9 26.5 23.9" stroke={`url(#${mint})`} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
        <circle cx="20" cy="13" r="3.6" fill={`url(#${amber})`} />
        <circle cx="11.8" cy="16.8" r="2.4" fill={`url(#${mint})`} opacity="0.92" />
        <circle cx="28.2" cy="16.8" r="2.4" fill={`url(#${mint})`} opacity="0.92" />
        <path d="M20 26.2L21.1 29.3L24.2 30.4L21.1 31.5L20 34.6L18.9 31.5L15.8 30.4L18.9 29.3L20 26.2Z" fill="#ffe0c4" />
      </svg>
    </div>
  )
}

export function OrgMark() {
  return (
    <span className="org-icon" aria-hidden="true">
      <svg viewBox="0 0 28 28" width="20" height="20" fill="none">
        <path d="M14 3L16.7 10.5L24.2 13.2L16.7 15.9L14 23.4L11.3 15.9L3.8 13.2L11.3 10.5L14 3Z" stroke="#ffd8b8" strokeWidth="1.7" fill="#ffb48629" strokeLinejoin="round" />
        <circle cx="14" cy="13.2" r="2.2" fill="#ffe3c8" />
      </svg>
    </span>
  )
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
