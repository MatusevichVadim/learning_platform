import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    // If already logged in, redirect appropriately.
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        navigate(user.role === 'admin' ? '/admin' : '/', { replace: true })
      } catch {
        localStorage.removeItem('user')
      }
    }
  }, [navigate])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await login(username, password)
      const role = data.user?.role ?? data.role
      navigate(role === 'admin' ? '/admin' : '/', { replace: true })
    } catch (err: any) {
      setError('Неверный логин или пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">Вход</h1>
        <form onSubmit={onSubmit}>
          <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="Логин" autoComplete="off" />
          <input className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль" type="password" style={{ marginTop: 8 }} autoComplete="off" />
          {error && <div style={{ color: 'red', marginTop: 8, fontSize: '14px' }}>{error}</div>}
          <button className="btn" type="submit" disabled={loading} style={{ marginTop: 12 }}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
