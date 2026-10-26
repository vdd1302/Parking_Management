import { useState } from 'react'
import api, { parseError } from '../api/client'
import { Alert, Badge, EmptyRow, Field } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { PRICING_METHODS, PRICING_UNIT, formatDateTime, formatMoney } from '../utils/format'
import useFetch from '../utils/useFetch'

const STATE = {
  CURRENT: { label: 'Đang áp dụng', tone: 'green' },
  SCHEDULED: { label: 'Sắp áp dụng', tone: 'blue' },
  EXPIRED: { label: 'Đã thay thế', tone: 'gray' },
}

export default function PricesPage() {
  const { isManager } = useAuth()
  const current = useFetch('/prices/current')
  const history = useFetch('/prices')
  const [form, setForm] = useState({
    vehicle_type_id: '',
    pricing_method: 'PER_TURN',
    unit_price: '',
    effective_from: '',
    note: '',
  })
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const reload = () => {
    current.reload()
    history.reload()
  }

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    try {
      const body = { ...form, vehicle_type_id: Number(form.vehicle_type_id), unit_price: Number(form.unit_price) }
      // datetime-local không có múi giờ -> chuyển sang ISO đầy đủ theo giờ máy
      body.effective_from = form.effective_from ? new Date(form.effective_from).toISOString() : null
      await api.post('/prices', body)
      setSuccess('Đã lưu bảng giá mới. Các giao dịch đã hoàn tất giữ nguyên số tiền cũ.')
      setForm({ ...form, unit_price: '', effective_from: '', note: '' })
      reload()
    } catch (err) {
      setError(parseError(err).message)
    }
  }

  const remove = async (rule) => {
    if (!window.confirm('Huỷ bảng giá sắp áp dụng này?')) return
    try {
      await api.delete(`/prices/${rule.id}`)
      reload()
    } catch (err) {
      setError(parseError(err).message)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Bảng giá dịch vụ</h1>
      </div>

      <div className="price-grid">
        {current.data?.map(({ vehicle_type: vt, price_rule: rule }) => (
          <div key={vt.id} className="card price-card">
            <div className="muted">{vt.name}</div>
            {rule ? (
              <>
                <div className="price">
                  {formatMoney(rule.unit_price)}
                  <span className="muted small">{PRICING_UNIT[rule.pricing_method]}</span>
                </div>
                <div className="small">{PRICING_METHODS[rule.pricing_method]}</div>
                <div className="muted small">Từ {formatDateTime(rule.effective_from)}</div>
              </>
            ) : (
              <Badge tone="red">Chưa có bảng giá</Badge>
            )}
          </div>
        ))}
      </div>

      {isManager && (
        <form className="card" onSubmit={submit}>
          <h2>Thiết lập / cập nhật giá</h2>
          <Alert>{error}</Alert>
          <Alert tone="success">{success}</Alert>
          <div className="form-row">
            <Field label="Loại phương tiện">
              <select
                required
                value={form.vehicle_type_id}
                onChange={(e) => setForm({ ...form, vehicle_type_id: e.target.value })}
              >
                <option value="">-- Chọn --</option>
                {current.data?.map(({ vehicle_type: vt }) => (
                  <option key={vt.id} value={vt.id}>
                    {vt.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cách tính phí">
              <select value={form.pricing_method} onChange={(e) => setForm({ ...form, pricing_method: e.target.value })}>
                {Object.entries(PRICING_METHODS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Đơn giá (VNĐ${PRICING_UNIT[form.pricing_method]})`}>
              <input
                type="number"
                min="0"
                step="500"
                required
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
              />
            </Field>
            <Field label="Áp dụng từ" hint="Để trống = áp dụng ngay">
              <input
                type="datetime-local"
                value={form.effective_from}
                onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Ghi chú">
            <input maxLength={255} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <p className="muted small">
            Theo giờ / theo ngày: thời gian gửi được làm tròn lên (tối thiểu 1 đơn vị). Mỗi lần cập nhật tạo một phiên bản
            giá mới; giá cũ được lưu lại để đối chiếu.
          </p>
          <button className="btn btn-primary">Lưu bảng giá</button>
        </form>
      )}

      <h2 className="section-title">Lịch sử bảng giá</h2>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Loại xe</th>
              <th>Cách tính</th>
              <th className="num">Đơn giá</th>
              <th>Áp dụng từ</th>
              <th>Trạng thái</th>
              <th>Ghi chú</th>
              <th>Người tạo</th>
              {isManager && <th />}
            </tr>
          </thead>
          <tbody>
            {history.data?.length ? (
              history.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.vehicle_type_name}</td>
                  <td>{PRICING_METHODS[r.pricing_method]}</td>
                  <td className="num">
                    {formatMoney(r.unit_price)}
                    {PRICING_UNIT[r.pricing_method]}
                  </td>
                  <td>{formatDateTime(r.effective_from)}</td>
                  <td>
                    <Badge tone={STATE[r.state].tone}>{STATE[r.state].label}</Badge>
                  </td>
                  <td>{r.note}</td>
                  <td>{r.created_by}</td>
                  {isManager && (
                    <td>
                      {r.state === 'SCHEDULED' && (
                        <button className="btn btn-sm btn-danger" onClick={() => remove(r)}>
                          Huỷ
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <EmptyRow colSpan={isManager ? 8 : 7} />
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
