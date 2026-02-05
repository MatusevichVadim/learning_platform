import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Home from './pages/Home'
import LanguageSelect from './pages/LanguageSelect'
import Lessons from './pages/Lessons'
import LessonDetail from './pages/LessonDetail'
import CompetitionRoom from './pages/CompetitionRoom'
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import UserSubmissions from './pages/admin/UserSubmissions'
import ProtectedRoute from './components/ProtectedRoute'
import UserProtectedRoute from './components/UserProtectedRoute'

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  {
    path: '/languages',
    element: (
      <UserProtectedRoute>
        <LanguageSelect />
      </UserProtectedRoute>
    )
  },
  {
    path: '/lessons/:language',
    element: (
      <UserProtectedRoute>
        <Lessons />
      </UserProtectedRoute>
    )
  },
  {
    path: '/lesson/:language/:lessonId',
    element: (
      <UserProtectedRoute>
        <LessonDetail />
      </UserProtectedRoute>
    )
  },
  {
    path: '/competition',
    element: (
      <UserProtectedRoute>
        <CompetitionRoom />
      </UserProtectedRoute>
    )
  },
  { path: '/admin/login', element: <AdminLogin /> },
  {
    path: '/admin',
    element: (
      <ProtectedRoute>
        <AdminDashboard />
      </ProtectedRoute>
    )
  },
  {
    path: '/admin/user/:userName/submissions',
    element: (
      <ProtectedRoute>
        <UserSubmissions />
      </ProtectedRoute>
    )
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)


