import { useEffect, useState } from 'react'
import {
  adminTeachers,
  adminClasses,
  adminTeacherClasses,
  adminAssignClassToTeacher,
  adminUnassignClassFromTeacher,
  createUser,
  deleteUser,
  toggleUserStatus,
} from '../../api'
import { formatDateTime } from '../../utils/date'

type Teacher = {
  id: number
  username: string
  full_name?: string
  role: string
  is_active: boolean
  created_at: string
  user_class?: string
}

const MIN_PASSWORD_LENGTH = 4

export default function TeachersTab() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [allClasses, setAllClasses] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newTeacherForm, setNewTeacherForm] = useState({ username: '', password: '', full_name: '' })
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignTeacherId, setAssignTeacherId] = useState<number | null>(null)
  const [assignedClasses, setAssignedClasses] = useState<string[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [classRefreshKey, setClassRefreshKey] = useState(0)
  const [deleteTeacherId, setDeleteTeacherId] = useState<number | null>(null)

  useEffect(() => {
    loadTeachers()
    loadClasses()
  }, [])

  async function loadTeachers() {
    try {
      const data = await adminTeachers()
      setTeachers(data as Teacher[])
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка загрузки учителей')
    }
  }

  async function loadClasses() {
    try {
      const data = await adminClasses()
      setAllClasses(data.map((c: any) => c.user_class))
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка загрузки классов')
    }
  }

  async function loadTeacherClasses(teacherId: number) {
    try {
      const data = await adminTeacherClasses(teacherId)
      setAssignedClasses(data.classes)
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка загрузки классов учителя')
    }
  }

  async function handleAddTeacher(e: React.FormEvent) {
    e.preventDefault()
    if (!newTeacherForm.username || !newTeacherForm.password) return
    if (newTeacherForm.password.length < MIN_PASSWORD_LENGTH) {
      setMessage('Пароль должен содержать не менее 4 символов')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      await createUser({
        username: newTeacherForm.username,
        password: newTeacherForm.password,
        full_name: newTeacherForm.full_name || undefined,
        role: 'teacher',
        user_class: undefined,
      })
      setMessage('Учитель создан')
      setShowAddModal(false)
      setNewTeacherForm({ username: '', password: '', full_name: '' })
      loadTeachers()
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка создания учителя')
    } finally {
      setLoading(false)
    }
  }

  async function handleAssignClass() {
    if (!assignTeacherId || !selectedClass) return
    setLoading(true)
    setMessage('')
    try {
      await adminAssignClassToTeacher(assignTeacherId, selectedClass)
      setMessage('Класс назначен')
      setShowAssignModal(false)
      setSelectedClass('')
      await loadTeacherClasses(assignTeacherId)
      setClassRefreshKey(key => key + 1)
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка назначения класса')
    } finally {
      setLoading(false)
    }
  }

  async function handleUnassignClass(teacherId: number, userClass: string) {
    setLoading(true)
    setMessage('')
    try {
      await adminUnassignClassFromTeacher(teacherId, userClass)
      setMessage('Класс отозван')
      await loadTeacherClasses(teacherId)
      setClassRefreshKey(key => key + 1)
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка отзыва класса')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleStatus(teacherId: number) {
    setLoading(true)
    try {
      await toggleUserStatus(teacherId)
      loadTeachers()
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteTeacher() {
    if (deleteTeacherId === null) return
    setLoading(true)
    try {
      await deleteUser(deleteTeacherId)
      setMessage('Учитель удален')
      setDeleteTeacherId(null)
      loadTeachers()
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка удаления')
    } finally {
      setLoading(false)
    }
  }

  function openAssignModal(teacher: Teacher) {
    setAssignTeacherId(teacher.id)
    setAssignedClasses([])
    setSelectedClass('')
    setShowAssignModal(true)
    loadTeacherClasses(teacher.id)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>{'Учителя'}</h2>
        <button className="btn" onClick={() => setShowAddModal(true)} style={{ backgroundColor: '#3dd179', color: '#092013' }}>
          {'Добавить учителя'}
        </button>
      </div>

      {message && <div style={{ marginBottom: 12, color: message.includes('Ошибка') ? '#dc3545' : '#3dd179' }}>{message}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ backgroundColor: '#101a2a' }}>
              <th style={{ padding: 10, textAlign: 'left' }}>{'ID'}</th>
              <th style={{ padding: 10, textAlign: 'left' }}>{'Логин'}</th>
              <th style={{ padding: 10, textAlign: 'left' }}>{'ФИО'}</th>
              <th style={{ padding: 10, textAlign: 'left' }}>{'Классы'}</th>
              <th style={{ padding: 10, textAlign: 'left' }}>{'Активен'}</th>
              <th style={{ padding: 10, textAlign: 'left' }}>{'Дата создания'}</th>
              <th style={{ padding: 10, textAlign: 'left' }}>{'Действия'}</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #1e2d3d' }}>
                <td style={{ padding: 10 }}>{t.id}</td>
                <td style={{ padding: 10 }}>{t.username}</td>
                <td style={{ padding: 10 }}>{t.full_name || '-'}</td>
                <td style={{ padding: 10 }}>
                  <TeacherClassList teacherId={t.id} refreshKey={classRefreshKey} />
                </td>
                <td style={{ padding: 10 }}>
                  <span style={{ color: t.is_active ? '#3dd179' : '#dc3545' }}>
                    {t.is_active ? 'Активен' : 'Заблокирован'}
                  </span>
                </td>
                <td style={{ padding: 10 }}>{formatDateTime(t.created_at)}</td>
                <td style={{ padding: 10 }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => openAssignModal(t)} style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#17a2b8', color: '#fff' }}>
                      {'Назначить класс'}
                    </button>
                    <button className="btn" onClick={() => handleToggleStatus(t.id)} style={{ padding: '4px 8px', fontSize: 12, backgroundColor: t.is_active ? '#dc3545' : '#3dd179', color: t.is_active ? '#fff' : '#092013' }}>
                      {t.is_active ? 'Заблокировать' : 'Разблокировать'}
                    </button>
                    <button className="btn" onClick={() => setDeleteTeacherId(t.id)} style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#dc3545', color: '#fff' }}>
                      {'Удалить'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#888' }}>{'Нет учителей'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Teacher Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowAddModal(false)}>
          <div className="card" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <h3>{'Добавить учителя'}</h3>
            <form onSubmit={handleAddTeacher}>
              <input className="input" value={newTeacherForm.username} onChange={e => setNewTeacherForm({ ...newTeacherForm, username: e.target.value })} placeholder={'Логин'} required />
              <input className="input" type="password" value={newTeacherForm.password} onChange={e => setNewTeacherForm({ ...newTeacherForm, password: e.target.value })} placeholder={'Пароль (минимум 4 символа)'} required style={{ marginTop: 12 }} />
              <input className="input" value={newTeacherForm.full_name} onChange={e => setNewTeacherForm({ ...newTeacherForm, full_name: e.target.value })} placeholder={'ФИО'} style={{ marginTop: 12 }} />
              <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setShowAddModal(false)} style={{ backgroundColor: '#6c757d' }}>{'Отмена'}</button>
                <button type="submit" className="btn" disabled={loading} style={{ backgroundColor: '#3dd179', color: '#092013' }}>{loading ? '...' : 'Создать'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Class Modal */}
      {showAssignModal && assignTeacherId !== null && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowAssignModal(false)}>
          <div className="card" style={{ width: 400, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3>{'Назначить класс учителю'}</h3>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#a9b1bb' }}>
              {'Учитель ID: '}{assignTeacherId}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6 }}>{'Назначенные классы'}</label>
              {assignedClasses.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {assignedClasses.map(c => (
                    <span key={c} style={{ backgroundColor: '#101a2a', border: '1px solid #243049', borderRadius: '6px', padding: '4px 10px', fontSize: 13, color: '#e6edf3' }}>
                      {c}
                      <button
                        onClick={() => handleUnassignClass(assignTeacherId, c)}
                        style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', marginLeft: 6, fontSize: 12 }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>{'Нет назначенных классов'}</div>
              )}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6 }}>{'Добавить класс'}</label>
              <select className="input" value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ fontSize: 14 }}>
                <option value="">{'Выберите класс...'}</option>
                {allClasses.map(c => (
                  <option key={c} value={c} disabled={assignedClasses.includes(c)}>{c}{assignedClasses.includes(c) ? ' (уже назначен)' : ''}</option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowAssignModal(false)} style={{ backgroundColor: '#6c757d' }}>{'Закрыть'}</button>
              <button className="btn" onClick={handleAssignClass} disabled={loading || !selectedClass} style={{ backgroundColor: '#3dd179', color: '#092013' }}>{loading ? '...' : 'Назначить'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Teacher Modal */}
      {deleteTeacherId !== null && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setDeleteTeacherId(null)}>
          <div className="card" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <h3>{'Удаление учителя'}</h3>
            <p style={{ color: '#a9b1bb' }}>{'Вы уверены, что хотите удалить этого учителя? Это действие необратимо.'}</p>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDeleteTeacherId(null)} style={{ backgroundColor: '#6c757d' }}>{'Отмена'}</button>
              <button className="btn" onClick={handleDeleteTeacher} disabled={loading} style={{ backgroundColor: '#dc3545', color: '#fff' }}>{loading ? '...' : 'Удалить'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Sub-component to display a teacher's assigned classes
function TeacherClassList({ teacherId, refreshKey }: { teacherId: number; refreshKey: number }) {
  const [classes, setClasses] = useState<string[]>([])

  useEffect(() => {
    adminTeacherClasses(teacherId).then(data => setClasses(data.classes)).catch(() => setClasses([]))
  }, [teacherId, refreshKey])

  if (classes.length === 0) {
    return <span style={{ color: '#888', fontSize: 13 }}>{'Нет классов'}</span>
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {classes.map(c => (
        <span key={c} style={{ backgroundColor: '#101a2a', border: '1px solid #243049', borderRadius: '4px', padding: '2px 8px', fontSize: 12, color: '#e6edf3' }}>
          {c}
        </span>
      ))}
    </div>
  )
}
