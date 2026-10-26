import { useState } from 'react'
import api, { parseError } from '../api/client'
import { Alert, Field } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../utils/format'

export default function ProfilePage() {
  const { user } = useAuth()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [msg, setMsg] = useState({})

  const submit = async (e) => {
    e.preventDefault()
    if (form.new_password !== form.confirm) {
      setMsg({ error: 'Mật khẩu xác nhận không khớp' })
      return
    }
    try {
      await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      setMsg({ success: 'Đổi mật khẩu thành công' })
      setForm({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      setMsg({ error: parseError(err).message })
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Tài khoản của tôi</h1>
      </div>
      <div className="two-col">
        <div className="card">
          <dl className="kv">
            <dt>Tên đăng nhập</dt>
            <dd className="mono">{user.username}</dd>
            <dt>Họ tên</dt>
            <dd>{user.full_name}</dd>
            <dt>Vai trò</dt>
            <dd>{ROLES[user.role]}</dd>
          </dl>
        </div>
        <form className="card" onSubmit={submit}>
          <h2>Đổi mật khẩu</h2>
          <Alert>{msg.error}</Alert>
          <Alert tone="success">{msg.success}</Alert>
          <Field label="Mật khẩu hiện tại">
            <input
              type="password"
              required
              value={form.current_password}
              onChange={(e) => setForm({ ...form, current_password: e.target.value })}
            />
          </Field>
          <Field label="Mật khẩu mới" hint="Tối thiểu 6 ký tự">
            <input
              type="password"
              required
              minLength={6}
              value={form.new_password}
              onChange={(e) => setForm({ ...form, new_password: e.target.value })}
            />
          </Field>
          <Field label="Nhập lại mật khẩu mới">
            <input
              type="password"
              required
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            />
          </Field>
          <button className="btn btn-primary">Đổi mật khẩu</button>
        </form>
      </div>
    </>
  )
}
