import { useEffect, useState } from 'react'
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { WorkoutSession, WorkoutGroup, PersonalWorkout, Exercise } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Weight, Clock, Activity, Loader2, ChevronDown, Dumbbell } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatDuration } from '@/lib/utils'

export function ProgressPage() {
  const { appUser } = useAuth()
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [loading, setLoading] = useState(true)

  const [groupsData, setGroupsData] = useState<(WorkoutGroup | PersonalWorkout)[]>([])

  useEffect(() => {
    if (!appUser) return
    const load = async () => {
      try {
        const q = query(
          collection(db, 'sessions'),
          where('userId', '==', appUser.uid),
          orderBy('createdAt', 'asc')
        )
        const snap = await getDocs(q)
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkoutSession)))

        // Load personal workout
        const personalWorkoutSnap = await getDoc(doc(db, 'personalWorkouts', appUser.uid))
        let pw = null
        if (personalWorkoutSnap.exists()) {
          pw = { id: personalWorkoutSnap.id, isPersonal: true, ...personalWorkoutSnap.data() } as PersonalWorkout & {isPersonal: boolean}
        }
        
        // Load personal groups created by AI
        const pgQuery = query(collection(db, 'workoutGroups'), where('ownerId', '==', appUser.uid))
        const pgSnap = await getDocs(pgQuery)
        const personalGroups = pgSnap.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutGroup))
        
        // Load assigned groups
        const { assignedGroupIds = [] } = appUser
        const validGroupIds = assignedGroupIds.filter((id: string) => id && id.trim() !== '')
        const groupsPromises = validGroupIds.map((groupId: string) => getDoc(doc(db, 'workoutGroups', groupId)))
        const groupsSnaps = await Promise.all(groupsPromises)
        const loadedGroups = groupsSnaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() } as WorkoutGroup))
        
        setGroupsData(pw ? [pw, ...personalGroups, ...loadedGroups] : [...personalGroups, ...loadedGroups])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [appUser])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  // Prepare chart data
  const chartData = sessions
    .filter((s) => s.date && typeof s.date.toDate === 'function')
    .map((s) => ({
      date: format(s.date.toDate(), 'dd/MM', { locale: ptBR }),
      peso: s.bodyWeightKg || 0,
      duracao: s.durationMinutes || 0,
      grupo: s.groupName,
    }))

  // Summary stats
  const totalSessions = sessions.length
  const totalMinutes = sessions.reduce((a, s) => a + (s.durationMinutes || 0), 0)
  const firstWeight = sessions.length > 0 ? sessions[0].bodyWeightKg : 0
  const lastWeight = sessions[sessions.length - 1]?.bodyWeightKg || 0
  const weightDiff = lastWeight - firstWeight

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary" />
          Meu Progresso
        </h1>
        <p className="text-muted-foreground mt-1">
          Acompanhe sua evolução ao longo do tempo
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Treinos</span>
            </div>
            <p className="text-2xl font-bold text-primary">{totalSessions}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Tempo total</span>
            </div>
            <p className="text-2xl font-bold text-blue-400">{formatDuration(totalMinutes)}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Weight className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-muted-foreground">Peso atual</span>
            </div>
            <p className="text-2xl font-bold text-purple-400">{lastWeight || '—'}kg</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-muted-foreground">Variação peso</span>
            </div>
            <p className={`text-2xl font-bold ${weightDiff < 0 ? 'text-primary' : weightDiff > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
              {weightDiff !== 0 ? `${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)}kg` : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {sessions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30 text-muted-foreground" />
            <p className="text-muted-foreground">
              Nenhum treino registrado ainda.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Complete seu primeiro treino para ver seu progresso aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Evolução de Carga por Exercício */}
          <Card className="border-border/50 mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-primary" />
                Evolução de Carga por Exercício
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {groupsData.map((group) => (
                <details key={group.id} className="group border border-border/50 rounded-lg bg-card overflow-hidden">
                  <summary className="flex justify-between items-center font-medium cursor-pointer list-none [&::-webkit-details-marker]:hidden p-4 bg-secondary/20 hover:bg-secondary/40 transition-colors">
                    <span className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-lg" style={{ backgroundColor: (group as any).colorHex || '#a855f7' }} />
                      {group.name}
                    </span>
                    <span className="transition group-open:rotate-180">
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    </span>
                  </summary>
                  <div className="p-4 bg-background space-y-4 border-t border-border/50">
                    {group.exercises?.map((ex, i) => {
                      const exId = ex.id || `${group.id}-${i}`
                      const groupSessions = sessions.filter(s => s.groupId === group.id || s.personalWorkoutId === group.id)
                      const exProgress = groupSessions
                        .filter(s => s.date && typeof s.date.toDate === 'function' && s.exerciseWeights?.[exId] !== undefined)
                        .map(s => ({
                          date: format(s.date.toDate(), 'dd/MM', { locale: ptBR }),
                          peso: s.exerciseWeights![exId]
                        }))

                      if (exProgress.length === 0) return null

                      return (
                        <details key={exId} className="group/ex border border-border/30 rounded-lg overflow-hidden">
                          <summary className="flex justify-between items-center cursor-pointer list-none [&::-webkit-details-marker]:hidden p-3 bg-secondary/10 hover:bg-secondary/20 transition-colors text-sm">
                            <span className="font-medium">{ex.name}</span>
                            <span className="transition group-open/ex:rotate-180">
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            </span>
                          </summary>
                          <div className="p-4 border-t border-border/30">
                            <div className="h-48 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={exProgress}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217.2 32.6% 17.5%)" />
                                  <XAxis dataKey="date" tick={{ fill: 'hsl(215 20.2% 65.1%)', fontSize: 10 }} axisLine={{ stroke: 'hsl(217.2 32.6% 17.5%)' }} />
                                  <YAxis width={30} tick={{ fill: 'hsl(215 20.2% 65.1%)', fontSize: 10 }} axisLine={{ stroke: 'hsl(217.2 32.6% 17.5%)' }} />
                                  <Tooltip contentStyle={{ backgroundColor: 'hsl(222.2 84% 6%)', border: '1px solid hsl(217.2 32.6% 17.5%)', borderRadius: '8px', color: 'hsl(210 40% 98%)' }} formatter={(value: any) => [`${value}kg`, 'Carga']} />
                                  <Line type="monotone" dataKey="peso" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} activeDot={{ r: 5 }} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </details>
                      )
                    })}
                    {group.exercises?.filter((ex, i) => {
                      const exId = ex.id || `${group.id}-${i}`
                      const groupSessions = sessions.filter(s => s.groupId === group.id || s.personalWorkoutId === group.id)
                      return groupSessions.some(s => s.exerciseWeights?.[exId] !== undefined)
                    }).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhum histórico de peso para este grupo ainda.</p>
                    )}
                  </div>
                </details>
              ))}
              {groupsData.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum grupo atribuído para mostrar evolução.</p>
              )}
            </CardContent>
          </Card>

          {/* Weight chart */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Weight className="w-4 h-4 text-purple-400" />
                Evolução do Peso Corporal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217.2 32.6% 17.5%)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'hsl(215 20.2% 65.1%)', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(217.2 32.6% 17.5%)' }}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fill: 'hsl(215 20.2% 65.1%)', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(217.2 32.6% 17.5%)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(222.2 84% 6%)',
                      border: '1px solid hsl(217.2 32.6% 17.5%)',
                      borderRadius: '8px',
                      color: 'hsl(210 40% 98%)',
                    }}
                    formatter={(value) => [`${value}kg`, 'Peso']}
                  />
                  <Line
                    type="monotone"
                    dataKey="peso"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={{ fill: '#a855f7', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Duration chart */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                Duração dos Treinos (minutos)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217.2 32.6% 17.5%)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'hsl(215 20.2% 65.1%)', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(217.2 32.6% 17.5%)' }}
                  />
                  <YAxis
                    tick={{ fill: 'hsl(215 20.2% 65.1%)', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(217.2 32.6% 17.5%)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(222.2 84% 6%)',
                      border: '1px solid hsl(217.2 32.6% 17.5%)',
                      borderRadius: '8px',
                      color: 'hsl(210 40% 98%)',
                    }}
                    formatter={(value) => [`${value}min`, 'Duração']}
                  />
                  <Bar dataKey="duracao" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Session history */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Histórico completo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...sessions].reverse().map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-sm">{session.groupName}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.date && typeof session.date.toDate === 'function'
                        ? format(session.date.toDate(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                        : '—'}
                    </p>
                    {session.notes && (
                      <p className="text-xs text-muted-foreground/70 mt-1 italic line-clamp-1">
                        "{session.notes}"
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary">{formatDuration(session.durationMinutes)}</Badge>
                    <Badge variant="outline">{session.bodyWeightKg}kg</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
