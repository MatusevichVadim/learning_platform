import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { authHeaders } from '../../api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Task = { id: number; lesson_id: number; title: string; description: string; kind: string; test_spec?: string; order_index?: number; rating?: number }
type Lesson = { id: number; language: string; title: string; order_index: number }
type Test = { input: string; output: string }

type Language = { id: string; name: string; is_custom: boolean }

export default function TasksTab({ view, initialSelectedLessonId }: { view: 'add' | 'update'; initialSelectedLessonId?: number | null }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [filterLang, setFilterLang] = useState<string>(() => localStorage.getItem('admin_lang') || 'python')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState<Task>({ id: 0, lesson_id: 1, title: '', description: '', kind: localStorage.getItem('last_task_kind') || 'quiz', test_spec: '', rating: 1 })
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null)
  const [quizOptions, setQuizOptions] = useState<Array<{ text: string; correct: boolean }>>([])
  const [showSuccess, setShowSuccess] = useState(false)
  const [selectedLessonForFilter, setSelectedLessonForFilter] = useState<number | null>(null)

  // New state for tabs and code tests
  const [activeTab, setActiveTab] = useState<'tests' | 'langs' | 'editor'>('tests')
  const [codeTests, setCodeTests] = useState<Test[]>([{ input: '', output: '' }])
  const [numExamples, setNumExamples] = useState(1)
  const [allowCustomRun, setAllowCustomRun] = useState(true)
  const [runAllTests, setRunAllTests] = useState(false)

  // State for description preview
  const [showDescriptionPreview, setShowDescriptionPreview] = useState(false)
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false)

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    if (initialSelectedLessonId) {
      setSelectedLessonId(initialSelectedLessonId)
      setSelectedLessonForFilter(initialSelectedLessonId)
    }
  }, [initialSelectedLessonId])

  async function refresh() {
    // Persist any pending in-memory reordering before pulling server truth,
    // otherwise the new order would be immediately overwritten and lost.
    if (pendingOrderRef.current) {
      await flushReorder()
    }
    const res = await axios.get('/api/admin/tasks', { headers: authHeaders() })
    setTasks(res.data)
    const ls = await axios.get('/api/admin/lessons', { headers: authHeaders() })
    setLessons(ls.data)
    const langs = await axios.get('/api/admin/languages', { headers: authHeaders() })
    setLanguages(langs.data)
  }

  // Flush any pending reorder when the component unmounts so the final order
  // is never lost (e.g. navigating away or switching languages mid-drag).
  useEffect(() => {
    return () => {
      if (reorderTimerRef.current) {
        clearTimeout(reorderTimerRef.current)
        reorderTimerRef.current = null
      }
      if (pendingOrderRef.current) {
        const pending = pendingOrderRef.current
        pendingOrderRef.current = null
        axios.post(
          '/api/admin/tasks/reorder',
          pending.map(t => ({ id: t.id, order_index: t.order_index })),
          { headers: authHeaders() }
        ).catch(() => {})
      }
    }
  }, [])

  useEffect(() => {
    if (view === 'add') {
      setSelectedId(null)
      setForm({ id: 0, lesson_id: selectedLessonId || 1, title: '', description: '', kind: localStorage.getItem('last_task_kind') || 'quiz', test_spec: '' })
      setQuizOptions([])
      setActiveTab('tests')
      setCodeTests([{ input: '', output: '' }])
      setNumExamples(1)
      setAllowCustomRun(true)
      setRunAllTests(false)
    }
  }, [view, selectedLessonId])

  // When language filter changes, preselect first lesson of that language or last selected
  useEffect(() => {
    const list = lessons.filter(l => (filterLang ? l.language === filterLang : true))
    if (list.length) {
      const saved = localStorage.getItem('last_selected_lesson_id')
      const savedId = saved ? Number(saved) : null
      const savedLesson = savedId ? list.find(l => l.id === savedId) : null
      setSelectedLessonId(savedLesson ? savedId : list[0].id)
    } else {
      setSelectedLessonId(null)
    }
  }, [filterLang, lessons])

  async function onSelect(id: number) {
    setSelectedId(id)
    const res = await axios.get(`/api/admin/tasks/${id}`, { headers: authHeaders() })
    const t: Task = res.data
    setForm({ id: t.id, lesson_id: t.lesson_id, title: t.title, description: t.description, kind: t.kind, test_spec: t.test_spec, rating: t.rating ?? 1 })
    setSelectedLessonId(t.lesson_id)
    setSelectedLessonForFilter(t.lesson_id)
    // parse quiz options if present
    try {
      if (t.kind === 'quiz' && t.test_spec) {
        const spec = JSON.parse(t.test_spec)
        const opts: string[] = spec.options || []
        const correctLetters: string[] = Array.isArray(spec.correct) ? spec.correct : (spec.correct ? [spec.correct] : [])
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        setQuizOptions(opts.map((o, i) => ({ text: o, correct: correctLetters.includes(letters[i]) })))
      } else if (t.kind === 'code' && t.test_spec) {
        const spec = JSON.parse(t.test_spec)
        setCodeTests(spec.tests?.map((test: any) => ({ input: test[0], output: test[1] })) || [{ input: '', output: '' }])
        setNumExamples(spec.numExamples || 1)
        setAllowCustomRun(spec.allowCustomRun ?? true)
        setRunAllTests(spec.runAllTests ?? false)
      } else {
        setQuizOptions([])
        setCodeTests([{ input: '', output: '' }])
        setNumExamples(1)
        setAllowCustomRun(true)
        setRunAllTests(false)
      }
    } catch {
      setQuizOptions([])
      setCodeTests([{ input: '', output: '' }])
      setNumExamples(1)
      setAllowCustomRun(true)
      setRunAllTests(false)
    }
  }

  async function createTask() {
    if (!selectedLessonId) {
      alert('Выберите язык и урок')
      return
    }
    let testSpec: any
    if (form.kind === 'quiz') {
      const options = quizOptions.map(o => o.text).filter(Boolean)
      const correctIndices = quizOptions.map((o, i) => o.correct ? i : -1).filter(i => i >= 0)
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      const correctLetters = correctIndices.map(i => letters[i])
      testSpec = { correct: correctLetters, options }
    } else if (form.kind === 'code') {
      testSpec = {
        tests: codeTests.map(t => [t.input, t.output]),
        numExamples,
        allowCustomRun,
        runAllTests
      }
    } else {
      testSpec = form.test_spec ? maybeParse(form.test_spec) : undefined
    }
    const payload: any = { lesson_id: selectedLessonId, language: filterLang || 'python', title: form.title, description: form.description, kind: form.kind, test_spec: testSpec, rating: Number(form.rating) || 1 }
    await axios.post(`/api/admin/tasks`, payload, { headers: authHeaders() })
    localStorage.setItem('last_selected_lesson_id', selectedLessonId.toString())
    localStorage.setItem('last_task_kind', form.kind)
    await refresh()
    // Clear form
    setForm({ id: 0, lesson_id: selectedLessonId, title: '', description: '', kind: form.kind, test_spec: '' })
    setQuizOptions([])
    setActiveTab('tests')
    setCodeTests([{ input: '', output: '' }])
    setNumExamples(1)
    setAllowCustomRun(true)
    setRunAllTests(false)
  }

  async function updateTask() {
    if (form.kind === 'quiz') {
      const options = quizOptions.map(o => o.text).filter(Boolean)
      const correctIndices = quizOptions.map((o, i) => o.correct ? i : -1).filter(i => i >= 0)
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      const correctLetters = correctIndices.map(i => letters[i])
      const testSpec = { correct: correctLetters, options }
      form.test_spec = JSON.stringify(testSpec)
    } else if (form.kind === 'code') {
      const testSpec = {
        tests: codeTests.map(t => [t.input, t.output]),
        numExamples,
        allowCustomRun,
        runAllTests
      }
      form.test_spec = JSON.stringify(testSpec)
    }
    await axios.put(`/api/admin/tasks/${form.id}`, form, { headers: authHeaders() })
    await refresh()
    if (selectedId) onSelect(selectedId)
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 2000)
  }

  async function deleteTask() {
    if (!selectedId) return
    if (!confirm('Вы уверены, что хотите удалить это задание?')) return
    try {
      await axios.delete(`/api/admin/tasks/${selectedId}`, { headers: authHeaders() })
      await refresh()
      setSelectedId(null)
      setForm({ id: 0, lesson_id: selectedLessonId || 1, title: '', description: '', kind: localStorage.getItem('last_task_kind') || 'quiz', test_spec: '' })
      setQuizOptions([])
      setCodeTests([{ input: '', output: '' }])
      setNumExamples(1)
      setAllowCustomRun(true)
      setRunAllTests(false)
    } catch (error) {
      console.error('Failed to delete task:', error)
      alert('Ошибка при удалении задания')
    }
  }

  // --- Optimistic, single-request reordering (drag-and-drop + arrows) ---
  // We never issue one request per swap. Instead we keep an in-memory
  // "desired order" and flush it as a single /tasks/reorder request,
  // debounced so rapid successive moves collapse into one request.
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingOrderRef = useRef<Task[] | null>(null)

  function scheduleFlush() {
    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current)
    reorderTimerRef.current = setTimeout(flushReorder, 400)
  }

  async function flushReorder() {
    const pending = pendingOrderRef.current
    reorderTimerRef.current = null
    if (!pending) return
    pendingOrderRef.current = null
    try {
      await axios.post(
        '/api/admin/tasks/reorder',
        pending.map(t => ({ id: t.id, order_index: t.order_index })),
        { headers: authHeaders() }
      )
    } catch (error) {
      console.error('Failed to persist task order:', error)
      // Roll back to server truth on failure.
      pendingOrderRef.current = null
      await refresh()
      if (selectedId) onSelect(selectedId)
      alert('Ошибка при сохранении порядка заданий')
    }
  }

  // Apply a new ordering to the visible task list optimistically and
  // remember it for the next flush. `order` is the full ordered list of
  // tasks that belong to the currently selected lesson.
  function applyReorder(order: Task[]) {
    setTasks(order)
    pendingOrderRef.current = order
    scheduleFlush()
  }

  // Move a single task one step left/right within its lesson, optimistically.
  function moveTask(id: number, direction: 'left' | 'right') {
    const lessonId = selectedLessonForFilter
    if (!lessonId) return
    const list = tasks
      .filter(t => t.lesson_id === lessonId)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    const idx = list.findIndex(t => t.id === id)
    if (idx < 0) return
    const newIdx = direction === 'left' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= list.length) return
    const next = list.slice()
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    // Reassign contiguous order_index values so the DB stays gap-free.
    next.forEach((t, i) => (t.order_index = i + 1))
    applyReorder(next)
  }

  // --- Native HTML5 drag-and-drop state ---
  const [dragId, setDragId] = useState<number | null>(null)
  // Which card the pointer is currently over, and whether the drop would place
  // the dragged card *above* or *below* it. Together they render a green
  // "insertion stick" that shows exactly where the task will land.
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const [dropSide, setDropSide] = useState<'before' | 'after' | null>(null)

  // Find the task card nearest to a given (clientX, clientY) coordinate. This
  // lets the user drop the dragged card anywhere inside the list — including
  // the gaps between cards — not only exactly on top of another card.
  //
  // The match is computed in 2D so cards on different rows are not confused:
  // a card that fully contains the cursor (both X and Y) always wins; only
  // among cards that do not contain the cursor do we fall back to the
  // closest 2D distance to the card's bounding box.
  function findCardAt(clientX: number, clientY: number): number | null {
    let bestId: number | null = null
    let bestDist = Infinity
    let bestContains = false
    document.querySelectorAll('[data-task-id]').forEach(el => {
      const id = Number((el as HTMLElement).dataset.taskId)
      const r = el.getBoundingClientRect()
      const insideX = clientX >= r.left && clientX <= r.right
      const insideY = clientY >= r.top && clientY <= r.bottom
      const contains = insideX && insideY
      // 2D distance from the cursor to the card's bounding box (0 if inside).
      const dx = insideX ? 0 : (clientX < r.left ? r.left - clientX : clientX - r.right)
      const dy = insideY ? 0 : (clientY < r.top ? r.top - clientY : clientY - r.bottom)
      const dist = Math.hypot(dx, dy)
      if (contains && !bestContains) {
        bestContains = true
        bestDist = dist
        bestId = id
      } else if (contains && bestContains && dist < bestDist) {
        bestDist = dist
        bestId = id
      } else if (!contains && !bestContains && dist < bestDist) {
        bestDist = dist
        bestId = id
      }
    })
    return bestId
  }

  function onContainerDragOver(e: React.DragEvent) {
    e.preventDefault() // allow drop
    e.dataTransfer.dropEffect = 'move'
    if (dragId == null) return
    const id = findCardAt(e.clientX, e.clientY)
    if (id == null) {
      if (dragOverId !== null) setDragOverId(null)
      if (dropSide !== null) setDropSide(null)
      return
    }
    // Decide above/below based on whether the cursor is in the top or bottom
    // half of the target card — this is where the green stick will be drawn.
    const el = document.querySelector(`[data-task-id="${id}"]`) as HTMLElement | null
    let side: 'before' | 'after' = 'before'
    if (el) {
      const r = el.getBoundingClientRect()
      side = e.clientY < (r.top + r.bottom) / 2 ? 'before' : 'after'
    }
    if (dragOverId !== id || dropSide !== side) {
      setDragOverId(id)
      setDropSide(side)
    }
  }

  // Compute the horizontal gap (right margin) for a card so that, when the
  // green insertion stick appears on its edge, the neighbouring card is pulled
  // in by exactly the stick's width — no leftover gap is left behind.
  function stickMargin(idx: number, total: number): number {
    if (dragOverId == null || dropSide == null) return 4
    const list = tasks
      .filter(t => t.lesson_id === selectedLessonForFilter)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    const overIdx = list.findIndex(t => t.id === dragOverId)
    if (overIdx < 0) return 4
    const stick = 3 // width of the green border stick
    // Stick on the right edge of the target card: pull the next card left.
    if (idx === overIdx && dropSide === 'after') return 4 - stick
    // Stick on the left edge of the target card: pull this (next) card left.
    if (idx === overIdx + 1 && dropSide === 'before') return 4 - stick
    return 4
  }

  function onContainerDragLeave(e: React.DragEvent) {
    // Only clear the highlight when leaving the container entirely.
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOverId(null)
    setDropSide(null)
  }

  function onContainerDrop(e: React.DragEvent) {
    e.preventDefault()
    const sourceId = dragId
    setDragId(null)
    setDragOverId(null)
    setDropSide(null)
    if (sourceId == null) return
    const targetId = findCardAt(e.clientX, e.clientY)
    if (targetId == null) return

    const lessonId = selectedLessonForFilter
    if (!lessonId) return
    const list = tasks
      .filter(t => t.lesson_id === lessonId)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    const fromIdx = list.findIndex(t => t.id === sourceId)
    const toIdx = list.findIndex(t => t.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return
    if (fromIdx === toIdx) return

    // dropSide tells us whether the dragged card goes before or after the
    // target card. If the cursor is in the top half, insert before; otherwise
    // after. This keeps the green stick and the actual placement in sync.
    const el = document.querySelector(`[data-task-id="${targetId}"]`) as HTMLElement | null
    let side = dropSide
    if (!side && el) {
      const r = el.getBoundingClientRect()
      side = e.clientY < (r.top + r.bottom) / 2 ? 'before' : 'after'
    }
    const insertAt = side === 'before' ? toIdx : toIdx + 1
    if (insertAt === fromIdx || insertAt === fromIdx + 1) return

    const next = list.slice()
    const [moved] = next.splice(fromIdx, 1)
    next.splice(insertAt, 0, moved)
    next.forEach((t, i) => (t.order_index = i + 1))
    applyReorder(next)
  }

  function onContainerDragEnd() {
    setDragId(null)
    setDragOverId(null)
    setDropSide(null)
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

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>Выбрать язык</label>
        <div className="tabs" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {languages.map(lang => (
            <button
              key={lang.id}
              className="tab"
              onClick={() => { 
                const v = lang.id; 
                setFilterLang(v); 
                setSelectedLessonForFilter(null); 
                setSelectedId(null);
                setQuizOptions([]);
                setCodeTests([{ input: '', output: '' }]);
                setForm({ id: 0, lesson_id: 1, title: '', description: '', kind: 'quiz', test_spec: '' });
                localStorage.setItem('admin_lang', v); 
              }}
              style={{
                backgroundColor: filterLang === lang.id ? '#3dd179' : '#101a2a',
                color: filterLang === lang.id ? '#092013' : '#e6edf3',
                fontWeight: filterLang === lang.id ? 'bold' : 'normal'
              }}
            >
              {lang.name}
            </button>
          ))}
        </div>
      </div>
      {showSuccess && (
        <div style={{ position: 'fixed', top: 10, right: 10, backgroundColor: '#4caf50', color: 'white', padding: '8px 16px', borderRadius: 4, zIndex: 1000 }}>
          Задание успешно обновлено
        </div>
      )}
      {view === 'update' && (
        <div style={{ marginBottom: 12 }}>
          {filterLang && (
            <>
              <label style={{ display: 'block', marginBottom: 8 }}>Выбрать урок</label>
              <div className="tabs" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
                {lessons
                  .filter(l => filterLang ? l.language === filterLang : true)
                  .sort((a, b) => a.order_index - b.order_index)
                  .map(l => (
                    <button
                      key={l.id}
                      className="tab"
                      onClick={() => { setSelectedLessonForFilter(l.id); setSelectedId(null); }}
                      style={{
                        backgroundColor: selectedLessonForFilter === l.id ? '#3dd179' : '#101a2a',
                        color: selectedLessonForFilter === l.id ? '#092013' : '#e6edf3',
                        fontWeight: selectedLessonForFilter === l.id ? 'bold' : 'normal'
                      }}
                    >
                      {l.title}
                    </button>
                  ))}
              </div>
            </>
          )}
          {selectedLessonForFilter && (
            <>
              <label style={{ display: 'block', marginBottom: 8 }}>Выбрать задание</label>
              <div className="tabs" onDragOver={onContainerDragOver} onDragLeave={onContainerDragLeave} onDrop={onContainerDrop} onDragEnd={onContainerDragEnd} style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                {tasks
                  .filter(t => !selectedLessonForFilter || t .lesson_id === selectedLessonForFilter)
                  .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                  .map((t, idx, arr) => (
                    <div
                      key={t.id}
                      data-task-id={t.id}
                      draggable
                      onDragStart={e => {
                        setDragId(t.id)
                        e.dataTransfer.effectAllowed = 'move'
                        try { e.dataTransfer.setData('text/plain', String(t.id)) } catch {}
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        marginRight: stickMargin(idx, arr.length),
                        marginBottom: 4,
                        opacity: dragId === t.id ? 0.4 : 1,
                        // Green "insertion stick" — a vertical line on the edge where
                        // the dragged card would land (above or below this card).
                        borderLeft: dragOverId === t.id && dropSide === 'before' ? '3px solid #3dd179' : 'none',
                        borderRight: dragOverId === t.id && dropSide === 'after' ? '3px solid #3dd179' : 'none',
                        cursor: dragId ? 'grabbing' : 'grab'
                      }}
                    >
                      <button
                        className="tab"
                        onClick={() => onSelect(t.id)}
                        style={{
                          backgroundColor: selectedId === t.id ? '#3dd179' : '#101a2a',
                          color: selectedId === t.id ? '#092013' : '#e6edf3',
                          fontWeight: selectedId === t.id ? 'bold' : 'normal'
                        }}
                      >
                        {t.title}
                      </button>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '100%' }}>
        {view === 'add' && (
          <>
            {filterLang && (
              <div className="form-row" style={{ justifyContent: 'flex-start' }}>
              <label style={{ display: 'block', marginBottom: 8 }}>К какому уроку</label>
              <div className="tabs" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
                {lessons
                  .filter(l => filterLang ? l.language === filterLang : true)
                  .sort((a, b) => a.order_index - b.order_index)
                  .map(l => (
                    <button
                      key={l.id}
                      className="tab"
                      onClick={() => { setSelectedLessonId(l.id); localStorage.setItem('last_selected_lesson_id', l.id.toString()); }}
                      style={{
                        backgroundColor: selectedLessonId === l.id ? '#3dd179' : '#101a2a',
                        color: selectedLessonId === l.id ? '#092013' : '#e6edf3',
                        fontWeight: selectedLessonId === l.id ? 'bold' : 'normal'
                      }}
                    >
                      {l.title}
                    </button>
                  ))}
              </div>
            </div>
            )}
          </>
        )}
        {view !== 'add' && selectedId ? (
          <>
            <div className="form-row full-row">
              <label>Тип</label>
              <select className="select" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                <option value="quiz">quiz</option>
                <option value="code">code</option>
              </select>
            </div>
            <div className="form-row full-row">
              <label>Заголовок</label>
              <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="form-row full-row">
              <label>Рейтинг задания (1–5)</label>
              <select className="select" value={Number(form.rating) || 1} onChange={e => setForm({ ...form, rating: Number(e.target.value) })}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>
            </div>
            <div className="form-row full-row">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Описание
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowMarkdownHelp(true)}
                    style={{
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                    title="Показать справку по Markdown"
                  >
                    ❓ Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDescriptionPreview(!showDescriptionPreview)}
                    style={{
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {showDescriptionPreview ? '✏️ Редактировать' : '👁️ Preview'}
                  </button>
                </div>
              </label>
              {showDescriptionPreview ? (
                <div style={{
                  border: '1px solid #243049',
                  borderRadius: '6px',
                  padding: '12px',
                  backgroundColor: '#0d1117',
                  minHeight: '120px'
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
                    {form.description || '*Описание не добавлено*'}
                  </ReactMarkdown>
                </div>
              ) : (
                <textarea className="textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              )}
            </div>
          </>
        ) : (view === 'add' && selectedLessonId) ? (
          <>
            <div className="form-row full-row">
              <label>Тип</label>
              <select className="select" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                <option value="quiz">quiz</option>
                <option value="code">code</option>
              </select>
            </div>
            <div className="form-row full-row">
              <label>Заголовок</label>
              <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="form-row full-row">
              <label>Рейтинг задания (1–5)</label>
              <select className="select" value={Number(form.rating) || 1} onChange={e => setForm({ ...form, rating: Number(e.target.value) })}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>
            </div>
            <div className="form-row full-row">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Описание
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowMarkdownHelp(true)}
                    style={{
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                    title="Показать справку по Markdown"
                  >
                    ❓ Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDescriptionPreview(!showDescriptionPreview)}
                    style={{
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {showDescriptionPreview ? '✏️ Редактировать' : '👁️ Preview'}
                  </button>
                </div>
              </label>
              {showDescriptionPreview ? (
                <div style={{
                  border: '1px solid #243049',
                  borderRadius: '6px',
                  padding: '12px',
                  backgroundColor: '#0d1117',
                  minHeight: '120px'
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
                    {form.description || '*Описание не добавлено*'}
                  </ReactMarkdown>
                </div>
              ) : (
                <textarea className="textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              )}
            </div>
          </>
        ) : null}
        {(view === 'add' && selectedLessonId || selectedId) && form.kind === 'quiz' ? (
          <div className="full-row">
            <button className="btn" style={{ width: '100%', marginBottom: 8 }} onClick={() => setQuizOptions(q => [...q, { text: '', correct: q.length === 0 }])}>+ Добавить вариант</button>
            <div className="stack">
              {quizOptions.map((opt, idx) => (
                <div key={idx} className="row" style={{ alignItems: 'flex-start' }}>
                  <input className="input" value={opt.text} onChange={e => setQuizOptions(q => q.map((o, i) => i === idx ? { ...o, text: e.target.value } : o))} placeholder={`Вариант ${idx + 1}`} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={opt.correct} onChange={() => setQuizOptions(q => q.map((o, i) => i === idx ? { ...o, correct: !o.correct } : o))} /> Правильный
                  </label>
                </div>
              ))}
            </div>
          </div>
        ) : (view === 'add' && selectedLessonId || selectedId) && form.kind === 'code' ? (
          <div className="full-row">
            <div className="tabs" style={{ marginBottom: 12 }}>
              <button className={`tab ${activeTab === 'tests' ? 'active' : ''}`} onClick={() => setActiveTab('tests')}>Тестовые данные</button>
              {form.kind !== 'code' && (
                <>
                  <button className={`tab ${activeTab === 'langs' ? 'active' : ''}`} onClick={() => setActiveTab('langs')}>Языки и шаблоны</button>
                  <button className={`tab ${activeTab === 'editor' ? 'active' : ''}`} onClick={() => setActiveTab('editor')}>Расширенный редактор</button>
                </>
              )}
            </div>
            {activeTab === 'tests' && (
              <div>
                {codeTests.map((test, idx) => (
                  <div key={idx} style={{ marginBottom: 12 }}>
                    <label>Тест №{idx + 1} <button onClick={() => setCodeTests(tests => tests.filter((_, i) => i !== idx))} style={{ marginLeft: 8 }}>×</button></label>
                    <textarea
                      className="textarea"
                      placeholder="Ввод"
                      value={test.input}
                      onChange={e => setCodeTests(tests => tests.map((t, i) => i === idx ? { ...t, input: e.target.value } : t))}
                      rows={3}
                      style={{ width: '100%', marginBottom: 4 }}
                    />
                    <textarea
                      className="textarea"
                      placeholder="Вывод"
                      value={test.output}
                      onChange={e => setCodeTests(tests => tests.map((t, i) => i === idx ? { ...t, output: e.target.value } : t))}
                      rows={3}
                      style={{ width: '100%' }}
                    />
                  </div>
                ))}
                <button className="btn" onClick={() => setCodeTests(tests => [...tests, { input: '', output: '' }])}>+ Добавить тест</button>
                {/* <div style={{ marginTop: 12 }}>
                  <label>Число примеров тестов</label>
                  <input
                    type="number"
                    min={1}
                    value={numExamples}
                    onChange={e => setNumExamples(Math.max(1, Number(e.target.value)))}
                    style={{ width: 100 }}
                  />
                </div>
                <div style={{ marginTop: 12 }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={allowCustomRun}
                      onChange={e => setAllowCustomRun(e.target.checked)}
                    /> Учащийся может запустить решение на своих данных
                  </label>
                </div>
                <div>
                  <label>
                    <input
                      type="checkbox"
                      checked={runAllTests}
                      onChange={e => setRunAllTests(e.target.checked)}
                    /> Запускать решения на всех тестах
                  </label>
                </div> */}
              </div>
            )}
            {/* {activeTab === 'langs' && (
              <div>
                <p>Здесь можно настроить языки и шаблоны (заглушка)</p>
              </div>
            )}
            {activeTab === 'editor' && (
              <div>
                <p>Расширенный редактор (заглушка)</p>
              </div>
            )} */}
          </div>
        ) : (view === 'add' && selectedLessonId || selectedId) ? (
          <div className="form-row full-row">
            <label>test_spec</label>
            <textarea className="textarea" placeholder='{"function":"add","tests":[[1,2,3]]}' value={form.test_spec || ''} onChange={e => setForm({ ...form, test_spec: e.target.value })} />
          </div>
        ) : null}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        {view === 'add' && selectedLessonId ? (
          <button className="btn" onClick={createTask}>Создать</button>
        ) : selectedId ? (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn" onClick={updateTask}>Сохранить изменения</button>
            <button className="btn" onClick={deleteTask} style={{ backgroundColor: '#dc3545' }}>Удалить</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function maybeParse(s?: string) {
  if (!s) return undefined
  try { return JSON.parse(s) } catch { return s }
}


