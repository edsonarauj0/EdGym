import { useEffect, useState } from 'react'
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { WorkoutSession } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar as CalendarIcon, Clock, Weight, FileText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/utils'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function CalendarPage() {
  const { appUser } = useAuth()
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedSessions, setSelectedSessions] = useState<WorkoutSession[]>([])

  useEffect(() => {
    if (!appUser) return
    const load = async () => {
      try {
        const q = query(
          collection(db, 'sessions'),
          where('userId', '==', appUser.uid),
          orderBy('createdAt', 'desc')
        )
        const snap = await getDocs(q)
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkoutSession)))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [appUser])

  const handleDayClick = (day: Date) => {
    setSelectedDay(day)
    const daySessions = sessions.filter((s) => {
      if (!s.date?.toDate) return false
      return isSameDay(s.date.toDate(), day)
    })
    setSelectedSessions(daySessions)
  }

  // Build calendar grid
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const hasSession = (day: Date) =>
    sessions.some((s) => s.date?.toDate && isSameDay(s.date.toDate(), day))

  const getSessionForDay = (day: Date) =>
    sessions.find((s) => s.date?.toDate && isSameDay(s.date.toDate(), day))

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarIcon className="w-6 h-6 text-primary" />
          Calendário de Treinos
        </h1>
        <p className="text-muted-foreground mt-1">
          Acompanhe sua frequência e histórico de treinos
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="border-border/50 lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Week headers */}
            <div className="grid grid-cols-7 mb-2">
              {weekDays.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {d}
                </div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const trained = hasSession(day)
                const isCurrentMonth = isSameMonth(day, currentMonth)
                const isSelected = selectedDay && isSameDay(day, selectedDay)
                const isToday = isSameDay(day, new Date())
                const daySession = getSessionForDay(day)

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => handleDayClick(day)}
                    className={`
                      relative flex flex-col items-center justify-center rounded-xl p-1 h-10 text-sm font-medium transition-all
                      ${!isCurrentMonth ? 'opacity-30' : ''}
                      ${isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}
                      ${trained ? 'bg-primary/20 text-primary hover:bg-primary/30' : 'hover:bg-secondary'}
                      ${isToday && !trained ? 'ring-1 ring-border' : ''}
                    `}
                  >
                    <span>{format(day, 'd')}</span>
                    {trained && daySession && (
                      <div
                        className="w-1.5 h-1.5 rounded-full mt-0.5"
                        style={{ backgroundColor: '#22c55e' }}
                      />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-primary/20" />
                <span>Treinou</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-secondary" />
                <span>Sem treino</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Session detail */}
        <div className="space-y-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">
                {selectedDay
                  ? format(selectedDay, "dd 'de' MMMM", { locale: ptBR })
                  : 'Selecione um dia'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedDay ? (
                <p className="text-sm text-muted-foreground">
                  Clique em um dia no calendário para ver os detalhes.
                </p>
              ) : selectedSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum treino registrado neste dia.
                </p>
              ) : (
                selectedSessions.map((session) => (
                  <div key={session.id} className="space-y-3">
                    <div>
                      <Badge className="mb-2">{session.groupName}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-secondary/50 rounded-lg p-3 text-center">
                        <Clock className="w-4 h-4 text-primary mx-auto mb-1" />
                        <p className="font-bold text-lg">{formatDuration(session.durationMinutes)}</p>
                        <p className="text-xs text-muted-foreground">Duração</p>
                      </div>
                      <div className="bg-secondary/50 rounded-lg p-3 text-center">
                        <Weight className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                        <p className="font-bold text-lg">{session.bodyWeightKg}kg</p>
                        <p className="text-xs text-muted-foreground">Peso</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Exercícios concluídos</p>
                      <Badge variant="secondary">
                        {session.completedExerciseIds?.length || 0} exercícios
                      </Badge>
                    </div>
                    {session.notes && (
                      <div className="bg-secondary/30 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-sm text-muted-foreground">{session.notes}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Monthly stats */}
          <Card className="border-border/50">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Este mês
              </p>
              <div className="space-y-2">
                {(() => {
                  const monthSessions = sessions.filter((s) =>
                    s.date?.toDate && isSameMonth(s.date.toDate(), currentMonth)
                  )
                  const totalDuration = monthSessions.reduce((a, b) => a + (b.durationMinutes || 0), 0)
                  return (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Treinos</span>
                        <span className="font-bold text-primary">{monthSessions.length}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tempo total</span>
                        <span className="font-bold">{formatDuration(totalDuration)}</span>
                      </div>
                    </>
                  )
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
