import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../utils/format'

const NAV = [
  { section: 'Vận hành' },
  { to: '/', label: 'Tổng quan', end: true },
  { to: '/check-in', label: 'Xe vào bãi' },
  { to: '/check-out', label: 'Xe ra & thu phí' },
  { to: '/sessions', label: 'Tra cứu lượt gửi' },
  { to: '/incidents', label: 'Yêu cầu xác minh' },
  { to: '/prices', label: 'Bảng giá' },
  { section: 'Quản lý', manager: true },
  { to: '/lot', label: 'Bãi xe & sức chứa', manager: true },
  { to: '/users', label: 'Tài khoản', manager: true },
  { to: '/reports/traffic', label: 'Thống kê lượt xe', manager: true },
  { to: '/reports/revenue', label: 'Thống kê doanh thu', manager: true },
]

export default function Layout() {
  const { user, logout, isManager } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-logo">P</span>
          <span>Quản lý bãi xe</span>
        </div>
        <nav onClick={() => setMenuOpen(false)}>
          {NAV.filter((item) => !item.manager || isManager).map((item) =>
            item.section ? (
              <div key={item.section} className="nav-section">
                {item.section}
              </div>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
      </aside>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="btn btn-sm menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Mở menu">
            ☰
          </button>
          <div className="topbar-spacer" />
          <NavLink to="/profile" className="user-chip">
            <span className="user-name">{user.full_name}</span>
            <span className={`role role-${user.role.toLowerCase()}`}>{ROLES[user.role]}</span>
          </NavLink>
          <button className="btn btn-sm" onClick={logout}>
            Đăng xuất
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
