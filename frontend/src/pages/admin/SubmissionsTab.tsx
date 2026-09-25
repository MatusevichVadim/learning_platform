import { useEffect, useState } from 'react'
import axios from 'axios'
import { authHeaders, getTask } from '../../api'
import { useNavigate } from 'react-router-dom'
import { formatDateTime } from '../../utils/date'

type Submission = {
  id: number
  user_name: string
  user_class?: string
  lesson_id: number
  lesson_title: string
  language?: string
  task_id: number
  task_title: string
  is_correct: boolean
  result: string
  status: string
  code?: string
  created_at: string
}

export default function SubmissionsTab() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState<number | null>(null)
  const [pageSize, setPageSize] = useState(50)
  const [showModal, setShowModal] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)
  const [comment, setComment] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskKind, setTaskKind] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const navigate = useNavigate()

  // Filter states.  All filtering/sorting is performed by the server: the
  // previous client-side approach requested 100_000 rows on every filter
  // change, which made SQLite read and join the whole submissions table
  // (code/result blobs included) and spiked disk IOPS into the tens of
  // thousands.  A single indexed page read is all we need now.
  const [statusFilter, setStatusFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [lessonFilter, setLessonFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // The table is always ordered by date, newest first (the server default).
  const [loadError, setLoadError] = useState('')

  // Options for the class/lesson dropdowns.  They cannot be derived from the
  // loaded page anymore, so they are fetched once from cheap endpoints.
  const [allClasses, setAllClasses] = useState<string[]>([])
  const [allLessons, setAllLessons] = useState<{ id: number; title: string; language: string }[]>([])

  // Debounce the free-text search so typing does not fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Any filter change must return to the first page.
  useEffect(() => { setPage(1) }, [statusFilter, classFilter, lessonFilter, debouncedSearch])

  useEffect(() => {
    refresh()
  }, [page, pageSize, statusFilter, classFilter, lessonFilter, debouncedSearch])

  // Load dropdown options once.  The dedicated endpoint only returns classes
  // and lessons that actually have submissions, so picking an option always
  // yields rows.
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/api/admin/submissions/filter-options', { headers: authHeaders() })
        setAllClasses((res.data?.classes || []).filter(Boolean))
        setAllLessons(res.data?.lessons || [])
      } catch (error) {
        console.error('Failed to load filter options:', error)
        setLoadError('Не удалось загрузить списки фильтров')
      }
    })()
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/submissions', {
        headers: authHeaders(),
        params: {
          page,
          page_size: pageSize,
          status: statusFilter,
          user_class: classFilter,
          lesson_id: lessonFilter,
          search: debouncedSearch,
        },
      })
      setSubmissions(res.data.data || [])
      setTotal(res.data.total || 0)
      setLoadError('')
    } catch (error: any) {
      // Surface the failure instead of silently keeping the old rows, which
      // made the filter row look completely dead.
      const status = error?.response?.status
      const detail = error?.response?.data?.detail
      setLoadError(
        `Не удалось загрузить данные${status ? ` (HTTP ${status})` : ''}` +
        (detail ? `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : '')
      )
      console.error('Failed to load submissions:', error)
    } finally {
      setLoading(false)
    }
  }

  function onUserClick(userName: string) {
    // Navigate to a page with submissions only for this user
    // For now, assume a route like /admin/user/:userName/submissions
    navigate(`/admin/user/${encodeURIComponent(userName)}/submissions`)
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
      }, { headers: authHeaders() })

      // Update the submission status locally
      setSubmissions(prev => prev.map(s =>
        s.id === submissionId ? { ...s, status: 'completed', is_correct: isCorrect } : s
      ))
      setShowModal(false)
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
    setTaskKind('')
    setCopiedCode(false)

    // Fetch task details
    try {
      const res = await axios.get(`/api/admin/tasks/${submission.task_id}`, { headers: authHeaders() })
      const taskData = res.data
      setTaskDescription(taskData.description || 'Описание не найдено')
      // Store task title if available
      if (taskData.title) {
        setSelectedSubmission({ ...submission, task_title: taskData.title })
      }
      if (taskData.kind) {
        setTaskKind(taskData.kind)
      }
    } catch (error) {
      console.error('Failed to fetch task description:', error)
      setTaskDescription(`Название задачи: ${submission.task_title}`)
    }

    setShowModal(true)
  }

  async function copyCodeToClipboard(code: string) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code)
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea')
        textArea.value = code
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } catch (error) {
      console.error('Failed to copy code:', error)
    }
  }


  // Server-side pagination: the API returns exactly one page of rows.
  const displayTotal = total || 0
  const displayPage = page
  const displayPageSize = pageSize
  const paginatedData = submissions

  return (
    <div>
      {/* Filter panel */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ color: '#a9b1bb', fontSize: '13px', whiteSpace: 'nowrap' }}>Статус:</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="input"
            style={{ backgroundColor: '#151c2c', color: '#e6edf3', border: '1px solid #243049', borderRadius: 6, padding: '6px 10px', fontSize: '13px', minWidth: 160 }}
          >
            <option value="">Все статусы</option>
            <option value="pending">Ожидает проверки</option>
            <option value="completed">Завершено</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ color: '#a9b1bb', fontSize: '13px', whiteSpace: 'nowrap' }}>Класс:</label>
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="input"
            style={{ backgroundColor: '#151c2c', color: '#e6edf3', border: '1px solid #243049', borderRadius: 6, padding: '6px 10px', fontSize: '13px', minWidth: 120 }}
          >
            <option value="">Все классы</option>
            {allClasses.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ color: '#a9b1bb', fontSize: '13px', whiteSpace: 'nowrap' }}>Урок:</label>
          <select
            value={lessonFilter}
            onChange={e => setLessonFilter(e.target.value)}
            className="input"
            style={{ backgroundColor: '#151c2c', color: '#e6edf3', border: '1px solid #243049', borderRadius: 6, padding: '6px 10px', fontSize: '13px', minWidth: 160 }}
          >
            <option value="">Все уроки</option>
            {allLessons.map(l => (
              <option key={l.id} value={l.id}>
                {l.language} — {l.title}
              </option>
            ))}
          </select>
        </div>
        {(statusFilter || classFilter || lessonFilter || searchQuery) && (
          <button
            className="btn"
            onClick={() => { setStatusFilter(''); setClassFilter(''); setLessonFilter(''); setSearchQuery(''); setPage(1) }}
            style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: '#3dd179', color: '#092013' }}
          >
            Сбросить
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 220 }}>
          <label style={{ color: '#a9b1bb', fontSize: '13px', whiteSpace: 'nowrap' }}>Поиск:</label>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Имя пользователя или номер задания"
            className="input"
            style={{ backgroundColor: '#151c2c', color: '#e6edf3', border: '1px solid #243049', borderRadius: 6, padding: '6px 10px', fontSize: '13px', flex: 1, minWidth: 200 }}
          />
        </div>
      </div>

      {loadError && (
        <div style={{
          marginBottom: 12,
          padding: '10px 14px',
          borderRadius: 6,
          backgroundColor: '#3d1d24',
          border: '1px solid #dc3545',
          color: '#ffb3bd',
          fontSize: '13px',
        }}>
          {loadError}
        </div>
      )}

      <table style={{
        width: '100%',
        tableLayout: 'fixed',
        borderCollapse: 'collapse',
        backgroundColor: '#1a1a2e',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#16213e' }}>
            {([
              ['Номер',        'left',  90,  90],
              ['Пользователь', 'left',  null, 180],
              ['Класс',        'left',  80,  80],
              ['Урок',         'left',  null, 200],
              ['Задание',      'left',  null, 260],
              ['Статус',       'left',  null, 160],
              ['Дата',         'right', 125, 125],
            ] as [string, 'left' | 'right', number | null, number][]).map(
              ([label, align, width, maxWidth]) => (
                <th
                  key={label}
                  style={{
                    padding: '12px 16px',
                    textAlign: align,
                    color: '#ffffff',
                    fontWeight: '600',
                    fontSize: '14px',
                    borderBottom: '1px solid #243049',
                    width: width ?? undefined,
                    maxWidth: maxWidth,
                  }}
                >
                  {label}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {paginatedData.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid #243049', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1e2540' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              onClick={() => onViewSolution(s)}
            >
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px',
                width: '90px',
                maxWidth: '90px'
              }}>{s.id}</td>
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px',
                maxWidth: '180px'
              }}>
                <a href="#" onClick={e => { e.preventDefault(); onUserClick(s.user_name) }} style={{
                  color: '#ffffff',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>{s.user_name}</a>
              </td>
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px',
                width: '80px',
                maxWidth: '80px'
              }}>{s.user_class || '-'}</td>
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px',
                maxWidth: '200px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>{s.lesson_title}</td>
              <td style={{
                padding: '12px 16px',
                maxWidth: '260px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {s.task_title}
              </td>
              <td style={{
                padding: '12px 16px',
                fontSize: '14px',
                maxWidth: '160px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {s.status === 'pending' ? (
                    <span style={{
                      display: 'inline-block',
                      backgroundColor: 'rgba(217, 175, 91, 0.15)',
                      color: '#EAD69E',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontWeight: '600'
                    }}>
                      Ожидает проверки
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-block',
                      backgroundColor: s.is_correct ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)',
                      color: s.is_correct ? '#76E0A6' : '#F1948A',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontWeight: '600'
                    }}>
                      {s.is_correct ? 'Правильно' : 'Неправильно'}
                    </span>
                  )}
                  {s.code && s.code.includes('AUTO_TEST_SUCCESS') && (
                    <span style={{
                      display: 'inline-block',
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      fontSize: '10px',
                      fontWeight: 'bold'
                    }}>
                      ТЕСТЫ
                    </span>
                  )}
                </div>
              </td>
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px',
                width: '125px',
                maxWidth: '125px',
                textAlign: 'right',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>{formatDateTime(s.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" style={{ backgroundColor: '#3dd179', color: '#092013' }} disabled={displayPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>пред</button>
        {displayTotal > 0 && (() => {
          const totalPages = Math.ceil(displayTotal / displayPageSize)
          const pages = []
          const showPages = 5 // number of page buttons to show
          let start = Math.max(1, displayPage - Math.floor(showPages / 2))
          let end = Math.min(totalPages, start + showPages - 1)
          start = Math.max(1, end - showPages + 1)

          if (start > 1) {
            pages.push(<button key={1} className="btn" style={{ backgroundColor: '#3dd179', color: '#092013' }} onClick={() => setPage(1)}>1</button>)
            if (start > 2) pages.push(<span key="start-ellipsis">...</span>)
          }

          for (let p = start; p <= end; p++) {
            pages.push(
              <button key={p} className="btn" style={{ backgroundColor: p === displayPage ? '#2eb85c' : '#3dd179', color: '#092013' }} onClick={() => setPage(p)}>{p}</button>
            )
          }

          if (end < totalPages) {
            if (end < totalPages - 1) pages.push(<span key="end-ellipsis">...</span>)
            pages.push(<button key={totalPages} className="btn" style={{ backgroundColor: '#3dd179', color: '#092013' }} onClick={() => setPage(totalPages)}>{totalPages}</button>)
          }

          return pages
        })()}
        <button className="btn" style={{ backgroundColor: '#3dd179', color: '#092013' }} disabled={displayTotal > 0 ? displayPage >= Math.ceil(displayTotal / displayPageSize) : false} onClick={() => setPage(p => p + 1)}>след</button>
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
              <h3 style={{ margin: 0, color: '#e6edf3' }}>Решение пользователя: {selectedSubmission.user_name}</h3>
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
            <div style={{ color: '#e6edf3', marginBottom: '12px' }}>
              <strong>Урок:</strong> {selectedSubmission.lesson_title}<br />
              <strong>Задание:</strong> {selectedSubmission.task_title}
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

            {taskKind !== 'quiz' && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <strong style={{ color: '#e6edf3' }}>Код решения:</strong>
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => selectedSubmission?.code ? copyCodeToClipboard(selectedSubmission.code) : null}
                    title="Копировать код"
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      backgroundColor: copiedCode ? '#28a745' : 'rgba(255, 255, 255, 0.15)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      zIndex: 10,
                      transition: 'all 0.2s ease',
                      opacity: 0.7
                    }}
                    onMouseOver={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.05)' }}
                    onMouseOut={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.transform = 'scale(1)' }}
                  >
                    {copiedCode ? '✓' : '📋'}
                  </button>
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
                </div>
              </>
            )}

            {taskKind !== 'quiz' && (selectedSubmission.status === 'pending' || selectedSubmission.is_correct) && (
              <div style={{ marginTop: '16px' }}>
                <label>
                  <strong style={{ color: '#e6edf3' }}>Комментарий:</strong>
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
            )}

            {selectedSubmission.status === 'pending' && (
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
            )}
          </div>
        </div>
      )}

    </div>
  )
}
