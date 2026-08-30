import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api'

export default function Home() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setLoading(true)
    setError('')
    try {
      const data = await login(username.trim(), password)
      const user = data.user
      // Redirect based on role
      if (user.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/languages')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">{'Вход'}</h1>
        <form onSubmit={onSubmit}>
          <input
            className="input"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder={'Логин'}
            autoComplete="username"
          />
          <input
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={'Пароль'}
            autoComplete="current-password"
            style={{ marginTop: 12 }}
          />
          {error && <div style={{ color: '#dc3545', marginTop: 8 }}>{error}</div>}
          <button className="btn" type="submit" disabled={loading} style={{ marginTop: 12 }}>
            {loading ? '...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
