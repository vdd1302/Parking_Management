import { useEffect } from 'react'
import { SESSION_STATUS } from '../utils/format'

export function Alert({ tone = 'error', title, children, onClose }) {
  if (!children && !title) return null
  return (
    <div className={`alert alert-${tone}`} role="alert">
      <div className="alert-body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {onClose && (
        <button type="button" className="alert-close" onClick={onClose} aria-label="Đóng">
          ×
        </button>
      )}
    </div>
  )
}

export function Modal({ open, title, onClose, children, footer, width = 520 }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="alert-close" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function Badge({ tone = 'gray', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function StatusBadge({ status }) {
  const s = SESSION_STATUS[status] || { label: status, tone: 'gray' }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

export function Pagination({ page, pages, total, onChange }) {
  if (!pages || pages <= 1) return <div className="pagination muted">Tổng: {total ?? 0}</div>
  return (
    <div className="pagination">
      <span className="muted">Tổng: {total}</span>
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ Trước
      </button>
      <span>
        Trang {page}/{pages}
      </span>
      <button className="btn btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Sau ›
      </button>
    </div>
  )
}

export function Spinner({ label = 'Đang tải...' }) {
  return <div className="spinner">{label}</div>
}

export function EmptyRow({ colSpan, children = 'Không có dữ liệu' }) {
  return (
    <tr>
      <td colSpan={colSpan} className="empty">
        {children}
      </td>
    </tr>
  )
}
