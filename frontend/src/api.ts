import axios from 'axios'

// Send cookies (the auth token is stored in an httpOnly cookie, not localStorage)
// on every request, including raw `axios.*` calls used across the admin pages.
axios.defaults.withCredentials = true

export const api = axios.create({ baseURL: '/api', withCredentials: true })

// Response interceptor to handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Don't force a redirect when the failed request is the login attempt
      // itself — that case must be handled locally (show an error message)
      // instead of bouncing the user to the login page.
      const url = error.config?.url || ''
      if (!url.includes('/auth/login')) {
        localStorage.removeItem('user')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export type User = { id: number; username: string; full_name?: string; role: string; is_active: boolean; rating?: number; rating_bonus?: number }

export async function login(username: string, password: string) {
  const res = await api.post<{ user: User; access_token: string; token_type: string; role: string }>('/auth/login', { username, password })
  // The JWT is set as an httpOnly cookie by the backend; only persist the
  // non-sensitive user object (used for role-based UI routing).
  localStorage.setItem('user', JSON.stringify(res.data.user))
  return res.data
}

export async function logout() {
  try {
    await api.post('/auth/logout')
  } catch {
    // ignore network errors on logout
  }
  localStorage.removeItem('user')
}

export async function listLanguages() {
  const res = await api.get('/languages')
  return res.data as Array<{ id: string; name: string; image_url?: string }>
}

export async function listLessons(language: string) {
  const res = await api.get('/lessons', { params: { language } })
  return res.data as Array<{ id: number; title: string; order_index: number }>
}

export async function getLesson(lessonId: number) {
  const res = await api.get(`/lessons/${lessonId}`)
  return res.data as { id: number; title: string; order_index: number }
}

export async function listTasks(lessonId: number) {
  const res = await api.get(`/lessons/${lessonId}/tasks`)
  return res.data as Array<{ id: number; title: string; description: string; kind: string }>
}

export async function getTask(taskId: number) {
  const res = await api.get(`/tasks/${taskId}`)
  return res.data as { id: number; title: string; description: string; kind: string; rating?: number }
}

export async function lessonStatus(lessonId: number) {
  const res = await api.get(`/lessons/${lessonId}/status`)
  return res.data as Record<string, boolean | null>
}

export async function submitQuiz(taskId: number, answer: string) {
  const res = await api.post(`/tasks/${taskId}/submit-quiz`, { answer })
  return res.data
}

export async function submitCode(taskId: number, code: string) {
  const res = await api.post(`/tasks/${taskId}/submit-code`, { code })
  return res.data
}

export function authHeaders() {
  // Auth is handled via the httpOnly cookie (sent automatically with
  // withCredentials). This helper is kept for call-site compatibility.
  return {}
}

export async function adminUsers(params?: { search?: string; sort_by?: string; order?: string }) {
  const res = await api.get('/admin/users', { params })
  return res.data
}

export async function createUser(data: { username: string; password: string; full_name?: string; role: string }) {
  const res = await api.post('/admin/users', data)
  return res.data
}

export async function resetUserPassword(userId: number, password: string) {
  const res = await api.put(`/admin/users/${userId}/reset-password`, { password })
  return res.data
}

export async function toggleUserStatus(userId: number) {
  const res = await api.put(`/admin/users/${userId}/status`)
  return res.data
}

export async function deleteUser(userId: number) {
  const res = await api.delete(`/admin/users/${userId}`)
  return res.data
}

export async function updateUser(userId: number, data: { full_name?: string; role?: string; is_active?: boolean; rating_bonus?: number }) {
  const res = await api.put(`/admin/users/${userId}`, data)
  return res.data
}

export async function leaderboard() {
  const res = await api.get('/leaderboard')
  return res.data as Array<{ id: number; username: string; full_name: string; rating: number; rating_bonus: number }>
}

export async function adminUserCard(userId: number, params?: { search?: string; sort_by?: string; order?: string }) {
  const res = await api.get(`/admin/users/${userId}/card`, { params })
  return res.data as {
    user: { id: number; username: string; full_name?: string; role: string; is_active: boolean; created_at: string; rating?: number; rating_bonus?: number; rank?: number }
    stats: {
      total_submissions: number
      correct_submissions: number
      pending_submissions: number
      solved_tasks: number
      solved_code_tasks: number
      solved_quiz_tasks: number
      attempted_tasks: number
      success_rate: number
    }
    submissions: Array<{
      id: number
      lesson_id: number
      lesson_title: string
      language: string
      task_id: number
      task_title: string
      is_correct: boolean
      result: string
      status: string
      code?: string
      created_at: string
    }>
    lesson_progress: Array<{
      lesson_id: number
      lesson_title: string
      language: string
      total_tasks: number
      solved_tasks: number
    }>
  }
}

export async function adminSubmissions() {
  const res = await api.get('/admin/submissions')
  return res.data
}

export async function getTaskSubmission(taskId: number) {
  const res = await api.get(`/tasks/${taskId}/submission`)
  return res.data
}

// Profile API
export async function getProfileSummary() {
  const res = await api.get('/profile/summary')
  return res.data as {
    total_solved: number
    total_submissions: number
    success_rate: number
    languages_progress: Record<string, { solved: number }>
  }
}

export async function getProfileSubmissions(params: { status?: string; language?: string; page?: number; page_size?: number }) {
  const res = await api.get('/profile/submissions', { params })
  return res.data as { data: any[]; total: number; page: number; page_size: number }
}

export async function getProfileSubmissionDetail(submissionId: number) {
  const res = await api.get(`/profile/submissions/${submissionId}`)
  return res.data as {
    id: number
    task_id: number
    task_title: string
    lesson_title: string
    language: string
    code?: string
    answer?: string
    is_correct: boolean
    result?: string | object
    status: string
    created_at: string
  }
}

export async function getMyCard(params?: { search?: string; sort_by?: string; order?: string }) {
  const res = await api.get('/profile/card', { params })
  return res.data as {
    user: { id: number; username: string; full_name?: string; role: string; is_active: boolean; created_at: string; rating?: number; rating_bonus?: number; rank?: number }
    stats: {
      total_submissions: number
      correct_submissions: number
      pending_submissions: number
      solved_tasks: number
      solved_code_tasks: number
      solved_quiz_tasks: number
      attempted_tasks: number
      success_rate: number
    }
    submissions: Array<{
      id: number
      lesson_id: number
      lesson_title: string
      language: string
      task_id: number
      task_title: string
      is_correct: boolean
      result: string
      status: string
      code?: string
      created_at: string
    }>
    lesson_progress: Array<{
      lesson_id: number
      lesson_title: string
      language: string
      total_tasks: number
      solved_tasks: number
    }>
  }
}
