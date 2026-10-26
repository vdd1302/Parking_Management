export const formatMoney = (value) =>
  value == null ? '—' : `${Number(value).toLocaleString('vi-VN')} đ`

export const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—'

export const formatDuration = (minutes) => {
  if (minutes == null) return '—'
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  return [d && `${d} ngày`, h && `${h} giờ`, `${m} phút`].filter(Boolean).join(' ')
}

/** Ngày hôm nay theo giờ máy, dạng YYYY-MM-DD. */
export const today = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export const SESSION_STATUS = {
  ACTIVE: { label: 'Đang gửi', tone: 'blue' },
  PENDING_PAYMENT: { label: 'Chờ thanh toán', tone: 'amber' },
  COMPLETED: { label: 'Đã kết thúc', tone: 'green' },
}

export const PRICING_METHODS = {
  PER_TURN: 'Theo lượt',
  PER_HOUR: 'Theo giờ',
  PER_DAY: 'Theo ngày (24h)',
}

export const PRICING_UNIT = {
  PER_TURN: '/lượt',
  PER_HOUR: '/giờ',
  PER_DAY: '/ngày',
}

export const PAYMENT_METHODS = {
  CASH: 'Tiền mặt',
  TRANSFER: 'Chuyển khoản',
}

export const ROLES = {
  MANAGER: 'Quản lý',
  STAFF: 'Nhân viên',
}

export const INCIDENT_TYPES = {
  LOT_FULL: 'Bãi đầy',
  DUPLICATE_ACTIVE: 'Xe đã có lượt gửi',
  SESSION_NOT_FOUND: 'Không tìm thấy lượt gửi',
  INFO_MISMATCH: 'Thông tin không khớp',
  OTHER: 'Khác',
}

// Ánh xạ mã lỗi API -> loại ngoại lệ để chuyển quản lý xác minh
export const ERROR_TO_INCIDENT = {
  LOT_FULL: 'LOT_FULL',
  DUPLICATE_ACTIVE_SESSION: 'DUPLICATE_ACTIVE',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  VEHICLE_MISMATCH: 'INFO_MISMATCH',
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' (không qua Date để tránh lệch múi giờ). */
export const formatDate = (ymd) => (ymd ? ymd.split('-').reverse().join('/') : '—')
