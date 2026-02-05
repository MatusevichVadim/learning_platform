import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('admin_token')

    if (!token) {
      setIsAuthenticated(false)
      return
    }

    // Verify token by making a test API call
    fetch('/api/admin/users', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => {
      if (response.ok) {
        setIsAuthenticated(true)
      } else {
        // Token is invalid, remove it
        localStorage.removeItem('admin_token')
        setIsAuthenticated(false)
      }
    })
    .catch(() => {
      // Network error or invalid token
      localStorage.removeItem('admin_token')
      setIsAuthenticated(false)
    })
  }, [])

  // Show loading while checking authentication
  if (isAuthenticated === null) {
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

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }

  // Render protected content if authenticated
  return <>{children}</>
}