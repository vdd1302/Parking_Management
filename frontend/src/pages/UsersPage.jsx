import { useState } from 'react'
import api, { parseError } from '../api/client'
import { Alert, Badge, EmptyRow, Field, Modal, Pagination } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { ROLES, formatDateTime } from '../utils/format'
import useFetch from '../utils/useFetch'

export default function UsersPage() {
  const { user: me } = useAuth()
  const [filters, setFilters] = useState({ q: '', page: 1 })
  const [q, setQ] = useState('')
  const { data, error, reload } = useFetch('/users', filters)
  const [editing, setEditing] = useState(null)
  const [resetting, setResetting] = useState(null)
  const [formError, setFormError] = useState(null)

  const save = async (e) => {
    e.preventDefault()
    setFormError(null)
    try {
      if (editing.id) {
        const { full_name, role, is_active } = editing
        await api.put(`/users/${editing.id}`, { full_name, role, is_active })
      } else {
        await api.post('/users', editing)
      }
      setEditing(null)
      reload()
    } catch (err) {
      setFormError(parseError(err).message)
    }
  }

  const resetPassword = async (e) => {
    e.preventDefault()
    setFormError(null)
    try {
      await api.post(`/users/${resetting.id}/reset-password`, { password: resetting.password })
      setResetting(null)
    } catch (err) {
      setFormError(parseError(err).message)
    }
  }

  const toggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { is_active: !u.is_active })
      reload()
    } catch (err) {
      alert(parseError(err).message)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Tài khoản người dùng</h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            setFormError(null)
            setEditing({ username: '', full_name: '', password: '', role: 'STAFF', is_active: true })
          }}
        >
          + Thêm tài khoản
        </button>
      </div>

      <form
        className="card filters"
        onSubmit={(e) => {
          e.preventDefault()
          setFilters({ q, page: 1 })
        }}
      >
        <input placeholder="Tìm theo tên đăng nhập / họ tên" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">Tìm</button>
      </form>

      <Alert>{error}</Alert>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Tên đăng nhập</th>
              <th>Họ tên</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Ngày tạo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.items.length ? (
              data.items.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.username}</td>
                  <td>{u.full_name}</td>
                  <td>
                    <Badge tone={u.role === 'MANAGER' ? 'blue' : 'gray'}>{ROLES[u.role]}</Badge>
                  </td>
                  <td>{u.is_active ? <Badge tone="green">Hoạt động</Badge> : <Badge tone="red">Đã khoá</Badge>}</td>
                  <td>{formatDateTime(u.created_at)}</td>
                  <td className="btn-row">
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        setFormError(null)
                        setEditing(u)
                      }}
                    >
                      Sửa
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        setFormError(null)
                        setResetting({ ...u, password: '' })
                      }}
                    >
                      Đặt lại mật khẩu
                    </button>
                    {u.id !== me.id && (
                      <button className={`btn btn-sm ${u.is_active ? 'btn-danger' : ''}`} onClick={() => toggleActive(u)}>
                        {u.is_active ? 'Khoá' : 'Mở khoá'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <EmptyRow colSpan={6} />
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

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Sửa tài khoản ${editing.username}` : 'Thêm tài khoản'}
        footer={
          <>
            <button className="btn" onClick={() => setEditing(null)}>
              Huỷ
            </button>
            <button className="btn btn-primary" form="user-form">
              Lưu
            </button>
          </>
        }
      >
        {editing && (
          <form id="user-form" className="form-grid" onSubmit={save}>
            <Alert>{formError}</Alert>
            {!editing.id && (
              <Field label="Tên đăng nhập">
                <input
                  required
                  value={editing.username}
                  onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                />
              </Field>
            )}
            <Field label="Họ tên">
              <input
                required
                value={editing.full_name}
                onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
              />
            </Field>
            {!editing.id && (
              <Field label="Mật khẩu" hint="Tối thiểu 6 ký tự">
                <input
                  type="password"
                  required
                  minLength={6}
                  value={editing.password}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                />
              </Field>
            )}
            <Field label="Vai trò">
              <select
                value={editing.role}
                disabled={editing.id === me.id}
                onChange={(e) => setEditing({ ...editing, role: e.target.value })}
              >
                {Object.entries(ROLES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </form>
        )}
      </Modal>

      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        title={`Đặt lại mật khẩu: ${resetting?.username || ''}`}
        footer={
          <>
            <button className="btn" onClick={() => setResetting(null)}>
              Huỷ
            </button>
            <button className="btn btn-primary" form="reset-form">
              Đặt lại
            </button>
          </>
        }
      >
        {resetting && (
          <form id="reset-form" className="form-grid" onSubmit={resetPassword}>
            <Alert>{formError}</Alert>
            <Field label="Mật khẩu mới" hint="Tối thiểu 6 ký tự">
              <input
                type="password"
                required
                minLength={6}
                value={resetting.password}
                onChange={(e) => setResetting({ ...resetting, password: e.target.value })}
              />
            </Field>
          </form>
        )}
      </Modal>
    </>
  )
}
