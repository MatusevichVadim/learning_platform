import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { enter } from '../api'
import { t } from '../i18n'

export default function Home() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    await enter(name.trim())
    setLoading(false)
    navigate('/languages')
  }

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">{t('enter_by_name')}</h1>
        <form onSubmit={onSubmit}>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={t('your_name')} />
          <button className="btn" type="submit" disabled={loading} style={{ marginTop: 12 }}>{t('enter')}</button>
        </form>
        {/* <div style={{ marginTop: 24 }}>
          <a href="/admin/login">{t('admin_login')}</a>
        </div> */}
      </div>
    </div>
  )
}


