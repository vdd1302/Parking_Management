import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { setUnauthorizedHandler, tokenStorage } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    tokenStorage.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    if (!tokenStorage.get()) {
      setLoading(false)
      return
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => logout())
      .finally(() => setLoading(false))
  }, [logout])

  const login = useCallback(async (username, password) => {
    const res = await api.post('/auth/login', { username, password })
    tokenStorage.set(res.data.access_token)
    setUser(res.data.user)
    return res.data.user
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, logout, isManager: user?.role === 'MANAGER' }),
    [user, loading, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
