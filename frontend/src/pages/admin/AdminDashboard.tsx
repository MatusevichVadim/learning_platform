import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminSubmissions, adminUsers } from '../../api'
import { useState as useS } from 'react'
import axios from 'axios'
import TasksTab from './TasksTab'
import LessonsTab from './LessonsTab'
import LanguagesTab from './LanguagesTab'
import SubmissionsTab from './SubmissionsTab'
import AdminCompetitionRoom from './AdminCompetitionRoom'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<any[]>([])
  const [subs, setSubs] = useState<any[]>([])
  const [lessonForm, setLessonForm] = useS({ language: 'python', title: '', order_index: 1 })
  const [taskForm, setTaskForm] = useS({ lesson_id: 1, title: '', description: '', kind: 'quiz', test_spec: '' })
  const [creator, setCreator] = useS<{ language: 'python'|'csharp'; lessonId?: number; type?: 'quiz'|'code'; title: string; description: string; options: string[]; correct?: string; tests: string }>({ language: 'python', title: '', description: '', options: ['', '', '', ''], tests: '' })
  const [updateTaskForm, setUpdateTaskForm] = useS({ id: 1, title: '', description: '', kind: 'quiz', test_spec: '' })
  const [view, setView] = useS<'add' | 'update'>('add')
  const [section, setSection] = useS<'tasks' | 'lessons' | 'languages' | 'competition'>('languages')
  const [adminTab, setAdminTab] = useS<'tables' | 'manage' | 'competition'>('tables')

  // Pagination and filtering state
  const [currentPage, setCurrentPage] = useState(1)
  const [filteredUser, setFilteredUser] = useState<string | null>(null)
  const recordsPerPage = 50

  useEffect(() => {
    adminUsers().then(setUsers)
    adminSubmissions().then(res => setSubs(res.data))
  }, [])

  // Filter submissions by user if filteredUser is set
  const filteredSubs = filteredUser ? subs.filter(s => s.user_name === filteredUser) : subs

  // Pagination calculations
  const totalPages = Math.ceil(filteredSubs.length / recordsPerPage)
  const paginatedSubs = filteredSubs.slice((currentPage - 1) * recordsPerPage, currentPage * recordsPerPage)

  // Handle username click to filter
  function onUserClick(userName: string) {
    setFilteredUser(userName)
    setCurrentPage(1)
  }

  // Clear user filter
  function clearFilter() {
    setFilteredUser(null)
    setCurrentPage(1)
  }

  // Logout function
  function handleLogout() {
    localStorage.removeItem('admin_token')
    navigate('/admin/login')
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Админ панель</h1>
        <button className="btn" onClick={handleLogout} style={{ backgroundColor: '#dc3545' }}>
          Выйти
        </button>
      </div>
      <div className="tabs" style={{ justifyContent: 'flex-start' }}>
        <button
          className="tab"
          onClick={() => setAdminTab('tables')}
          style={{
            backgroundColor: adminTab === 'tables' ? '#3dd179' : '#101a2a',
            color: adminTab === 'tables' ? '#092013' : '#e6edf3',
            fontWeight: adminTab === 'tables' ? 'bold' : 'normal'
          }}
        >
          Результаты
        </button>
        <button
          className="tab"
          onClick={() => setAdminTab('competition')}
          style={{
            backgroundColor: adminTab === 'competition' ? '#3dd179' : '#101a2a',
            color: adminTab === 'competition' ? '#092013' : '#e6edf3',
            fontWeight: adminTab === 'competition' ? 'bold' : 'normal'
          }}
        >
          Соревнования
        </button>
        <button
          className="tab"
          onClick={() => setAdminTab('manage')}
          style={{
            backgroundColor: adminTab === 'manage' ? '#3dd179' : '#101a2a',
            color: adminTab === 'manage' ? '#092013' : '#e6edf3',
            fontWeight: adminTab === 'manage' ? 'bold' : 'normal'
          }}
        >
          Управление
        </button>
      </div>

      {adminTab === 'tables' && (
        <div className="card">
          <SubmissionsTab />
        </div>
      )}

      {adminTab === 'competition' && (
        <div className="card">
          <h2>Комната соревнований</h2>
          <AdminCompetitionRoom />
        </div>
      )}

      {adminTab === 'manage' && (
        <div className="card" style={{ marginTop: 24 }}>
        <div className="tabs" style={{ justifyContent: 'flex-start' }}>
          <button
            className="tab"
            onClick={() => setSection('languages')}
            style={{
              backgroundColor: section === 'languages' ? '#3dd179' : '#101a2a',
              color: section === 'languages' ? '#092013' : '#e6edf3',
              fontWeight: section === 'languages' ? 'bold' : 'normal'
            }}
          >
            Языки
          </button>
          <button
            className="tab"
            onClick={() => setSection('lessons')}
            style={{
              backgroundColor: section === 'lessons' ? '#3dd179' : '#101a2a',
              color: section === 'lessons' ? '#092013' : '#e6edf3',
              fontWeight: section === 'lessons' ? 'bold' : 'normal'
            }}
          >
            Уроки
          </button>
          <button
            className="tab"
            onClick={() => setSection('tasks')}
            style={{
              backgroundColor: section === 'tasks' ? '#3dd179' : '#101a2a',
              color: section === 'tasks' ? '#092013' : '#e6edf3',
              fontWeight: section === 'tasks' ? 'bold' : 'normal'
            }}
          >
            Задания
          </button>
        </div>
        {section === 'languages' && (
          <LanguagesTab />
        )}
        {section === 'tasks' && (
          <div>
            <h2>Задания</h2>
            <div className="tabs">
              <button
                className="tab"
                onClick={() => setView('add')}
                style={{
                  backgroundColor: view === 'add' ? '#3dd179' : '#101a2a',
                  color: view === 'add' ? '#092013' : '#e6edf3',
                  fontWeight: view === 'add' ? 'bold' : 'normal'
                }}
              >
                Добавить
              </button>
              <button
                className="tab"
                onClick={() => setView('update')}
                style={{
                  backgroundColor: view === 'update' ? '#3dd179' : '#101a2a',
                  color: view === 'update' ? '#092013' : '#e6edf3',
                  fontWeight: view === 'update' ? 'bold' : 'normal'
                }}
              >
                Изменить
              </button>
            </div>
            <TasksTab view={view} />
          </div>
        )}
        {section === 'lessons' && (
          <div>
            <h2>Уроки</h2>
            <LessonsTab onSelectLesson={(id: number) => { setSection('tasks') }} />
          </div>
        )}
        </div>
      )}

    </div>
  )
}
