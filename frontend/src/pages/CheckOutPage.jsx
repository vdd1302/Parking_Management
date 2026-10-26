import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api, { parseError } from '../api/client'
import IncidentModal from '../components/IncidentModal'
import { Alert, Field, StatusBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import {
  ERROR_TO_INCIDENT,
  PAYMENT_METHODS,
  PRICING_METHODS,
  PRICING_UNIT,
  formatDateTime,
  formatDuration,
  formatMoney,
} from '../utils/format'
import useFetch from '../utils/useFetch'

/**
 * Quy trình xe ra:
 *  1. Tìm lượt gửi đang hoạt động (mã vé / biển số)
 *  2. Đối chiếu biển số + loại xe thực tế -> hệ thống xác định giờ ra và tính phí
 *  3. Nhân viên xác nhận đã thu tiền -> kết thúc lượt gửi, giải phóng chỗ
 */
export default function CheckOutPage() {
  const { isManager } = useAuth()
  const [params] = useSearchParams()
  const types = useFetch('/vehicle-types').data || []

  const [query, setQuery] = useState(params.get('q') || '')
  const [session, setSession] = useState(null)
  const [verify, setVerify] = useState({ plate_number: '', vehicle_type_id: '' })
  const [payment, setPayment] = useState({ method: 'CASH', received: '', note: '' })
  const [override, setOverride] = useState({ enabled: false, note: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [escalate, setEscalate] = useState(null)
  const [notice, setNotice] = useState(null)

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(parseError(err))
    } finally {
      setBusy(false)
    }
  }

  const lookup = (q) =>
    run(async () => {
      setDone(null)
      setSession(null)
      setNotice(null)
      const res = await api.get('/sessions/lookup', { params: { q } })
      setSession(res.data)
      setVerify({ plate_number: '', vehicle_type_id: res.data.vehicle_type_id })
      setOverride({ enabled: false, note: '' })
      setPayment({ method: 'CASH', received: '', note: '' })
    })

  useEffect(() => {
    if (params.get('q')) lookup(params.get('q'))
  }, [])

  const calculate = (e) => {
    e?.preventDefault()
    run(async () => {
      // Tính lại phí cho lượt đã đối chiếu trước đó: dùng thông tin của chính lượt gửi
      const body =
        session.status === 'PENDING_PAYMENT'
          ? { plate_number: session.plate_number, vehicle_type_id: session.vehicle_type_id }
          : { plate_number: verify.plate_number, vehicle_type_id: Number(verify.vehicle_type_id) }
      if (override.enabled && session.status !== 'PENDING_PAYMENT') {
        Object.assign(body, { override: true, override_note: override.note })
      }
      const res = await api.post(`/sessions/${session.id}/checkout`, body)
      setSession(res.data)
    })
  }

  const cancelQuote = () =>
    run(async () => {
      const res = await api.post(`/sessions/${session.id}/cancel-checkout`)
      setSession(res.data)
    })

  const confirmPayment = () =>
    run(async () => {
      const res = await api.post(`/sessions/${session.id}/pay`, { method: payment.method, note: payment.note })
      setDone(res.data)
      setSession(null)
      setQuery('')
    })

  const openEscalate = () => {
    const mismatch = error?.details?.mismatches
      ?.map((m) => `${m.field === 'plate_number' ? 'Biển số' : 'Loại xe'}: vé "${m.expected}" - thực tế "${m.actual}"`)
      .join('; ')
    setEscalate({
      type: ERROR_TO_INCIDENT[error?.code] || 'OTHER',
      plate_number: verify.plate_number || session?.plate_number || query,
      session_id: session?.id,
      description: `Xe ra${session ? ` - lượt gửi ${session.code}` : ` - tìm "${query}"`}: ${error?.message || ''}${
        mismatch ? `\n${mismatch}` : ''
      }`,
    })
  }

  const received = Number(payment.received || 0)
  const change = session?.fee_amount != null && received ? received - session.fee_amount : null
  const pending = session?.status === 'PENDING_PAYMENT'
  const isMismatch = error?.code === 'VEHICLE_MISMATCH'

  return (
    <>
      <div className="page-header">
        <h1>Xử lý phương tiện ra khỏi bãi</h1>
      </div>

      <form
        className="card search-bar"
        onSubmit={(e) => {
          e.preventDefault()
          lookup(query)
        }}
      >
        <input
          autoFocus
          placeholder="Nhập mã lượt gửi (VD: LG261022000001) hoặc biển số"
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
        />
        <button className="btn btn-primary" disabled={busy || !query.trim()}>
          Tìm lượt gửi
        </button>
      </form>

      {error && (
        <Alert tone={ERROR_TO_INCIDENT[error.code] ? 'warning' : 'error'} onClose={() => setError(null)}>
          {error.message}
          {isMismatch && (
            <ul className="mismatch-list">
              {error.details.mismatches.map((m) => (
                <li key={m.field}>
                  {m.field === 'plate_number' ? 'Biển số' : 'Loại xe'}: trên vé <b>{m.expected}</b> — thực tế{' '}
                  <b>{m.actual}</b>
                </li>
              ))}
            </ul>
          )}
          {ERROR_TO_INCIDENT[error.code] && (
            <div className="alert-actions">
              <button type="button" className="btn btn-sm" onClick={openEscalate}>
                Chuyển quản lý xác minh
              </button>
              {isMismatch && isManager && !override.enabled && (
                <button type="button" className="btn btn-sm" onClick={() => setOverride({ enabled: true, note: '' })}>
                  Quản lý xác minh & cho xe ra
                </button>
              )}
            </div>
          )}
        </Alert>
      )}
      {notice && (
        <Alert tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {done && (
        <div className="card success-card">
          <h2>Hoàn tất lượt gửi {done.code}</h2>
          <p>
            Đã thu <b>{formatMoney(done.payment.amount)}</b> ({PAYMENT_METHODS[done.payment.method]}) — xe{' '}
            <span className="plate">{done.plate_number}</span> được ra khỏi bãi.
          </p>
        </div>
      )}

      {session && (
        <div className="two-col">
          <div className="card">
            <h2>
              Lượt gửi {session.code} <StatusBadge status={session.status} />
            </h2>
            <dl className="kv">
              <dt>Biển số</dt>
              <dd className="plate">{session.plate_number}</dd>
              <dt>Loại xe</dt>
              <dd>{session.vehicle_type_name}</dd>
              <dt>Giờ vào</dt>
              <dd>{formatDateTime(session.check_in_at)}</dd>
              <dt>Nhân viên nhận xe</dt>
              <dd>{session.checked_in_by}</dd>
              {session.note && (
                <>
                  <dt>Ghi chú</dt>
                  <dd>{session.note}</dd>
                </>
              )}
            </dl>
          </div>

          {!pending ? (
            <form className="card" onSubmit={calculate}>
              <h2>Đối chiếu phương tiện</h2>
              <p className="muted">Nhập biển số và chọn loại xe thực tế đang ra cổng.</p>
              <Field label="Biển số thực tế">
                <input
                  className="input-plate"
                  required
                  autoFocus
                  value={verify.plate_number}
                  onChange={(e) => setVerify({ ...verify, plate_number: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field label="Loại xe thực tế">
                <select
                  value={verify.vehicle_type_id}
                  onChange={(e) => setVerify({ ...verify, vehicle_type_id: e.target.value })}
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              {override.enabled && (
                <Field label="Lý do xác minh (quản lý)" hint="Bắt buộc khi cho xe ra dù thông tin không khớp">
                  <input
                    required
                    maxLength={200}
                    value={override.note}
                    onChange={(e) => setOverride({ ...override, note: e.target.value })}
                  />
                </Field>
              )}
              <button className="btn btn-primary btn-block" disabled={busy}>
                {override.enabled ? 'Xác minh & tính phí' : 'Xác định giờ ra & tính phí'}
              </button>
            </form>
          ) : (
            <div className="card">
              <h2>Thanh toán</h2>
              <dl className="kv">
                <dt>Giờ ra</dt>
                <dd>{formatDateTime(session.check_out_at)}</dd>
                <dt>Thời lượng gửi</dt>
                <dd>{formatDuration(session.duration_minutes)}</dd>
                <dt>Bảng giá</dt>
                <dd>
                  {PRICING_METHODS[session.price_rule.pricing_method]} —{' '}
                  {formatMoney(session.price_rule.unit_price)}
                  {PRICING_UNIT[session.price_rule.pricing_method]}
                </dd>
              </dl>
              <div className="fee-box">
                <span>Số tiền cần thanh toán</span>
                <strong>{formatMoney(session.fee_amount)}</strong>
              </div>
              <Field label="Hình thức thanh toán">
                <select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              {payment.method === 'CASH' && (
                <Field
                  label="Tiền khách đưa (tuỳ chọn)"
                  hint={change != null ? (change >= 0 ? `Tiền thối: ${formatMoney(change)}` : 'Chưa đủ tiền') : null}
                >
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={payment.received}
                    onChange={(e) => setPayment({ ...payment, received: e.target.value })}
                  />
                </Field>
              )}
              <div className="btn-row">
                <button className="btn" type="button" onClick={cancelQuote} disabled={busy}>
                  Huỷ / đối chiếu lại
                </button>
                <button className="btn" type="button" onClick={() => calculate()} disabled={busy}>
                  Tính lại phí
                </button>
                <button
                  className="btn btn-success"
                  type="button"
                  onClick={confirmPayment}
                  disabled={busy || (payment.method === 'CASH' && change != null && change < 0)}
                >
                  Xác nhận đã thu tiền
                </button>
              </div>
              <p className="muted small">Lượt gửi chỉ hoàn tất và giải phóng chỗ sau khi xác nhận đã thu tiền.</p>
            </div>
          )}
        </div>
      )}

      <IncidentModal
        open={!!escalate}
        defaults={escalate || {}}
        onClose={() => setEscalate(null)}
        onCreated={() => setNotice('Đã chuyển yêu cầu xác minh cho quản lý.')}
      />
    </>
  )
}
