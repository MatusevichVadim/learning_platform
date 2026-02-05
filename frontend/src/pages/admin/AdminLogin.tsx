import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminLogin } from '../../api'

export default function AdminLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    // Check if already logged in
    const token = localStorage.getItem('admin_token')
    if (token) {
      // Verify token is still valid
      fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(response => {
        if (response.ok) {
          navigate('/admin')
        }
      })
      .catch(() => {
        // Token invalid, remove it
        localStorage.removeItem('admin_token')
      })
    }
  }, [navigate])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await adminLogin(username, password)
      navigate('/admin')
    } catch (err: any) {
      setError('Неверный логин или пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">Админ вход</h1>
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


