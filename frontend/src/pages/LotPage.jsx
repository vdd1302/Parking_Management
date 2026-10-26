import { useEffect, useState } from 'react'
import api, { parseError } from '../api/client'
import { Alert, Badge, EmptyRow, Field, Modal } from '../components/ui'
import useFetch from '../utils/useFetch'

export default function LotPage() {
  return (
    <>
      <div className="page-header">
        <h1>Thông tin & sức chứa bãi xe</h1>
      </div>
      <LotInfoForm />
      <VehicleTypes />
    </>
  )
}

function LotInfoForm() {
  const { data } = useFetch('/lot')
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState({})

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  if (!form) return null
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setMsg({})
    try {
      const res = await api.put('/lot', form)
      setForm(res.data)
      setMsg({ success: 'Đã cập nhật thông tin bãi xe' })
    } catch (err) {
      setMsg({ error: parseError(err).message })
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Thông tin cơ bản</h2>
      <Alert>{msg.error}</Alert>
      <Alert tone="success">{msg.success}</Alert>
      <div className="form-row">
        <Field label="Tên bãi xe">
          <input required maxLength={150} value={form.name || ''} onChange={set('name')} />
        </Field>
        <Field label="Số điện thoại">
          <input maxLength={20} value={form.phone || ''} onChange={set('phone')} />
        </Field>
        <Field label="Giờ hoạt động">
          <input maxLength={100} value={form.opening_hours || ''} onChange={set('opening_hours')} />
        </Field>
      </div>
      <Field label="Địa chỉ">
        <input maxLength={255} value={form.address || ''} onChange={set('address')} />
      </Field>
      <Field label="Mô tả">
        <textarea rows={2} value={form.description || ''} onChange={set('description')} />
      </Field>
      <button className="btn btn-primary">Lưu thông tin</button>
    </form>
  )
}

function VehicleTypes() {
  const { data, reload } = useFetch('/vehicle-types', { include_inactive: 1 })
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)

  const save = async (e) => {
    e.preventDefault()
    setError(null)
    const body = { name: editing.name, capacity: Number(editing.capacity), is_active: editing.is_active }
    try {
      if (editing.id) await api.put(`/vehicle-types/${editing.id}`, body)
      else await api.post('/vehicle-types', { ...body, code: editing.code })
      setEditing(null)
      reload()
    } catch (err) {
      setError(parseError(err).message)
    }
  }

  return (
    <>
      <div className="page-header">
        <h2 className="section-title">Sức chứa theo loại phương tiện</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setError(null)
            setEditing({ code: '', name: '', capacity: 0, is_active: true })
          }}
        >
          + Thêm loại xe
        </button>
      </div>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên loại xe</th>
              <th className="num">Sức chứa tối đa</th>
              <th className="num">Đang gửi</th>
              <th className="num">Còn trống</th>
              <th>Trạng thái</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.length ? (
              data.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.code}</td>
                  <td>{t.name}</td>
                  <td className="num">{t.capacity}</td>
                  <td className="num">{t.occupied}</td>
                  <td className="num">{t.available}</td>
                  <td>{t.is_active ? <Badge tone="green">Đang dùng</Badge> : <Badge>Ngừng</Badge>}</td>
                  <td>
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        setError(null)
                        setEditing(t)
                      }}
                    >
                      Sửa
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <EmptyRow colSpan={7} />
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Cập nhật ${editing.name}` : 'Thêm loại phương tiện'}
        footer={
          <>
            <button className="btn" onClick={() => setEditing(null)}>
              Huỷ
            </button>
            <button className="btn btn-primary" form="type-form">
              Lưu
            </button>
          </>
        }
      >
        {editing && (
          <form id="type-form" onSubmit={save} className="form-grid">
            <Alert>{error}</Alert>
            {!editing.id && (
              <Field label="Mã loại xe" hint="Chữ in hoa, số, '_' (VD: TRUCK)">
                <input
                  required
                  value={editing.code}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                />
              </Field>
            )}
            <Field label="Tên loại xe">
              <input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field
              label="Sức chứa tối đa"
              hint={editing.id ? `Không được nhỏ hơn số xe đang gửi (${editing.occupied})` : null}
            >
              <input
                type="number"
                min={editing.occupied || 0}
                required
                value={editing.capacity}
                onChange={(e) => setEditing({ ...editing, capacity: e.target.value })}
              />
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={editing.is_active}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
              Đang tiếp nhận loại xe này
            </label>
          </form>
        )}
      </Modal>
    </>
  )
}
