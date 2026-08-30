import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../api'

interface UserProtectedRouteProps {
  children: React.ReactNode
}

export default function UserProtectedRoute({ children }: UserProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    const userStr = localStorage.getItem('user')

    if (!userStr) {
      setIsAuthenticated(false)
      return
    }

    // Verify the session via the httpOnly cookie by calling /auth/me.
    api.get('/auth/me')
      .then(() => setIsAuthenticated(true))
      .catch(() => {
        localStorage.removeItem('user')
        setIsAuthenticated(false)
      })
  }, [])

  // Show loading while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ textAlign: 'center', padding: '20px' }}>
            Загрузка...
          </div>
        </div>
      </div>
    )
  }

  // Redirect to home page if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  // Render children if authenticated
  return <>{children}</>
}
