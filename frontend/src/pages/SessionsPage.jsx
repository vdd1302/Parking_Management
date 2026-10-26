import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CapacityCards from '../components/CapacityCards'
import { Alert, EmptyRow, Modal, Pagination, StatusBadge } from '../components/ui'
import { PAYMENT_METHODS, SESSION_STATUS, formatDateTime, formatDuration, formatMoney } from '../utils/format'
import useFetch from '../utils/useFetch'

const EMPTY = { plate: '', code: '', vehicle_type_id: '', status: '', from: '', to: '' }

export default function SessionsPage() {
  const [searchParams] = useSearchParams()
  const initial = { ...EMPTY, status: searchParams.get('status') || '' }
  const [form, setForm] = useState(initial)
  const [filters, setFilters] = useState({ ...initial, page: 1 })
  const [detail, setDetail] = useState(null)

  const capacity = useFetch('/capacity')
  const types = useFetch('/vehicle-types', { include_inactive: 1 }).data || []
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))
  const { data, error, loading } = useFetch('/sessions', params)

  const submit = (e) => {
    e.preventDefault()
    setFilters({ ...form, page: 1 })
  }

  return (
    <>
      <div className="page-header">
        <h1>Theo dõi và tra cứu lượt gửi</h1>
      </div>

      {capacity.data && <CapacityCards items={capacity.data.items} />}

      <form className="card filters" onSubmit={submit}>
        <input placeholder="Biển số" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} />
        <input
          placeholder="Mã lượt gửi"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
        <select value={form.vehicle_type_id} onChange={(e) => setForm({ ...form, vehicle_type_id: e.target.value })}>
          <option value="">Tất cả loại xe</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE,PENDING_PAYMENT">Đang trong bãi</option>
          {Object.entries(SESSION_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <label className="inline-field">
          Vào từ
          <input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        </label>
        <label className="inline-field">
          đến
          <input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
        </label>
        <button className="btn btn-primary">Tìm kiếm</button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setForm(EMPTY)
            setFilters({ ...EMPTY, page: 1 })
          }}
        >
          Xoá lọc
        </button>
      </form>

      <Alert>{error}</Alert>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Mã lượt gửi</th>
              <th>Biển số</th>
              <th>Loại xe</th>
              <th>Giờ vào</th>
              <th>Giờ ra</th>
              <th className="num">Phí</th>
              <th>Trạng thái</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <EmptyRow colSpan={8}>Đang tải...</EmptyRow>
            ) : data?.items.length ? (
              data.items.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => setDetail(s)}>
                  <td className="mono">{s.code}</td>
                  <td className="plate">{s.plate_number}</td>
                  <td>{s.vehicle_type_name}</td>
                  <td>{formatDateTime(s.check_in_at)}</td>
                  <td>{formatDateTime(s.check_out_at)}</td>
                  <td className="num">{formatMoney(s.fee_amount)}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {s.status !== 'COMPLETED' && (
                      <Link className="btn btn-sm" to={`/check-out?q=${encodeURIComponent(s.code)}`}>
                        Cho xe ra
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <EmptyRow colSpan={8} />
            )}
          </tbody>
        </table>
        {data && (
          <Pagination
            page={data.page}
            pages={data.pages}
            total={data.total}
            onChange={(page) => setFilters({ ...filters, page })}
          />
        )}
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Lượt gửi ${detail?.code || ''}`}>
        {detail && (
          <dl className="kv">
            <dt>Trạng thái</dt>
            <dd>
              <StatusBadge status={detail.status} />
            </dd>
            <dt>Biển số</dt>
            <dd className="plate">{detail.plate_number}</dd>
            <dt>Loại xe</dt>
            <dd>{detail.vehicle_type_name}</dd>
            <dt>Giờ vào</dt>
            <dd>
              {formatDateTime(detail.check_in_at)} — {detail.checked_in_by}
            </dd>
            <dt>Giờ ra</dt>
            <dd>
              {formatDateTime(detail.check_out_at)}
              {detail.checked_out_by && ` — ${detail.checked_out_by}`}
            </dd>
            <dt>Thời lượng</dt>
            <dd>{formatDuration(detail.duration_minutes)}</dd>
            <dt>Phí</dt>
            <dd>{formatMoney(detail.fee_amount)}</dd>
            {detail.payment && (
              <>
                <dt>Thanh toán</dt>
                <dd>
                  {PAYMENT_METHODS[detail.payment.method]} lúc {formatDateTime(detail.payment.paid_at)} —{' '}
                  {detail.payment.received_by}
                </dd>
              </>
            )}
            {detail.note && (
              <>
                <dt>Ghi chú</dt>
                <dd>{detail.note}</dd>
              </>
            )}
          </dl>
        )}
      </Modal>
    </>
  )
}
