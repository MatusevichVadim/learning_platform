import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { adminHeaders } from '../../api'

type Language = { id: string; name: string; is_custom: boolean; image_url?: string }

export default function LanguagesTab() {
  const [languages, setLanguages] = useState<Language[]>([])
  const [form, setForm] = useState({ id: '', name: '', image_url: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', image_url: '' })
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { refresh() }, [])

  async function refresh() {
    const res = await axios.get('/api/admin/languages', { headers: adminHeaders() })
    console.log('Languages data:', res.data)
    setLanguages(res.data)
  }

  async function create() {
    if (!form.id.trim() || !form.name.trim()) {
      alert('Заполните все поля')
      return
    }
    try {
      await axios.post('/api/admin/languages', form, { headers: adminHeaders() })
      setForm({ id: '', name: '', image_url: '' })
      await refresh()
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Ошибка при создании языка')
    }
  }

  async function remove(id: string) {
    if (!confirm('Удалить язык и все его уроки?')) return
    try {
      await axios.delete(`/api/admin/languages/${id}`, { headers: adminHeaders() })
      await refresh()
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Ошибка при удалении языка')
    }
  }

  function startEdit(lang: Language) {
    setEditingId(lang.id)
    setEditForm({ name: lang.name, image_url: lang.image_url || '' })
  }

  async function saveEdit(id: string) {
    try {
      await axios.put(`/api/admin/languages/${id}`, editForm, { headers: adminHeaders() })
      setEditingId(null)
      await refresh()
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Ошибка при сохранении')
    }
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm({ name: '', image_url: '' })
  }

  async function handleFileUpload(langId: string, file: File) {
    if (!file) return
    
    const formData = new FormData()
    formData.append('file', file)
    
    setUploadingId(langId)
    try {
      const response = await axios.post(`/api/admin/languages/${langId}/upload-image`, formData, {
        headers: {
          ...adminHeaders(),
          'Content-Type': 'multipart/form-data'
        }
      })
      console.log('Upload response:', response.data)
      // Update editForm with the new image_url so it doesn't get overwritten on save
      if (response.data.image_url) {
        setEditForm(prev => ({ ...prev, image_url: response.data.image_url }))
      }
      await refresh()
    } catch (error: any) {
      console.error('Upload error:', error.response?.data || error)
      alert(error.response?.data?.detail || 'Ошибка при загрузке изображения')
    } finally {
      setUploadingId(null)
    }
  }

  function triggerFileInput(langId: string) {
    setUploadingId(langId)
    fileInputRef.current?.click()
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file && uploadingId) {
      handleFileUpload(uploadingId, file)
    }
    // Reset input
    e.target.value = ''
  }

  return (
    <div>
      {/* Hidden file input for upload */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        onChange={onFileSelected}
      />

      <h3>Создать язык программирования</h3>
      <div className="form-grid" style={{ gridTemplateColumns: '1fr 2fr 2fr auto' }}>
        <input
          className="input"
          value={form.id}
          onChange={e => setForm({ ...form, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
          placeholder="Идентификатор (например: mylang)"
        />
        <input
          className="input"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          placeholder="Название (например: My Language)"
        />
        <input
          className="input"
          value={form.image_url}
          onChange={e => setForm({ ...form, image_url: e.target.value })}
          placeholder="URL изображения (опционально)"
        />
        <button className="btn" onClick={create}>Создать</button>
      </div>

      <h3 style={{ marginTop: 16 }}>Список языков</h3>
      <table style={{
        width: '100%',
        backgroundColor: '#1a1a2e',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        border: '1px solid #243049'
      }}>
        <thead>
          <tr style={{
            backgroundColor: '#16213e',
            borderBottom: '1px solid #243049'
          }}>
            <th style={{
              padding: '12px 16px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              textAlign: 'left'
            }}>Идентификатор</th>
            <th style={{
              padding: '12px 16px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              textAlign: 'left'
            }}>Название</th>
            <th style={{
              padding: '12px 16px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              textAlign: 'left'
            }}>Изображение</th>
            <th style={{
              padding: '12px 16px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              textAlign: 'left'
            }}>Тип</th>
            <th style={{
              padding: '12px 16px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              textAlign: 'left'
            }}>Действия</th>
          </tr>
        </thead>
        <tbody>
          {languages.map(lang => (
            <tr key={lang.id} style={{
              borderBottom: '1px solid #243049'
            }}>
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px'
              }}>
                {lang.id}
              </td>
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px'
              }}>
                {editingId === lang.id ? (
                  <input
                    className="input"
                    value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    style={{ padding: '4px 8px', fontSize: '14px' }}
                  />
                ) : (
                  lang.name
                )}
              </td>
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px'
              }}>
                {editingId === lang.id ? (
                  <div>
                    <input
                      className="input"
                      value={editForm.image_url}
                      onChange={e => setEditForm({ ...editForm, image_url: e.target.value })}
                      placeholder="URL изображения"
                      style={{ padding: '4px 8px', fontSize: '14px', marginBottom: '8px' }}
                    />
                    <button
                      className="btn small"
                      onClick={() => triggerFileInput(lang.id)}
                      disabled={uploadingId === lang.id}
                      style={{
                        backgroundColor: uploadingId === lang.id ? '#6c757d' : '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '12px',
                        cursor: uploadingId === lang.id ? 'not-allowed' : 'pointer',
                        width: '100%'
                      }}
                    >
                      {uploadingId === lang.id ? '⏳ Загрузка...' : '📁 Загрузить с диска'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {lang.image_url ? (
                      <img 
                        src={lang.image_url} 
                        alt={lang.name}
                        style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '4px' }}
                      />
                    ) : (
                      <span style={{ color: '#6c757d' }}>Нет изображения</span>
                    )}
                  </div>
                )}
              </td>
              <td style={{
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px'
              }}>
                {lang.is_custom ? 'Пользовательский' : 'Встроенный'}
              </td>
              <td style={{
                padding: '12px 16px'
              }}>
                {editingId === lang.id ? (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className="btn small"
                      onClick={() => saveEdit(lang.id)}
                      style={{
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                      title="Сохранить"
                    >
                      ✓
                    </button>
                    <button
                      className="btn small"
                      onClick={cancelEdit}
                      style={{
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                      title="Отмена"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className="btn small"
                      onClick={() => startEdit(lang)}
                      style={{
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                      title="Редактировать"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn small"
                      onClick={() => remove(lang.id)}
                      style={{
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                      title="Удалить язык"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
