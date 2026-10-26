import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import CapacityCards from '../components/CapacityCards'
import { Alert, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { formatMoney } from '../utils/format'
import useFetch from '../utils/useFetch'

export default function DashboardPage() {
  const { isManager } = useAuth()
  const { data, error, loading, reload } = useFetch('/dashboard')

  // Tự làm mới mỗi 30 giây để theo dõi sức chứa
  useEffect(() => {
    const id = setInterval(reload, 30000)
    return () => clearInterval(id)
  }, [reload])

  if (loading && !data) return <Spinner />
  if (error) return <Alert>{error}</Alert>

  const fullTypes = data.capacity.items.filter((t) => t.is_full)

  return (
    <>
      <div className="page-header">
        <h1>Tổng quan</h1>
        <div className="actions">
          <Link to="/check-in" className="btn btn-primary">
            + Xe vào
          </Link>
          <Link to="/check-out" className="btn">
            Xe ra
          </Link>
        </div>
      </div>

      {fullTypes.length > 0 && (
        <Alert tone="warning" title="Cảnh báo bãi đầy">
          Hết chỗ cho: {fullTypes.map((t) => t.name).join(', ')}
        </Alert>
      )}
      {data.pending_payment > 0 && (
        <Alert tone="info">
          Có {data.pending_payment} lượt gửi đã tính phí nhưng chưa xác nhận thu tiền.{' '}
          <Link to="/sessions?status=PENDING_PAYMENT">Xem danh sách</Link>
        </Alert>
      )}

      <div className="stats-grid">
        <Stat label="Xe đang gửi" value={`${data.capacity.total_occupied} / ${data.capacity.total_capacity}`} />
        <Stat label="Chỗ còn trống" value={data.capacity.total_available} />
        <Stat label="Lượt vào hôm nay" value={data.check_ins_today} />
        <Stat label="Lượt ra hôm nay" value={data.check_outs_today} />
        {isManager && <Stat label="Doanh thu hôm nay" value={formatMoney(data.revenue_today)} />}
        <Stat
          label={isManager ? 'Yêu cầu xác minh chờ xử lý' : 'Yêu cầu của tôi chờ xử lý'}
          value={<Link to="/incidents">{data.open_incidents}</Link>}
        />
      </div>

      <h2 className="section-title">Sức chứa theo loại phương tiện</h2>
      <CapacityCards items={data.capacity.items} />
    </>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}
