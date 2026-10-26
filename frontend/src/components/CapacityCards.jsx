export default function CapacityCards({ items = [], selectedId, onSelect }) {
  return (
    <div className="capacity-grid">
      {items.map((t) => {
        const ratio = t.capacity ? t.occupied / t.capacity : 1
        const tone = t.is_full ? 'full' : ratio >= 0.9 ? 'warn' : 'ok'
        const Tag = onSelect ? 'button' : 'div'
        return (
          <Tag
            key={t.id}
            type={onSelect ? 'button' : undefined}
            className={`capacity-card tone-${tone} ${selectedId === t.id ? 'selected' : ''}`}
            onClick={onSelect ? () => onSelect(t.id) : undefined}
          >
            <div className="capacity-name">{t.name}</div>
            <div className="capacity-numbers">
              <span className="capacity-available">{t.available}</span>
              <span className="muted"> chỗ trống / {t.capacity}</span>
            </div>
            <div className="meter">
              <div className="meter-fill" style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
            </div>
            <div className="capacity-foot">
              Đang gửi: <strong>{t.occupied}</strong>
              {t.is_full && <span className="tag-full">ĐẦY</span>}
              {!t.is_full && ratio >= 0.9 && <span className="tag-warn">Sắp đầy</span>}
            </div>
          </Tag>
        )
      })}
    </div>
  )
}
