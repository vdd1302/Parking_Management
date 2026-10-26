import { useEffect, useState } from 'react'
import api, { parseError } from '../api/client'
import { INCIDENT_TYPES } from '../utils/format'
import { Alert, Field, Modal } from './ui'

/** Nhân viên chuyển trường hợp ngoại lệ cho quản lý xác minh. */
export default function IncidentModal({ open, onClose, defaults = {}, onCreated }) {
  const [form, setForm] = useState({ type: 'OTHER', plate_number: '', description: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({
        type: defaults.type || 'OTHER',
        plate_number: defaults.plate_number || '',
        description: defaults.description || '',
        session_id: defaults.session_id,
      })
      setError(null)
    }
  }, [open])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await api.post('/incidents', form)
      onCreated?.(res.data)
      onClose()
    } catch (err) {
      setError(parseError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Chuyển quản lý xác minh"
      footer={
        <>
          <button className="btn" onClick={onClose} type="button">
            Huỷ
          </button>
          <button className="btn btn-primary" form="incident-form" disabled={saving}>
            {saving ? 'Đang gửi...' : 'Gửi yêu cầu'}
          </button>
        </>
      }
    >
      <form id="incident-form" onSubmit={submit} className="form-grid">
        <Alert>{error}</Alert>
        <Field label="Loại ngoại lệ">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(INCIDENT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Biển số liên quan">
          <input
            value={form.plate_number}
            maxLength={20}
            onChange={(e) => setForm({ ...form, plate_number: e.target.value })}
          />
        </Field>
        <Field label="Mô tả tình huống">
          <textarea
            rows={4}
            required
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
      </form>
    </Modal>
  )
}
