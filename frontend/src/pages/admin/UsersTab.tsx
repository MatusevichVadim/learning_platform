import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminUsers, adminUserCard, createUser, resetUserPassword, toggleUserStatus, updateUser, deleteUser } from '../../api'
import CardChart from '../../components/CardChart'
import LessonProgress from '../../components/LessonProgress'
import { formatDate } from '../../utils/date'

type User = {
  id: number
  username: string
  full_name?: string
  role: string
  is_active: boolean
  created_at: string
  rating?: number
  rating_bonus?: number
}

// Must match the backend PasswordReset schema (min_length=4) to avoid 422 errors.
const MIN_PASSWORD_LENGTH = 4

export default function UsersTab() {
  const [users, setUsers] = useState<User[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'user', rating_bonus: 0 })
  const [resetPasswordId, setResetPasswordId] = useState<number | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')

  const navigate = useNavigate()

  // Personal card modal state
  const [cardData, setCardData] = useState<null | Awaited<ReturnType<typeof adminUserCard>>>(null)
  const [cardLoading, setCardLoading] = useState(false)
  const [cardError, setCardError] = useState('')
  const [cardUser, setCardUser] = useState<User | null>(null)
  const [cardSearch, setCardSearch] = useState('')
  const [cardSortBy, setCardSortBy] = useState('created_at')
  const [cardOrder, setCardOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    const t = setTimeout(() => { loadUsers() }, 300)
    return () => clearTimeout(t)
  }, [search, sortBy, order])

  useEffect(() => {
    const t = setTimeout(() => { reloadCard() }, 300)
    return () => clearTimeout(t)
  }, [cardSearch])

  async function openCard(user: User) {
    setCardUser(user)
    setCardData(null)
    setCardError('')
    setCardLoading(true)
    try {
      const data = await adminUserCard(user.id, { search: cardSearch, sort_by: cardSortBy, order: cardOrder })
      setCardData(data)
    } catch (err: any) {
      setCardError(err.response?.data?.detail || 'Ошибка загрузки карточки')
    } finally {
      setCardLoading(false)
    }
  }

  async function reloadCard(searchArg?: string, sortByArg?: string, orderArg?: 'asc' | 'desc') {
    const u = cardUser
    if (!u) return
    const se = searchArg ?? cardSearch
    const sb = sortByArg ?? cardSortBy
    const or = orderArg ?? cardOrder
    setCardLoading(true)
    setCardError('')
    try {
      const data = await adminUserCard(u.id, { search: se, sort_by: sb, order: or })
      setCardData(data)
    } catch (err: any) {
      setCardError(err.response?.data?.detail || 'Ошибка загрузки карточки')
    } finally {
      setCardLoading(false)
    }
  }

  async function loadUsers() {
    const data = await adminUsers({ search, sort_by: sortBy, order })
    setUsers(data as User[])
  }

  function openAddModal() {
    setEditingUser(null)
    setForm({ username: '', password: '', full_name: '', role: 'user', rating_bonus: 0 })
    setShowModal(true)
  }

  function openEditModal(user: User) {
    setEditingUser(user)
    setForm({ username: user.username, password: '', full_name: user.full_name || '', role: user.role, rating_bonus: user.rating_bonus ?? 0 })
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          full_name: form.full_name || undefined,
          role: form.role,
          is_active: editingUser.is_active,
          rating_bonus: Number(form.rating_bonus) || 0,
        })
        setMessage('Успешно')
      } else {
        await createUser({
          username: form.username,
          password: form.password,
          full_name: form.full_name || undefined,
          role: form.role,
        })
        setMessage('Успешно')
      }
      setShowModal(false)
      loadUsers()
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword() {
    if (!resetPasswordId || newPassword.length < MIN_PASSWORD_LENGTH) return
    setLoading(true)
    try {
      await resetUserPassword(resetPasswordId, newPassword)
      setMessage('Успешно')
      setResetPasswordId(null)
      setNewPassword('')
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleStatus(userId: number) {
    setLoading(true)
    try {
      await toggleUserStatus(userId)
      loadUsers()
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteUser() {
    if (deleteUserId === null) return
    setLoading(true)
    try {
      await deleteUser(deleteUserId)
      setMessage('Успешно')
      setDeleteUserId(null)
      loadUsers()
    } catch (err: any) {
      setMessage(err.response?.data?.detail || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>{'Пользователи'}</h2>
        <button className="btn" onClick={openAddModal} style={{ backgroundColor: '#3dd179', color: '#092013' }}>
          {'Добавить пользователя'}
        </button>
      </div>

      {message && <div style={{ marginBottom: 12, color: message === 'Успешно' ? '#3dd179' : '#dc3545' }}>{message}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={'Поиск по логину или ФИО'}
          style={{ flex: 1, minWidth: 220 }}
        />
        <select className="input" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 180 }}>
          <option value="created_at">{'Дата создания'}</option>
          <option value="id">{'ID'}</option>
          <option value="username">{'Логин'}</option>
          <option value="full_name">{'ФИО'}</option>
          <option value="role">{'Роль'}</option>
          <option value="is_active">{'Статус'}</option>
          <option value="rating">{'Рейтинг'}</option>
        </select>
        <button
          className="btn"
          onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
          style={{ backgroundColor: '#17a2b8', color: '#fff', whiteSpace: 'nowrap' }}
        >
          {order === 'asc' ? '↑ По возрастанию' : '↓ По убыванию'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#101a2a' }}>
              <th style={{ padding: 10, textAlign: 'left' }}>{'ID'}</th>
              <th style={{ padding: 10, textAlign: 'left' }}>{'Логин'}</th>
              <th style={{ padding: 10, textAlign: 'left' }}>{'ФИО'}</th>
              <th style={{ padding: 10, textAlign: 'left' }}>{'Роль'}</th>
              <th style={{ padding: 10, textAlign: 'left' }}>{'Активен'}</th>
              <th style={{ padding: 10, textAlign: 'left' }}>{'Рейтинг'}</th>
              <th style={{ padding: 10, textAlign: 'left' }}>{'Дата создания'}</th>
              <th style={{ padding: 10, textAlign: 'left' }}>{'Действия'}</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid #1e2d3d' }}>
                <td style={{ padding: 10 }}>{user.id}</td>
                <td style={{ padding: 10 }}>{user.username}</td>
                <td style={{ padding: 10 }}>{user.full_name ? user.full_name : '-'}</td>
                <td style={{ padding: 10 }}>{user.role === 'admin' ? 'Администратор' : 'Пользователь'}</td>
                <td style={{ padding: 10 }}>
                  <span style={{ color: user.is_active ? '#3dd179' : '#dc3545' }}>
                    {user.is_active ? 'Активен' : 'Заблокирован'}
                  </span>
                </td>
                <td style={{ padding: 10 }}>
                  <span style={{ fontWeight: 700, color: '#f39c12' }}>{(user.rating ?? 0) + (user.rating_bonus ?? 0)}</span>
                </td>
                <td style={{ padding: 10 }}>{formatDate(user.created_at)}</td>
                <td style={{ padding: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      <button className="btn" onClick={() => openCard(user)} style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#17a2b8', color: '#fff' }}>
                        {'Личная карточка'}
                      </button>
                      <button className="btn" onClick={() => setResetPasswordId(user.id)} style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#ffc107', color: '#000' }}>
                        {'Сбросить пароль'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      <button className="btn" onClick={() => openEditModal(user)} style={{ padding: '4px 8px', fontSize: 12 }}>
                        {'Редактировать'}
                      </button>
                      <button className="btn" onClick={() => handleToggleStatus(user.id)} style={{ padding: '4px 8px', fontSize: 12, backgroundColor: user.is_active ? '#dc3545' : '#3dd179', color: user.is_active ? '#fff' : '#092013' }}>
                        {user.is_active ? 'Заблокировать' : 'Разблокировать'}
                      </button>
                      <button className="btn" onClick={() => setDeleteUserId(user.id)} style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#dc3545', color: '#fff' }}>
                        {'Удалить'}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#888' }}>{'Нет данных'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 400, maxHeight: '90vh', overflow: 'auto' }}>
            <h3>{editingUser ? 'Редактировать пользователя' : 'Добавить пользователя'}</h3>
            <form onSubmit={handleSubmit}>
              <input className="input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder={'Логин'} disabled={!!editingUser} />
              {!editingUser && (
                <input className="input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={'Пароль'} style={{ marginTop: 12 }} />
              )}
              <input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder={'ФИО'} style={{ marginTop: 12 }} />
              <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ marginTop: 12 }}>
                <option value="user">{'Пользователь'}</option>
                <option value="admin">{'Администратор'}</option>
              </select>
              {editingUser && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6 }}>{'Бонус рейтинга (вручную)'}</label>
                  <input
                    className="input"
                    type="number"
                    value={form.rating_bonus}
                    onChange={e => setForm({ ...form, rating_bonus: Number(e.target.value) })}
                    placeholder={'0'}
                  />
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    {'Итоговый рейтинг: '}{((editingUser.rating ?? 0) - (editingUser.rating_bonus ?? 0) + (Number(form.rating_bonus) || 0))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setShowModal(false)} style={{ backgroundColor: '#6c757d' }}>{'Отмена'}</button>
                <button type="submit" className="btn" disabled={loading} style={{ backgroundColor: '#3dd179', color: '#092013' }}>{loading ? '...' : 'Сохранить'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetPasswordId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 400 }}>
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

      {deleteUserId !== null && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setDeleteUserId(null)}>
          <div className="card" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <h3>{'Удаление аккаунта'}</h3>
            <p style={{ color: '#a9b1bb' }}>{'Вы уверены, что хотите удалить аккаунт? Это действие необратимо.'}</p>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDeleteUserId(null)} style={{ backgroundColor: '#6c757d' }}>{'Отмена'}</button>
              <button className="btn" onClick={handleDeleteUser} disabled={loading} style={{ backgroundColor: '#dc3545', color: '#fff' }}>{loading ? '...' : 'Удалить'}</button>
            </div>
          </div>
        </div>
      )}

      {cardLoading && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 420, textAlign: 'center' }}>
            <p style={{ color: '#a9b1bb' }}>{'Загрузка карточки...'}</p>
          </div>
        </div>
      )}

      {!cardLoading && cardData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setCardData(null)}>
          <div className="card" style={{ width: 720, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {cardData.user.full_name || cardData.user.username}
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#f39c12' }}>{'Рейтинг: '}{(cardData.user.rating ?? 0) + (cardData.user.rating_bonus ?? 0)}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#17a2b8' }}>{'Место: '}{cardData.user.rank ?? '-'}</span>
                </h3>
                <div style={{ color: '#a9b1bb', fontSize: 13, marginTop: 4 }}>
                  {cardData.user.username} · {cardData.user.role === 'admin' ? 'Администратор' : 'Пользователь'} ·{' '}
                  <span style={{ color: cardData.user.is_active ? '#3dd179' : '#dc3545' }}>{cardData.user.is_active ? 'Активен' : 'Заблокирован'}</span>
                </div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{'Регистрация: '}{formatDate(cardData.user.created_at)}</div>
              </div>
              <button onClick={() => setCardData(null)} style={{ background: 'none', border: 'none', color: '#a9b1bb', fontSize: 22, cursor: 'pointer' }}>×</button>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h4 style={{ margin: 0 }}>{'Решения'}</h4>
              <button className="btn" onClick={() => { const u = cardData.user.username; setCardData(null); navigate(`/admin/user/${encodeURIComponent(u)}/submissions`) }} style={{ backgroundColor: '#007bff', color: '#fff', fontSize: 12, padding: '4px 10px' }}>
                {'Все решения'}
              </button>
            </div>

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
                  {cardData.submissions.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #1e2d3d' }}>
                      <td style={{ padding: 8 }}>{s.language || '-'}</td>
                      <td style={{ padding: 8 }}>{s.lesson_title}</td>
                      <td style={{ padding: 8 }}>{s.task_title}</td>
                      <td style={{ padding: 8, color: s.status === 'pending' ? '#ffa500' : (s.is_correct ? '#3dd179' : '#a9b1bb') }}>
                        {s.status === 'pending' ? 'Ожидает проверки' : (s.is_correct ? 'Правильно' : 'Неправильно')}
                      </td>
                      <td style={{ padding: 8 }}>{formatDate(s.created_at)}</td>
                    </tr>
                  ))}
                  {cardData.submissions.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: '#888' }}>{'Нет решений'}</td></tr>
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

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ backgroundColor: '#101a2a', borderRadius: 8, padding: '12px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#a9b1bb', marginTop: 4 }}>{label}</div>
    </div>
  )
}
