import { useEffect, useState } from 'react'
import { leaderboard } from '../api'

type LeaderboardEntry = { id: number; username: string; full_name: string; rating: number; rating_bonus: number }

export default function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Determine the current user's id (stored in localStorage on login) so we
  // can highlight their row in the leaderboard.
  let currentUserId: number | null = null
  try {
    const raw = localStorage.getItem('user')
    if (raw) currentUserId = (JSON.parse(raw) as { id?: number }).id ?? null
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

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 460, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{'Лидерборд'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a9b1bb', fontSize: 22, cursor: 'pointer' }}>×</button>
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
                  <th style={{ padding: 10, textAlign: 'left' }}>{'ФИО'}</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>{'Рейтинг'}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, idx) => {
                  const isMe = currentUserId !== null && e.id === currentUserId
                  return (
                    <tr
                      key={e.id}
                      style={{
                        borderBottom: '1px solid #1e2d3d',
                        backgroundColor: isMe ? 'rgba(243, 156, 18, 0.18)' : 'transparent',
                        outline: isMe ? '1px solid #f39c12' : 'none',
                      }}
                    >
                      <td style={{ padding: 10, fontWeight: 700, color: idx === 0 ? '#f1c40f' : (idx < 3 ? '#e67e22' : '#a9b1bb') }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: 10, fontWeight: isMe ? 700 : 400, color: isMe ? '#f39c12' : 'inherit' }}>
                        {e.full_name || e.username}
                        {isMe && <span style={{ marginLeft: 8, fontSize: 12, color: '#f39c12' }}>{' (вы)'}</span>}
                      </td>
                      <td style={{ padding: 10 }}>
                        <span style={{ fontWeight: 700, color: isMe ? '#f39c12' : '#f39c12' }}>{e.rating}</span>
                      </td>
                    </tr>
                  )
                })}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: 20, textAlign: 'center', color: '#888' }}>{'Нет данных'}</td>
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
