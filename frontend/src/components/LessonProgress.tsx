import { useMemo, useState } from 'react'

export type LessonProgressItem = {
  lesson_id: number
  lesson_title: string
  language: string
  total_tasks: number
  solved_tasks: number
}

export default function LessonProgress({ items, title }: { items: LessonProgressItem[]; title?: string }) {
  const [lang, setLang] = useState('')

  // Доступные языки программирования (для фильтрации).
  const languages = useMemo(
    () => Array.from(new Set(items.map(i => i.language))).sort((a, b) => a.localeCompare(b)),
    [items]
  )

  const filtered = useMemo(
    () => (lang ? items.filter(i => i.language === lang) : items),
    [items, lang]
  )

  // Цвет полоски прогресса в зависимости от процента прохождения.
  function progressColor(pct: number): string {
    if (pct === 100) return '#3dd179' // зелёный — полностью пройдено
    if (pct >= 70) return '#17a2b8'   // бирюзовый — почти пройдено
    if (pct >= 40) return '#f39c12'   // оранжевый — средний прогресс
    if (pct > 10) return '#e67e22'    // тёмно-оранжевый — небольшой прогресс
    return '#e74c3c'                  // красный — 0–10% пройдено
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {title && <h4 style={{ margin: 0 }}>{title}</h4>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#a9b1bb' }}>{'Язык программирования:'}</span>
          <select
            className="input"
            value={lang}
            onChange={e => setLang(e.target.value)}
            style={{ width: 200, fontSize: 12 }}
          >
            <option value="">{'Все языки'}</option>
            {languages.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: '#888', fontSize: 13 }}>{'Нет данных о прохождении уроков'}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {filtered.map(item => {
            const pct = item.total_tasks > 0 ? Math.round((item.solved_tasks / item.total_tasks) * 100) : 0
            return (
              <div
                key={item.lesson_id}
                style={{
                  backgroundColor: '#101a2a',
                  borderRadius: 10,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  border: '1px solid #1e2d3d',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{item.lesson_title}</div>
                <div style={{ fontSize: 12, color: '#a9b1bb', textTransform: 'capitalize' }}>{item.language}</div>
                <div style={{ height: 8, backgroundColor: '#1e2d3d', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      backgroundColor: progressColor(pct),
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: '#e6e6e6' }}>{`${item.solved_tasks} / ${item.total_tasks}`}</span>
                  <span style={{ color: progressColor(pct), fontWeight: 700 }}>{`${pct}%`}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
