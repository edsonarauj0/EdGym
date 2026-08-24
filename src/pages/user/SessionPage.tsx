import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, addDoc, collection, serverTimestamp, getDocs, query, where, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { WorkoutGroup, Exercise } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  ChevronLeft,
  Clock,
  Weight,
  CheckSquare,
  Dumbbell,
  Info,
} from 'lucide-react'
import { getYouTubeSearchUrl } from '@/lib/utils'
import { toast } from 'sonner'

export function SessionPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const { appUser } = useAuth()
  const navigate = useNavigate()

  const [group, setGroup] = useState<WorkoutGroup | null>(null)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null)

  const [form, setForm] = useState({
    bodyWeightKg: '',
    durationMinutes: '',
    notes: '',
  })

  useEffect(() => {
    if (!groupId) return
    const load = async () => {
      const snap = await getDoc(doc(db, 'workoutGroups', groupId))
      if (snap.exists()) {
        setGroup({ id: snap.id, ...snap.data() } as WorkoutGroup)
      }
      setLoading(false)
    }
    load()
  }, [groupId])

  const toggleExercise = (id: string) => {
    setCompletedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleFinish = async () => {
    if (!appUser || !group) return
    if (!form.bodyWeightKg || !form.durationMinutes) {
      toast.error('Preencha o peso e o tempo de treino.')
      return
    }

    setSaving(true)
    try {
      // Save session
      await addDoc(collection(db, 'sessions'), {
        userId: appUser.uid,
        groupId: group.id,
        groupName: group.name,
        date: serverTimestamp(),
        durationMinutes: parseInt(form.durationMinutes),
        bodyWeightKg: parseFloat(form.bodyWeightKg),
        notes: form.notes,
        completedExerciseIds: Array.from(completedIds),
        createdAt: serverTimestamp(),
      })

      // Advance group rotation index
      const usersSnap = await getDocs(
        query(collection(db, 'users'), where('uid', '==', appUser.uid))
      )
      if (!usersSnap.empty) {
        const userDoc = usersSnap.docs[0]
        const userData = userDoc.data()
        const totalGroups = userData.assignedGroupIds?.length || 1
        const nextIndex = ((userData.currentGroupIndex || 0) + 1) % totalGroups
        await updateDoc(doc(db, 'users', userDoc.id), { currentGroupIndex: nextIndex })
      }

      toast.success('Treino registrado com sucesso! 💪')
      navigate('/dashboard')
    } catch (err) {
      toast.error('Erro ao salvar a sessão.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Grupo não encontrado.</p>
        <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mt-4">
          Voltar
        </Button>
      </div>
    )
  }

  const totalExercises = group.exercises?.length || 0
  const completedCount = completedIds.size
  const progressPercent = totalExercises > 0 ? (completedCount / totalExercises) * 100 : 0

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard')}
          className="mb-3 text-muted-foreground"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Voltar
        </Button>
        <h1 className="text-2xl font-bold">{group.name}</h1>
        {group.muscleTarget && (
          <p className="text-muted-foreground mt-1">🎯 {group.muscleTarget}</p>
        )}
      </div>

      {/* Progress */}
      <Card className="border-primary/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progresso do treino</span>
            <span className="text-sm text-primary font-bold">{completedCount}/{totalExercises}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          {progressPercent === 100 && (
            <p className="text-primary text-sm font-medium mt-2 text-center">
              🎉 Todos os exercícios concluídos!
            </p>
          )}
        </CardContent>
      </Card>

      {/* Exercises */}
      <div className="space-y-3">
        {group.exercises?.map((ex: Exercise) => {
          const isDone = completedIds.has(ex.id)
          const isExpanded = expandedExercise === ex.id

          return (
            <Card
              key={ex.id}
              className={`border transition-all cursor-pointer ${
                isDone
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border/50 hover:border-primary/30'
              }`}
              onClick={() => setExpandedExercise(isExpanded ? null : ex.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleExercise(ex.id)
                    }}
                    className="shrink-0"
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-6 h-6 text-primary" />
                    ) : (
                      <Circle className="w-6 h-6 text-muted-foreground" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`font-medium ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                        {ex.name}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">{ex.sets}x{ex.reps}</Badge>
                        <a
                          href={getYouTubeSearchUrl(ex.videoSearchQuery)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:text-primary/80"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ex.equipmentName} • {ex.restSeconds}s de descanso
                    </p>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pl-9 space-y-3" onClick={(e) => e.stopPropagation()}>
                    {ex.imageUrl && (
                      <img
                        src={ex.imageUrl}
                        alt={ex.equipmentName}
                        className="w-full max-h-40 object-cover rounded-lg"
                      />
                    )}
                    <div className="bg-secondary/50 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-sm text-muted-foreground">{ex.description}</p>
                      </div>
                    </div>
                    <a
                      href={getYouTubeSearchUrl(ex.videoSearchQuery)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Ver vídeo no YouTube
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Session form */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-primary" />
            Registrar sessão
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="weight" className="flex items-center gap-1">
                <Weight className="w-3 h-3" />
                Peso corporal (kg)
              </Label>
              <Input
                id="weight"
                type="number"
                step="0.1"
                placeholder="Ex: 75.5"
                value={form.bodyWeightKg}
                onChange={(e) => setForm({ ...form, bodyWeightKg: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration" className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Duração (minutos)
              </Label>
              <Input
                id="duration"
                type="number"
                placeholder="Ex: 60"
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações do dia</Label>
            <Textarea
              id="notes"
              placeholder="Como você se sentiu? Algo a destacar? Ex: Aumentei o peso na rosca direta, senti dor no joelho..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
            />
          </div>

          <Button
            
            className="w-full font-semibold"
            onClick={handleFinish}
            disabled={saving}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
            ) : (
              <><Dumbbell className="w-4 h-4" /> Finalizar Treino</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
