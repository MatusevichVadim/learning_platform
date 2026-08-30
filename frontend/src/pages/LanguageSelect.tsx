import { useEffect, useState } from 'react'
import { listLanguages } from '../api'
import { useNavigate } from 'react-router-dom'
import UserCardButton from '../components/UserCardButton'
import LeaderboardModal from '../components/LeaderboardModal'

type Language = { id: string; name: string; image_url?: string }

export default function LanguageSelect() {
  const [langs, setLangs] = useState<Language[]>([])
  const [userName, setUserName] = useState<string>(localStorage.getItem('user_name') || '')
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    listLanguages().then(setLangs)
  }, [])

  const handleChangeName = () => {
    navigate('/')
  }

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 className="title" style={{ margin: 0 }}>{'Выберите язык'}</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <UserCardButton inline />
            <button
              className="btn"
              onClick={() => setShowLeaderboard(true)}
              style={{ backgroundColor: '#f39c12', color: '#000', fontSize: '14px', padding: '8px 16px' }}
            >
              Лидерборд
            </button>
            <button
              className="btn"
              onClick={handleChangeName}
              style={{ backgroundColor: '#dc3545', color: 'white', fontSize: '14px', padding: '8px 16px' }}
            >
              Выход
            </button>
          </div>
        </div>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(5, 1fr)', 
          gap: '30px',
          marginBottom: '24px'
        }}>
          {langs.map(l => (
            <div 
              key={l.id} 
              onClick={() => navigate(`/lessons/${l.id}`)}
              style={{
                backgroundColor: '#1a1a2e',
                border: '1px solid #243049',
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                minHeight: '140px',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.borderColor = '#3dd179'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(61, 209, 121, 0.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.borderColor = '#243049'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {l.image_url ? (
                <img 
                  src={l.image_url} 
                  alt={l.name}
                  style={{ 
                    width: '100px', 
                    height: '100px', 
                    objectFit: 'contain',
                    borderRadius: '8px'
                  }}
                />
              ) : (
                <div style={{
                  width: '100px',
                  height: '100px',
                  borderRadius: '8px',
                  backgroundColor: '#243049',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  color: '#3dd179'
                }}>
                  {'</>'}
                </div>
              )}
              <span style={{
                fontSize: '18px',
                fontWeight: '600',
                color: '#e6edf3',
                textAlign: 'center'
              }}>
                {l.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {showLeaderboard && <LeaderboardModal onClose={() => setShowLeaderboard(false)} />}
    </div>
  )
}
