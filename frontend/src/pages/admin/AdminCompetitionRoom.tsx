import { useEffect, useState } from 'react'
import axios from 'axios'
import { adminHeaders } from '../../api'

type Participant = {
  id: number
  user_name: string
  score: number
  is_connected: boolean
  user_id: number
}

type Submission = {
  id: number
  task_title: string
  task_kind: string
  lesson_title: string
  code: string | null
  answer: string | null
  is_correct: boolean
  result: string | null
  status: string
  created_at: string
}

export default function AdminCompetitionRoom() {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [gameStarted, setGameStarted] = useState(false)
  const [gameTime, setGameTime] = useState(60)
  const [difficulty, setDifficulty] = useState(2)
  const [timeLeft, setTimeLeft] = useState(60)
  const [roomData, setRoomData] = useState<any>(null)
  const [selectedUser, setSelectedUser] = useState<Participant | null>(null)
  const [userSubmissions, setUserSubmissions] = useState<Submission[]>([])

  useEffect(() => {
    loadRoomData()
    loadParticipants()
  }, [])

  const loadRoomData = async () => {
    try {
      const res = await axios.get('/api/admin/competition/room', { headers: adminHeaders() })
      setRoomData(res.data)
      setGameTime(res.data.game_time)
      setDifficulty(res.data.difficulty)
      setGameStarted(res.data.is_active)
    } catch (error) {
      console.error('Failed to load room data:', error)
    }
  }

  const loadParticipants = async () => {
    try {
      const res = await axios.get('/api/admin/competition/participants', { headers: adminHeaders() })
      setParticipants(res.data)
    } catch (error) {
      console.error('Failed to load participants:', error)
    }
  }

  const loadUserSubmissions = async (userId: number) => {
    try {
      const res = await axios.get(`/api/admin/competition/participants/${userId}/submissions`, { headers: adminHeaders() })
      setUserSubmissions(res.data)
    } catch (error) {
      console.error('Failed to load user submissions:', error)
    }
  }

  const onUserClick = (participant: Participant) => {
    setSelectedUser(participant)
    loadUserSubmissions(participant.user_id)
  }

  useEffect(() => {
    if (gameStarted && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else if (timeLeft === 0) {
      setGameStarted(false)
    }
  }, [gameStarted, timeLeft])

  const startGame = async () => {
    try {
      await axios.put('/api/admin/competition/room', {
        game_time: gameTime,
        difficulty: difficulty,
        is_active: true
      }, { headers: adminHeaders() })
      await axios.post('/api/admin/competition/start', {}, { headers: adminHeaders() })
      setGameStarted(true)
      setTimeLeft(gameTime)
      loadParticipants()
    } catch (error) {
      console.error('Failed to start game:', error)
      alert('Ошибка при запуске игры')
    }
  }

  const stopGame = async () => {
    try {
      await axios.post('/api/admin/competition/stop', {}, { headers: adminHeaders() })
      setGameStarted(false)
      loadParticipants()
    } catch (error) {
      console.error('Failed to stop game:', error)
      alert('Ошибка при остановке игры')
    }
  }

  const resetGame = () => {
    setGameStarted(false)
    setTimeLeft(gameTime)
  }

  return (
    <div>
      <h3>Комната соревнований (Админ)</h3>

      {!gameStarted ? (
        <div style={{ marginBottom: 20 }}>
          <h4>Настройки игры</h4>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16 }}>
            <div>
              <label>Время (сек): </label>
              <input
                type="number"
                value={gameTime}
                onChange={(e) => setGameTime(parseInt(e.target.value) || 60)}
                min={10}
                max={300}
                style={{ width: 80, marginLeft: 8 }}
              />
            </div>
            <div>
              <label>Сложность (1-5): </label>
              <input
                type="number"
                value={difficulty}
                onChange={(e) => setDifficulty(parseInt(e.target.value) || 2)}
                min={1}
                max={5}
                style={{ width: 60, marginLeft: 8 }}
              />
            </div>
          </div>
          <button className="btn" onClick={startGame} style={{ marginRight: 10 }}>
            Запустить игру
          </button>
          <button className="btn" onClick={resetGame}>
            Сбросить
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <h4>Игра идет!</h4>
          <p>Осталось времени: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</p>
          <button className="btn" onClick={stopGame}>
            Остановить игру
          </button>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <h4>Подключенные пользователи:</h4>
        <ul>
          {participants.map(p => (
            <li key={p.id}>{p.user_name} {p.is_connected ? '(online)' : '(offline)'}</li>
          ))}
        </ul>
      </div>

      <div>
        <h4>Таблица результатов:</h4>
        <div style={{
          backgroundColor: '#1a1a2e',
          borderRadius: '8px',
          padding: '16px',
          border: '1px solid #243049'
        }}>
          {participants
            .sort((a, b) => b.score - a.score)
            .map((participant, index) => (
              <div
                key={participant.id}
                onClick={() => onUserClick(participant)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: index < participants.length - 1 ? '1px solid #243049' : 'none',
                  cursor: 'pointer'
                }}
              >
                <span style={{ color: '#ffffff', textDecoration: 'underline' }}>{participant.user_name}</span>
                <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{participant.score}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Modal for user submissions */}
      {selectedUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setSelectedUser(null)}>
          <div style={{
            backgroundColor: '#1a1a2e',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid #243049',
            maxWidth: '800px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Решения пользователя: {selectedUser.user_name}</h3>
              <button
                onClick={() => setSelectedUser(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '24px',
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>

            {userSubmissions.length === 0 ? (
              <p>Нет отправленных решений</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {userSubmissions.map((submission) => (
                  <div key={submission.id} style={{
                    backgroundColor: '#0d1117',
                    borderRadius: '8px',
                    padding: '16px',
                    border: '1px solid #243049'
                  }}>
                    <div style={{ marginBottom: '8px' }}>
                      <strong>Урок:</strong> {submission.lesson_title}
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <strong>Задача:</strong> {submission.task_title}
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <strong>Тип:</strong> {submission.task_kind === 'code' ? 'Код' : 'Тест'}
                      {' | '}
                      <strong>Статус:</strong> {submission.status === 'completed' ? 'Проверено' : 'Ожидает'}
                      {' | '}
                      <strong>Результат:</strong>{' '}
                      <span style={{ color: submission.is_correct ? '#3dd179' : '#f85149' }}>
                        {submission.is_correct ? 'Верно' : 'Неверно'}
                      </span>
                    </div>
                    {submission.task_kind === 'code' && submission.code && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>Отправленный код:</div>
                        <pre style={{
                          backgroundColor: '#161b22',
                          padding: '12px',
                          borderRadius: '6px',
                          overflow: 'auto',
                          fontSize: '13px',
                          lineHeight: '1.5',
                          margin: 0,
                          border: '1px solid #30363d'
                        }}>
                          <code>{submission.code}</code>
                        </pre>
                      </div>
                    )}
                    {submission.answer && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>Ответ:</div>
                        <div style={{
                          backgroundColor: '#161b22',
                          padding: '12px',
                          borderRadius: '6px',
                          border: '1px solid #30363d'
                        }}>
                          {submission.answer}
                        </div>
                      </div>
                    )}
                    {submission.result && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>Результат проверки:</div>
                        <pre style={{
                          backgroundColor: '#161b22',
                          padding: '12px',
                          borderRadius: '6px',
                          overflow: 'auto',
                          fontSize: '12px',
                          lineHeight: '1.4',
                          margin: 0,
                          border: '1px solid #30363d',
                          color: '#8b949e'
                        }}>
                          {submission.result}
                        </pre>
                      </div>
                    )}
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#8b949e' }}>
                      Отправлено: {new Date(submission.created_at).toLocaleString('ru-RU')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
