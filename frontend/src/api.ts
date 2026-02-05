import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export type User = { id: number; name: string; is_admin: boolean }

export async function enter(name: string) {
  const res = await api.post<{ user: User; access_token: string; token_type: string }>('/enter', { name })
  localStorage.setItem('token', res.data.access_token)
  localStorage.setItem('user', JSON.stringify(res.data.user))
  return res.data.user
}

export function authHeaders() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function listLanguages() {
  const res = await api.get('/languages')
  return res.data as Array<{ id: string; name: string; image_url?: string }>
}

export async function listLessons(language: string) {
  const res = await api.get('/lessons', { params: { language } })
  return res.data as Array<{ id: number; title: string; order_index: number }>
}

export async function listTasks(lessonId: number) {
  const res = await api.get(`/lessons/${lessonId}/tasks`)
  return res.data as Array<{ id: number; title: string; description: string; kind: string }>
}

export async function getTask(taskId: number) {
  const res = await api.get(`/tasks/${taskId}`)
  return res.data as { id: number; title: string; description: string; kind: string }
}

export async function lessonStatus(lessonId: number) {
  const res = await api.get(`/lessons/${lessonId}/status`, { headers: authHeaders() })
  return res.data as Record<string, boolean | null>
}

export async function submitQuiz(taskId: number, answer: string) {
  const res = await api.post(`/tasks/${taskId}/submit-quiz`, { answer }, { headers: authHeaders() })
  return res.data
}

export async function submitCode(taskId: number, code: string) {
  const res = await api.post(`/tasks/${taskId}/submit-code`, { code }, { headers: authHeaders() })
  return res.data
}

export async function adminLogin(username: string, password: string) {
  const res = await api.post('/admin/login', { username, password })
  localStorage.setItem('admin_token', res.data.access_token)
  return res.data
}

export function adminHeaders() {
  const token = localStorage.getItem('admin_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function adminUsers() {
  const res = await api.get('/admin/users', { headers: adminHeaders() })
  return res.data
}

export async function adminSubmissions() {
  const res = await api.get('/admin/submissions', { headers: adminHeaders() })
  return res.data
}

export async function getTaskSubmission(taskId: number) {
  const res = await api.get(`/tasks/${taskId}/submission`, { headers: authHeaders() })
  return res.data
}


