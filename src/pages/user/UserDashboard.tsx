import { useEffect, useState } from 'react'
import { collection, getDocs, doc, getDoc, query, where, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { PersonalWorkout, WorkoutGroup, WorkoutSession } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { WorkoutRegistrationDialog } from '@/components/user/WorkoutRegistrationDialog'
import {
  Dumbbell,
  Calendar,
  TrendingUp,
  Clock,
  Weight,
  ChevronRight,
  Play,
  Flame,
  Loader2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { formatDate, formatDuration } from '@/lib/utils'

export function UserDashboard() {
  const { appUser } = useAuth()
  const navigate = useNavigate()
  const [todayGroup, setTodayGroup] = useState<WorkoutGroup | null>(null)
  const [assignedGroups, setAssignedGroups] = useState<WorkoutGroup[]>([])
  const [personalWorkout, setPersonalWorkout] = useState<PersonalWorkout | null>(null)
  const [recentSessions, setRecentSessions] = useState<WorkoutSession[]>([])
  const [streak, setStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!appUser) {
      setLoading(false)
      return
    }

    const loadDashboard = async () => {
      try {
        const personalWorkoutSnapshot = await getDoc(doc(db, 'personalWorkouts', appUser.uid))
        if (personalWorkoutSnapshot.exists()) {
          setPersonalWorkout({ id: personalWorkoutSnapshot.id, ...personalWorkoutSnapshot.data() } as PersonalWorkout)
        } else {
          setPersonalWorkout(null)
        }

        // Load today's group based on rotation
        const { assignedGroupIds = [], currentGroupIndex = 0 } = appUser
        const validGroupIds = assignedGroupIds.filter((id: string) => id && id.trim() !== '')

        if (validGroupIds.length > 0) {
          const groupSnapshots = await Promise.all(
            validGroupIds.map((groupId: string) => getDoc(doc(db, 'workoutGroups', groupId)))
          )
          const groups = groupSnapshots
            .filter((snapshot) => snapshot.exists())
            .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as WorkoutGroup))
          setAssignedGroups(groups)

          const groupId = validGroupIds[currentGroupIndex % validGroupIds.length]
          setTodayGroup(groups.find((group) => group.id === groupId) ?? groups[0] ?? null)
        }

        // Load recent sessions — orderBy('createdAt') requires composite index
        // Fallback to simple query if index not ready
        try {
          const sessionsQuery = query(
            collection(db, 'sessions'),
            where('userId', '==', appUser.uid),
            orderBy('createdAt', 'desc'),
            limit(5)
          )
          const sessionsSnap = await getDocs(sessionsQuery)
          const sessions = sessionsSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as WorkoutSession[]
          setRecentSessions(sessions)

          // Calculate streak
          let streakCount = 0
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          for (let i = 0; i < sessions.length; i++) {
            const sessionDate = sessions[i].date?.toDate?.()
            if (!sessionDate) break
            sessionDate.setHours(0, 0, 0, 0)
            const expected = new Date(today)
            expected.setDate(today.getDate() - i)
            if (sessionDate.getTime() === expected.getTime()) streakCount++
            else break
          }
          setStreak(streakCount)
        } catch (sessionErr) {
          // Index not ready yet — load without orderBy
          console.warn('[Dashboard] Índice Firestore não pronto, carregando sem ordenação:', sessionErr)
          const simpleQuery = query(
            collection(db, 'sessions'),
            where('userId', '==', appUser.uid),
            limit(5)
          )
          const sessionsSnap = await getDocs(simpleQuery)
          setRecentSessions(
            sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as WorkoutSession[]
          )
        }
      } catch (err) {
        console.error('[Dashboard] Erro ao carregar:', err)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [appUser, refreshKey])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const activeWorkout = personalWorkout ?? todayGroup
  const totalExercises = activeWorkout?.exercises?.length || 0
  const latestWeight = recentSessions[0]?.bodyWeightKg || 0

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">
          Olá, {appUser?.name?.split(' ')[0] || 'Atleta'} 💪
        </h1>
        <p className="text-muted-foreground mt-1">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="border-border/50 bg-gradient-to-br from-orange-500/10 to-orange-600/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-muted-foreground">Sequência</span>
            </div>
            <p className="text-3xl font-bold text-orange-400">{streak}</p>
            <p className="text-xs text-muted-foreground">dias seguidos</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-blue-500/10 to-blue-600/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Weight className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Último peso</span>
            </div>
            <p className="text-3xl font-bold text-blue-400">{latestWeight || '—'}</p>
            <p className="text-xs text-muted-foreground">kg</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-primary/10 to-emerald-600/5 col-span-2 sm:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Treinos totais</span>
            </div>
            <p className="text-3xl font-bold text-primary">{recentSessions.length}</p>
            <p className="text-xs text-muted-foreground">registrados</p>
          </CardContent>
        </Card>
      </div>

      {/* Today's workout */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-card to-emerald-950/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <CardTitle className="text-lg">Treino de Hoje</CardTitle>
            </div>
            {activeWorkout && (
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: personalWorkout ? '#a855f7' : todayGroup?.colorHex || '#22c55e' }}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!activeWorkout ? (
            <div className="text-center py-6">
              <Dumbbell className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">
                Nenhum treino atribuído ainda.
              </p>
              <p className="text-sm text-muted-foreground">Aguarde seu treinador configurar seu plano.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold">{activeWorkout.name}</h3>
                {personalWorkout ? (
                  <p className="text-muted-foreground text-sm mt-1">✨ Plano personalizado para você</p>
                ) : todayGroup?.muscleTarget && (
                  <p className="text-muted-foreground text-sm mt-1">
                    🎯 {todayGroup.muscleTarget}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Dumbbell className="w-4 h-4" />
                  {totalExercises} exercícios
                </span>
              </div>

              {/* Exercise preview */}
              {activeWorkout.exercises?.slice(0, 3).map((ex, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {i + 1}
                  </div>
                  <span className="flex-1">{ex.name}</span>
                  <Badge variant="outline" className="text-xs">{ex.sets}x{ex.reps}</Badge>
                </div>
              ))}
              {totalExercises > 3 && (
                <p className="text-sm text-muted-foreground">
                  + {totalExercises - 3} exercícios...
                </p>
              )}

              <Button
                className="w-full font-semibold"
                onClick={() => setRegistrationOpen(true)}
              >
                <Play className="w-4 h-4" />
                Iniciar Treino
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                Últimos Treinos
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/calendar')}
                className="text-primary hover:text-primary/80"
              >
                Ver calendário
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
              >
                <div>
                  <p className="font-medium text-sm">{session.groupName}</p>
                  <p className="text-xs text-muted-foreground">
                    {session.date?.toDate
                      ? formatDate(session.date.toDate())
                      : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(session.durationMinutes)}
                  </Badge>
                  <Badge variant="outline">{session.bodyWeightKg}kg</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <WorkoutRegistrationDialog
        groups={assignedGroups}
        personalWorkout={personalWorkout}
        defaultGroupId={todayGroup?.id}
        open={registrationOpen}
        onOpenChange={setRegistrationOpen}
        onRegistered={() => setRefreshKey((value) => value + 1)}
      />

      {(assignedGroups.length > 0 || personalWorkout) && (
        <Button
          size="icon-lg"
          className="fixed bottom-6 right-6 z-40 rounded-full shadow-lg shadow-primary/30"
          onClick={() => setRegistrationOpen(true)}
          aria-label="Registrar treino"
          title="Registrar treino"
        >
          <Dumbbell className="size-5" />
        </Button>
      )}
    </div>
  )
}
