import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  teacherGetClasses,
  teacherListStudents,
  teacherCreateStudent,
  teacherUpdateStudent,
  teacherResetStudentPassword,
  teacherGetStudentCard,
  teacherGetStudentLanguages,
  teacherSetStudentLanguages,
  teacherListLanguages,
  teacherListLessons,
  teacherGetLesson,
  teacherGetTask,
  teacherGetSubmissions,
  teacherReviewSubmission,
  logout,
} from '../api'
import CardChart from '../components/CardChart'
import LessonProgress from '../components/LessonProgress'
import { formatDateTime } from '../utils/date'

type Language = { id: string; name: string; image_url?: string }
type Lesson = { id: number; title: string; order_index: number }
type Student = { id: number; username: string; full_name?: string; user_class?: string; is_active: boolean; rating?: number; rating_bonus?: number }

const MIN_PASSWORD_LENGTH = 4

export default function TeacherDashboard() {
  const navigate = useNavigate()
  // Namespace the saved tab by user id so different users on the same
  // computer don't share the remembered active tab.
  const teacherUserId = (() => {
    try {
      const raw = localStorage.getItem('user')
      if (!raw) return 'guest'
      const parsed = JSON.parse(raw)
      return parsed?.id != null ? String(parsed.id) : 'guest'
    } catch {
      return 'guest'
    }
  })()
  const [activeTab, setActiveTab] = useState<'lessons' | 'results' | 'management'>(
    (typeof window !== 'undefined' && (localStorage.getItem(`teacherActiveTab_${teacherUserId}`) as any)) || 'lessons'
  )
  const [classes, setClasses] = useState<string[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // Lessons tab state
  const [languages, setLanguages] = useState<Language[]>([])
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])

  // Results tab state (submissions view)
  const [submissionsData, setSubmissionsData] = useState<any>(null)
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissionsPage, setSubmissionsPage] = useState(1)
  const [submissionsPageSize, setSubmissionsPageSize] = useState(50)
  const [submissionsClassFilter, setSubmissionsClassFilter] = useState('')
  const [submissionsStudentFilter, setSubmissionsStudentFilter] = useState('')
  const [submissionsLessonFilter, setSubmissionsLessonFilter] = useState('')
  const [submissionsTaskFilter, setSubmissionsTaskFilter] = useState('')
  const [submissionsStatusFilter, setSubmissionsStatusFilter] = useState('')
  const [submissionsSearchQuery, setSubmissionsSearchQuery] = useState('')
  const [submissionsSortBy, setSubmissionsSortBy] = useState('created_at')
  const [submissionsOrder, setSubmissionsOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null)
  const [submissionComment, setSubmissionComment] = useState('')
  const [submissionTaskDescription, setSubmissionTaskDescription] = useState('')
  const [submissionTaskKind, setSubmissionTaskKind] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  // Client-side filtering state (mirrors admin SubmissionsTab approach)
  const [filteredSubmissions, setFilteredSubmissions] = useState<any[]>([])
  const [filteredPage, setFilteredPage] = useState(1)
  const [isFilteredMode, setIsFilteredMode] = useState(false)

  // Management tab state
  const [mgmtSearch, setMgmtSearch] = useState('')
  const [mgmtSortBy, setMgmtSortBy] = useState('username')
  const [mgmtOrder, setMgmtOrder] = useState<'asc' | 'desc'>('asc')
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [newStudentForm, setNewStudentForm] = useState({ username: '', password: '', full_name: '', user_class: '' })
  const [cardData, setCardData] = useState<any>(null)
  const [cardLoading, setCardLoading] = useState(false)
  const [cardError, setCardError] = useState('')
  const [cardStudent, setCardStudent] = useState<Student | null>(null)
  const [showCard, setShowCard] = useState(false)
  const [cardSearch, setCardSearch] = useState('')
  const [cardSortBy, setCardSortBy] = useState('created_at')
  const [cardOrder, setCardOrder] = useState<'asc' | 'desc'>('desc')
  const [editStudent, setEditStudent] = useState<Student | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '', password: '' })
  const [resetPasswordId, setResetPasswordId] = useState<number | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [languageModalStudent, setLanguageModalStudent] = useState<Student | null>(null)
  const [selectedStudentLanguageIds, setSelectedStudentLanguageIds] = useState<string[]>([])
  const [languageSaveLoading, setLanguageSaveLoading] = useState(false)

  useEffect(() => {
    loadClasses()
  }, [])

  async function loadClasses() {
    try {
      const data = await teacherGetClasses()
      setClasses(data)
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка загрузки классов')
    }
  }

  async function loadStudents() {
    try {
      const data = await teacherListStudents({ search: mgmtSearch, sort_by: mgmtSortBy, order: mgmtOrder })
      setStudents(data)
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка загрузки учеников')
    }
  }

  async function loadSubmissions() {
    setSubmissionsLoading(true)
    try {
      const data = await teacherGetSubmissions({
        class_filter: submissionsClassFilter,
        student_filter: submissionsStudentFilter,
        lesson_filter: submissionsLessonFilter,
        task_filter: submissionsTaskFilter,
        status_filter: submissionsStatusFilter,
        page: submissionsPage,
        page_size: submissionsPageSize,
        sort_by: submissionsSortBy,
        order: submissionsOrder,
      })
      setSubmissionsData(data)
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка загрузки решений')
    } finally {
      setSubmissionsLoading(false)
    }
  }

  // When any filter is active, fetch all data at once and filter client-side
  // (mirrors the admin SubmissionsTab approach for consistent UX)
  async function loadFilteredSubmissions() {
    setSubmissionsLoading(true)
    try {
      const data = await teacherGetSubmissions({
        class_filter: submissionsClassFilter,
        student_filter: submissionsStudentFilter,
        lesson_filter: submissionsLessonFilter,
        task_filter: submissionsTaskFilter,
        status_filter: submissionsStatusFilter,
        page: 1,
        page_size: 100000,
        sort_by: submissionsSortBy,
        order: submissionsOrder,
      })
      const allData = data.data
      const filtered = allData.filter(s => {
        if (submissionsStatusFilter && s.status !== submissionsStatusFilter) return false
        if (submissionsClassFilter && s.user_class !== submissionsClassFilter) return false
        if (submissionsLessonFilter && s.lesson_title !== submissionsLessonFilter) return false
        if (submissionsTaskFilter && s.task_title !== submissionsTaskFilter) return false
        if (submissionsStudentFilter && !(s.username?.toLowerCase().includes(submissionsStudentFilter.toLowerCase()) || s.full_name?.toLowerCase().includes(submissionsStudentFilter.toLowerCase()))) return false
        if (submissionsSearchQuery.trim()) {
          const q = submissionsSearchQuery.trim().toLowerCase()
          if (s.username?.toLowerCase().includes(q)) return true
          if (s.full_name?.toLowerCase().includes(q)) return true
          if (String(s.id).includes(q)) return true
          return false
        }
        return true
      })
      setFilteredSubmissions(filtered)
      setIsFilteredMode(true)
      setFilteredPage(1)
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка загрузки решений')
    } finally {
      setSubmissionsLoading(false)
    }
  }

  async function loadLanguages() {
    try {
      const data = await teacherListLanguages()
      setLanguages(data)
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка загрузки языков')
    }
  }

  async function loadLessons(lang: string) {
    try {
      const data = await teacherListLessons(lang)
      setLessons(data)
      setSelectedLanguage(lang)
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка загрузки уроков')
    }
  }

  function openLessonDetail(lesson: Lesson) {
    // Navigate to the same LessonDetail page that regular users use,
    // so the teacher can view and complete tasks with the same interface
    navigate(`/lesson/${selectedLanguage}/${lesson.id}`)
  }

  // Persist the active tab across page reloads (namespaced per user)
  useEffect(() => {
    try {
      localStorage.setItem(`teacherActiveTab_${teacherUserId}`, activeTab)
    } catch (e) {
      // ignore storage errors
    }
  }, [activeTab])

  // Load data when tabs are activated
  useEffect(() => {
    if (activeTab === 'lessons' && languages.length === 0) {
      loadLanguages()
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'management') {
      loadStudents()
      if (languages.length === 0) {
        loadLanguages()
      }
    }
  }, [activeTab, mgmtSearch, mgmtSortBy, mgmtOrder])

  // When any filter changes, load all data and filter client-side
  useEffect(() => {
    if (activeTab !== 'results') return
    const hasFilters = submissionsClassFilter || submissionsStudentFilter || submissionsLessonFilter || submissionsTaskFilter || submissionsStatusFilter || submissionsSearchQuery
    if (hasFilters) {
      loadFilteredSubmissions()
    } else {
      setIsFilteredMode(false)
      loadSubmissions()
    }
  }, [activeTab, submissionsClassFilter, submissionsStudentFilter, submissionsLessonFilter, submissionsTaskFilter, submissionsStatusFilter, submissionsSearchQuery, submissionsSortBy, submissionsOrder])

  // Server-side pagination when not in filtered mode
  useEffect(() => {
    if (activeTab === 'results' && !isFilteredMode) {
      loadSubmissions()
    }
  }, [activeTab, submissionsPage, isFilteredMode])

  // Debounced search for management tab
  useEffect(() => {
    if (activeTab !== 'management') return
    const t = setTimeout(() => { loadStudents() }, 300)
    return () => clearTimeout(t)
  }, [mgmtSearch])

  // Debounced search for card
  useEffect(() => {
    if (!cardStudent) return
    const t = setTimeout(() => { reloadCard() }, 300)
    return () => clearTimeout(t)
  }, [cardSearch])

  async function openCard(student: Student) {
    setShowCard(true)
    setCardStudent(student)
    setCardData(null)
    setCardError('')
    setCardLoading(true)
    try {
      const data = await teacherGetStudentCard(student.id, { search: cardSearch, sort_by: cardSortBy, order: cardOrder })
      setCardData(data)
    } catch (err: any) {
      setCardError(err.response?.data?.detail || 'Ошибка загрузки карточки')
    } finally {
      setCardLoading(false)
    }
  }

  function closeCard() {
    setShowCard(false)
    setCardData(null)
    setCardStudent(null)
  }

  async function reloadCard(searchArg?: string, sortByArg?: string, orderArg?: 'asc' | 'desc') {
    const u = cardStudent
    if (!u) return
    const se = searchArg ?? cardSearch
    const sb = sortByArg ?? cardSortBy
    const or = orderArg ?? cardOrder
    setCardLoading(true)
    setCardError('')
    try {
      const data = await teacherGetStudentCard(u.id, { search: se, sort_by: sb, order: or })
      setCardData(data)
    } catch (err: any) {
      setCardError(err.response?.data?.detail || 'Ошибка загрузки карточки')
    } finally {
      setCardLoading(false)
    }
  }

  async function onViewSubmission(submission: any) {
    setSelectedSubmission(submission)
    setSubmissionComment('')
    setSubmissionTaskDescription('')
    setSubmissionTaskKind('')
    // Fetch task details
    try {
      const taskData = await teacherGetTask(submission.task_id)
      setSubmissionTaskDescription(taskData.description || 'Описание не найдено')
      if (taskData.kind) {
        setSubmissionTaskKind(taskData.kind)
      }
    } catch (error) {
      console.error('Failed to fetch task description:', error)
      setSubmissionTaskDescription(`Задание: ${submission.task_title}`)
    }
  }

  async function copyCodeToClipboard(code: string) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code)
      } else {
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

  async function handleReviewSubmission(isCorrect: boolean) {
    if (!selectedSubmission) return
    setReviewLoading(true)
    try {
      await teacherReviewSubmission(selectedSubmission.id, {
        is_correct: isCorrect,
        comment: submissionComment,
      })
      // Update the submission in the list (both server-side and client-side filtered data)
      setSubmissionsData((prev: any) => {
        if (!prev) return prev
        return {
          ...prev,
          data: prev.data.map((s: any) =>
            s.id === selectedSubmission.id
              ? { ...s, is_correct: isCorrect, status: 'completed' }
              : s
          ),
        }
      })
      if (isFilteredMode) {
        setFilteredSubmissions(prev => prev.map((s: any) =>
          s.id === selectedSubmission.id
            ? { ...s, is_correct: isCorrect, status: 'completed' }
            : s
        ))
      }
      setSelectedSubmission(null)
      setSubmissionComment('')
      setSubmissionTaskDescription('')
      setSubmissionTaskKind('')
      setMessage(isCorrect ? 'Решение отмечено как правильное' : 'Решение отмечено как неправильное')
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка при проверке решения')
    } finally {
      setReviewLoading(false)
    }
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!newStudentForm.username || !newStudentForm.password || !newStudentForm.user_class) return
    if (newStudentForm.password.length < MIN_PASSWORD_LENGTH) {
      setMessage('Пароль должен содержать не менее 4 символов')
      return
    }
    if (!classes.includes(newStudentForm.user_class)) {
      setMessage('Выберите класс из назначенных вам')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      await teacherCreateStudent({
        username: newStudentForm.username,
        password: newStudentForm.password,
        full_name: newStudentForm.full_name || undefined,
        user_class: newStudentForm.user_class,
      })
      setMessage('Ученик создан')
      setShowAddStudent(false)
      setNewStudentForm({ username: '', password: '', full_name: '', user_class: classes[0] || '' })
      loadStudents()
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка создания ученика')
    } finally {
      setLoading(false)
    }
  }

  async function handleEditStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!editStudent) return
    setLoading(true)
    setMessage('')
    try {
      await teacherUpdateStudent(editStudent.id, {
        full_name: editForm.full_name || undefined,
        password: editForm.password || undefined,
      })
      setMessage('Ученик обновлен')
      setEditStudent(null)
      setEditForm({ full_name: '', password: '' })
      loadStudents()
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка обновления')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword() {
    if (!resetPasswordId || newPassword.length < MIN_PASSWORD_LENGTH) return
    setLoading(true)
    try {
      await teacherResetStudentPassword(resetPasswordId, newPassword)
      setMessage('Пароль сброшен')
      setResetPasswordId(null)
      setNewPassword('')
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function openLanguageModal(student: Student) {
    setLanguageModalStudent(student)
    setSelectedStudentLanguageIds([])
    try {
      const data = await teacherGetStudentLanguages(student.id)
      setSelectedStudentLanguageIds(data.language_ids)
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка загрузки языков ученика')
    }
  }

  async function saveLanguageModal() {
    if (!languageModalStudent) return
    setLanguageSaveLoading(true)
    setMessage('')
    try {
      await teacherSetStudentLanguages(languageModalStudent.id, selectedStudentLanguageIds)
      setMessage('Языки ученика обновлены')
      setLanguageModalStudent(null)
      setSelectedStudentLanguageIds([])
      loadStudents()
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка сохранения языков')
    } finally {
      setLanguageSaveLoading(false)
    }
  }

  function handleLogout() {
    logout().finally(() => navigate('/'))
  }

  function renderLessonsTab() {
    if (selectedLanguage) {
      return (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <button className="btn" onClick={() => { setSelectedLanguage(null); setLessons([]) }} style={{ backgroundColor: '#6c757d' }}>
              ← Назад к языкам
            </button>
          </div>
          <div className="card">
            <h1 className="title" style={{ textAlign: 'left', marginBottom: 16 }}>{'Уроки: '}{languages.find(l => l.id === selectedLanguage)?.name || selectedLanguage}</h1>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
              {lessons.map((l, index) => (
                <div
                  key={l.id}
                  onClick={() => openLessonDetail(l)}
                  style={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #243049',
                    borderRadius: '12px',
                    padding: '20px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.borderColor = '#3dd179'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(61, 209, 121, 0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.borderColor = '#243049'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ fontSize: 20, color: '#3dd179', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Урок {index + 1}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: '#e6edf3' }}>
                    {l.title}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="card">
        <h1 className="title" style={{ textAlign: 'left', marginBottom: 16 }}>{'Выберите язык'}</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '30px', marginBottom: '24px' }}>
          {languages.map(l => (
            <div
              key={l.id}
              onClick={() => loadLessons(l.id)}
              style={{
                backgroundColor: '#1a1a2e',
                border: '1px solid #243049',
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                minHeight: '140px',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.borderColor = '#3dd179'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(61, 209, 121, 0.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.borderColor = '#243049'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {l.image_url ? (
                <img src={l.image_url} alt={l.name} style={{ width: '100px', height: '100px', objectFit: 'contain', borderRadius: '8px' }} />
              ) : (
                <div style={{ width: '100px', height: '100px', borderRadius: '8px', backgroundColor: '#243049', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', color: '#3dd179' }}>
                  {'</>'}
                </div>
              )}
              <span style={{ fontSize: '18px', fontWeight: '600', color: '#e6edf3', textAlign: 'center' }}>
                {l.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function renderResultsTab() {
    if (!submissionsData && !submissionsLoading) {
      return (
        <div className="card">
          <p style={{ color: '#a9b1bb' }}>{'Загрузка решений...'}</p>
        </div>
      )
    }

    if (submissionsLoading) {
      return (
        <div className="card">
          <p style={{ color: '#a9b1bb' }}>{'Загрузка...'}</p>
        </div>
      )
    }

    // Determine which data to display and paginate (mirrors admin SubmissionsTab)
    const serverData = submissionsData || { data: [], total: 0, page: 1, page_size: 50 }
    const displayData = isFilteredMode ? filteredSubmissions : serverData.data
    const displayTotal = isFilteredMode ? filteredSubmissions.length : serverData.total
    const displayPage = isFilteredMode ? filteredPage : serverData.page
    const displayPageSize = serverData.page_size

    // Unique values for filter dropdowns
    const uniqueClasses = [...new Set(displayData.map((s: any) => s.user_class).filter(Boolean))]
    const uniqueLessons = [...new Set(displayData.map((s: any) => s.lesson_title).filter(Boolean))]

    // Client-side pagination for filtered mode
    const paginatedData = isFilteredMode
      ? displayData.slice((displayPage - 1) * displayPageSize, displayPage * displayPageSize)
      : displayData

    return (
      <div>
        {/* Filter panel - matching admin SubmissionsTab */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#a9b1bb', fontSize: '13px', whiteSpace: 'nowrap' }}>Статус:</label>
            <select
              value={submissionsStatusFilter}
              onChange={e => { setSubmissionsStatusFilter(e.target.value); setSubmissionsPage(1); setFilteredPage(1) }}
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
              value={submissionsClassFilter}
              onChange={e => { setSubmissionsClassFilter(e.target.value); setSubmissionsPage(1); setFilteredPage(1) }}
              className="input"
              style={{ backgroundColor: '#151c2c', color: '#e6edf3', border: '1px solid #243049', borderRadius: 6, padding: '6px 10px', fontSize: '13px', minWidth: 120 }}
            >
              <option value="">Все классы</option>
              {uniqueClasses.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#a9b1bb', fontSize: '13px', whiteSpace: 'nowrap' }}>Урок:</label>
            <select
              value={submissionsLessonFilter}
              onChange={e => { setSubmissionsLessonFilter(e.target.value); setSubmissionsPage(1); setFilteredPage(1) }}
              className="input"
              style={{ backgroundColor: '#151c2c', color: '#e6edf3', border: '1px solid #243049', borderRadius: 6, padding: '6px 10px', fontSize: '13px', minWidth: 160 }}
            >
              <option value="">Все уроки</option>
              {uniqueLessons.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          {(submissionsStatusFilter || submissionsClassFilter || submissionsLessonFilter || submissionsStudentFilter || submissionsTaskFilter || submissionsSearchQuery) && (
            <button
              className="btn"
              onClick={() => {
                setSubmissionsStatusFilter('')
                setSubmissionsClassFilter('')
                setSubmissionsLessonFilter('')
                setSubmissionsStudentFilter('')
                setSubmissionsTaskFilter('')
                setSubmissionsSearchQuery('')
                setFilteredPage(1)
                setSubmissionsPage(1)
              }}
              style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: '#3dd179', color: '#092013' }}
            >
              Сбросить
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 220 }}>
            <label style={{ color: '#a9b1bb', fontSize: '13px', whiteSpace: 'nowrap' }}>Поиск:</label>
            <input
              type="text"
              value={submissionsSearchQuery}
              onChange={e => { setSubmissionsSearchQuery(e.target.value); setSubmissionsPage(1); setFilteredPage(1) }}
              placeholder="Имя пользователя или номер задания"
              className="input"
              style={{ backgroundColor: '#151c2c', color: '#e6edf3', border: '1px solid #243049', borderRadius: 6, padding: '6px 10px', fontSize: '13px', flex: 1, minWidth: 200 }}
            />
          </div>
        </div>

        {/* Table - matching admin SubmissionsTab style */}
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
              <th style={{
                padding: '12px 16px',
                textAlign: 'left',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '14px',
                borderBottom: '1px solid #243049',
                width: '90px',
                maxWidth: '90px'
              }}>Номер</th>
              <th style={{
                padding: '12px 16px',
                textAlign: 'left',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '14px',
                borderBottom: '1px solid #243049',
                maxWidth: '180px'
              }}>Ученик</th>
              <th style={{
                padding: '12px 16px',
                textAlign: 'left',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '14px',
                borderBottom: '1px solid #243049',
                width: '80px',
                maxWidth: '80px'
              }}>Класс</th>
              <th style={{
                padding: '12px 16px',
                textAlign: 'left',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '14px',
                borderBottom: '1px solid #243049',
                maxWidth: '200px'
              }}>Урок</th>
              <th style={{
                padding: '12px 16px',
                textAlign: 'left',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '14px',
                borderBottom: '1px solid #243049',
                maxWidth: '260px'
              }}>Задание</th>
              <th style={{
                padding: '12px 16px',
                textAlign: 'left',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '14px',
                borderBottom: '1px solid #243049',
                maxWidth: '160px'
              }}>Статус</th>
              <th style={{
                padding: '12px 16px',
                textAlign: 'right',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '14px',
                borderBottom: '1px solid #243049',
                width: '125px',
                maxWidth: '125px'
              }}>Дата</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((s: any) => (
              <tr key={s.id} style={{ borderBottom: '1px solid #243049', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1e2540' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                onClick={() => onViewSubmission(s)}
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
                  <a href="#" onClick={e => { e.preventDefault(); onViewSubmission(s) }} style={{
                    color: '#ffffff',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>{s.username}{s.full_name ? ` (${s.full_name})` : ''}</a>
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
            {paginatedData.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#888' }}>{'Нет решений'}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination - matching admin SubmissionsTab */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" style={{ backgroundColor: '#3dd179', color: '#092013' }} disabled={displayPage <= 1} onClick={() => { if (isFilteredMode) setFilteredPage(p => Math.max(1, p - 1)); else setSubmissionsPage(p => Math.max(1, p - 1)) }}>пред</button>
          {displayTotal > 0 && (() => {
            const totalPages = Math.ceil(displayTotal / displayPageSize)
            const pages = []
            const showPages = 5 // number of page buttons to show
            let start = Math.max(1, displayPage - Math.floor(showPages / 2))
            let end = Math.min(totalPages, start + showPages - 1)
            start = Math.max(1, end - showPages + 1)

            if (start > 1) {
              pages.push(<button key={1} className="btn" style={{ backgroundColor: '#3dd179', color: '#092013' }} onClick={() => { if (isFilteredMode) setFilteredPage(1); else setSubmissionsPage(1) }}>1</button>)
              if (start > 2) pages.push(<span key="start-ellipsis">...</span>)
            }

            for (let p = start; p <= end; p++) {
              pages.push(
                <button key={p} className="btn" style={{ backgroundColor: p === displayPage ? '#2eb85c' : '#3dd179', color: '#092013' }} onClick={() => { if (isFilteredMode) setFilteredPage(p); else setSubmissionsPage(p) }}>{p}</button>
              )
            }

            if (end < totalPages) {
              if (end < totalPages - 1) pages.push(<span key="end-ellipsis">...</span>)
              pages.push(<button key={totalPages} className="btn" style={{ backgroundColor: '#3dd179', color: '#092013' }} onClick={() => { if (isFilteredMode) setFilteredPage(totalPages); else setSubmissionsPage(totalPages) }}>{totalPages}</button>)
            }

            return pages
          })()}
          <button className="btn" style={{ backgroundColor: '#3dd179', color: '#092013' }} disabled={displayTotal > 0 ? displayPage >= Math.ceil(displayTotal / displayPageSize) : false} onClick={() => { if (isFilteredMode) setFilteredPage(p => p + 1); else setSubmissionsPage(p => p + 1) }}>след</button>
        </div>

        {/* Submission Detail Modal - matching admin SubmissionsTab */}
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
                <h3 style={{ margin: 0, color: '#e6edf3' }}>Решение ученика: {selectedSubmission.username}{selectedSubmission.full_name ? ` (${selectedSubmission.full_name})` : ''}</h3>
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

              {submissionTaskDescription && (
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
                    {submissionTaskDescription}
                  </div>
                </div>
              )}

              {submissionTaskKind !== 'quiz' && (
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

              {submissionTaskKind !== 'quiz' && (selectedSubmission.status === 'pending' || selectedSubmission.is_correct) && (
                <div style={{ marginTop: '16px' }}>
                  <label>
                    <strong style={{ color: '#e6edf3' }}>Комментарий:</strong>
                    <textarea
                      className="input"
                      value={submissionComment}
                      onChange={e => setSubmissionComment(e.target.value)}
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
                    onClick={() => handleReviewSubmission(true)}
                    disabled={reviewLoading}
                    style={{ backgroundColor: '#28a745' }}
                  >
                    ✓ Правильно
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleReviewSubmission(false)}
                    disabled={reviewLoading}
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

  function renderManagementTab() {
    return (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ margin: 0 }}>{'Управление учениками'}</h2>
          <button className="btn" onClick={() => { setShowAddStudent(true); setNewStudentForm({ username: '', password: '', full_name: '', user_class: classes[0] || '' }) }} style={{ backgroundColor: '#3dd179', color: '#092013' }}>
            {'Добавить ученика'}
          </button>
        </div>

        {classes.length > 0 && (
          <div style={{ marginBottom: 12, fontSize: 14, color: '#a9b1bb' }}>
            {'Назначенные классы: '}{classes.join(', ')}
          </div>
        )}

        {message && <div style={{ marginBottom: 12, color: message === 'Ученик создан' || message === 'Ученик обновлен' || message === 'Пароль сброшен' || message === 'Языки ученика обновлены' ? '#3dd179' : '#dc3545' }}>{message}</div>}

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            value={mgmtSearch}
            onChange={e => setMgmtSearch(e.target.value)}
            placeholder={'Поиск по логину или ФИО'}
            style={{ flex: 1, minWidth: 220, fontSize: 14 }}
          />
          <select className="input" value={mgmtSortBy} onChange={e => setMgmtSortBy(e.target.value)} style={{ width: 180, fontSize: 14 }}>
            <option value="username">{'Логин'}</option>
            <option value="full_name">{'ФИО'}</option>
            <option value="user_class">{'Класс'}</option>
            <option value="id">{'ID'}</option>
            <option value="rating">{'Рейтинг'}</option>
          </select>
          <button
            className="btn"
            onClick={() => setMgmtOrder(mgmtOrder === 'asc' ? 'desc' : 'asc')}
            style={{ backgroundColor: '#17a2b8', color: '#fff', whiteSpace: 'nowrap', fontSize: 13 }}
          >
            {mgmtOrder === 'asc' ? '↑ По возрастанию' : '↓ По убыванию'}
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ backgroundColor: '#101a2a' }}>
                <th style={{ padding: 10, textAlign: 'left' }}>{'ID'}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{'Логин'}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{'ФИО'}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{'Класс'}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{'Рейтинг'}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{'Активен'}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{'Языки'}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{'Действия'}</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #1e2d3d' }}>
                  <td style={{ padding: 10 }}>{s.id}</td>
                  <td style={{ padding: 10 }}>{s.username}</td>
                  <td style={{ padding: 10 }}>{s.full_name || '-'}</td>
                  <td style={{ padding: 10 }}>{s.user_class || '-'}</td>
                  <td style={{ padding: 10 }}><span style={{ fontWeight: 700, color: '#f39c12' }}>{(s.rating ?? 0) + (s.rating_bonus ?? 0)}</span></td>
                  <td style={{ padding: 10 }}>
                    <span style={{ color: s.is_active ? '#3dd179' : '#dc3545' }}>
                      {s.is_active ? 'Активен' : 'Заблокирован'}
                    </span>
                  </td>
                  <td style={{ padding: 10, minWidth: 150 }}>
                    <button
                      className="btn"
                      onClick={() => openLanguageModal(s)}
                      style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#6f42c1', color: '#fff' }}
                    >
                      {'Назначить языки'}
                    </button>
                  </td>
                  <td style={{ padding: 10 }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button className="btn" onClick={() => openCard(s)} style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#17a2b8', color: '#fff' }}>
                        {'Карточка'}
                      </button>
                      <button className="btn" onClick={() => { setEditStudent(s); setEditForm({ full_name: s.full_name || '', password: '' }) }} style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#ffc107', color: '#000' }}>
                        {'Редактировать'}
                      </button>
                      <button className="btn" onClick={() => setResetPasswordId(s.id)} style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#ffc107', color: '#000' }}>
                        {'Сбросить пароль'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 20, textAlign: 'center', color: '#888' }}>{'Нет учеников'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add Student Modal */}
        {showAddStudent && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowAddStudent(false)}>
            <div className="card" style={{ width: 400, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
              <h3>{'Добавить ученика'}</h3>
              <form onSubmit={handleAddStudent}>
                <input className="input" value={newStudentForm.username} onChange={e => setNewStudentForm({ ...newStudentForm, username: e.target.value })} placeholder={'Логин'} required />
                <input className="input" type="password" value={newStudentForm.password} onChange={e => setNewStudentForm({ ...newStudentForm, password: e.target.value })} placeholder={'Пароль (минимум 4 символа)'} required style={{ marginTop: 12 }} />
                <input className="input" value={newStudentForm.full_name} onChange={e => setNewStudentForm({ ...newStudentForm, full_name: e.target.value })} placeholder={'ФИО'} style={{ marginTop: 12 }} />
                <select className="input" value={newStudentForm.user_class} onChange={e => setNewStudentForm({ ...newStudentForm, user_class: e.target.value })} style={{ marginTop: 12 }} required>
                  {classes.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn" onClick={() => setShowAddStudent(false)} style={{ backgroundColor: '#6c757d' }}>{'Отмена'}</button>
                  <button type="submit" className="btn" disabled={loading} style={{ backgroundColor: '#3dd179', color: '#092013' }}>{loading ? '...' : 'Создать'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Student Modal */}
        {editStudent && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditStudent(null)}>
            <div className="card" style={{ width: 400, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
              <h3>{'Редактировать ученика'}</h3>
              <form onSubmit={handleEditStudent}>
                <input className="input" value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} placeholder={'ФИО'} style={{ marginTop: 12 }} />
                <input className="input" type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder={'Новый пароль (минимум 4 символа)'} style={{ marginTop: 12 }} />
                <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn" onClick={() => setEditStudent(null)} style={{ backgroundColor: '#6c757d' }}>{'Отмена'}</button>
                  <button type="submit" className="btn" disabled={loading} style={{ backgroundColor: '#3dd179', color: '#092013' }}>{loading ? '...' : 'Сохранить'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Reset Password Modal */}
        {resetPasswordId !== null && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => { setResetPasswordId(null); setNewPassword('') }}>
            <div className="card" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
              <h3>{'Сбросить пароль'}</h3>
              <input className="input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={'Пароль (минимум 4 символа)'} />
              {newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH && (
                <div style={{ marginTop: 8, color: '#ff6b6b', fontSize: 13 }}>
                  {'Пароль должен содержать не менее 4 символов'}
                </div>
              )}
              <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => { setResetPasswordId(null); setNewPassword('') }} style={{ backgroundColor: '#6c757d' }}>{'Отмена'}</button>
                <button className="btn" onClick={handleResetPassword} disabled={loading || newPassword.length < MIN_PASSWORD_LENGTH} style={{ backgroundColor: '#3dd179', color: '#092013' }}>{loading ? '...' : 'Сохранить'}</button>
              </div>
            </div>
          </div>
        )}

        {languageModalStudent && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => { setLanguageModalStudent(null); setSelectedStudentLanguageIds([]) }}>
            <div className="card" style={{ width: 460, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
              <h3>{`Языки: ${languageModalStudent.full_name || languageModalStudent.username}`}</h3>
              <p style={{ color: '#a9b1bb', fontSize: 13 }}>{'Отметьте языки, которые будут доступны этому ученику.'}</p>
              {languages.length === 0 ? (
                <p style={{ color: '#dc3545' }}>{'Языки еще не созданы'}</p>
              ) : (
                <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
                  {languages.map(language => (
                    <label key={language.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, backgroundColor: '#101a2a', borderRadius: 6 }}>
                      <input
                        type="checkbox"
                        checked={selectedStudentLanguageIds.includes(language.id)}
                        onChange={e => setSelectedStudentLanguageIds(e.target.checked ? [...selectedStudentLanguageIds, language.id] : selectedStudentLanguageIds.filter(id => id !== language.id))}
                        disabled={languageSaveLoading}
                      />
                      <span>{language.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => { setLanguageModalStudent(null); setSelectedStudentLanguageIds([]) }} style={{ backgroundColor: '#6c757d' }}>{'Отмена'}</button>
                <button className="btn" onClick={saveLanguageModal} disabled={languageSaveLoading || languages.length === 0} style={{ backgroundColor: '#3dd179', color: '#092013' }}>{languageSaveLoading ? '...' : 'Сохранить'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Student Card Modal */}
        {showCard && cardLoading && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="card" style={{ width: 420, textAlign: 'center' }}>
              <p style={{ color: '#a9b1bb' }}>{'Загрузка карточки...'}</p>
            </div>
          </div>
        )}

        {showCard && !cardLoading && cardData && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={closeCard}>
            <div className="card" style={{ width: 720, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    {cardData.user.full_name || cardData.user.username}
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#f39c12' }}>{'Рейтинг: '}{(cardData.user.rating ?? 0) + (cardData.user.rating_bonus ?? 0)}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#17a2b8' }}>{'Место: '}{cardData.user.rank ?? '-'}</span>
                  </h3>
                  <div style={{ color: '#a9b1bb', fontSize: 13, marginTop: 4 }}>
                    {cardData.user.username} · {cardData.user.role === 'admin' ? 'Администратор' : cardData.user.role === 'teacher' ? 'Учитель' : 'Ученик'} ·{' '}
                    {cardData.user.user_class && <span style={{ color: '#f39c12' }}>Класс: {cardData.user.user_class} · </span>}
                    <span style={{ color: cardData.user.is_active ? '#3dd179' : '#dc3545' }}>{cardData.user.is_active ? 'Активен' : 'Заблокирован'}</span>
                  </div>
                  <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{'Регистрация: '}{formatDateTime(cardData.user.created_at)}</div>
                </div>
                <button onClick={closeCard} style={{ background: 'none', border: 'none', color: '#a9b1bb', fontSize: 22, cursor: 'pointer' }}>×</button>
              </div>

              {cardError && <div style={{ color: '#dc3545', marginBottom: 12 }}>{cardError}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 18 }}>
                <StatCard label={'Задач всего'} value={cardData.stats.attempted_tasks} color={'#9b59b6'} />
                <StatCard label={'Всего решений'} value={cardData.stats.total_submissions} color={'#007bff'} />
                <StatCard label={'Правильно'} value={cardData.stats.correct_submissions} color={'#3dd179'} />
                <StatCard label={'Code задач решено'} value={cardData.stats.solved_code_tasks} color={'#17a2b8'} />
                <StatCard label={'Тестов решено'} value={cardData.stats.solved_quiz_tasks} color={'#e67e22'} />
                <StatCard label={'Успешность'} value={cardData.stats.success_rate + '%'} color={'#f39c12'} />
              </div>

              <h4 style={{ margin: '0 0 8px' }}>{'График активности'}</h4>
              <CardChart submissions={cardData.submissions} />

              <LessonProgress title={'Прохождение заданий в уроках'} items={cardData.lesson_progress || []} />

              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  className="input"
                  value={cardSearch}
                  onChange={e => setCardSearch(e.target.value)}
                  placeholder={'Поиск по уроку, заданию или языку'}
                  style={{ flex: 1, minWidth: 180, fontSize: 12 }}
                />
                <select
                  className="input"
                  value={cardSortBy}
                  onChange={e => { const v = e.target.value; setCardSortBy(v); reloadCard(undefined, v, cardOrder) }}
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
                  onClick={() => { const nv = cardOrder === 'asc' ? 'desc' : 'asc'; setCardOrder(nv); reloadCard(undefined, cardSortBy, nv) }}
                  style={{ backgroundColor: '#17a2b8', color: '#fff', fontSize: 12, whiteSpace: 'nowrap' }}
                >
                  {cardOrder === 'asc' ? '↑ По возрастанию' : '↓ По убыванию'}
                </button>
              </div>

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
                    {cardData.submissions.map((s: any) => (
                      <tr key={s.id} style={{ borderBottom: '1px solid #1e2d3d' }}>
                        <td style={{ padding: 8 }}>{s.language || '-'}</td>
                        <td style={{ padding: 8 }}>{s.lesson_title}</td>
                        <td style={{ padding: 8 }}>{s.task_title}</td>
                        <td style={{ padding: 8, color: s.status === 'pending' ? '#ffa500' : (s.is_correct ? '#3dd179' : '#a9b1bb') }}>
                          {s.status === 'pending' ? 'Ожидает проверки' : (s.is_correct ? 'Правильно' : 'Неправильно')}
                        </td>
                        <td style={{ padding: 8 }}>{formatDateTime(s.created_at)}</td>
                      </tr>
                    ))}
                    {cardData.submissions.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#888' }}>{'Нет решений'}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>{'Панель учителя'}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 14, color: '#a9b1bb' }}>
            {'Назначенные классы: '}{classes.length > 0 ? classes.join(', ') : 'нет'}
          </span>
          <button className="btn" onClick={handleLogout} style={{ backgroundColor: '#dc3545' }}>
            {'Выйти'}
          </button>
        </div>
      </div>

      <div className="tabs" style={{ justifyContent: 'flex-start', marginBottom: 16 }}>
        <button
          className="tab"
          onClick={() => setActiveTab('lessons')}
          style={{
            backgroundColor: activeTab === 'lessons' ? '#3dd179' : '#101a2a',
            color: activeTab === 'lessons' ? '#092013' : '#e6edf3',
            fontWeight: activeTab === 'lessons' ? 'bold' : 'normal',
          }}
        >
          {'Уроки'}
        </button>
        <button
          className="tab"
          onClick={() => setActiveTab('results')}
          style={{
            backgroundColor: activeTab === 'results' ? '#3dd179' : '#101a2a',
            color: activeTab === 'results' ? '#092013' : '#e6edf3',
            fontWeight: activeTab === 'results' ? 'bold' : 'normal',
          }}
        >
          {'Результаты'}
        </button>
        <button
          className="tab"
          onClick={() => setActiveTab('management')}
          style={{
            backgroundColor: activeTab === 'management' ? '#3dd179' : '#101a2a',
            color: activeTab === 'management' ? '#092013' : '#e6edf3',
            fontWeight: activeTab === 'management' ? 'bold' : 'normal',
          }}
        >
          {'Управление'}
        </button>
      </div>

      {message && <div style={{ marginBottom: 12, color: message.includes('Ошибка') || message.includes('должен') ? '#dc3545' : '#3dd179' }}>{message}</div>}

      {activeTab === 'lessons' && renderLessonsTab()}
      {activeTab === 'results' && (submissionsLoading ? <div className="card"><p style={{ color: '#a9b1bb' }}>{'Загрузка...'}</p></div> : renderResultsTab())}
      {activeTab === 'management' && renderManagementTab()}
    </div>
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
