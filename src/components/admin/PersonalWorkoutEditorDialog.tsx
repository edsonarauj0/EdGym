import { useEffect, useState } from 'react'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { ExternalLink, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { db } from '@/lib/firebase'
import { generatePersonalWorkout } from '@/lib/gemini'
import { getYouTubeSearchUrl } from '@/lib/utils'
import { Exercise, PersonalWorkout } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PersonalWorkoutEditorDialogProps {
  user: { uid: string; name: string }
  open: boolean
  onOpenChange: (open: boolean) => void
}

const newExercise = (): Exercise => ({
  id: crypto.randomUUID(),
  name: '',
  equipmentId: '',
  equipmentName: 'Exercício livre',
  description: '',
  sets: '3',
  reps: '10-12',
  restSeconds: 60,
  videoSearchQuery: '',
  orderIndex: 0,
})

export function PersonalWorkoutEditorDialog({ user, open, onOpenChange }: PersonalWorkoutEditorDialogProps) {
  const [name, setName] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [goal, setGoal] = useState('')

  useEffect(() => {
    if (!open) return

    const loadWorkout = async () => {
      setLoading(true)
      try {
        const snapshot = await getDoc(doc(db, 'personalWorkouts', user.uid))
        const workout = snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as PersonalWorkout) : null
        setName(workout?.name || `Treino personalizado de ${user.name}`)
        setExercises(workout?.exercises || [])
      } catch (error) {
        console.error(error)
        toast.error('Não foi possível carregar o treino personalizado.')
      } finally {
        setLoading(false)
      }
    }

    loadWorkout()
  }, [open, user])

  const updateExercise = (id: string, patch: Partial<Exercise>) => {
    setExercises((current) => current.map((exercise) => exercise.id === id ? { ...exercise, ...patch } : exercise))
  }

  const addExercise = () => setExercises((current) => [...current, { ...newExercise(), orderIndex: current.length }])

  const save = async () => {
    if (!name.trim()) return toast.error('Informe o nome do treino.')
    if (exercises.some((exercise) => !exercise.name.trim())) return toast.error('Informe o nome de todos os exercícios.')

    setSaving(true)
    try {
      await setDoc(doc(db, 'personalWorkouts', user.uid), {
        userId: user.uid,
        name: name.trim(),
        exercises: exercises.map((exercise, orderIndex) => ({ ...exercise, orderIndex })),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }, { merge: true })
      toast.success(`Treino personalizado de ${user.name} salvo.`)
      onOpenChange(false)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar o treino personalizado.')
    } finally {
      setSaving(false)
    }
  }

  const generateWithAi = async () => {
    setGenerating(true)
    try {
      const workout = await generatePersonalWorkout(user.name, goal)
      setName(workout.name)
      setExercises(workout.exercises.map((exercise, orderIndex) => ({
        ...newExercise(),
        ...exercise,
        id: crypto.randomUUID(),
        orderIndex,
      })))
      toast.success('A IA preparou uma sugestão. Revise e salve o treino.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível gerar o treino agora. Tente novamente.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Treino personalizado — {user.name}</DialogTitle>
          <DialogDescription>Este plano é exclusivo deste aluno e não altera os grupos de treino.</DialogDescription>
        </DialogHeader>
        {loading ? <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-primary" /></div> : (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <Label htmlFor="personal-workout-goal">Criar sugestão com IA</Label>
              <div className="flex flex-col gap-2 sm:flex-row"><Input id="personal-workout-goal" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Ex.: iniciante, emagrecimento, 3x por semana, dor no joelho" /><Button type="button" variant="secondary" onClick={generateWithAi} disabled={generating}>{generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Gerar</Button></div>
            </div>
            <div className="space-y-2"><Label htmlFor="personal-workout-name">Nome do treino</Label><Input id="personal-workout-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div className="space-y-3">
              {exercises.map((exercise, index) => (
                <div key={exercise.id} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center gap-2"><span className="text-sm font-semibold text-primary">{index + 1}</span><Input value={exercise.name} onChange={(event) => updateExercise(exercise.id, { name: event.target.value })} placeholder="Nome do exercício" /><Button type="button" variant="ghost" size="icon" onClick={() => setExercises((current) => current.filter((item) => item.id !== exercise.id))} aria-label="Remover exercício"><Trash2 className="size-4 text-destructive" /></Button></div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Input value={exercise.sets} onChange={(event) => updateExercise(exercise.id, { sets: event.target.value })} placeholder="Séries" /><Input value={exercise.reps} onChange={(event) => updateExercise(exercise.id, { reps: event.target.value })} placeholder="Repetições" /><Input type="number" min="0" value={exercise.restSeconds} onChange={(event) => updateExercise(exercise.id, { restSeconds: Number(event.target.value) || 0 })} placeholder="Descanso (s)" /><Input value={exercise.equipmentName} onChange={(event) => updateExercise(exercise.id, { equipmentName: event.target.value })} placeholder="Aparelho" /></div>
                  <Input value={exercise.description} onChange={(event) => updateExercise(exercise.id, { description: event.target.value })} placeholder="Orientação de execução (opcional)" />
                  <div className="flex gap-2"><Input value={exercise.videoSearchQuery} onChange={(event) => updateExercise(exercise.id, { videoSearchQuery: event.target.value })} placeholder="Busca do vídeo no YouTube" /><a href={getYouTubeSearchUrl(exercise.videoSearchQuery || exercise.name)} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-md border px-3 text-sm font-medium text-primary hover:bg-primary/5" title="Ver vídeo no YouTube"><ExternalLink className="size-4" /> Vídeo</a></div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addExercise}><Plus className="size-4" /> Adicionar exercício</Button>
            </div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button><Button onClick={save} disabled={loading || saving}>{saving && <Loader2 className="size-4 animate-spin" />}Salvar treino</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
