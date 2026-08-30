import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../api'

interface ProtectedRouteProps {
  children: React.ReactNode
}

type AuthStatus = 'loading' | 'ok' | 'no-auth' | 'no-admin'

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    const userStr = localStorage.getItem('user')

    if (!userStr) {
      setStatus('no-auth')
      return
    }

    let storedUser: { role?: string } | null = null
    try {
      storedUser = JSON.parse(userStr)
    } catch {
      localStorage.removeItem('user')
      setStatus('no-auth')
      return
    }

    // Fallback to stored role; verify with the backend /api/auth/me endpoint.
    if (storedUser?.role !== 'admin') {
      setStatus('no-admin')
      return
    }

    api.get('/auth/me')
      .then((res) => {
        if (res.data?.role === 'admin') {
          setStatus('ok')
        } else {
          setStatus('no-admin')
        }
      })
      .catch(() => {
        localStorage.removeItem('user')
        setStatus('no-auth')
      })
  }, [])

  if (status === 'loading') {
    return (
      <div className="container">
        <div className="card">
          <div style={{ textAlign: 'center', padding: '20px' }}>
            Проверка авторизации...
          </div>
        </div>
      </div>
    )
  }

  if (status === 'no-auth') {
    return <Navigate to="/login" replace />
  }

  if (status === 'no-admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
