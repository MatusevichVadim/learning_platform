import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

interface UserProtectedRouteProps {
  children: React.ReactNode
}

export default function UserProtectedRoute({ children }: UserProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const user = localStorage.getItem('user')

    if (!token || !user) {
      setIsAuthenticated(false)
      return
    }

    // User has token and user data, consider authenticated
    setIsAuthenticated(true)
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
