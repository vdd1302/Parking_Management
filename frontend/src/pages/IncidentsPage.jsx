import { useState } from 'react'
import api, { parseError } from '../api/client'
import IncidentModal from '../components/IncidentModal'
import { Alert, Badge, EmptyRow, Field, Modal, Pagination } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { INCIDENT_TYPES, formatDateTime } from '../utils/format'
import useFetch from '../utils/useFetch'

export default function IncidentsPage() {
  const { isManager } = useAuth()
  const [filters, setFilters] = useState({ status: 'OPEN', page: 1 })
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))
  const { data, error, reload } = useFetch('/incidents', params)
  const [creating, setCreating] = useState(false)
  const [resolving, setResolving] = useState(null)
  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState(null)

  const resolve = async (e) => {
    e.preventDefault()
    try {
      await api.post(`/incidents/${resolving.id}/resolve`, { resolution_note: note })
      setResolving(null)
      reload()
    } catch (err) {
      setActionError(parseError(err).message)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Yêu cầu xác minh ngoại lệ</h1>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Tạo yêu cầu
        </button>
      </div>
      <p className="muted">
        {isManager
          ? 'Các trường hợp bãi đầy, trùng lượt gửi, không tìm thấy lượt gửi hoặc thông tin không khớp do nhân viên chuyển lên.'
          : 'Các yêu cầu bạn đã chuyển cho quản lý xác minh.'}
      </p>

      <div className="tabs">
        {[
          ['OPEN', 'Chờ xử lý'],
          ['RESOLVED', 'Đã xử lý'],
          ['', 'Tất cả'],
        ].map(([value, label]) => (
          <button
            key={label}
            className={`tab ${filters.status === value ? 'active' : ''}`}
            onClick={() => setFilters({ status: value, page: 1 })}
          >
            {label}
          </button>
        ))}
      </div>

      <Alert>{error}</Alert>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Loại</th>
              <th>Biển số / Lượt gửi</th>
              <th>Mô tả</th>
              <th>Người tạo</th>
              <th>Kết quả</th>
              {isManager && <th />}
            </tr>
          </thead>
          <tbody>
            {data?.items.length ? (
              data.items.map((i) => (
                <tr key={i.id}>
                  <td>{formatDateTime(i.created_at)}</td>
                  <td>
                    <Badge tone={i.type === 'INFO_MISMATCH' ? 'red' : 'amber'}>{INCIDENT_TYPES[i.type]}</Badge>
                  </td>
                  <td>
                    <div className="plate">{i.plate_number || '—'}</div>
                    {i.session_code && <div className="mono small">{i.session_code}</div>}
                  </td>
                  <td className="pre-wrap">{i.description}</td>
                  <td>{i.created_by}</td>
                  <td>
                    {i.status === 'RESOLVED' ? (
                      <>
                        <Badge tone="green">Đã xử lý</Badge>
                        <div className="small">{i.resolution_note}</div>
                        <div className="muted small">
                          {i.resolved_by} · {formatDateTime(i.resolved_at)}
                        </div>
                      </>
                    ) : (
                      <Badge tone="amber">Chờ xử lý</Badge>
                    )}
                  </td>
                  {isManager && (
                    <td>
                      {i.status === 'OPEN' && (
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            setResolving(i)
                            setNote('')
                            setActionError(null)
                          }}
                        >
                          Xử lý
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <EmptyRow colSpan={isManager ? 7 : 6} />
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

      <IncidentModal open={creating} onClose={() => setCreating(false)} onCreated={reload} />

      <Modal
        open={!!resolving}
        onClose={() => setResolving(null)}
        title="Xử lý yêu cầu xác minh"
        footer={
          <>
            <button className="btn" onClick={() => setResolving(null)}>
              Huỷ
            </button>
            <button className="btn btn-primary" form="resolve-form">
              Đánh dấu đã xử lý
            </button>
          </>
        }
      >
        <form id="resolve-form" onSubmit={resolve} className="form-grid">
          <Alert>{actionError}</Alert>
          <p className="pre-wrap">{resolving?.description}</p>
          <Field label="Kết quả xác minh / hướng xử lý">
            <textarea rows={4} required value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </form>
      </Modal>
    </>
  )
}
