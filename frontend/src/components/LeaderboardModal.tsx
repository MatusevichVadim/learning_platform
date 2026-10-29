import { useEffect, useState, useMemo } from 'react'
import { leaderboard } from '../api'

type LeaderboardEntry = { id: number; username: string; full_name: string; rating: number; rating_bonus: number; user_class?: string }

export default function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [sortKey, setSortKey] = useState<'rating' | 'name' | 'class'>('rating')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  let currentUserId: number | null = null
  let isAdminOrTeacher = false
  try {
    const raw = localStorage.getItem('user')
    if (raw) {
      const u = JSON.parse(raw) as { id?: number; role?: string }
      currentUserId = u.id ?? null
      isAdminOrTeacher = u.role === 'admin' || u.role === 'teacher'
    }
  } catch {
    currentUserId = null
  }

  useEffect(() => {
    let active = true
    leaderboard()
      .then(data => { if (active) setEntries(data) })
      .catch(err => { if (active) setError(err.response?.data?.detail || 'Ошибка загрузки рейтинга') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const classes = useMemo(() => {
    const set = new Set<string>()
    entries.forEach(e => { if (e.user_class) set.add(e.user_class) })
    return Array.from(set).sort()
  }, [entries])

  const filtered = useMemo(() => {
    let list = entries
    if (selectedClass !== 'all') {
      list = list.filter(e => e.user_class === selectedClass)
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'rating') cmp = (a.rating || 0) - (b.rating || 0)
      else if (sortKey === 'name') cmp = (a.full_name || a.username).localeCompare(b.full_name || b.username)
      else if (sortKey === 'class') cmp = (a.user_class || '').localeCompare(b.user_class || '')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [entries, selectedClass, sortKey, sortDir])

  const toggleSort = (key: 'rating' | 'name' | 'class') => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'rating' ? 'desc' : 'asc')
    }
  }

  const isOverall = selectedClass === 'all'

  const topClass = (idx: number) => {
    if (!isOverall) return ''
    if (idx === 0) return 'lb-1'
    if (idx === 1) return 'lb-2'
    if (idx === 2) return 'lb-3'
    if (idx === 3) return 'lb-4'
    if (idx === 4) return 'lb-5'
    return ''
  }

  const rowStyle = (idx: number) => {
    if (!isOverall) return {}
    if (idx === 3) return { border: '1px solid #00bcd4', borderRadius: 4 }
    if (idx === 4) return { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: 4 }
    return {}
  }

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <style>{`
        @keyframes goldShimmer {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes silverShimmer {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .lb-1, .lb-2, .lb-3, .lb-4, .lb-5 {
          font-weight: 700;
        }
        .lb-1 {
          font-size: 20px;
          background: linear-gradient(90deg, #b38728, #fcf6ba, #aa771c, #fcf6ba, #b38728);
          background-size: 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: goldShimmer 3s ease infinite;
        }
        .lb-2 {
          font-size: 18px;
          background: linear-gradient(90deg, #ffffff, #b0b3b8, #ffffff);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: silverShimmer 2.5s ease infinite;
        }
        .lb-3 {
          font-size: 17px;
          background: linear-gradient(90deg, #d7a15c, #965a38);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .lb-4 {
          font-size: 15px;
          color: #ffffff;
        }
        .lb-5 {
          font-size: 15px;
          color: #ffffff;
        }
      `}</style>
      <div className="card" style={{ width: 560, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
          <h3 style={{ margin: 0 }}>{'Лидерборд'}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isAdminOrTeacher && (
              <label style={{ fontSize: 13, color: '#a9b1bb' }}>
                {'Класс:'}
                <select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  style={{ marginLeft: 6, padding: '4px 8px', borderRadius: 6, border: '1px solid #1e2d3d', background: '#101a2a', color: '#fff' }}
                >
                  <option value="all">{'Все'}</option>
                  {classes.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a9b1bb', fontSize: 22, cursor: 'pointer' }}>×</button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>{'Загрузка...'}</div>
        ) : error ? (
          <div style={{ color: '#dc3545', textAlign: 'center', padding: 20 }}>{error}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#101a2a' }}>
                  <th style={{ padding: 10, textAlign: 'left' }}>{'Место'}</th>
                  <th style={{ padding: 10, textAlign: 'left', cursor: isAdminOrTeacher ? 'pointer' : 'default' }} onClick={() => isAdminOrTeacher && toggleSort('name')}>
                    {'ФИО'}{isAdminOrTeacher && sortKey === 'name' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  {isAdminOrTeacher && (
                    <th style={{ padding: 10, textAlign: 'left', cursor: 'pointer' }} onClick={() => toggleSort('class')}>
                      {'Класс'}{sortKey === 'class' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                  )}
                  <th style={{ padding: 10, textAlign: 'left', cursor: isAdminOrTeacher ? 'pointer' : 'default' }} onClick={() => isAdminOrTeacher && toggleSort('rating')}>
                    {'Рейтинг'}{isAdminOrTeacher && sortKey === 'rating' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, idx) => {
                  const isMe = currentUserId !== null && e.id === currentUserId
                  const cls = topClass(idx)
                  return (
                    <tr
                      key={e.id}
                      style={{
                        borderBottom: '1px solid #1e2d3d',
                        backgroundColor: isMe ? 'rgba(243, 156, 18, 0.18)' : 'transparent',
                        outline: isMe ? '1px solid #f39c12' : 'none',
                        ...rowStyle(idx),
                      }}
                    >
                      <td style={{ padding: 10, fontWeight: 700, color: idx === 0 ? '#f1c40f' : (idx < 3 ? '#e67e22' : '#a9b1bb') }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: 10, fontWeight: isMe ? 700 : 400, color: isMe ? '#f39c12' : 'inherit' }}>
                        <span className={cls}>{e.full_name || e.username}</span>
                        {isMe && <span style={{ marginLeft: 8, fontSize: 12, color: '#f39c12' }}>{' (вы)'}</span>}
                      </td>
                      {isAdminOrTeacher && (
                        <td style={{ padding: 10 }}>{e.user_class || '—'}</td>
                      )}
                      <td style={{ padding: 10, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, color: isMe ? '#f39c12' : '#f39c12' }}>{e.rating}</span>
                        <span style={{ fontSize: 16, color: '#f1c40f' }}>★</span>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={isAdminOrTeacher ? 4 : 3} style={{ padding: 20, textAlign: 'center', color: '#888' }}>{'Нет данных'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
