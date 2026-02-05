import { useEffect, useState } from 'react'
import axios from 'axios'
import { adminHeaders } from '../../api'

type PendingSubmission = {
  id: number
  user_name: string
  lesson_title: string
  task_title: string
  task_description: string
  code: string
  created_at: string
}

export default function PendingReview() {
  const [submissions, setSubmissions] = useState<PendingSubmission[]>([])
  const [selectedSubmission, setSelectedSubmission] = useState<PendingSubmission | null>(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadPendingSubmissions()
  }, [])

  async function loadPendingSubmissions() {
    try {
      const res = await axios.get('/api/admin/submissions/pending', { headers: adminHeaders() })
      setSubmissions(res.data)
    } catch (error) {
      console.error('Failed to load pending submissions:', error)
    }
  }

  async function reviewSubmission(submissionId: number, isCorrect: boolean) {
    setLoading(true)
    try {
      await axios.post(`/api/admin/submissions/${submissionId}/review`, {
        is_correct: isCorrect,
        comment: comment
      }, { headers: adminHeaders() })
      
      // Remove reviewed submission from list
      setSubmissions(prev => prev.filter(s => s.id !== submissionId))
      setSelectedSubmission(null)
      setComment('')
    } catch (error) {
      console.error('Failed to review submission:', error)
      alert('Ошибка при проверке решения')
    } finally {
      setLoading(false)
    }
  }

  if (selectedSubmission) {
    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          <button 
            className="btn" 
            onClick={() => setSelectedSubmission(null)}
            style={{ backgroundColor: '#6c757d' }}
          >
            ← Назад к списку
          </button>
        </div>
        
        <div className="card">
          <h3>Проверка решения</h3>

          <h4>Условие задания:</h4>
          <div style={{
            backgroundColor: '#111a2b',
            color: '#e6edf3',
            padding: '12px',
            borderRadius: '10px',
            marginBottom: '20px',
            border: '1px solid #243049',
            fontFamily: 'Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: '14px',
            lineHeight: '1.4',
            whiteSpace: 'pre-wrap'
          }}>
            {selectedSubmission.task_description || 'Описание задания не найдено'}
          </div>

          <h4>Код решения:</h4>
          <pre style={{
            backgroundColor: '#111a2b',
            color: '#e6edf3',
            padding: '12px',
            borderRadius: '10px',
            overflow: 'auto',
            maxHeight: '400px',
            border: '1px solid #243049',
            fontFamily: 'Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: '14px',
            lineHeight: '1.4'
          }}>
            {selectedSubmission.code}
          </pre>
          
          <div style={{ marginTop: '20px' }}>
            <label>
              <strong>Комментарий (необязательно):</strong>
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
    )
  }

  return (
    <div>
      <h3>Ожидают проверки ({submissions.length})</h3>

      {submissions.length === 0 ? (
        <p>Нет решений, ожидающих проверки</p>
      ) : (
        <div style={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: '#1a1a2e',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: '#1a1a2e',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#16213e' }}>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  color: '#ffffff',
                  fontWeight: '600',
                  fontSize: '14px',
                  borderBottom: '1px solid #243049'
                }}>Студент</th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  color: '#ffffff',
                  fontWeight: '600',
                  fontSize: '14px',
                  borderBottom: '1px solid #243049'
                }}>Урок</th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  color: '#ffffff',
                  fontWeight: '600',
                  fontSize: '14px',
                  borderBottom: '1px solid #243049'
                }}>Задание</th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  color: '#ffffff',
                  fontWeight: '600',
                  fontSize: '14px',
                  borderBottom: '1px solid #243049'
                }}>Дата отправки</th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  color: '#ffffff',
                  fontWeight: '600',
                  fontSize: '14px',
                  borderBottom: '1px solid #243049'
                }}>Действие</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map(submission => (
                <tr key={submission.id} style={{ borderBottom: '1px solid #243049' }}>
                  <td style={{
                    padding: '12px 16px',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}>
                    <a href="#" onClick={e => { e.preventDefault(); }} style={{
                      color: '#ffffff',
                      textDecoration: 'none',
                      cursor: 'pointer'
                    }}>{submission.user_name}</a>
                  </td>
                  <td style={{
                    padding: '12px 16px',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}>{submission.lesson_title}</td>
                  <td style={{
                    padding: '12px 16px'
                  }}>
                    <a
                      href="#"
                      onClick={e => { e.preventDefault(); }}
                      style={{
                        color: '#ffffff',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        fontWeight: '500',
                        fontSize: '14px'
                      }}
                    >
                      {submission.task_title}
                    </a>
                  </td>
                  <td style={{
                    padding: '12px 16px',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}>{(() => { const d = new Date(submission.created_at); return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }); })()}</td>
                  <td style={{
                    padding: '12px 16px'
                  }}>
                    <button
                      className="btn"
                      onClick={() => setSelectedSubmission(submission)}
                      style={{
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Проверить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}