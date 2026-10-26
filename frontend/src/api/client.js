import axios from 'axios'

const TOKEN_KEY = 'parking_token'

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api`,
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = tokenStorage.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Hết phiên / tài khoản bị khoá -> AuthContext đăng xuất
let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.endsWith('/auth/login')) {
      onUnauthorized()
    }
    return Promise.reject(err)
  },
)

/** Chuẩn hoá lỗi API thành { code, message, details }. */
export function parseError(err) {
  const apiError = err?.response?.data?.error
  if (apiError) return apiError
  if (err?.code === 'ECONNABORTED') return { code: 'TIMEOUT', message: 'Máy chủ phản hồi quá lâu' }
  if (!err?.response) return { code: 'NETWORK', message: 'Không kết nối được máy chủ' }
  return { code: 'UNKNOWN', message: 'Đã xảy ra lỗi, vui lòng thử lại' }
}

export default api
