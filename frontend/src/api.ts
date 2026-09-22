import axios from 'axios'

// Base URL for the backend API. In the dev server it is proxied from /api,
// in production it is served from the same domain (via nginx) or from a
// VITE_API_BASE environment variable when building for a remote host.
const configuredApiBase = import.meta.env.VITE_API_BASE?.trim()
const normalizedApiBase = configuredApiBase?.replace(/\/+$/, '')
const API_BASE = normalizedApiBase
  ? (normalizedApiBase.endsWith('/api') ? normalizedApiBase : `${normalizedApiBase}/api`)
  : '/api'

// Send cookies (the auth token is stored in an httpOnly cookie, not localStorage)
// on every request, including raw `axios.*` calls used across the admin pages.
axios.defaults.withCredentials = true

export const api = axios.create({ baseURL: API_BASE, withCredentials: true })

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

export type User = { id: number; username: string; full_name?: string; role: string; is_active: boolean; rating?: number; rating_bonus?: number; user_class?: string }

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
  return res.data as Array<{ id: number; title: string; description: string; kind: string; rating?: number }>
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

export async function createUser(data: { username: string; password: string; full_name?: string; role: string; user_class?: string }) {
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

export async function updateUser(userId: number, data: { username?: string; full_name?: string; role?: string; is_active?: boolean; rating_bonus?: number; user_class?: string }) {
  const res = await api.put(`/admin/users/${userId}`, data)
  return res.data
}

export async function adminListLanguages() {
  const res = await api.get('/admin/languages')
  return res.data as Array<{ id: string; name: string; image_url?: string }>
}

export async function adminGetUserLanguages(userId: number) {
  const res = await api.get(`/admin/users/${userId}/languages`)
  return res.data as { user_id: number; language_ids: string[] }
}

export async function adminSetUserLanguages(userId: number, languageIds: string[]) {
  const res = await api.put(`/admin/users/${userId}/languages`, { language_ids: languageIds })
  return res.data as { user_id: number; language_ids: string[] }
}

export async function leaderboard() {
  const res = await api.get('/leaderboard')
  return res.data as Array<{ id: number; username: string; full_name: string; rating: number; rating_bonus: number; user_class?: string }>
}

export async function adminUserCard(userId: number, params?: { search?: string; sort_by?: string; order?: string }) {
  const res = await api.get(`/admin/users/${userId}/card`, { params })
  return res.data as {
    user: { id: number; username: string; full_name?: string; role: string; is_active: boolean; created_at: string; rating?: number; rating_bonus?: number; user_class?: string; rank?: number }
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
    user: { id: number; username: string; full_name?: string; role: string; is_active: boolean; created_at: string; rating?: number; rating_bonus?: number; user_class?: string; rank?: number }
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

// --- Teacher API ---

export async function teacherGetClasses() {
  const res = await api.get('/teacher/classes')
  return res.data as string[]
}

export async function teacherAssignClass(userClass: string) {
  const res = await api.post('/teacher/classes', { user_class: userClass })
  return res.data
}

export async function teacherUnassignClass(userClass: string) {
  const res = await api.delete(`/teacher/classes/${encodeURIComponent(userClass)}`)
  return res.data
}

export async function teacherListStudents(params?: { search?: string; sort_by?: string; order?: string }) {
  const res = await api.get('/teacher/students', { params })
  return res.data as Array<{
    id: number
    username: string
    full_name?: string
    user_class?: string
    is_active: boolean
    rating?: number
    rating_bonus?: number
  }>
}

export async function teacherCreateStudent(data: { username: string; password: string; full_name?: string; user_class: string }) {
  const res = await api.post('/teacher/students', data)
  return res.data
}

export async function teacherUpdateStudent(studentId: number, data: { full_name?: string; password?: string }) {
  const res = await api.put(`/teacher/students/${studentId}`, data)
  return res.data
}

export async function teacherResetStudentPassword(studentId: number, password: string) {
  const res = await api.put(`/teacher/students/${studentId}/reset-password`, { password })
  return res.data
}

export async function teacherGetStudentCard(studentId: number, params?: { search?: string; sort_by?: string; order?: string }) {
  const res = await api.get(`/teacher/students/${studentId}/card`, { params })
  return res.data as {
    user: { id: number; username: string; full_name?: string; role: string; is_active: boolean; created_at: string; rating?: number; rating_bonus?: number; user_class?: string; rank?: number }
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

export async function teacherGetStudentLanguages(studentId: number) {
  const res = await api.get(`/teacher/students/${studentId}/languages`)
  return res.data as { user_id: number; language_ids: string[] }
}

export async function teacherSetStudentLanguages(studentId: number, languageIds: string[]) {
  const res = await api.put(`/teacher/students/${studentId}/languages`, { language_ids: languageIds })
  return res.data as { user_id: number; language_ids: string[] }
}

export async function teacherListLanguages() {
  const res = await api.get('/teacher/languages')
  return res.data as Array<{ id: string; name: string; image_url?: string }>
}

export async function teacherListLessons(language: string) {
  const res = await api.get('/teacher/lessons', { params: { language } })
  return res.data as Array<{ id: number; title: string; order_index: number }>
}

export async function teacherGetLesson(lessonId: number) {
  const res = await api.get(`/teacher/lessons/${lessonId}`)
  return res.data as { id: number; title: string; order_index: number }
}

export async function teacherListTasks(lessonId: number) {
  const res = await api.get(`/teacher/lessons/${lessonId}/tasks`)
  return res.data as Array<{ id: number; title: string; description: string; kind: string; rating?: number }>
}

export async function teacherLessonStatus(lessonId: number) {
  const res = await api.get(`/teacher/lessons/${lessonId}/status`)
  return res.data as Record<string, Record<string, boolean | null>>
}

export async function teacherGetLessonAdditionalInfo(lessonId: number) {
  const res = await api.get(`/teacher/lessons/${lessonId}/additional-info`)
  return res.data as { additional_info: string }
}

export async function teacherGetTask(taskId: number) {
  const res = await api.get(`/teacher/tasks/${taskId}`)
  return res.data as { id: number; title: string; description: string; kind: string; test_spec?: string; rating?: number }
}

export async function teacherGetResults(params?: { class_filter?: string; sort_by?: string; order?: string }) {
  const res = await api.get('/teacher/results', { params })
  return res.data as {
    students: Array<{
      id: number
      username: string
      full_name?: string
      user_class?: string
      is_active: boolean
      rating?: number
      total_submissions: number
      correct_submissions: number
      solved_tasks: number
      success_rate: number
    }>
    classes: string[]
  }
}

export async function teacherGetSubmissions(params?: {
  class_filter?: string
  student_filter?: string
  lesson_filter?: string
  task_filter?: string
  status_filter?: string
  page?: number
  page_size?: number
  sort_by?: string
  order?: string
}) {
  const res = await api.get('/teacher/submissions', { params })
  return res.data as {
    data: Array<{
      id: number
      username: string
      full_name?: string
      user_class?: string
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
    total: number
    page: number
    page_size: number
  }
}

export async function teacherReviewSubmission(submissionId: number, data: { is_correct: boolean; comment?: string }) {
  const res = await api.post(`/teacher/submissions/${submissionId}/review`, data)
  return res.data
}

// --- Admin Teacher Management API ---

export async function adminTeachers() {
  const res = await api.get('/admin/teachers')
  return res.data as User[]
}

export async function adminClasses() {
  const res = await api.get('/admin/classes')
  return res.data as Array<{ user_class: string }>
}

export async function adminTeacherClasses(teacherId: number) {
  const res = await api.get(`/admin/teachers/${teacherId}/classes`)
  return res.data as { classes: string[] }
}

export async function adminAssignClassToTeacher(teacherId: number, userClass: string) {
  const res = await api.post(`/admin/teachers/${teacherId}/classes`, { user_class: userClass })
  return res.data
}

export async function adminUnassignClassFromTeacher(teacherId: number, userClass: string) {
  const res = await api.delete(`/admin/teachers/${teacherId}/classes/${encodeURIComponent(userClass)}`)
  return res.data
}
