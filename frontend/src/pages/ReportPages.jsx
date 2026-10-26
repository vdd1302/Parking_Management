import { useState } from 'react'
import CapacityCards from '../components/CapacityCards'
import { Alert, EmptyRow } from '../components/ui'
import { PAYMENT_METHODS, daysAgo, formatDate, formatMoney, today } from '../utils/format'
import useFetch from '../utils/useFetch'

function ReportFilters({ value, onApply }) {
  const [form, setForm] = useState(value)
  const types = useFetch('/vehicle-types', { include_inactive: 1 }).data || []
  const preset = (from) => {
    const next = { ...form, from, to: today() }
    setForm(next)
    onApply(next)
  }
  return (
    <form
      className="card filters"
      onSubmit={(e) => {
        e.preventDefault()
        onApply(form)
      }}
    >
      <label className="inline-field">
        Từ ngày
        <input type="date" required value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
      </label>
      <label className="inline-field">
        Đến ngày
        <input type="date" required value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
      </label>
      <select value={form.vehicle_type_id} onChange={(e) => setForm({ ...form, vehicle_type_id: e.target.value })}>
        <option value="">Tất cả loại xe</option>
        {types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button className="btn btn-primary">Xem thống kê</button>
      <span className="preset-group">
        <button type="button" className="btn btn-sm" onClick={() => preset(today())}>
          Hôm nay
        </button>
        <button type="button" className="btn btn-sm" onClick={() => preset(daysAgo(6))}>
          7 ngày
        </button>
        <button type="button" className="btn btn-sm" onClick={() => preset(daysAgo(29))}>
          30 ngày
        </button>
      </span>
    </form>
  )
}

function useReport(url) {
  const [filters, setFilters] = useState({ from: daysAgo(6), to: today(), vehicle_type_id: '' })
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))
  return { filters, setFilters, ...useFetch(url, params) }
}

/** Thanh tỉ lệ nhỏ trong ô bảng giúp so sánh nhanh giữa các ngày. */
function Bar({ value, max, tone = 'blue' }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className="bar-track">
      <div className={`bar-fill bar-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function TrafficReportPage() {
  const { filters, setFilters, data, error } = useReport('/reports/traffic')
  const maxDay = Math.max(0, ...(data?.by_day || []).flatMap((d) => [d.check_ins, d.check_outs]))

  return (
    <>
      <div className="page-header">
        <h1>Thống kê lượt xe và sức chứa</h1>
      </div>
      <ReportFilters value={filters} onApply={setFilters} />
      <Alert>{error}</Alert>
      {data && (
        <>
          <div className="stats-grid">
            <div className="stat">
              <div className="stat-label">Lượt xe vào</div>
              <div className="stat-value">{data.total_check_ins}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Lượt xe ra (đã thanh toán)</div>
              <div className="stat-value">{data.total_check_outs}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Đang gửi (hiện tại)</div>
              <div className="stat-value">
                {data.current_capacity.items.reduce((s, i) => s + i.occupied, 0)} /{' '}
                {data.current_capacity.items.reduce((s, i) => s + i.capacity, 0)}
              </div>
            </div>
          </div>

          <h2 className="section-title">Sức chứa tại thời điểm truy vấn</h2>
          <CapacityCards items={data.current_capacity.items} />

          <div className="two-col">
            <div className="card table-card">
              <h2>Theo loại phương tiện</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Loại xe</th>
                    <th className="num">Vào</th>
                    <th className="num">Ra</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_vehicle_type.length ? (
                    data.by_vehicle_type.map((r) => (
                      <tr key={r.vehicle_type_id}>
                        <td>{r.vehicle_type_name}</td>
                        <td className="num">{r.check_ins}</td>
                        <td className="num">{r.check_outs}</td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow colSpan={3} />
                  )}
                </tbody>
              </table>
            </div>
            <div className="card table-card">
              <h2>Theo ngày</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th className="num">Vào</th>
                    <th className="num">Ra</th>
                    <th className="bar-col">
                      <span className="legend legend-blue">Vào</span> <span className="legend legend-teal">Ra</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_day.length ? (
                    data.by_day.map((d) => (
                      <tr key={d.date}>
                        <td>{formatDate(d.date)}</td>
                        <td className="num">{d.check_ins}</td>
                        <td className="num">{d.check_outs}</td>
                        <td className="bar-col">
                          <Bar value={d.check_ins} max={maxDay} />
                          <Bar value={d.check_outs} max={maxDay} tone="teal" />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow colSpan={4} />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}

export function RevenueReportPage() {
  const { filters, setFilters, data, error } = useReport('/reports/revenue')
  const maxDay = Math.max(0, ...(data?.by_day || []).map((d) => d.amount))

  return (
    <>
      <div className="page-header">
        <h1>Thống kê doanh thu</h1>
      </div>
      <ReportFilters value={filters} onApply={setFilters} />
      <Alert>{error}</Alert>
      {data && (
        <>
          <div className="stats-grid">
            <div className="stat">
              <div className="stat-label">Tổng doanh thu</div>
              <div className="stat-value">{formatMoney(data.total_amount)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Số giao dịch</div>
              <div className="stat-value">{data.total_transactions}</div>
            </div>
            {data.by_method.map((m) => (
              <div className="stat" key={m.method}>
                <div className="stat-label">
                  {PAYMENT_METHODS[m.method]} ({m.transactions})
                </div>
                <div className="stat-value">{formatMoney(m.amount)}</div>
              </div>
            ))}
          </div>

          <div className="two-col">
            <div className="card table-card">
              <h2>Theo loại phương tiện</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Loại xe</th>
                    <th className="num">Giao dịch</th>
                    <th className="num">Doanh thu</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_vehicle_type.length ? (
                    data.by_vehicle_type.map((r) => (
                      <tr key={r.vehicle_type_id}>
                        <td>{r.vehicle_type_name}</td>
                        <td className="num">{r.transactions}</td>
                        <td className="num">{formatMoney(r.amount)}</td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow colSpan={3} />
                  )}
                </tbody>
              </table>
            </div>
            <div className="card table-card">
              <h2>Theo ngày</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th className="num">Giao dịch</th>
                    <th className="num">Doanh thu</th>
                    <th className="bar-col" />
                  </tr>
                </thead>
                <tbody>
                  {data.by_day.length ? (
                    data.by_day.map((d) => (
                      <tr key={d.date}>
                        <td>{formatDate(d.date)}</td>
                        <td className="num">{d.transactions}</td>
                        <td className="num">{formatMoney(d.amount)}</td>
                        <td className="bar-col">
                          <Bar value={d.amount} max={maxDay} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow colSpan={4} />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
