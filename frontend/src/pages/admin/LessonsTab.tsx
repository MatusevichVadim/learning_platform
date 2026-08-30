import { useEffect, useState } from 'react'
import axios from 'axios'
import { authHeaders } from '../../api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Lesson = { id: number; language: string; title: string; order_index: number }

type Language = { id: string; name: string; is_custom: boolean }

export default function LessonsTab({ onSelectLesson }: { onSelectLesson?: (id: number) => void }) {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [form, setForm] = useState<Partial<Lesson>>({ language: 'python', title: '' })
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null)
  const [taskCounts, setTaskCounts] = useState<Record<number, number>>({})
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null)
  const [editingLessonTitle, setEditingLessonTitle] = useState<string>('')
  const [editingAdditionalInfoLessonId, setEditingAdditionalInfoLessonId] = useState<number | null>(null)
  const [additionalInfo, setAdditionalInfo] = useState('')
  const [showAdditionalInfoPreview, setShowAdditionalInfoPreview] = useState(false)
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false)
  const [textareaRows, setTextareaRows] = useState(6)

  useEffect(() => { refresh() }, [])

  // Update textarea rows based on content
  useEffect(() => {
    const lines = additionalInfo.split('\n').length
    const minRows = 6
    const maxRows = 20
    const calculatedRows = Math.max(minRows, Math.min(maxRows, lines + 2)) // +2 for some padding
    setTextareaRows(calculatedRows)
  }, [additionalInfo])

  async function refresh() {
    const res = await axios.get('/api/admin/lessons', { headers: authHeaders() })
    setLessons(res.data)
    // fetch task counts per lesson
    const countsRes = await axios.get('/api/admin/tasks', { headers: authHeaders() })
    const counts: Record<number, number> = {}
    for (const task of countsRes.data) {
      counts[task.lesson_id] = (counts[task.lesson_id] || 0) + 1
    }
    setTaskCounts(counts)

    // fetch languages
    const langsRes = await axios.get('/api/admin/languages', { headers: authHeaders() })
    setLanguages(langsRes.data)
  }

  async function create() {
    await axios.post('/api/admin/lessons', form, { headers: authHeaders() })
    setForm({ language: 'python', title: '' })
    await refresh()
  }

  async function remove(id: number) {
    if (!confirm('Удалить урок и все его задания?')) return
    try {
      await axios.delete(`/api/admin/lessons/${id}`, { headers: authHeaders() })
      await refresh()
    } catch (error) {
      console.error('Failed to delete lesson:', error)
      alert('Ошибка при удалении урока')
    }
  }

  async function startEditTitle(lesson: { id: number; title: string }) {
    setEditingLessonId(lesson.id)
    setEditingLessonTitle(lesson.title)
  }

  async function saveTitle(lessonId: number) {
    try {
      await axios.put(`/api/admin/lessons/${lessonId}`, { title: editingLessonTitle }, { headers: authHeaders() })
      setEditingLessonId(null)
      setEditingLessonTitle('')
      await refresh()
    } catch (error) {
      console.error('Failed to update lesson title:', error)
      alert('Ошибка при сохранении названия')
    }
  }

  function cancelTitleEdit() {
    setEditingLessonId(null)
    setEditingLessonTitle('')
  }

  async function moveLesson(lessonId: number, direction: 'up' | 'down') {
    try {
      await axios.post(`/api/admin/lessons/${lessonId}/move`, { direction }, { headers: authHeaders() })
      await refresh()
    } catch (error) {
      console.error('Failed to move lesson:', error)
    }
  }

  async function startEditAdditionalInfo(lessonId: number) {
    try {
      const response = await axios.get(`/api/admin/lessons/${lessonId}/additional-info`, {
        headers: authHeaders()
      })
      setAdditionalInfo(response.data.additional_info || '')
      setEditingAdditionalInfoLessonId(lessonId)
    } catch (error) {
      console.error('Failed to fetch additional info:', error)
      setAdditionalInfo('')
      setEditingAdditionalInfoLessonId(lessonId)
    }
  }

  async function saveAdditionalInfo() {
    if (editingAdditionalInfoLessonId === null) return

    try {
      await axios.put(`/api/admin/lessons/${editingAdditionalInfoLessonId}/additional-info`, {
        additional_info: additionalInfo
      }, {
        headers: authHeaders()
      })
      // Success - no alert needed
      setEditingAdditionalInfoLessonId(null)
      setAdditionalInfo('')
    } catch (error) {
      console.error('Failed to save additional info:', error)
      alert('Ошибка при сохранении')
    }
  }

  function cancelEdit() {
    setEditingAdditionalInfoLessonId(null)
    setAdditionalInfo('')
  }

  return (
    <div>
      {/* Markdown Help Modal */}
      {showMarkdownHelp && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onClick={() => setShowMarkdownHelp(false)}
        >
          <div
            style={{
              backgroundColor: '#151c2c',
              border: '1px solid #243049',
              borderRadius: '14px',
              padding: '20px',
              maxWidth: '700px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#e6edf3' }}>Справка по Markdown</h3>
              <button
                onClick={() => setShowMarkdownHelp(false)}
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
              <h4 style={{ color: '#58a6ff', marginTop: '20px', marginBottom: '10px' }}>Заголовки</h4>
              <div style={{ backgroundColor: '#0d1117', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <div style={{ marginBottom: '8px' }}><code style={{ color: '#a9b1bb' }}># Заголовок 1</code> → <h1 style={{ color: '#58a6ff', margin: '0', fontSize: '1.2em' }}>Заголовок 1</h1></div>
                <div style={{ marginBottom: '8px' }}><code style={{ color: '#a9b1bb' }}>## Заголовок 2</code> → <h2 style={{ color: '#58a6ff', margin: '0', fontSize: '1.1em' }}>Заголовок 2</h2></div>
                <div><code style={{ color: '#a9b1bb' }}>### Заголовок 3</code> → <h3 style={{ color: '#58a6ff', margin: '0', fontSize: '1em' }}>Заголовок 3</h3></div>
              </div>

              <h4 style={{ color: '#58a6ff', marginTop: '20px', marginBottom: '10px' }}>Форматирование текста</h4>
              <div style={{ backgroundColor: '#0d1117', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <div style={{ marginBottom: '8px' }}><code style={{ color: '#a9b1bb' }}>**жирный текст**</code> → <strong style={{ color: '#f85149' }}>жирный текст</strong></div>
                <div style={{ marginBottom: '8px' }}><code style={{ color: '#a9b1bb' }}>*курсив*</code> → <em style={{ color: '#d29922' }}>курсив</em></div>
                <div><code style={{ color: '#a9b1bb' }}>***жирный курсив***</code> → <strong style={{ color: '#f85149' }}><em style={{ color: '#d29922' }}>жирный курсив</em></strong></div>
              </div>

              <h4 style={{ color: '#58a6ff', marginTop: '20px', marginBottom: '10px' }}>Код</h4>
              <div style={{ backgroundColor: '#0d1117', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <div style={{ marginBottom: '8px' }}><code style={{ color: '#a9b1bb' }}>`код`</code> → <code style={{ backgroundColor: '#161b22', padding: '2px 4px', borderRadius: '3px' }}>код</code></div>
                <div>
                  <code style={{ color: '#a9b1bb' }}>```<br/>блок кода<br/>```</code> →
                  <pre style={{ backgroundColor: '#161b22', padding: '8px', borderRadius: '4px', marginTop: '4px', fontSize: '12px' }}>
                    блок кода
                  </pre>
                </div>
              </div>

              <h4 style={{ color: '#58a6ff', marginTop: '20px', marginBottom: '10px' }}>Списки</h4>
              <div style={{ backgroundColor: '#0d1117', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ marginBottom: '4px' }}><code style={{ color: '#a9b1bb' }}>- элемент списка</code></div>
                  <div style={{ marginBottom: '4px' }}><code style={{ color: '#a9b1bb' }}>- другой элемент</code></div>
                  <div style={{ marginLeft: '20px', marginBottom: '8px' }}>→</div>
                  <ul style={{ marginLeft: '20px', marginBottom: '0' }}>
                    <li style={{ marginBottom: '2px' }}>элемент списка</li>
                    <li>другой элемент</li>
                  </ul>
                </div>
                <div>
                  <div style={{ marginBottom: '4px' }}><code style={{ color: '#a9b1bb' }}>1. нумерованный</code></div>
                  <div style={{ marginBottom: '4px' }}><code style={{ color: '#a9b1bb' }}>2. список</code></div>
                  <div style={{ marginLeft: '20px', marginBottom: '8px' }}>→</div>
                  <ol style={{ marginLeft: '20px', marginBottom: '0' }}>
                    <li style={{ marginBottom: '2px' }}>нумерованный</li>
                    <li>список</li>
                  </ol>
                </div>
              </div>

              <h4 style={{ color: '#58a6ff', marginTop: '20px', marginBottom: '10px' }}>Цитаты</h4>
              <div style={{ backgroundColor: '#0d1117', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <div style={{ marginBottom: '8px' }}><code style={{ color: '#a9b1bb' }}>{'>'} Это цитата</code></div>
                <div style={{ marginLeft: '20px' }}>→</div>
                <blockquote style={{ borderLeft: '4px solid #58a6ff', paddingLeft: '12px', marginBottom: '0', color: '#a9b1bb' }}>
                  Это цитата
                </blockquote>
              </div>

              <h4 style={{ color: '#58a6ff', marginTop: '20px', marginBottom: '10px' }}>Ссылки и изображения</h4>
              <div style={{ backgroundColor: '#0d1117', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <div style={{ marginBottom: '8px' }}><code style={{ color: '#a9b1bb' }}>[текст ссылки](url)</code> → <a href="#" style={{ color: '#58a6ff' }}>текст ссылки</a></div>
                <div><code style={{ color: '#a9b1bb' }}>![alt текст](url изображения)</code> → изображение</div>
              </div>

              <h4 style={{ color: '#58a6ff', marginTop: '20px', marginBottom: '10px' }}>Таблицы</h4>
              <div style={{ backgroundColor: '#0d1117', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <div style={{ marginBottom: '8px', fontSize: '12px', color: '#a9b1bb', fontFamily: 'monospace' }}>
                  | Заголовок 1 | Заголовок 2 |<br/>
                  |------------|-----------|<br/>
                  | Ячейка 1   | Ячейка 2   |<br/>
                  | Ячейка 3   | Ячейка 4   |
                </div>
                <div style={{ marginLeft: '20px', marginBottom: '8px' }}>→</div>
                <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '0' }}>
                  <thead>
                    <tr>
                      <th style={{ border: '1px solid #243049', padding: '6px', backgroundColor: '#161b22', textAlign: 'left' }}>Заголовок 1</th>
                      <th style={{ border: '1px solid #243049', padding: '6px', backgroundColor: '#161b22', textAlign: 'left' }}>Заголовок 2</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #243049', padding: '6px' }}>Ячейка 1</td>
                      <td style={{ border: '1px solid #243049', padding: '6px' }}>Ячейка 2</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #243049', padding: '6px' }}>Ячейка 3</td>
                      <td style={{ border: '1px solid #243049', padding: '6px' }}>Ячейка 4</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <h3>Создать урок</h3>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select 
          className="select" 
          value={form.language} 
          onChange={e => setForm({ ...form, language: e.target.value })}
          style={{ flex: '1 1 150px', minWidth: '140px' }}
        >
          {languages.map(lang => (
            <option key={lang.id} value={lang.id}>{lang.name}</option>
          ))}
        </select>
        <input 
          className="input" 
          value={form.title} 
          onChange={e => setForm({ ...form, title: e.target.value })} 
          placeholder="Название урока" 
          style={{ flex: '2 1 250px', minWidth: '200px' }}
        />
        <button className="btn" onClick={create} style={{ flexShrink: 0 }}>Создать</button>
      </div>

      <h3 style={{ marginTop: 16 }}>Список уроков ({form.language})</h3>
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
              }}>Название</th>
              <th style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '600',
                textAlign: 'left'
              }}>Заданий</th>
              <th style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '600',
                textAlign: 'left'
              }}>Доп. информация</th>
              <th style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '600',
                textAlign: 'left'
              }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {lessons.filter(l => l.language === form.language).map(l => (
            <tr key={l.id} style={{
              borderBottom: '1px solid #243049',
              backgroundColor: selectedLessonId === l.id ? '#243049' : 'transparent'
            }}>
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px'
              }}>
                {editingLessonId === l.id ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      className="input"
                      value={editingLessonTitle}
                      onChange={(e) => setEditingLessonTitle(e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '14px' }}
                    />
                    <button
                      className="btn small"
                      onClick={() => saveTitle(l.id)}
                      style={{ backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      ✓
                    </button>
                    <button
                      className="btn small"
                      onClick={cancelTitleEdit}
                      style={{ backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{l.title}</span>
                    <button
                      className="btn small"
                      onClick={() => startEditTitle(l)}
                      style={{ backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                      title="Изменить название"
                    >
                      ✏️
                    </button>
                  </div>
                )}
              </td>
              <td style={{
                padding: '12px 16px'
              }}>
                <button
                  className="btn small"
                  onClick={() => onSelectLesson && onSelectLesson(l.id)}
                  style={{
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {taskCounts[l.id] ?? 0}
                </button>
              </td>
              <td style={{
                padding: '12px 16px'
              }}>
                <button
                  className="btn small"
                  onClick={() => startEditAdditionalInfo(l.id)}
                  style={{
                    backgroundColor: '#17a2b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                  title="Дополнительная информация"
                >
                  📝
                </button>
              </td>
              <td style={{
                padding: '12px 16px'
              }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    className="btn small"
                    onClick={() => moveLesson(l.id, 'up')}
                    style={{
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                    title="Переместить вверх"
                  >
                    ↑
                  </button>
                  <button
                    className="btn small"
                    onClick={() => moveLesson(l.id, 'down')}
                    style={{
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                    title="Переместить вниз"
                  >
                    ↓
                  </button>
                  <button
                    className="btn small"
                    onClick={() => remove(l.id)}
                    style={{
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                    title="Удалить урок"
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
            ))}
          </tbody>
        </table>

      {/* Additional Information Editor */}
      {editingAdditionalInfoLessonId && (
        <div style={{ marginTop: '20px', padding: '16px', border: '1px solid #243049', borderRadius: '8px', backgroundColor: '#111a2b', width: '80vw', maxWidth: '1200px', marginLeft: 'auto', marginRight: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0 }}>Редактирование дополнительной информации</h4>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowMarkdownHelp(true)}
                style={{
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
                title="Показать справку по Markdown"
              >
                ❓ Markdown
              </button>
              <button
                type="button"
                onClick={() => setShowAdditionalInfoPreview(!showAdditionalInfoPreview)}
                style={{
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                {showAdditionalInfoPreview ? '✏️ Редактировать' : '👁️ Preview'}
              </button>
            </div>
          </div>
          {showAdditionalInfoPreview ? (
            <div style={{
              border: '1px solid #243049',
              borderRadius: '6px',
              padding: '12px',
              backgroundColor: '#0d1117',
              minHeight: '400px',
              marginBottom: '12px'
            }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 style={{ color: '#58a6ff', marginTop: '0', marginBottom: '10px', fontSize: '1.3em' }}>{children}</h1>,
                  h2: ({ children }) => <h2 style={{ color: '#58a6ff', marginTop: '16px', marginBottom: '8px', fontSize: '1.1em' }}>{children}</h2>,
                  h3: ({ children }) => <h3 style={{ color: '#58a6ff', marginTop: '14px', marginBottom: '6px', fontSize: '1em' }}>{children}</h3>,
                  p: ({ children }) => <p style={{ marginBottom: '8px' }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ marginLeft: '16px', marginBottom: '8px' }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ marginLeft: '16px', marginBottom: '8px' }}>{children}</ol>,
                  li: ({ children }) => <li style={{ marginBottom: '2px' }}>{children}</li>,
                  code: ({ children }) => <code style={{ backgroundColor: '#161b22', padding: '2px 4px', borderRadius: '3px', fontFamily: 'monospace' }}>{children}</code>,
                  pre: ({ children }) => <pre style={{ backgroundColor: '#161b22', padding: '8px', borderRadius: '4px', overflow: 'auto', marginBottom: '8px' }}>{children}</pre>,
                  blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid #58a6ff', paddingLeft: '8px', marginBottom: '8px', color: '#a9b1bb' }}>{children}</blockquote>,
                  strong: ({ children }) => <strong style={{ color: '#f85149' }}>{children}</strong>,
                  em: ({ children }) => <em style={{ color: '#d29922' }}>{children}</em>,
                  table: ({ children }) => <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '8px' }}>{children}</table>,
                  th: ({ children }) => <th style={{ border: '1px solid #243049', padding: '6px', backgroundColor: '#161b22', textAlign: 'left' }}>{children}</th>,
                  td: ({ children }) => <td style={{ border: '1px solid #243049', padding: '6px' }}>{children}</td>,
                  tr: ({ children }) => <tr>{children}</tr>,
                }}
              >
                {additionalInfo || '*Дополнительная информация не добавлена*'}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              className="input"
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              placeholder="япи"
              rows={textareaRows}
              style={{ width: '100%', minWidth: '100%', maxWidth: '100%', resize: 'vertical', marginBottom: '12px', minHeight: '400px' }}
            />
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn"
              onClick={saveAdditionalInfo}
              style={{ backgroundColor: '#28a745' }}
            >
              Сохранить
            </button>
            <button
              className="btn"
              onClick={cancelEdit}
              style={{ backgroundColor: '#6c757d' }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


