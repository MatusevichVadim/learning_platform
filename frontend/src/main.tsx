import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Home from './pages/Home'
import LanguageSelect from './pages/LanguageSelect'
import Lessons from './pages/Lessons'
import LessonDetail from './pages/LessonDetail'
import Login from './pages/Login'
import AdminDashboard from './pages/admin/AdminDashboard'
import UserSubmissions from './pages/admin/UserSubmissions'
import Profile from './pages/Profile'
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
    path: '/profile',
    element: (
      <UserProtectedRoute>
        <Profile />
      </UserProtectedRoute>
    )
  },
  { path: '/login', element: <Login /> },
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
      <UserProtectedRoute>
        <UserSubmissions />
      </UserProtectedRoute>
    )
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
