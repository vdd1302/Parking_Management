import { useCallback, useEffect, useState } from 'react'
import api, { parseError } from '../api/client'

/** GET đơn giản: tự gọi lại khi url/params đổi, có reload() để làm mới thủ công. */
export default function useFetch(url, params) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const key = JSON.stringify(params || {})

  const load = useCallback(async () => {
    if (!url) return
    setLoading(true)
    try {
      const res = await api.get(url, { params: JSON.parse(key) })
      setData(res.data)
      setError(null)
    } catch (err) {
      setError(parseError(err).message)
    } finally {
      setLoading(false)
    }
  }, [url, key])

  useEffect(() => {
    load()
  }, [load])

  return { data, error, loading, reload: load, setData }
}
