import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listTasks, submitQuiz, submitCode, lessonStatus, getTaskSubmission } from '../api'
import { t } from '../i18n'
import CodeInterpreter from '../components/CodeInterpreter'
import ReactMarkdown from 'react-markdown'

type Task = { id: number; title: string; description: string; kind: string; test_spec?: string }

type SubmissionDetails = {
  id: number
  is_correct: boolean
  result: string
  status: string
  created_at: string
}

export default function LessonDetail() {
  const { language, lessonId } = useParams()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<Task[]>([])
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [status, setStatus] = useState<Record<number, boolean | null>>({})
  const [activeIdx, setActiveIdx] = useState(0)
  const [shuffledOpts, setShuffledOpts] = useState<Record<number, string[]>>({})
  const [quizAttempts, setQuizAttempts] = useState<Record<number, number>>({})

  // New state for detailed test results per task
  const [detailedResults, setDetailedResults] = useState<Record<number, any[] | undefined>>({})

  // State for submission details including admin comments
  const [submissionDetails, setSubmissionDetails] = useState<Record<number, SubmissionDetails | null>>({})

  // State to track if we have pending submissions that need polling
  const [hasPendingSubmissions, setHasPendingSubmissions] = useState(false)

  // State for additional information modal
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [additionalInfo, setAdditionalInfo] = useState('')


  // Function to fetch submission details for all tasks
  const fetchSubmissionDetails = async (taskList: Task[]) => {
    const details: Record<number, SubmissionDetails | null> = {}
    let hasPending = false
    
    for (const task of taskList) {
      try {
        const submission = await getTaskSubmission(task.id)
        details[task.id] = submission
        if (submission?.status === 'pending') {
          hasPending = true
        }
      } catch (error) {
        details[task.id] = null
      }
    }
    
    setSubmissionDetails(details)
    setHasPendingSubmissions(hasPending)
    return details
  }

  // Function to check if code task has tests
  function hasCodeTests(task: Task): boolean {
    if (task.kind !== 'code' || !task.test_spec) {
      return false
    }
    try {
      const spec = JSON.parse(task.test_spec)
      const tests = spec.tests || []
      // Check if there are any non-empty tests
      return tests.some((test: any) => test && test.length >= 2 && (test[0]?.trim() || test[1]?.trim()))
    } catch {
      return false
    }
  }


  useEffect(() => {
    const id = Number(lessonId)
    if (id) {
      listTasks(id).then(async (taskList) => {
        setTasks(taskList)
        await fetchSubmissionDetails(taskList)

        // Load quiz attempts from localStorage
        const attempts: Record<number, number> = {}
        taskList.forEach(task => {
          const stored = localStorage.getItem(`quiz_attempts_${id}_${task.id}`)
          attempts[task.id] = stored ? Number(stored) : 0
        })
        setQuizAttempts(attempts)
      })

      lessonStatus(id).then(s => {
        const conv: Record<number, boolean | null> = {}
        Object.entries(s).forEach(([k, v]) => conv[Number(k)] = v as any)
        setStatus(conv)
      })

      // Fetch additional information
      fetch(`/api/lessons/${id}/additional-info`)
        .then(res => res.json())
        .then(data => setAdditionalInfo(data.additional_info))
        .catch(error => console.error('Failed to fetch additional info:', error))
    }
  }, [lessonId])

  // Polling effect for pending submissions
  useEffect(() => {
    if (!hasPendingSubmissions || tasks.length === 0) return

    const pollInterval = setInterval(async () => {
      try {
        const details = await fetchSubmissionDetails(tasks)
        
        // Check if any pending submission became completed
        let statusChanged = false
        for (const task of tasks) {
          const oldDetails = submissionDetails[task.id]
          const newDetails = details[task.id]
          
          if (oldDetails?.status === 'pending' && newDetails?.status === 'completed') {
            statusChanged = true
            break
          }
        }
        
        // If status changed, refresh lesson status
        if (statusChanged) {
          const id = Number(lessonId)
          if (id) {
            const s = await lessonStatus(id)
            const conv: Record<number, boolean | null> = {}
            Object.entries(s).forEach(([k, v]) => conv[Number(k)] = v as any)
            setStatus(conv)
            
            // Check for auto-progression
            for (const task of tasks) {
              if (s[task.id] === true) {
                const currentTaskIndex = tasks.findIndex(t => t.id === task.id)
                if (currentTaskIndex !== -1 && currentTaskIndex < tasks.length - 1) {
                  setActiveIdx(currentTaskIndex + 1)
                  break
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error polling for submission updates:', error)
      }
    }, 3000) // Poll every 3 seconds

    return () => clearInterval(pollInterval)
  }, [hasPendingSubmissions, tasks, submissionDetails, lessonId])

  async function onSubmit(task: Task) {
    // Shuffle options on submit only if answer is not correct
    const id = Number(lessonId)
    if (task.kind === 'quiz' && task.test_spec && id) {
      try {
        const s = await lessonStatus(id)
        if (!s[task.id]) { // if not correct
          const spec = JSON.parse(task.test_spec)
          const opts: string[] = spec.options || []
          const shuffledIndices = opts.map((_, i) => i).sort(() => Math.random() - 0.5)
          const shuffled = shuffledIndices.map(i => opts[i])
          setShuffledOpts(s => ({ ...s, [task.id]: shuffled }))
        }
      } catch {}
    }
    const value = answers[task.id] || ''
    if (task.kind === 'quiz') {
      await submitQuiz(task.id, value)
      setDetailedResults(prev => ({ ...prev, [task.id]: undefined })) // clear previous
    } else {
      const res = await submitCode(task.id, value)
      console.log('submitCode response:', res)

      if (res && res.result && Array.isArray(res.result.results)) {
        console.log('Detailed results:', res.result.results)
        setDetailedResults(prev => ({ ...prev, [task.id]: res.result.results }))
        if (res.failed_test_index) {
          alert(`Тест №${res.failed_test_index} не прошел`)
        }
      } else {
        setDetailedResults(prev => ({ ...prev, [task.id]: undefined }))
      }
    }
    if (id) {
      const s = await lessonStatus(id)
      const conv: Record<number, boolean | null> = {}
      Object.entries(s).forEach(([k, v]) => conv[Number(k)] = v as any)
      setStatus(conv)
      
      // If correct, advance to next task (if not the last one)
      if (s[task.id] === true) {
        const currentTaskIndex = tasks.findIndex(t => t.id === task.id)
        if (currentTaskIndex !== -1 && currentTaskIndex < tasks.length - 1) {
          // Move to next task immediately
          setActiveIdx(currentTaskIndex + 1)
        }
      }
      
      // If incorrect, clear answers and increment attempts for quiz
      if (s[task.id] === false) {
        setAnswers(a => ({ ...a, [task.id]: '' }))
        if (task.kind === 'quiz') {
          setQuizAttempts(prev => {
            const newAttempts = { ...prev, [task.id]: (prev[task.id] || 0) + 1 }
            localStorage.setItem(`quiz_attempts_${lessonId}_${task.id}`, String(newAttempts[task.id]))
            return newAttempts
          })
        }
      }
      
      // Refresh submission details after submit
      try {
        const submission = await getTaskSubmission(task.id)
        setSubmissionDetails(prev => ({ ...prev, [task.id]: submission }))
      } catch (error) {
        console.error('Failed to fetch submission details:', error)
      }
    }
  }

  return (
    <div className="container">
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          className="btn"
          onClick={() => navigate(`/lessons/${language}`)}
          style={{ backgroundColor: '#6c757d' }}
        >
          ← Назад к урокам
        </button>
        <button
          className="btn"
          onClick={() => setShowInfoModal(true)}
        >
          Дополнительная информация
        </button>
      </div>
      <div className="card">
        <h1 className="title">{t('tasks')}</h1>
        <div className="tabs">
          {tasks.map((task, idx) => {
            const st = status[task.id]
            const isActive = idx === activeIdx
            const attempts = quizAttempts[task.id] || 0
            const isDisabled = task.kind === 'quiz' && attempts >= 3 && st !== true
            const cls = st === true ? 'tab ok' : st === false ? 'tab fail' : 'tab'
            return (
              <button
                key={task.id}
                onClick={() => !isDisabled && setActiveIdx(idx)}
                className={cls}
                disabled={isDisabled}
                style={{
                  backgroundColor: isActive ? '#3dd179' : isDisabled ? '#6c757d' : undefined,
                  color: isActive ? '#092013' : isDisabled ? '#a9b1bb' : undefined,
                  fontWeight: isActive ? 'bold' : undefined,
                  border: isActive ? '2px solid #2a8f5c' : undefined,
                  cursor: isDisabled ? 'not-allowed' : 'pointer'
                }}
              >
                {idx + 1}
              </button>
            )
          })}
        </div>

        {tasks.map((task, idx) => (
        <div key={task.id} style={{ display: idx === activeIdx ? 'block' : 'none' }}>
          <h3>{task.title}</h3>
          <div style={{ color: '#e6edf3', lineHeight: '1.6', marginBottom: '16px' }}>
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 style={{ color: '#58a6ff', marginTop: '20px', marginBottom: '10px', fontSize: '1.5em' }}>{children}</h1>,
                h2: ({ children }) => <h2 style={{ color: '#58a6ff', marginTop: '16px', marginBottom: '8px', fontSize: '1.3em' }}>{children}</h2>,
                h3: ({ children }) => <h3 style={{ color: '#58a6ff', marginTop: '14px', marginBottom: '6px', fontSize: '1.2em' }}>{children}</h3>,
                p: ({ children }) => <p style={{ marginBottom: '12px' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ marginLeft: '20px', marginBottom: '12px' }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ marginLeft: '20px', marginBottom: '12px' }}>{children}</ol>,
                li: ({ children }) => <li style={{ marginBottom: '4px' }}>{children}</li>,
                code: ({ children }) => <code style={{ backgroundColor: '#0d1117', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>{children}</code>,
                pre: ({ children }) => <pre style={{ backgroundColor: '#0d1117', padding: '12px', borderRadius: '6px', overflow: 'auto', marginBottom: '12px' }}>{children}</pre>,
                blockquote: ({ children }) => <blockquote style={{ borderLeft: '4px solid #58a6ff', paddingLeft: '12px', marginBottom: '12px', color: '#a9b1bb' }}>{children}</blockquote>,
                strong: ({ children }) => <strong style={{ color: '#f85149' }}>{children}</strong>,
                em: ({ children }) => <em style={{ color: '#d29922' }}>{children}</em>,
              }}
            >
              {task.description || 'Описание задания не добавлено.'}
            </ReactMarkdown>
          </div>
            {task.kind === 'quiz' && (() => { try {
              const spec = task.test_spec ? JSON.parse(task.test_spec) : {}
              const opts: string[] = spec.options || []
              const correctLetters: string[] = Array.isArray(spec.correct) ? spec.correct : (spec.correct ? [spec.correct] : [])
              const displayOpts = shuffledOpts[task.id] || opts
              const shuffledIndices = displayOpts.map(opt => opts.indexOf(opt))
              return (
                <div style={{ display: 'flex', gap: 8, flexDirection: 'column', marginBottom: 8 }}>
                  {displayOpts.map((opt, displayIdx) => {
                    const originalIdx = shuffledIndices[displayIdx]
                    const letter = String.fromCharCode(65 + originalIdx)
                    const isChecked = status[task.id] === true ? correctLetters.includes(letter) : (answers[task.id] || '').includes(letter)
                    return (
                      <label key={displayIdx}>
                        <input
                          type="checkbox"
                          name={`q_${task.id}_${displayIdx}`}
                          checked={isChecked}
                          disabled={status[task.id] === true || (quizAttempts[task.id] || 0) >= 3}
                          onChange={() => {
                            if (status[task.id] !== true && (quizAttempts[task.id] || 0) < 3) { // only allow change if not correct and attempts left
                              setAnswers(a => {
                                const current = a[task.id] || ''
                                const chars = current.split('')
                                if (chars.includes(letter)) {
                                  return { ...a, [task.id]: chars.filter(c => c !== letter).join('') }
                                } else {
                                  return { ...a, [task.id]: current + letter }
                                }
                              })
                            }
                          }}
                        /> {opt}
                      </label>
                    )
                  })}
                </div>
              )
            } catch { return null } })()}
          {task.kind === 'code' && (
            <CodeInterpreter
              value={answers[task.id] || ''}
              onChange={value => setAnswers(a => ({ ...a, [task.id]: value }))}
              language={language || 'python'}
            />
          )}
          <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
            <button className="btn" onClick={() => onSubmit(task)} disabled={task.kind === 'quiz' && (quizAttempts[task.id] || 0) >= 3 && status[task.id] !== true}>{t('submit')}</button>
            {status[task.id] !== undefined && status[task.id] !== null && (
              <span style={{ color: status[task.id] ? '#3dd179' : '#a9b1bb' }}>
                {status[task.id] ? 'Верно' : 'Неверно'}
              </span>
            )}
            {submissionDetails[task.id]?.status === 'pending' && (
              <span style={{ color: 'orange' }}>
                Ожидает проверки администратором
              </span>
            )}
            {detailedResults[task.id] && detailedResults[task.id]!.length > 0 && (
              <div style={{ marginTop: 8, color: 'red', whiteSpace: 'pre-wrap' }}>
                {detailedResults[task.id]!.map((res, idx) => (
                  <div key={idx}>
                    {res.ok ? null : `Тест №${idx + 1} не пройден: ${res.msg}`}
                  </div>
                ))}
              </div>
            )}
            {/* Display admin comments for code tasks */}
            {task.kind === 'code' && submissionDetails[task.id]?.result && submissionDetails[task.id]?.status === 'completed' && (
              <div style={{
                marginTop: 12,
                padding: '12px',
                backgroundColor: '#111a2b',
                border: '1px solid #243049',
                borderRadius: '10px',
                color: '#e6edf3'
              }}>
                <div style={{
                  color: '#a9b1bb',
                  fontSize: '14px',
                  marginBottom: '6px',
                  fontWeight: '500'
                }}>
                  Комментарий преподавателя:
                </div>
                <div style={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.4'
                }}>
                  {submissionDetails[task.id]!.result}
                </div>
              </div>
            )}
          </div>
        </div>
        ))}
      </div>

      {/* Additional Information Modal */}
      {showInfoModal && (
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
          onClick={() => setShowInfoModal(false)}
        >
          <div
            style={{
              backgroundColor: '#151c2c',
              border: '1px solid #243049',
              borderRadius: '14px',
              padding: '30px',
              maxWidth: '900px',
              width: '85vw',
              maxHeight: '85vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#e6edf3' }}>Дополнительная информация</h3>
              <button
                onClick={() => setShowInfoModal(false)}
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
            <div style={{ color: '#e6edf3', lineHeight: '1.6' }}>
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 style={{ color: '#58a6ff', marginTop: '20px', marginBottom: '10px', fontSize: '1.5em' }}>{children}</h1>,
                  h2: ({ children }) => <h2 style={{ color: '#58a6ff', marginTop: '16px', marginBottom: '8px', fontSize: '1.3em' }}>{children}</h2>,
                  h3: ({ children }) => <h3 style={{ color: '#58a6ff', marginTop: '14px', marginBottom: '6px', fontSize: '1.2em' }}>{children}</h3>,
                  p: ({ children }) => <p style={{ marginBottom: '12px' }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ marginLeft: '20px', marginBottom: '12px' }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ marginLeft: '20px', marginBottom: '12px' }}>{children}</ol>,
                  li: ({ children }) => <li style={{ marginBottom: '4px' }}>{children}</li>,
                  code: ({ children }) => <code style={{ backgroundColor: '#0d1117', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>{children}</code>,
                  pre: ({ children }) => <pre style={{ backgroundColor: '#0d1117', padding: '12px', borderRadius: '6px', overflow: 'auto', marginBottom: '12px' }}>{children}</pre>,
                  blockquote: ({ children }) => <blockquote style={{ borderLeft: '4px solid #58a6ff', paddingLeft: '12px', marginBottom: '12px', color: '#a9b1bb' }}>{children}</blockquote>,
                  strong: ({ children }) => <strong style={{ color: '#f85149' }}>{children}</strong>,
                  em: ({ children }) => <em style={{ color: '#d29922' }}>{children}</em>,
                }}
              >
                {additionalInfo || 'Дополнительная информация для этого урока пока не добавлена.'}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


