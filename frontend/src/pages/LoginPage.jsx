import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { parseError } from '../api/client'
import { Alert } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import '../login.css'

function Icon({ name, ...props }) {
  const paths = {
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}

function ParkingIllustration() {
  return (
    <svg className="parking-illustration" viewBox="0 0 600 330" fill="none" aria-hidden="true">
      <defs>
        <pattern id="parking-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0v28" stroke="#fff" strokeOpacity=".035" /></pattern>
        <linearGradient id="parking-car" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#91A8FF" /><stop offset="1" stopColor="#4C6CE8" /></linearGradient>
      </defs>
      <rect width="600" height="330" fill="url(#parking-grid)" />
      <g transform="translate(54 35) rotate(-7 240 130)">
        <rect width="488" height="254" rx="22" fill="#1C3550" stroke="#55708C" strokeOpacity=".5" />
        <path d="M26 91h436M26 163h436" stroke="#8AA2BB" strokeOpacity=".5" />
        {[32, 116, 200, 284, 368, 452].map(x => <path key={x} d={`M${x} 21v70m0 72v70`} stroke="#8AA2BB" strokeOpacity=".55" strokeWidth="2" />)}
        <path d="M45 127h388" stroke="#B3C3D6" strokeOpacity=".4" strokeDasharray="13 13" strokeWidth="2" />
        <path d="m245 119 10 8-10 8" stroke="#B3C3D6" strokeWidth="2" />
        {[[52, 24], [220, 24], [388, 24], [136, 177], [304, 177]].map(([x, y], i) => (
          <g key={x} transform={`translate(${x} ${y})`}>
            <rect x="-3" y="12" width="49" height="10" rx="3" fill="#101E30" />
            <rect x="-3" y="39" width="49" height="10" rx="3" fill="#101E30" />
            <rect width="43" height="61" rx="12" fill={i === 1 ? '#E4EBF5' : 'url(#parking-car)'} />
            <path d="m7 17 3-7h23l3 7-3 6H10l-3-6Zm0 26 3-5h23l3 5-3 7H10l-3-7Z" fill="#182F4A" />
            <path d="M5 28v8m33-8v8" stroke="#fff" strokeOpacity=".5" strokeWidth="2" />
          </g>
        ))}
        <rect x="122" y="27" width="71" height="55" rx="7" fill="#39C8A0" fillOpacity=".09" stroke="#66DABB" strokeDasharray="4 4" />
        <text x="157" y="63" textAnchor="middle" fill="#79E0C5" fontSize="24" fontFamily="sans-serif">P</text>
      </g>
      <g transform="translate(395 259)"><rect width="162" height="44" rx="12" fill="#F3F7FF" /><circle cx="23" cy="22" r="5" fill="#159D77" /><text x="38" y="27" fill="#243D57" fontSize="13" fontFamily="sans-serif">Sẵn sàng vận hành</text></g>
    </svg>
  )
}

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  if (user) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await login(form.username.trim(), form.password)
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (err) {
      setError(parseError(err).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Giới thiệu hệ thống">
        <div className="auth-brand"><span className="auth-logo">P<span /></span><div>Quản lý bãi xe<small>HỆ THỐNG VẬN HÀNH</small></div></div>
        <div className="auth-story-content">
          <span className="auth-eyebrow"><span /> KẾT NỐI MỌI LƯỢT XE</span>
          <h1>Vận hành bãi xe,<br /><span>rõ ràng từng lượt gửi.</span></h1>
          <p>Từ đón xe đến thu phí, mọi thao tác được kết nối trong một không gian quản lý.</p>
          <ParkingIllustration />
          <div className="auth-features"><span>01 <b>Tiếp nhận xe</b></span><span>02 <b>Kiểm soát xe ra</b></span><span>03 <b>Quản lý thu phí</b></span></div>
        </div>
        <div className="auth-story-footer"><Icon name="shield" /> Đồng hành cùng nhân viên và quản lý bãi xe</div>
      </section>
      <section className="auth-panel" aria-labelledby="login-heading">
        <div className="auth-panel-top"><span>CỔNG TRUY CẬP NỘI BỘ</span><span className="auth-panel-mark">P /</span></div>
        <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit} aria-busy={submitting}>
        <div className="auth-welcome-icon"><Icon name="lock" width="25" height="25" /></div>
        <p className="auth-kicker">CHÀO MỪNG TRỞ LẠI</p>
        <h2 id="login-heading">Đăng nhập hệ thống</h2>
        <p className="auth-description">Nhập tài khoản để bắt đầu quản lý bãi xe của bạn.</p>
        <Alert>{error}</Alert>
        <label className="auth-label" htmlFor="login-username">Tên đăng nhập</label>
        <div className="auth-input-wrap"><Icon name="user" />
          <input
            id="login-username"
            name="username"
            placeholder="Nhập tên đăng nhập"
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={submitting}
            required
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </div>
        <label className="auth-label" htmlFor="login-password">Mật khẩu</label>
        <div className="auth-input-wrap"><Icon name="lock" />
          <input
            id="login-password"
            name="password"
            placeholder="Nhập mật khẩu"
            type={showPassword ? 'text' : 'password'}
            disabled={submitting}
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button className="auth-password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} disabled={submitting}><Icon name="eye" />{showPassword && <span className="auth-eye-slash" />}</button>
        </div>
        <button className="auth-submit" type="submit" disabled={submitting}>
          {submitting ? <><span className="auth-spinner" /> Đang đăng nhập...</> : <>Đăng nhập <Icon name="arrow" /></>}
        </button>
        <div className="auth-help"><Icon name="shield" /><p>Không đăng nhập được?<br /><span>Liên hệ quản lý bãi xe để được hỗ trợ.</span></p></div>
        </form>
        </div>
        <footer className="auth-panel-footer">Quản lý bãi đỗ xe <span>•</span> Cổng dành cho nhân viên & quản lý</footer>
      </section>
    </main>
  )
}
