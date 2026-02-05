import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { authHeaders } from '../api'

interface Asteroid {
  id: number
  word: string
  typedLetters: string
  x: number
  y: number
  vx: number
  vy: number
  size: number
}

export default function CompetitionRoom() {
  const [connectedUsers, setConnectedUsers] = useState<string[]>([])
  const [gameStarted, setGameStarted] = useState(false)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [timeLeft, setTimeLeft] = useState(60)
  const [roomData, setRoomData] = useState<any>(null)
  const [words, setWords] = useState<string[]>([])
  const [asteroids, setAsteroids] = useState<Asteroid[]>([])
  const [shipDisabled, setShipDisabled] = useState(false)
  const [disabledTimeLeft, setDisabledTimeLeft] = useState(0)
  const [userInput, setUserInput] = useState('')
  const [currentTargetId, setCurrentTargetId] = useState<number | null>(null)
  const [bullets, setBullets] = useState<Array<{id: number, x: number, y: number, targetX: number, targetY: number, progress: number}>>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const navigate = useNavigate()

  useEffect(() => {
    joinRoom()
    loadWords()
    const interval = setInterval(checkGameStatus, 2000) // Poll every 2 seconds
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (gameStarted) {
      startGameLoop()
      spawnAsteroids()
      const spawnInterval = setInterval(spawnAsteroids, 3000)
      return () => {
        clearInterval(spawnInterval)
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
        }
      }
    }
  }, [gameStarted])

  useEffect(() => {
    if (shipDisabled && disabledTimeLeft > 0) {
      const timer = setTimeout(() => setDisabledTimeLeft(disabledTimeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else if (disabledTimeLeft === 0) {
      setShipDisabled(false)
    }
  }, [shipDisabled, disabledTimeLeft])

  const joinRoom = async () => {
    try {
      await axios.post('/api/competition/join', {}, { headers: authHeaders() })
      loadParticipants()
    } catch (error) {
      console.error('Failed to join room:', error)
    }
  }

  const loadParticipants = async () => {
    try {
      const res = await axios.get('/api/competition/participants')
      const users = res.data.map((p: any) => p.user_name)
      const scoresObj = res.data.reduce((acc: any, p: any) => {
        acc[p.user_name] = p.score
        return acc
      }, {})
      setConnectedUsers(users)
      setScores(scoresObj)
    } catch (error) {
      console.error('Failed to load participants:', error)
    }
  }

  const loadWords = async () => {
    try {
      const res = await axios.get('/api/competition/words')
      setWords(res.data.words)
    } catch (error) {
      console.error('Failed to load words:', error)
      // Fallback words
      setWords(['hello', 'world', 'typing', 'speed', 'competition'])
    }
  }

  const checkGameStatus = async () => {
    try {
      const res = await axios.get('/api/competition/room')
      setRoomData(res.data)
      setGameStarted(res.data.is_active)
      if (res.data.is_active && !gameStarted) {
        // Game just started
        setTimeLeft(res.data.game_time)
        generateNewWord()
      }
      loadParticipants()
    } catch (error) {
      console.error('Failed to check game status:', error)
    }
  }

  useEffect(() => {
    if (gameStarted && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else if (timeLeft === 0) {
      setGameStarted(false)
    }
  }, [gameStarted, timeLeft])

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (!gameStarted || shipDisabled) return

    const char = e.key.toLowerCase()
    if (char.length !== 1 || !/[a-zа-яё]/i.test(char)) return

    // Find asteroids that need this character next
    const targetAsteroids = asteroids.filter(a => {
      const remainingWord = a.word.toLowerCase().slice(a.typedLetters.length)
      return remainingWord.startsWith(char)
    })

    if (targetAsteroids.length > 0) {
      // Target the closest asteroid
      const shipX = 400
      const shipY = 550
      let closestAsteroid = targetAsteroids[0]
      let closestDistance = Infinity

      targetAsteroids.forEach(asteroid => {
        const distance = Math.sqrt(
          Math.pow(asteroid.x - shipX, 2) + Math.pow(asteroid.y - shipY, 2)
        )
        if (distance < closestDistance) {
          closestDistance = distance
          closestAsteroid = asteroid
        }
      })

      // Update asteroid's typed letters
      setAsteroids(prev => prev.map(a =>
        a.id === closestAsteroid.id
          ? { ...a, typedLetters: a.typedLetters + char }
          : a
      ))

      // Fire bullet towards the asteroid
      const bulletId = Date.now() + Math.random()
      const newBullet = {
        id: bulletId,
        x: shipX,
        y: shipY,
        targetX: closestAsteroid.x,
        targetY: closestAsteroid.y,
        progress: 0
      }
      setBullets(prev => [...prev, newBullet])
    }
  }

  const spawnAsteroids = useCallback(() => {
    if (!gameStarted || words.length === 0) return

    const newAsteroid: Asteroid = {
      id: Date.now() + Math.random(),
      word: words[Math.floor(Math.random() * words.length)],
      typedLetters: '',
      x: Math.random() * 800,
      y: -50,
      vx: (Math.random() - 0.5) * 1, // Slower horizontal movement
      vy: Math.random() * 1 + 0.5, // Slower vertical movement
      size: 30 + Math.random() * 20
    }

    setAsteroids(prev => [...prev, newAsteroid])
  }, [gameStarted, words])

  const startGameLoop = useCallback(() => {
    const gameLoop = () => {
      setAsteroids(prev => prev.map(asteroid => ({
        ...asteroid,
        x: asteroid.x + asteroid.vx,
        y: asteroid.y + asteroid.vy
      })).filter(asteroid => asteroid.y < 650 && asteroid.x > -50 && asteroid.x < 850))

      // Update bullets
      setBullets(prev => prev.map(bullet => ({
        ...bullet,
        progress: bullet.progress + 0.05 // Bullet speed
      })).filter(bullet => bullet.progress < 1))

      // Check bullet-asteroid collisions and word completion
      setBullets(prevBullets => {
        const remainingBullets = [...prevBullets]
        setAsteroids(prevAsteroids => {
          const remainingAsteroids = [...prevAsteroids]
          remainingBullets.forEach((bullet, bulletIndex) => {
            remainingAsteroids.forEach((asteroid, asteroidIndex) => {
              const bulletX = bullet.x + (bullet.targetX - bullet.x) * bullet.progress
              const bulletY = bullet.y + (bullet.targetY - bullet.y) * bullet.progress
              const distance = Math.sqrt(
                Math.pow(asteroid.x - bulletX, 2) + Math.pow(asteroid.y - bulletY, 2)
              )
              if (distance < asteroid.size / 2) {
                // Check if word is complete
                if (asteroid.typedLetters.length + 1 >= asteroid.word.length) {
                  // Word complete! Remove asteroid
                  remainingBullets.splice(bulletIndex, 1)
                  remainingAsteroids.splice(asteroidIndex, 1)
                  destroyAsteroid(asteroid.id)
                } else {
                  // Just remove bullet, asteroid continues
                  remainingBullets.splice(bulletIndex, 1)
                }
              }
            })
          })
          return remainingAsteroids
        })
        return remainingBullets
      })

      // Check collisions with ship (bottom center)
      setAsteroids(prev => {
        const newAsteroids = [...prev]
        newAsteroids.forEach(asteroid => {
          const distance = Math.sqrt(
            Math.pow(asteroid.x - 400, 2) + Math.pow(asteroid.y - 550, 2)
          )
          if (distance < asteroid.size + 20 && !shipDisabled) { // 20 is ship radius
            setShipDisabled(true)
            setDisabledTimeLeft(roomData?.difficulty * 2 || 4) // Disable time based on difficulty
          }
        })
        return newAsteroids
      })

      animationRef.current = requestAnimationFrame(gameLoop)
    }
    gameLoop()
  }, [shipDisabled, roomData])

  const updateScore = async (newScore: number) => {
    try {
      await axios.post('/api/competition/update-score', { score: newScore }, { headers: authHeaders() })
    } catch (error) {
      console.error('Failed to update score:', error)
    }
  }

  const destroyAsteroid = (asteroidId: number) => {
    // Create explosion effect
    const asteroid = asteroids.find(a => a.id === asteroidId)
    if (asteroid) {
      // Add explosion particles (simplified)
      const explosionParticles = []
      for (let i = 0; i < 8; i++) {
        explosionParticles.push({
          x: asteroid.x,
          y: asteroid.y,
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 10,
          life: 30
        })
      }
      // In a full implementation, you'd manage particles in state
    }

    setAsteroids(prev => prev.filter(a => a.id !== asteroidId))
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const userName = user.name || 'Игрок'
    const newScore = (scores[userName] || 0) + 10
    setScores(prev => ({
      ...prev,
      [userName]: newScore
    }))
    updateScore(newScore)
  }

  if (!gameStarted) {
    return (
      <div className="container">
        <div className="card">
          <h1 className="title">Комната соревнований</h1>
          <div style={{ marginBottom: 20 }}>
            <h3>Подключенные игроки:</h3>
            <ul>
              {connectedUsers.map(user => (
                <li key={user}>{user}</li>
              ))}
            </ul>
          </div>
          <div style={{ marginBottom: 20 }}>
            <h3>Таблица результатов:</h3>
            {Object.entries(scores).map(([user, score]) => (
              <div key={user}>{user}: {score} очков</div>
            ))}
          </div>
          <p>Ожидание начала игры администратором...</p>
          <button className="btn" onClick={() => navigate('/')} style={{ marginTop: 20 }}>
            Назад
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2>Время: {timeLeft} сек</h2>
            {shipDisabled && <div style={{ color: 'red' }}>Корабль поврежден! {disabledTimeLeft} сек</div>}
          </div>
          <div>
            <h3>Ваш счет: {(() => {
               const user = JSON.parse(localStorage.getItem('user') || '{}')
               return scores[user.name] || 0
             })()}</h3>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h3>Общие результаты:</h3>
          {Object.entries(scores)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([user, score]) => (
              <div key={user} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>{user}</span>
                <span>{score}</span>
              </div>
            ))}
        </div>

        <div
          style={{
            position: 'relative',
            width: '800px',
            height: '600px',
            margin: '0 auto',
            backgroundColor: '#000011',
            border: '2px solid #243049',
            borderRadius: '8px'
          }}
          tabIndex={0}
          onKeyDown={handleKeyPress}
        >

          {/* Render asteroids */}
          {asteroids.map(asteroid => {
            const typedPart = asteroid.word.slice(0, asteroid.typedLetters.length)
            const remainingPart = asteroid.word.slice(asteroid.typedLetters.length)

            return (
              <div
                key={asteroid.id}
                style={{
                  position: 'absolute',
                  left: asteroid.x - asteroid.size/2,
                  top: asteroid.y - asteroid.size/2,
                  width: asteroid.size,
                  height: asteroid.size,
                  backgroundColor: '#8B4513',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: `${asteroid.size * 0.25}px`,
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  border: '2px solid #654321',
                  boxShadow: '0 0 10px rgba(139, 69, 19, 0.5)',
                  textAlign: 'center',
                  lineHeight: '1.2'
                }}
              >
                <span style={{ color: '#00ff00' }}>{typedPart}</span>
                <span style={{ color: 'white' }}>{remainingPart}</span>
              </div>
            )
          })}

          {/* Render bullets */}
          {bullets.map(bullet => {
            const currentX = bullet.x + (bullet.targetX - bullet.x) * bullet.progress
            const currentY = bullet.y + (bullet.targetY - bullet.y) * bullet.progress
            return (
              <div
                key={bullet.id}
                style={{
                  position: 'absolute',
                  left: currentX - 2,
                  top: currentY - 2,
                  width: 4,
                  height: 4,
                  backgroundColor: '#ffff00',
                  borderRadius: '50%',
                  boxShadow: '0 0 4px #ffff00'
                }}
              />
            )
          })}

          {/* Render spaceship (fixed at bottom center) */}
          <div
            style={{
              position: 'absolute',
              left: 380,
              top: 530,
              width: 40,
              height: 40,
              backgroundColor: shipDisabled ? '#666' : '#00ff00',
              clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
              opacity: shipDisabled ? 0.5 : 1,
              transition: 'opacity 0.3s'
            }}
          />
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <div style={{ fontSize: '1.2rem', color: '#888', marginBottom: 10 }}>
            Нажимайте клавиши для стрельбы по астероидам
          </div>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>
            Зеленый текст - уже введенные буквы, белый - оставшиеся
          </div>
        </div>
      </div>
    </div>
  )
}