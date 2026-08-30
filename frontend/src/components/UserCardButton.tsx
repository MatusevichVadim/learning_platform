import { useEffect, useState } from 'react'
import { getMyCard } from '../api'
import CardChart from './CardChart'
import LessonProgress from './LessonProgress'
import { formatDate } from '../utils/date'

type CardData = Awaited<ReturnType<typeof getMyCard>>

export default function UserCardButton({ inline = false }: { inline?: boolean }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<CardData | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')

  async function loadCard(searchArg?: string, sortByArg?: string, orderArg?: 'asc' | 'desc') {
    const se = searchArg ?? search
    const sb = sortByArg ?? sortBy
    const or = orderArg ?? order
    setLoading(true)
    setError('')
    try {
      const d = await getMyCard({ search: se, sort_by: sb, order: or })
      setData(d)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки карточки')
    } finally {
      setLoading(false)
    }
  }

  function openCard() {
    setOpen(true)
    loadCard()
  }

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => { loadCard() }, 300)
    return () => clearTimeout(t)
  }, [search])

  return (
    <>
      <button
        className="btn"
        onClick={openCard}
        style={
          inline
            ? { backgroundColor: '#17a2b8', color: '#fff', fontSize: 14, padding: '8px 16px' }
            : { position: 'fixed', top: 16, right: 16, zIndex: 900, backgroundColor: '#17a2b8', color: '#fff', fontSize: 14, padding: '8px 16px' }
        }
      >
        {'Моя карточка'}
      </button>

      {open && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setOpen(false)}
        >
          <div className="card" style={{ width: 720, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {data?.user.full_name || data?.user.username}
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#f39c12' }}>{'Рейтинг: '}{(data?.user.rating ?? 0) + (data?.user.rating_bonus ?? 0)}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#17a2b8' }}>{'Место: '}{data?.user.rank ?? '-'}</span>
                </h3>
                <div style={{ color: '#a9b1bb', fontSize: 13, marginTop: 4 }}>
                  {data?.user.username} · {data?.user.role === 'admin' ? 'Администратор' : 'Пользователь'} ·{' '}
                  <span style={{ color: data?.user.is_active ? '#3dd179' : '#dc3545' }}>{data?.user.is_active ? 'Активен' : 'Заблокирован'}</span>
                </div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{'Регистрация: '}{data ? formatDate(data.user.created_at) : ''}</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#a9b1bb', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            {loading && <p style={{ color: '#a9b1bb' }}>{'Загрузка карточки...'}</p>}
            {error && <div style={{ color: '#dc3545', marginBottom: 12 }}>{error}</div>}

            {data && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 18 }}>
                  <StatCard label={'Задач всего'} value={data.stats.attempted_tasks} color={'#9b59b6'} />
                  <StatCard label={'Всего решений'} value={data.stats.total_submissions} color={'#007bff'} />
                  <StatCard label={'Правильно'} value={data.stats.correct_submissions} color={'#3dd179'} />
                  <StatCard label={'Code задач решено'} value={data.stats.solved_code_tasks} color={'#17a2b8'} />
                  <StatCard label={'Тестов решено'} value={data.stats.solved_quiz_tasks} color={'#e67e22'} />
                  <StatCard label={'Успешность'} value={data.stats.success_rate + '%'} color={'#f39c12'} />
                </div>

                <h4 style={{ margin: '0 0 8px' }}>{'График активности'}</h4>
                <CardChart submissions={data.submissions} />

                <LessonProgress title={'Прохождение заданий в уроках'} items={data.lesson_progress || []} />

                <div style={{ display: 'flex', gap: 8, marginTop: 18, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    className="input"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={'Поиск по уроку, заданию или языку'}
                    style={{ flex: 1, minWidth: 180, fontSize: 12 }}
                  />
                  <select
                    className="input"
                    value={sortBy}
                    onChange={e => { const v = e.target.value; setSortBy(v); loadCard(undefined, v, order) }}
                    style={{ width: 160, fontSize: 12 }}
                  >
                    <option value="created_at">{'Дата'}</option>
                    <option value="lesson_title">{'Урок'}</option>
                    <option value="task_title">{'Задание'}</option>
                    <option value="language">{'Язык'}</option>
                    <option value="status">{'Статус'}</option>
                  </select>
                  <button
                    className="btn"
                    onClick={() => { const nv = order === 'asc' ? 'desc' : 'asc'; setOrder(nv); loadCard(undefined, sortBy, nv) }}
                    style={{ backgroundColor: '#17a2b8', color: '#fff', fontSize: 12, whiteSpace: 'nowrap' }}
                  >
                    {order === 'asc' ? '↑ По возрастанию' : '↓ По убыванию'}
                  </button>
                </div>

                <h4 style={{ margin: '0 0 8px' }}>{'Решения'}</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#101a2a' }}>
                        <th style={{ padding: 8, textAlign: 'left' }}>{'Язык'}</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>{'Урок'}</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>{'Задание'}</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>{'Статус'}</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>{'Дата'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.submissions.map(s => (
                        <tr key={s.id} style={{ borderBottom: '1px solid #1e2d3d' }}>
                          <td style={{ padding: 8 }}>{s.language || '-'}</td>
                          <td style={{ padding: 8 }}>{s.lesson_title}</td>
                          <td style={{ padding: 8 }}>{s.task_title}</td>
                          <td style={{ padding: 8, color: s.status === 'pending' ? '#ffa500' : (s.is_correct ? '#3dd179' : '#a9b1bb') }}>
                            {s.status === 'pending' ? 'Ожидает проверки' : (s.is_correct ? 'Правильно' : 'Неправильно')}
                          </td>
                          <td style={{ padding: 8 }}>{formatDate(s.created_at)}</td>
                        </tr>
                      ))}
                      {data.submissions.length === 0 && (
                        <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#888' }}>{'Нет решений'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ backgroundColor: '#101a2a', borderRadius: 8, padding: '12px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#a9b1bb', marginTop: 4 }}>{label}</div>
    </div>
  )
}
