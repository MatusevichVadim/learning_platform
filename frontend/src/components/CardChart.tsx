import { useMemo, useState } from 'react'
import { formatDate } from '../utils/date'

export type CardChartSubmission = {
  id: number
  user_name?: string
  lesson_id?: number
  lesson_title: string
  language?: string
  task_id?: number
  task_title: string
  is_correct: boolean
  result?: string | object
  status: string
  code?: string
  created_at: string
}

// По какому полю строятся столбцы (точечный результат).
type GroupKey = 'task_title' | 'lesson_title' | 'date' | 'language'

const GROUP_LABELS: Record<GroupKey, string> = {
  lesson_title: 'Урок',
  task_title: 'Задание / тест',
  date: 'Дата',
  language: 'Язык',
}

// Что показывают столбцы.
type MetricKey = 'percent' | 'count'

const METRIC_LABELS: Record<MetricKey, string> = {
  percent: 'Результат, %',
  count: 'Кол-во решений',
}

type Bucket = {
  key: string
  label: string
  total: number
  correct: number
  pending: number
  percent: number
  first: number
}

function groupOf(s: CardChartSubmission, group: GroupKey): { key: string; label: string } {
  switch (group) {
    case 'task_title': {
      const label = s.task_title || '—'
      return { key: String(s.task_id ?? label), label }
    }
    case 'lesson_title': {
      const label = s.lesson_title || '—'
      return { key: String(s.lesson_id ?? label), label }
    }
    case 'language': {
      const label = s.language || '—'
      return { key: label, label }
    }
    case 'date': {
      const d = new Date(s.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return { key, label: formatDate(d) }
    }
  }
}

function barColor(percent: number): string {
  if (percent >= 80) return '#3dd179'
  if (percent >= 50) return '#17a2b8'
  if (percent > 0) return '#e67e22'
  return '#dc3545'
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

export default function CardChart({ submissions }: { submissions: CardChartSubmission[] }) {
  const [group, setGroup] = useState<GroupKey>('lesson_title')
  const [metric, setMetric] = useState<MetricKey>('percent')
  const [trendWindow, setTrendWindow] = useState(3)

  // Агрегация решений в столбцы: результат за каждый урок/тест.
  const buckets = useMemo<Bucket[]>(() => {
    const map = new Map<string, Bucket>()
    for (const s of submissions) {
      const { key, label } = groupOf(s, group)
      const time = new Date(s.created_at).getTime()
      let b = map.get(key)
      if (!b) {
        b = { key, label, total: 0, correct: 0, pending: 0, percent: 0, first: time }
        map.set(key, b)
      }
      b.total += 1
      if (s.status === 'pending') b.pending += 1
      else if (s.is_correct) b.correct += 1
      if (time < b.first) b.first = time
    }
    const arr = Array.from(map.values())
    for (const b of arr) {
      const graded = b.total - b.pending
      b.percent = graded > 0 ? Math.round((b.correct / graded) * 1000) / 10 : 0
    }
    // Столбцы идут в хронологическом порядке — так линия тренда имеет смысл.
    arr.sort((a, b) => (group === 'date' ? a.key.localeCompare(b.key) : a.first - b.first))
    return arr
  }, [submissions, group])

  const values = useMemo(
    () => buckets.map(b => (metric === 'percent' ? b.percent : b.total)),
    [buckets, metric]
  )

  // Скользящее среднее (тренд успеваемости).
  const trend = useMemo(() => {
    return values.map((_, i) => {
      const from = Math.max(0, i - trendWindow + 1)
      const slice = values.slice(from, i + 1)
      const avg = slice.reduce((acc, v) => acc + v, 0) / slice.length
      return Math.round(avg * 10) / 10
    })
  }, [values, trendWindow])

  const yMax = metric === 'percent' ? 100 : Math.max(1, ...values)

  // Геометрия
  const padLeft = 40
  const padRight = 14
  const padTop = 16
  const padBottom = 62
  const plotHeight = 190
  const slot = buckets.length > 24 ? 34 : 46
  const plotWidth = Math.max(560, buckets.length * slot)
  const totalWidth = padLeft + plotWidth + padRight
  const totalHeight = padTop + plotHeight + padBottom
  const barWidth = Math.min(28, slot * 0.6)

  const y = (v: number) => padTop + plotHeight * (1 - v / yMax)
  const cx = (i: number) => padLeft + i * slot + slot / 2
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(yMax * f * 10) / 10)

  const trendPoints = trend.map((v, i) => `${cx(i)},${y(v)}`).join(' ')

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#a9b1bb' }}>{'Столбцы по:'}</span>
        <select
          className="input"
          value={group}
          onChange={e => setGroup(e.target.value as GroupKey)}
          style={{ width: 150, fontSize: 12 }}
        >
          {(Object.keys(GROUP_LABELS) as GroupKey[]).map(k => (
            <option key={k} value={k}>{GROUP_LABELS[k]}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: '#a9b1bb' }}>{'Показатель:'}</span>
        <select
          className="input"
          value={metric}
          onChange={e => setMetric(e.target.value as MetricKey)}
          style={{ width: 150, fontSize: 12 }}
        >
          {(Object.keys(METRIC_LABELS) as MetricKey[]).map(k => (
            <option key={k} value={k}>{METRIC_LABELS[k]}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: '#a9b1bb' }}>{'Тренд (среднее по):'}</span>
        <select
          className="input"
          value={trendWindow}
          onChange={e => setTrendWindow(Number(e.target.value))}
          style={{ width: 90, fontSize: 12 }}
        >
          <option value={2}>{'2'}</option>
          <option value={3}>{'3'}</option>
          <option value={5}>{'5'}</option>
          <option value={7}>{'7'}</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: '#a9b1bb' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, backgroundColor: '#17a2b8' }} />
          {metric === 'percent' ? 'Результат за урок/тест, %' : 'Кол-во решений'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 16, height: 3, borderRadius: 2, backgroundColor: '#f39c12' }} />
          {`Тренд: скользящее среднее (${trendWindow})`}
        </span>
      </div>

      {buckets.length === 0 ? (
        <div style={{ color: '#888', fontSize: 13 }}>{'Нет данных для отображения'}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <svg width={totalWidth} height={totalHeight} style={{ display: 'block' }}>
            {/* Сетка и подписи оси Y */}
            {ticks.map(t => (
              <g key={t}>
                <line
                  x1={padLeft}
                  x2={padLeft + plotWidth}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="#1e2d3d"
                  strokeWidth={1}
                />
                <text x={padLeft - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#a9b1bb">
                  {metric === 'percent' ? `${t}%` : t}
                </text>
              </g>
            ))}

            {/* Столбцы */}
            {buckets.map((b, i) => {
              const v = values[i]
              const barH = Math.max(v > 0 ? 2 : 0, (v / yMax) * plotHeight)
              const x = cx(i) - barWidth / 2
              const color = metric === 'percent' ? barColor(b.percent) : '#17a2b8'
              const labelY = padTop + plotHeight + 12
              return (
                <g key={b.key}>
                  <title>
                    {`${b.label}\n${metric === 'percent' ? `Результат: ${b.percent}%` : `Решений: ${b.total}`}\nПравильно: ${b.correct} из ${b.total}${b.pending ? `\nОжидает проверки: ${b.pending}` : ''}\nТренд: ${trend[i]}${metric === 'percent' ? '%' : ''}`}
                  </title>
                  <rect
                    x={x}
                    y={padTop + plotHeight - barH}
                    width={barWidth}
                    height={barH}
                    rx={3}
                    fill={color}
                  />
                  {slot >= 40 && (
                    <text
                      x={cx(i)}
                      y={padTop + plotHeight - barH - 4}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#e6e6e6"
                    >
                      {metric === 'percent' ? `${Math.round(b.percent)}%` : b.total}
                    </text>
                  )}
                  <text
                    x={cx(i)}
                    y={labelY}
                    textAnchor="end"
                    fontSize="10"
                    fill="#a9b1bb"
                    transform={`rotate(-35, ${cx(i)}, ${labelY})`}
                  >
                    {truncate(b.label, 14)}
                  </text>
                </g>
              )
            })}

            {/* Линия тренда поверх столбцов */}
            <polyline
              points={trendPoints}
              fill="none"
              stroke="#f39c12"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {trend.map((v, i) => (
              <circle key={buckets[i].key + '-t'} cx={cx(i)} cy={y(v)} r={3} fill="#f39c12" stroke="#151c2c" strokeWidth={1}>
                <title>{`${buckets[i].label}\nТренд: ${v}${metric === 'percent' ? '%' : ''}`}</title>
              </circle>
            ))}

            {/* Ось X */}
            <line
              x1={padLeft}
              x2={padLeft + plotWidth}
              y1={padTop + plotHeight}
              y2={padTop + plotHeight}
              stroke="#243049"
              strokeWidth={1}
            />
          </svg>
        </div>
      )}
    </div>
  )
}
