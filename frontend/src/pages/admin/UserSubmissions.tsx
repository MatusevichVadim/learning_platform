import { useEffect, useState } from 'react'
import axios from 'axios'
import { adminHeaders, getTask } from '../../api'
import { useParams, useNavigate } from 'react-router-dom'

type Submission = {
  id: number
  user_name: string
  lesson_id: number
  lesson_title: string
  task_id: number
  task_title: string
  is_correct: boolean
  result: string
  status: string
  code?: string
  created_at: string
}

export default function UserSubmissions() {
  const { userName } = useParams<{ userName: string }>()
  const navigate = useNavigate()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState<number | null>(null)
  const [pageSize, setPageSize] = useState(50)
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)
  const [comment, setComment] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { refresh() }, [page, userName])

  async function refresh() {
    if (!userName) return
    const res = await axios.get('/api/admin/submissions', { headers: adminHeaders(), params: { user_name: decodeURIComponent(userName), page, page_size: pageSize } })
    setSubmissions(res.data.data)
    setTotal(res.data.total)
    setPageSize(res.data.page_size)
  }

  function onTaskClick(lessonId: number) {
    // Navigate to the lesson detail page
    navigate(`/lesson/${lessonId}`)
  }

  async function reviewSubmission(submissionId: number, isCorrect: boolean) {
    setLoading(true)
    try {
      await axios.post(`/api/admin/submissions/${submissionId}/review`, {
        is_correct: isCorrect,
        comment: comment
      }, { headers: adminHeaders() })

      // Update the submission status locally
      setSubmissions(prev => prev.map(s =>
        s.id === submissionId ? { ...s, status: 'completed', is_correct: isCorrect } : s
      ))
      setSelectedSubmission(null)
      setComment('')
    } catch (error) {
      console.error('Failed to review submission:', error)
      alert('Ошибка при проверке решения')
    } finally {
      setLoading(false)
    }
  }

  async function onViewSolution(submission: Submission) {
    setSelectedSubmission(submission)
    setComment('')
    setTaskDescription('')

    // Fetch task details
    try {
      const res = await axios.get(`/api/admin/tasks/${submission.task_id}`, { headers: adminHeaders() })
      const taskData = res.data
      setTaskDescription(taskData.description || 'Описание не найдено')
      // Store task title if available
      if (taskData.title) {
        setSelectedSubmission({ ...submission, task_title: taskData.title })
      }
    } catch (error) {
      console.error('Failed to fetch task description:', error)
      setTaskDescription(`Название задачи: ${submission.task_title}`)
    }
  }


  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3>Результаты пользователя: {decodeURIComponent(userName || '')}</h3>
          <button
            className="btn"
            onClick={() => navigate('/admin')}
            style={{ backgroundColor: '#6c757d' }}
          >
            ← Назад к админ панели
          </button>
        </div>
        <table style={{
          width: '100%',
          backgroundColor: '#1a1a2e',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          border: '1px solid #243049'
        }}>
        <thead>
          <tr style={{
            backgroundColor: '#16213e',
            borderBottom: '1px solid #243049'
          }}>
            <th style={{
              padding: '12px 16px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              textAlign: 'left'
            }}>ID</th>
            <th style={{
              padding: '12px 16px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              textAlign: 'left'
            }}>Урок</th>
            <th style={{
              padding: '12px 16px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              textAlign: 'left'
            }}>Задание</th>
            <th style={{
              padding: '12px 16px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              textAlign: 'left'
            }}>Статус</th>
            <th style={{
              padding: '12px 16px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              textAlign: 'left'
            }}>Результат</th>
            <th style={{
              padding: '12px 16px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              textAlign: 'left'
            }}>Дата</th>
          </tr>
        </thead>
        <tbody>
          {submissions.map(s => (
            <tr key={s.id} style={{
              borderBottom: '1px solid #243049'
            }}>
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px'
              }}>{s.id}</td>
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px'
              }}>{s.lesson_title}</td>
              <td style={{
                padding: '12px 16px'
              }}>
                <a
                  href="#"
                  onClick={e => { e.preventDefault(); onTaskClick(s.lesson_id) }}
                  style={{ color: '#007bff', textDecoration: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.target as HTMLElement).style.textDecoration = 'underline'}
                  onMouseLeave={e => (e.target as HTMLElement).style.textDecoration = 'none'}
                >
                  {s.task_title}
                </a>
              </td>
              <td style={{
                padding: '12px 16px',
                color: s.status === 'pending' ? '#ffa500' : (s.is_correct ? '#3dd179' : '#a9b1bb'),
                fontSize: '14px'
              }}>
                {s.status === 'pending' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Ожидает проверки
                    {s.code && (
                      <button
                        className="btn"
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                        onClick={() => onViewSolution(s)}
                      >
                        Просмотреть решение
                      </button>
                    )}
                  </div>
                ) : (s.is_correct ? 'Правильно' : 'Неправильно')}
              </td>
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px'
              }}>{s.result}</td>
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px'
              }}>{(() => { const d = new Date(s.created_at); return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }); })()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" style={{ backgroundColor: '#007bff', color: 'white' }} disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>пред</button>
        {total && Array.from({ length: Math.ceil(total / pageSize) }, (_, i) => i + 1).map(p => (
          <button key={p} className="btn" style={{ backgroundColor: p === page ? '#0056b3' : '#007bff', color: 'white' }} onClick={() => setPage(p)}>{p}</button>
        ))}
        <button className="btn" style={{ backgroundColor: '#007bff', color: 'white' }} disabled={total ? page >= Math.ceil(total / pageSize) : false} onClick={() => setPage(p => p + 1)}>след</button>
      </div>

      </div>

      {/* Modal for viewing solution */}
      {selectedSubmission && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setSelectedSubmission(null)}
        >
          <div
            style={{
              backgroundColor: '#151c2c',
              border: '1px solid #243049',
              borderRadius: '14px',
              padding: '20px',
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#e6edf3' }}>Проверка решения: {selectedSubmission.user_name}</h3>
              <button
                onClick={() => setSelectedSubmission(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#a9b1bb',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                ×
              </button>
            </div>

            {taskDescription && (
              <div style={{ marginBottom: '16px' }}>
                <strong style={{ color: '#e6edf3' }}>Условие задания:</strong>
                <div style={{
                  marginTop: '8px',
                  padding: '12px',
                  backgroundColor: '#111a2b',
                  border: '1px solid #243049',
                  borderRadius: '8px',
                  color: '#e6edf3',
                  maxHeight: '200px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap'
                }}>
                  {taskDescription}
                </div>
              </div>
            )}

            <h4 style={{ color: '#e6edf3', marginBottom: '8px' }}>Код решения:</h4>
            <pre style={{
              backgroundColor: '#111a2b',
              border: '1px solid #243049',
              borderRadius: '10px',
              padding: '12px',
              color: '#e6edf3',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              maxHeight: '300px',
              overflow: 'auto'
            }}>
              {selectedSubmission.code}
            </pre>

            <div style={{ marginTop: '16px' }}>
              <label>
                <strong style={{ color: '#e6edf3' }}>Комментарий (необязательно):</strong>
                <textarea
                  className="input"
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Добавьте комментарий к проверке..."
                  rows={3}
                  style={{ marginTop: '8px', resize: 'vertical' }}
                />
              </label>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
              <button
                className="btn"
                onClick={() => reviewSubmission(selectedSubmission.id, true)}
                disabled={loading}
                style={{ backgroundColor: '#28a745' }}
              >
                ✓ Правильно
              </button>
              <button
                className="btn"
                onClick={() => reviewSubmission(selectedSubmission.id, false)}
                disabled={loading}
                style={{ backgroundColor: '#dc3545' }}
              >
                ✗ Неправильно
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
