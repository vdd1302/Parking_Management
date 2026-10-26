import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import CheckInPage from './pages/CheckInPage'
import CheckOutPage from './pages/CheckOutPage'
import DashboardPage from './pages/DashboardPage'
import IncidentsPage from './pages/IncidentsPage'
import LoginPage from './pages/LoginPage'
import LotPage from './pages/LotPage'
import PricesPage from './pages/PricesPage'
import ProfilePage from './pages/ProfilePage'
import { RevenueReportPage, TrafficReportPage } from './pages/ReportPages'
import SessionsPage from './pages/SessionsPage'
import UsersPage from './pages/UsersPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          {/* Nhân viên & quản lý */}
          <Route index element={<DashboardPage />} />
          <Route path="check-in" element={<CheckInPage />} />
          <Route path="check-out" element={<CheckOutPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="prices" element={<PricesPage />} />
          <Route path="profile" element={<ProfilePage />} />

          {/* Chỉ quản lý */}
          <Route element={<ProtectedRoute roles={['MANAGER']} />}>
            <Route path="lot" element={<LotPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="reports/traffic" element={<TrafficReportPage />} />
            <Route path="reports/revenue" element={<RevenueReportPage />} />
          </Route>

          <Route
            path="*"
            element={
              <div className="card">
                <h2>Không tìm thấy trang</h2>
                <Link to="/">Về trang tổng quan</Link>
              </div>
            }
          />
        </Route>
      </Route>
    </Routes>
  )
}
