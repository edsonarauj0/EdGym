import { useEffect, useState } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { WorkoutSession } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Layers, Activity, TrendingUp, Loader2 } from 'lucide-react'

export function AdminDashboard() {
  const { appUser } = useAuth()
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalGroups: 0,
    totalSessions: 0,
    recentSessions: [] as WorkoutSession[],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [usersSnap, groupsSnap, sessionsSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'workoutGroups')),
          getDocs(query(collection(db, 'sessions'), orderBy('createdAt', 'desc'))),
        ])

        const sessions = sessionsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as WorkoutSession[]

        setStats({
          totalUsers: usersSnap.size - 1, // exclude admin
          totalGroups: groupsSnap.size,
          totalSessions: sessions.length,
          recentSessions: sessions.slice(0, 5),
        })
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const statCards = [
    {
      label: 'Usuários ativos',
      value: stats.totalUsers,
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
    {
      label: 'Grupos de treino',
      value: stats.totalGroups,
      icon: Layers,
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
    },
    {
      label: 'Sessões registradas',
      value: stats.totalSessions,
      icon: Activity,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Olá, {appUser?.name?.split(' ')[0] || 'Admin'} 👋
        </h1>
        <p className="text-muted-foreground mt-1">Aqui está o resumo do sistema</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-3xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent sessions */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Sessões Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentSessions.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              Nenhuma sessão registrada ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                >
                  <div>
                    <p className="font-medium text-sm">{session.groupName}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.date?.toDate
                        ? session.date.toDate().toLocaleDateString('pt-BR')
                        : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{session.durationMinutes}min</Badge>
                    <Badge variant="outline">{session.bodyWeightKg}kg</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
