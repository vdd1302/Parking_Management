import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Spinner } from './ui'

/** Chặn truy cập khi chưa đăng nhập; `roles` giới hạn theo vai trò. */
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="card">
        <h2>Không có quyền truy cập</h2>
        <p className="muted">Chức năng này chỉ dành cho người quản lý bãi xe.</p>
      </div>
    )
  }
  return <Outlet />
}
