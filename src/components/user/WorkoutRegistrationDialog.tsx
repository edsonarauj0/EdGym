import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { CheckSquare, Clock, Dumbbell, ExternalLink, Loader2, Play, Weight } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { db } from '@/lib/firebase'
import { getYouTubeSearchUrl } from '@/lib/utils'
import { Exercise, WorkoutGroup } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'

interface WorkoutRegistrationDialogProps {
  groups: WorkoutGroup[]
  defaultGroupId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRegistered: () => void
}

export function WorkoutRegistrationDialog({
  groups,
  defaultGroupId,
  open,
  onOpenChange,
  onRegistered,
}: WorkoutRegistrationDialogProps) {
  const { appUser } = useAuth()
  const [selectedGroupId, setSelectedGroupId] = useState(defaultGroupId ?? '')
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [exerciseWeights, setExerciseWeights] = useState<Record<string, string>>({})
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ bodyWeightKg: '', notes: '' })

  useEffect(() => {
    if (open) {
      setSelectedGroupId(defaultGroupId ?? groups[0]?.id ?? '')
      setCompletedIds(new Set())
      setExerciseWeights({})
      setStartedAt(null)
      setLastCheckedAt(null)
      setForm({ bodyWeightKg: '', notes: '' })
    }
  }, [open, defaultGroupId, groups])

  useEffect(() => {
    if (!startedAt) return
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [startedAt])

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  )
  const exercises = selectedGroup?.exercises ?? []
  const progress = exercises.length ? (completedIds.size / exercises.length) * 100 : 0
  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((currentTime - startedAt) / 1000)) : 0
  const elapsedLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`

  const setExerciseCompleted = (id: string, checked: boolean) => {
    setCompletedIds((previous) => {
      const next = new Set(previous)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
    if (checked) setLastCheckedAt(Date.now())
  }

  const startWorkout = () => {
    setStartedAt(Date.now())
    setLastCheckedAt(null)
    setCompletedIds(new Set())
    setExerciseWeights({})
  }

  const handleSave = async () => {
    if (!appUser || !selectedGroup) return
    if (!startedAt) {
      toast.error('Inicie o treino antes de registrá-lo.')
      return
    }
    if (completedIds.size === 0 || !lastCheckedAt) {
      toast.error('Marque ao menos um exercício concluído.')
      return
    }

    const durationMinutes = Math.max(1, Math.ceil((lastCheckedAt - startedAt) / 60000))
    const recordedWeights = Object.fromEntries(
      Object.entries(exerciseWeights)
        .filter(([, value]) => value !== '' && !Number.isNaN(Number(value)))
        .map(([id, value]) => [id, Number(value)]),
    )

    setSaving(true)
    try {
      await addDoc(collection(db, 'sessions'), {
        userId: appUser.uid,
        groupId: selectedGroup.id,
        groupName: selectedGroup.name,
        date: serverTimestamp(),
        durationMinutes,
        bodyWeightKg: form.bodyWeightKg ? Number.parseFloat(form.bodyWeightKg) : 0,
        notes: form.notes,
        completedExerciseIds: Array.from(completedIds),
        exerciseWeights: recordedWeights,
        createdAt: serverTimestamp(),
      })

      const usersSnapshot = await getDocs(query(collection(db, 'users'), where('uid', '==', appUser.uid)))
      if (!usersSnapshot.empty) {
        const userDocument = usersSnapshot.docs[0]
        const assignedGroupIds = userDocument.data().assignedGroupIds ?? []
        const selectedIndex = assignedGroupIds.indexOf(selectedGroup.id)
        const nextIndex = selectedIndex >= 0 ? (selectedIndex + 1) % assignedGroupIds.length : 0
        await updateDoc(doc(db, 'users', userDocument.id), { currentGroupIndex: nextIndex })
      }

      toast.success('Treino registrado com sucesso! 💪')
      onOpenChange(false)
      onRegistered()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível registrar o treino.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl gap-0 overflow-y-auto p-0 sm:max-w-xl" aria-describedby="workout-registration-description">
        <DialogHeader className="p-6 pb-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="size-5 text-primary" />
            Registrar treino
          </DialogTitle>
          <DialogDescription id="workout-registration-description">
            Escolha o grupo realizado e marque os exercícios que você concluiu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 pb-6">
          <div className="space-y-2">
            <Label>Qual grupo você treinou?</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {groups.map((group) => {
                const selected = group.id === selectedGroupId
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(group.id)
                      setCompletedIds(new Set())
                      setExerciseWeights({})
                      setStartedAt(null)
                      setLastCheckedAt(null)
                    }}
                    className={`rounded-lg border p-3 text-left transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <span className="size-2 rounded-full" style={{ backgroundColor: group.colorHex || '#22c55e' }} />
                      {group.name}
                    </span>
                    {group.muscleTarget && <span className="mt-1 block text-xs text-muted-foreground">{group.muscleTarget}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {selectedGroup && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Exercícios concluídos</Label>
                  <p className="mt-1 text-xs text-muted-foreground">A duração final considera sua última marcação.</p>
                </div>
                {!startedAt ? (
                  <Button type="button" size="sm" onClick={startWorkout}>
                    <Play className="size-4" /> Iniciar
                  </Button>
                ) : (
                  <span className="flex items-center gap-1 text-sm font-semibold text-primary"><Clock className="size-4" /> {elapsedLabel}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Progresso</span>
                <span className="text-sm font-medium text-primary">{completedIds.size}/{exercises.length}</span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="space-y-2">
                {exercises.map((exercise: Exercise, index) => {
                  // Grupos criados pela IA podem não ter `id` por exercício.
                  // O fallback impede que todos usem a mesma chave (undefined).
                  const exerciseId = exercise.id || `${selectedGroup.id}-${index}`
                  const checked = completedIds.has(exerciseId)
                  return (
                    <div key={exerciseId} className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${checked ? 'border-primary/50 bg-primary/5' : 'border-border/60'}`}>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => setExerciseCompleted(exerciseId, value === true)}
                        disabled={!startedAt}
                        aria-label={`Marcar ${exercise.name} como concluído`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-medium ${checked ? 'text-muted-foreground line-through' : ''}`}>{exercise.name}</span>
                        <span className="block text-xs text-muted-foreground">{exercise.equipmentName} · {exercise.restSeconds}s de descanso</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          className="h-8 w-20"
                          value={exerciseWeights[exerciseId] ?? ''}
                          onChange={(event) => setExerciseWeights((previous) => ({ ...previous, [exerciseId]: event.target.value }))}
                          placeholder="kg"
                          aria-label={`Peso usado em ${exercise.name}, em kg`}
                          disabled={!startedAt}
                        />
                        <Badge variant="outline" className="text-xs">{exercise.sets}x{exercise.reps}</Badge>
                      </div>
                      <a
                        href={getYouTubeSearchUrl(exercise.videoSearchQuery || exercise.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-primary hover:text-primary/80"
                        aria-label={`Ver vídeo de ${exercise.name}`}
                        title="Ver vídeo"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    </div>
                  )
                })}
                {exercises.length === 0 && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Este grupo ainda não possui exercícios cadastrados.</p>}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="modal-weight" className="flex items-center gap-1"><Weight className="size-3" /> Peso corporal (kg, opcional)</Label>
            <Input id="modal-weight" type="number" step="0.1" placeholder="Ex.: 75,5" value={form.bodyWeightKg} onChange={(event) => setForm({ ...form, bodyWeightKg: event.target.value })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="modal-notes">Observações do dia</Label>
            <Textarea id="modal-notes" rows={3} placeholder="Como você se sentiu?" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>
        </div>

        <DialogFooter className="sticky bottom-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !selectedGroup}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Dumbbell className="size-4" />}
            {saving ? 'Salvando...' : 'Registrar treino'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
