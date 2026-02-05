import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { listLessons, listLanguages } from '../api'
import { t } from '../i18n'

type Language = { id: string; name: string; image_url?: string }

export default function Lessons() {
  const { language } = useParams()
  const [lessons, setLessons] = useState<Array<{ id: number; title: string; order_index: number }>>([])
  const [langInfo, setLangInfo] = useState<Language | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (language) {
      listLessons(language).then(setLessons)
      // Fetch language info to get image
      listLanguages().then(langs => {
        const found = langs.find(l => l.id === language)
        if (found) setLangInfo(found)
      })
    }
  }, [language])

  return (
    <div className="container">
      {/* Back button at the top */}
        <div style={{ marginBottom: '20px' }}>
          <button 
            className="btn"
            onClick={() => navigate('/languages')}
            style={{ backgroundColor: '#6c757d' }}
          >
            ← Назад к выбору языка
          </button>
        </div>
      <div className="card">
        

        {/* Language header with image */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', justifyContent: 'center' }}>
          {langInfo?.image_url ? (
            <img 
              src={langInfo.image_url} 
              alt={langInfo.name}
              style={{ 
                width: '50px', 
                height: '50px', 
                objectFit: 'contain',
                borderRadius: '8px'
              }}
            />
          ) : (
            <div style={{
              width: '50px',
              height: '50px',
              borderRadius: '8px',
              backgroundColor: '#243049',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              color: '#3dd179'
            }}>
              {'</>'}
            </div>
          )}
          <h1 className="title" style={{ margin: 0 }}>{t('lessons')}: {langInfo?.name || language}</h1>
        </div>
        
        {/* Lessons list as cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
          gap: '16px' 
        }}>
          {lessons.map((l, index) => (
            <div 
              key={l.id} 
              onClick={() => navigate(`/lesson/${language}/${l.id}`)}
              style={{
                backgroundColor: '#1a1a2e',
                border: '1px solid #243049',
                borderRadius: '12px',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.borderColor = '#3dd179'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(61, 209, 121, 0.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.borderColor = '#243049'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div style={{
                fontSize: '20px',
                color: '#3dd179',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                Урок {index + 1}
              </div>
              <div style={{
                fontSize: '16px',
                fontWeight: '500',
                color: '#e6edf3'
              }}>
                {l.title}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
