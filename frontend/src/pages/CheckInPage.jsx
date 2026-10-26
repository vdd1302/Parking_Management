import { useEffect, useRef, useState } from 'react'
import api, { parseError } from '../api/client'
import CapacityCards from '../components/CapacityCards'
import IncidentModal from '../components/IncidentModal'
import { Alert, Field } from '../components/ui'
import { ERROR_TO_INCIDENT, formatDateTime } from '../utils/format'
import useFetch from '../utils/useFetch'

export default function CheckInPage() {
  const capacity = useFetch('/capacity')
  const [form, setForm] = useState({ plate_number: '', vehicle_type_id: null, note: '' })
  const [error, setError] = useState(null)
  const [ticket, setTicket] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [escalate, setEscalate] = useState(null)
  const [notice, setNotice] = useState(null)
  const plateRef = useRef(null)

  const types = capacity.data?.items || []

  useEffect(() => {
    if (!form.vehicle_type_id && types.length) setForm((f) => ({ ...f, vehicle_type_id: types[0].id }))
  }, [types, form.vehicle_type_id])

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      const res = await api.post('/sessions/check-in', form)
      setTicket(res.data.session)
      setForm({ ...form, plate_number: '', note: '' })
      capacity.reload()
      plateRef.current?.focus()
    } catch (err) {
      setError(parseError(err))
      capacity.reload()
    } finally {
      setSubmitting(false)
    }
  }

  const openEscalate = () => {
    const type = types.find((t) => t.id === form.vehicle_type_id)
    setEscalate({
      type: ERROR_TO_INCIDENT[error.code] || 'OTHER',
      plate_number: form.plate_number,
      session_id: error.details?.session?.id,
      description: `Xe vào - ${type?.name || ''}: ${error.message}`,
    })
  }

  return (
    <>
      <div className="page-header">
        <h1>Tiếp nhận phương tiện vào bãi</h1>
      </div>

      <div className="two-col">
        <form className="card" onSubmit={submit}>
          <h2>Thông tin phương tiện</h2>
          {error && (
            <Alert tone={ERROR_TO_INCIDENT[error.code] ? 'warning' : 'error'} onClose={() => setError(null)}>
              {error.message}
              {ERROR_TO_INCIDENT[error.code] && (
                <div className="alert-actions">
                  <button type="button" className="btn btn-sm" onClick={openEscalate}>
                    Chuyển quản lý xác minh
                  </button>
                </div>
              )}
            </Alert>
          )}
          {notice && (
            <Alert tone="success" onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          )}
          <Field label="Biển số xe" hint="VD: 29A-123.45, 59X1-678.90">
            <input
              ref={plateRef}
              className="input-plate"
              autoFocus
              required
              maxLength={20}
              value={form.plate_number}
              onChange={(e) => setForm({ ...form, plate_number: e.target.value.toUpperCase() })}
            />
          </Field>
          <div className="field">
            <span className="field-label">Loại phương tiện</span>
            <CapacityCards
              items={types}
              selectedId={form.vehicle_type_id}
              onSelect={(id) => setForm({ ...form, vehicle_type_id: id })}
            />
          </div>
          <Field label="Ghi chú (tuỳ chọn)">
            <input maxLength={255} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <button className="btn btn-primary btn-block" disabled={submitting || !form.vehicle_type_id}>
            {submitting ? 'Đang xử lý...' : 'Tiếp nhận xe vào'}
          </button>
        </form>

        <div className="card">
          <h2>Vé gửi xe</h2>
          {ticket ? (
            <div className="ticket" id="ticket">
              <div className="ticket-code">{ticket.code}</div>
              <dl className="kv">
                <dt>Biển số</dt>
                <dd className="plate">{ticket.plate_number}</dd>
                <dt>Loại xe</dt>
                <dd>{ticket.vehicle_type_name}</dd>
                <dt>Giờ vào</dt>
                <dd>{formatDateTime(ticket.check_in_at)}</dd>
                <dt>Nhân viên</dt>
                <dd>{ticket.checked_in_by}</dd>
              </dl>
              <button type="button" className="btn btn-sm no-print" onClick={() => window.print()}>
                In vé
              </button>
            </div>
          ) : (
            <p className="muted">Vé sẽ hiển thị tại đây sau khi tiếp nhận xe thành công.</p>
          )}
        </div>
      </div>

      <IncidentModal
        open={!!escalate}
        defaults={escalate || {}}
        onClose={() => setEscalate(null)}
        onCreated={() => setNotice('Đã chuyển yêu cầu xác minh cho quản lý.')}
      />
    </>
  )
}
