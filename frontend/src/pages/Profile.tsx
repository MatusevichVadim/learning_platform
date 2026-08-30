import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProfileSummary, getProfileSubmissions, getProfileSubmissionDetail, logout } from '../api'
import UserCardButton from '../components/UserCardButton'
import LeaderboardModal from '../components/LeaderboardModal'
import CardChart from '../components/CardChart'
import { formatDateTime } from '../utils/date'

type Submission = {
  id: number
  task_id: number
  task_title: string
  lesson_title: string
  language: string
  code?: string
  answer?: string
  is_correct: boolean
  result?: string | object
  status: string
  created_at: string
}

type ProfileSummary = {
  total_solved: number
  total_submissions: number
  success_rate: number
  languages_progress: Record<string, { solved: number }>
}

export default function Profile() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<ProfileSummary | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [statusFilter, setStatusFilter] = useState('')
  const [languageFilter, setLanguageFilter] = useState('')
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSummary()
    loadSubmissions()
  }, [page, statusFilter, languageFilter])

  async function loadSummary() {
    const data = await getProfileSummary()
    setSummary(data)
  }

  async function loadSubmissions() {
    setLoading(true)
    try {
      const params: any = { page, page_size: pageSize }
      if (statusFilter) params.status = statusFilter
      if (languageFilter) params.language = languageFilter
      const data = await getProfileSubmissions(params)
      setSubmissions(data.data)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }

  async function viewSubmissionDetail(submissionId: number) {
    const data = await getProfileSubmissionDetail(submissionId)
    setSelectedSubmission(data)
  }

  function getStatusLabel(status: string, isCorrect: boolean) {
    if (status === 'pending') return 'Ожидает проверки'
    if (isCorrect) return 'Принято'
    return 'Неправильный ответ'
  }

  function getStatusColor(status: string, isCorrect: boolean) {
    if (status === 'pending') return '#ffc107'
    if (isCorrect) return '#3dd179'
    return '#dc3545'
  }

  function handleLogout() {
    logout().finally(() => navigate('/'))
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>{'Личный кабинет'}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <UserCardButton inline />
          <button className="btn" onClick={() => setShowLeaderboard(true)} style={{ backgroundColor: '#f39c12', color: '#000' }}>
            {'Лидерборд'}
          </button>
          <button className="btn" onClick={handleLogout} style={{ backgroundColor: '#dc3545' }}>
            {'Выйти'}
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#3dd179' }}>{summary.total_solved}</div>
            <div style={{ color: '#888' }}>{'Решено задач'}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#3dd179' }}>{summary.success_rate}%</div>
            <div style={{ color: '#888' }}>{'Процент успеха'}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#3dd179' }}>{summary.total_submissions}</div>
            <div style={{ color: '#888' }}>{'Всего отправок'}</div>
          </div>
        </div>
      )}

      {/* Languages Progress */}
      {summary && Object.keys(summary.languages_progress).length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3>Прогресс по языкам</h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
            {Object.entries(summary.languages_progress).map(([lang, data]) => (
              <div key={lang} style={{ backgroundColor: '#101a2a', padding: '12px 20px', borderRadius: 8 }}>
                <div style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>{lang}</div>
                <div style={{ color: '#3dd179' }}>Решено: {data.solved}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submission History */}
      <div className="card">
        <h3>{'История решений'}</h3>

        <h4 style={{ margin: '0 0 8px' }}>{'График активности'}</h4>
        <CardChart submissions={submissions} />

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <select
            className="input"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            style={{ width: 'auto' }}
          >
            <option value="">Все статусы</option>
            <option value="accepted">{'Принято'}</option>
            <option value="wrong_answer">{'Неправильный ответ'}</option>
            <option value="pending">{'Ожидает проверки'}</option>
          </select>
          <input
            className="input"
            value={languageFilter}
            onChange={e => { setLanguageFilter(e.target.value); setPage(1) }}
            placeholder="Язык (python, csharp)"
            style={{ width: 200 }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>{'Загрузка...'}</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#101a2a' }}>
                    <th style={{ padding: 10, textAlign: 'left' }}>{'Дата'}</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>{'Урок'}</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>{'Задача'}</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>{'Язык'}</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>{'Статус'}</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>{'Действия'}</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map(sub => (
                    <tr key={sub.id} style={{ borderBottom: '1px solid #1e2d3d' }}>
                      <td style={{ padding: 10 }}>{formatDateTime(sub.created_at)}</td>
                      <td style={{ padding: 10 }}>{sub.lesson_title}</td>
                      <td style={{ padding: 10 }}>{sub.task_title}</td>
                      <td style={{ padding: 10, textTransform: 'capitalize' }}>{sub.language}</td>
                      <td style={{ padding: 10 }}>
                        <span style={{ color: getStatusColor(sub.status, sub.is_correct), fontWeight: 'bold' }}>
                          {getStatusLabel(sub.status, sub.is_correct)}
                        </span>
                      </td>
                      <td style={{ padding: 10 }}>
                        <button className="btn" onClick={() => viewSubmissionDetail(sub.id)} style={{ padding: '4px 12px', fontSize: 12 }}>
                          {'Посмотреть код'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {submissions.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#888' }}>{'Нет данных'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ backgroundColor: '#101a2a' }}>
                  Назад
                </button>
                <span style={{ padding: '8px 16px' }}>{page} / {totalPages}</span>
                <button className="btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ backgroundColor: '#101a2a' }}>
                  Вперед
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Submission Detail Modal */}
      {selectedSubmission && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 800, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>{selectedSubmission.task_title} - {selectedSubmission.lesson_title}</h3>
              <button className="btn" onClick={() => setSelectedSubmission(null)} style={{ backgroundColor: '#6c757d' }}>{'Закрыть'}</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <strong>{'Статус'}:</strong>{' '}
              <span style={{ color: getStatusColor(selectedSubmission.status, selectedSubmission.is_correct) }}>
                {getStatusLabel(selectedSubmission.status, selectedSubmission.is_correct)}
              </span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <strong>{'Язык'}:</strong> {selectedSubmission.language}
            </div>

            <div style={{ marginBottom: 12 }}>
              <strong>{'Дата'}:</strong> {formatDateTime(selectedSubmission.created_at)}
            </div>

            {selectedSubmission.code && (
              <div style={{ marginBottom: 12 }}>
                <strong>Код:</strong>
                <pre style={{ backgroundColor: '#0d1117', padding: 12, borderRadius: 6, overflow: 'auto', marginTop: 8, color: '#e6edf3' }}>
                  {selectedSubmission.code}
                </pre>
              </div>
            )}

            {selectedSubmission.answer && (
              <div style={{ marginBottom: 12 }}>
                <strong>Ответ:</strong>
                <pre style={{ backgroundColor: '#0d1117', padding: 12, borderRadius: 6, overflow: 'auto', marginTop: 8, color: '#e6edf3' }}>
                  {selectedSubmission.answer}
                </pre>
              </div>
            )}

            {selectedSubmission.result && (
              <div style={{ marginBottom: 12 }}>
                <strong>Результат:</strong>
                <pre style={{ backgroundColor: '#0d1117', padding: 12, borderRadius: 6, overflow: 'auto', marginTop: 8, color: '#e6edf3' }}>
                  {typeof selectedSubmission.result === 'string' ? selectedSubmission.result : JSON.stringify(selectedSubmission.result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {showLeaderboard && <LeaderboardModal onClose={() => setShowLeaderboard(false)} />}
    </div>
  )
}
