import { useEffect, useState, useMemo } from 'react'
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { generateLibraryExercises } from '@/lib/gemini'
import { LibraryExercise, WorkoutGroup, ExerciseDifficulty, ExerciseCategory } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { getYouTubeSearchUrl } from '@/lib/utils'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  BookOpen,
  Sparkles,
  Loader2,
  Search,
  X,
  Plus,
  Trash2,
  ExternalLink,
  Dumbbell,
  Layers,
  ChevronDown,
  Filter,
  Monitor,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Constants ────────────────────────────────────────────────────────────────

const DIFFICULTY_COLORS: Record<ExerciseDifficulty, string> = {
  Iniciante: 'bg-green-500/15 text-green-400 border-green-500/30',
  Intermediário: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  Avançado: 'bg-red-500/15 text-red-400 border-red-500/30',
}

const CATEGORY_COLORS: Record<ExerciseCategory, string> = {
  Força: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  Funcional: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  Cardio: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  Mobilidade: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  Isométrico: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
}

const ALL_DIFFICULTIES: ExerciseDifficulty[] = ['Iniciante', 'Intermediário', 'Avançado']
const ALL_CATEGORIES: ExerciseCategory[] = ['Força', 'Funcional', 'Cardio', 'Mobilidade', 'Isométrico']

// ─── Add-to-Group Dialog ──────────────────────────────────────────────────────

interface AddToGroupDialogProps {
  exercise: LibraryExercise
  groups: WorkoutGroup[]
  open: boolean
  onClose: () => void
  onAdded: () => void
}

function AddToGroupDialog({ exercise, groups, open, onClose, onAdded }: AddToGroupDialogProps) {
  const [adding, setAdding] = useState<string | null>(null)

  const handleAdd = async (group: WorkoutGroup) => {
    setAdding(group.id)
    try {
      // For equipment-sourced exercises, recover the real Firestore exercise id
      const exWithMeta = exercise as LibraryExercise & { _source?: string; _originalId?: string }
      const equipmentId = exWithMeta._source === 'equipment' ? (exWithMeta._originalId || '') : ''

      const newExercise = {
        id: crypto.randomUUID(),
        name: exercise.name,
        equipmentId,
        equipmentName: exercise.equipment,
        description: exercise.description,
        sets: exercise.sets,
        reps: exercise.reps,
        restSeconds: exercise.restSeconds,
        videoSearchQuery: exercise.videoSearchQuery,
        orderIndex: (group.exercises?.length || 0),
      }
      const updated = [...(group.exercises || []), newExercise]
      await updateDoc(doc(db, 'workoutGroups', group.id), { exercises: updated })
      toast.success(`"${exercise.name}" adicionado ao grupo "${group.name}"!`)
      onAdded()
      onClose()
    } catch {
      toast.error('Erro ao adicionar exercício ao grupo.')
    } finally {
      setAdding(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Adicionar ao Grupo de Treino
          </DialogTitle>
          <DialogDescription>
            Escolha em qual grupo deseja adicionar <strong>{exercise.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2 max-h-80 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum grupo criado. Crie grupos em <strong>Grupos de Treino</strong> primeiro.
            </p>
          ) : (
            groups.map((group) => (
              <button
                key={group.id}
                onClick={() => handleAdd(group)}
                disabled={adding === group.id}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: group.colorHex || '#22c55e' }}
                  />
                  <div>
                    <p className="text-sm font-medium">{group.name}</p>
                    {group.muscleTarget && (
                      <p className="text-xs text-muted-foreground">{group.muscleTarget}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{group.exercises?.length || 0} ex.</span>
                  {adding === group.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : (
                    <Plus className="w-4 h-4 text-primary" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── AI Generate Dialog ───────────────────────────────────────────────────────

interface AiGenerateDialogProps {
  open: boolean
  onClose: () => void
  onGenerated: () => void
}

function AiGenerateDialog({ open, onClose, onGenerated }: AiGenerateDialogProps) {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return
    setGenerating(true)
    try {
      const results = await generateLibraryExercises(prompt)
      // Save all to Firestore
      await Promise.all(
        results.map((ex) =>
          addDoc(collection(db, 'libraryExercises'), {
            ...ex,
            aiGenerated: true,
            createdAt: serverTimestamp(),
          }),
        ),
      )
      toast.success(`${results.length} exercício${results.length > 1 ? 's' : ''} adicionado${results.length > 1 ? 's' : ''} à biblioteca!`)
      setPrompt('')
      onGenerated()
      onClose()
    } catch (err) {
      toast.error('A IA está temporariamente indisponível. Tente novamente.')
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !generating && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            Gerar Exercícios com IA
          </DialogTitle>
          <DialogDescription>
            Descreva o tipo de exercício que você quer e a IA vai criar e adicionar à biblioteca automaticamente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleGenerate} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="ai-prompt">Descreva os exercícios</Label>
            <Textarea
              id="ai-prompt"
              placeholder="Ex: exercícios para costas sem equipamento para iniciantes, 3 séries..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              disabled={generating}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              'Peito com barra para intermediários',
              'Pernas sem equipamento para iniciantes',
              'Core e abdômen funcional',
              'Ombros com halteres avançado',
            ].map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="text-xs px-2 py-1 rounded-md bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
              >
                {example}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={generating || !prompt.trim()} className="flex-1">
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Gerando com IA...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Gerar Exercícios</>
              )}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={generating}>
              Cancelar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

interface FilterState {
  search: string
  muscles: string[]
  categories: ExerciseCategory[]
  difficulties: ExerciseDifficulty[]
  equipment: string
}

interface FilterBarProps {
  filters: FilterState
  onChange: (f: FilterState) => void
  allMuscles: string[]
  allEquipment: string[]
  totalShown: number
  totalAll: number
}

function FilterBar({ filters, onChange, allMuscles, allEquipment, totalShown, totalAll }: FilterBarProps) {
  const [showMore, setShowMore] = useState(false)

  const hasActiveFilters =
    filters.search ||
    filters.muscles.length > 0 ||
    filters.categories.length > 0 ||
    filters.difficulties.length > 0 ||
    filters.equipment

  const toggleMuscle = (m: string) =>
    onChange({
      ...filters,
      muscles: filters.muscles.includes(m) ? filters.muscles.filter((x) => x !== m) : [...filters.muscles, m],
    })

  const toggleCategory = (c: ExerciseCategory) =>
    onChange({
      ...filters,
      categories: filters.categories.includes(c)
        ? filters.categories.filter((x) => x !== c)
        : [...filters.categories, c],
    })

  const toggleDifficulty = (d: ExerciseDifficulty) =>
    onChange({
      ...filters,
      difficulties: filters.difficulties.includes(d)
        ? filters.difficulties.filter((x) => x !== d)
        : [...filters.difficulties, d],
    })

  const clearAll = () =>
    onChange({ search: '', muscles: [], categories: [], difficulties: [], equipment: '' })

  return (
    <Card className="border-border/50">
      <CardContent className="p-4 space-y-4">
        {/* Search row */}
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar exercício..."
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              className="pl-9"
            />
          </div>
          <span className="text-sm text-muted-foreground shrink-0">
            {totalShown} / {totalAll}
          </span>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="shrink-0 gap-1.5 text-muted-foreground">
              <X className="w-3.5 h-3.5" />
              Limpar
            </Button>
          )}
        </div>

        {/* Difficulty pills */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Dificuldade:</span>
          {ALL_DIFFICULTIES.map((d) => (
            <button
              key={d}
              onClick={() => toggleDifficulty(d)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                filters.difficulties.includes(d)
                  ? DIFFICULTY_COLORS[d]
                  : 'border-border text-muted-foreground hover:border-border/80'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Categoria:</span>
          {ALL_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => toggleCategory(c)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                filters.categories.includes(c)
                  ? CATEGORY_COLORS[c]
                  : 'border-border text-muted-foreground hover:border-border/80'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Toggle muscle/equipment filters */}
        <button
          onClick={() => setShowMore((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Filter className="w-3 h-3" />
          {showMore ? 'Ocultar' : 'Mais filtros'} (músculo, equipamento)
          <ChevronDown className={`w-3 h-3 transition-transform ${showMore ? 'rotate-180' : ''}`} />
        </button>

        {showMore && (
          <div className="space-y-3 pt-1 border-t border-border/40">
            {/* Muscle groups */}
            {allMuscles.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Músculo:</span>
                {allMuscles.map((m) => (
                  <button
                    key={m}
                    onClick={() => toggleMuscle(m)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      filters.muscles.includes(m)
                        ? 'bg-primary/20 text-primary border-primary/40'
                        : 'border-border text-muted-foreground hover:border-border/80'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {/* Equipment */}
            {allEquipment.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Equipamento:</span>
                {allEquipment.map((eq) => (
                  <button
                    key={eq}
                    onClick={() => onChange({ ...filters, equipment: filters.equipment === eq ? '' : eq })}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      filters.equipment === eq
                        ? 'bg-primary/20 text-primary border-primary/40'
                        : 'border-border text-muted-foreground hover:border-border/80'
                    }`}
                  >
                    {eq}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Exercise Card ────────────────────────────────────────────────────────────

interface ExerciseCardProps {
  exercise: LibraryExercise
  isAdmin: boolean
  onAddToGroup?: () => void
  onDelete?: () => void
}

function ExerciseCard({ exercise, isAdmin, onAddToGroup, onDelete }: ExerciseCardProps) {
  const isEquipmentExercise = exercise.id.startsWith('eq__')

  return (
    <Card className="border-border/50 hover:border-primary/30 transition-colors flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Dumbbell className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <CardTitle className="text-sm leading-tight">{exercise.name}</CardTitle>
          </div>
          {exercise.aiGenerated ? (
            <span title="Gerado por IA" className="shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400 mt-0.5" />
            </span>
          ) : isEquipmentExercise ? (
            <span title="Do aparelho" className="shrink-0">
              <Monitor className="w-3.5 h-3.5 text-muted-foreground/60 mt-0.5" />
            </span>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 pb-4">
        <p className="text-xs text-muted-foreground leading-relaxed">{exercise.description}</p>

        {/* Tags row */}
        <div className="flex flex-wrap gap-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${DIFFICULTY_COLORS[exercise.difficulty]}`}>
            {exercise.difficulty}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CATEGORY_COLORS[exercise.category]}`}>
            {exercise.category}
          </span>
        </div>

        {/* Muscle groups */}
        <div className="flex flex-wrap gap-1">
          {exercise.muscleGroups.map((m) => (
            <Badge key={m} variant="secondary" className="text-xs py-0">
              {m}
            </Badge>
          ))}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-secondary/40 rounded-lg py-1.5 px-1">
            <p className="text-xs font-bold">{exercise.sets}</p>
            <p className="text-xs text-muted-foreground">séries</p>
          </div>
          <div className="bg-secondary/40 rounded-lg py-1.5 px-1">
            <p className="text-xs font-bold">{exercise.reps}</p>
            <p className="text-xs text-muted-foreground">reps</p>
          </div>
          <div className="bg-secondary/40 rounded-lg py-1.5 px-1">
            <p className="text-xs font-bold">{exercise.restSeconds}s</p>
            <p className="text-xs text-muted-foreground">descanso</p>
          </div>
        </div>

        {/* Equipment */}
        <p className="text-xs text-muted-foreground">
          🏋️ {exercise.equipment}
        </p>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-1 mt-auto">
          <a
            href={getYouTubeSearchUrl(exercise.videoSearchQuery)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
          >
            Ver vídeo <ExternalLink className="w-3 h-3" />
          </a>

          <div className="flex gap-1">
            {isAdmin && onAddToGroup && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={onAddToGroup}
              >
                <Plus className="w-3 h-3" />
                Grupo
              </Button>
            )}
            {isAdmin && onDelete && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
                onClick={onDelete}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ExerciseLibraryPage() {
  const { isAdmin } = useAuth()
  const [exercises, setExercises] = useState<LibraryExercise[]>([])
  const [groups, setGroups] = useState<WorkoutGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [aiDialogOpen, setAiDialogOpen] = useState(false)
  const [addToGroupExercise, setAddToGroupExercise] = useState<LibraryExercise | null>(null)

  const [filters, setFilters] = useState<FilterState>({
    search: '',
    muscles: [],
    categories: [],
    difficulties: [],
    equipment: '',
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const [libSnap, groupsSnap, exercisesSnap, equipSnap] = await Promise.all([
        getDocs(collection(db, 'libraryExercises')),
        getDocs(collection(db, 'workoutGroups')),
        getDocs(collection(db, 'exercises')),
        getDocs(collection(db, 'equipment')),
      ])

      // Map equipment by id to get musclesWorked
      const equipmentMap: Record<string, string[]> = {}
      equipSnap.docs.forEach((d) => {
        const data = d.data()
        equipmentMap[d.id] = data.musclesWorked || []
      })

      // Existing equipment exercises adapted to LibraryExercise format
      const equipmentExercises: LibraryExercise[] = exercisesSnap.docs.map((d) => {
        const ex = d.data()
        return {
          id: `eq__${d.id}`,           // prefix to distinguish from library ones
          name: ex.name,
          description: ex.description || '',
          muscleGroups: equipmentMap[ex.equipmentId] || [],
          equipment: ex.equipmentName || 'Aparelho',
          sets: ex.sets || '3',
          reps: ex.reps || '10-12',
          restSeconds: ex.restSeconds ?? 60,
          difficulty: 'Intermediário' as const,
          category: 'Força' as const,
          videoSearchQuery: ex.videoSearchQuery || ex.name,
          aiGenerated: false,
          createdAt: ex.createdAt,
          _source: 'equipment',         // internal marker
          _originalId: d.id,            // real Firestore id for add-to-group
        } as LibraryExercise & { _source: string; _originalId: string }
      })

      // Library exercises (AI-generated via the new collection)
      const libraryExercises: LibraryExercise[] = libSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as LibraryExercise),
      )

      setExercises([...equipmentExercises, ...libraryExercises])
      setGroups(groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkoutGroup)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleDelete = async (id: string, name: string) => {
    // Equipment-sourced exercises (id starts with 'eq__') can't be deleted from here
    if (id.startsWith('eq__')) {
      toast.error('Exercícios de aparelhos só podem ser removidos na página de Aparelhos.')
      return
    }
    if (!confirm(`Remover "${name}" da biblioteca?`)) return
    try {
      await deleteDoc(doc(db, 'libraryExercises', id))
      toast.success('Exercício removido da biblioteca.')
      setExercises((prev) => prev.filter((e) => e.id !== id))
    } catch {
      toast.error('Erro ao remover exercício.')
    }
  }

  // Derived filter options from actual data
  const allMuscles = useMemo(
    () => [...new Set(exercises.flatMap((e) => e.muscleGroups))].sort(),
    [exercises],
  )
  const allEquipment = useMemo(
    () => [...new Set(exercises.map((e) => e.equipment))].sort(),
    [exercises],
  )

  // Filtered exercises
  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase()
    return exercises.filter((ex) => {
      if (q && !ex.name.toLowerCase().includes(q) && !ex.description.toLowerCase().includes(q) && !ex.muscleGroups.some((m) => m.toLowerCase().includes(q)))
        return false
      if (filters.difficulties.length && !filters.difficulties.includes(ex.difficulty)) return false
      if (filters.categories.length && !filters.categories.includes(ex.category)) return false
      if (filters.muscles.length && !filters.muscles.some((m) => ex.muscleGroups.includes(m))) return false
      if (filters.equipment && ex.equipment !== filters.equipment) return false
      return true
    })
  }, [exercises, filters])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            Biblioteca de Exercícios
          </h1>
          <p className="text-muted-foreground mt-1">
            Repositório global de exercícios criados e recomendados pela IA
            {isAdmin && ' • Admins podem adicionar exercícios aos grupos de treino'}
          </p>
        </div>

        {isAdmin && (
          <Button onClick={() => setAiDialogOpen(true)} className="shrink-0">
            <Sparkles className="w-4 h-4" />
            Gerar com IA
          </Button>
        )}
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        allMuscles={allMuscles}
        allEquipment={allEquipment}
        totalShown={filtered.length}
        totalAll={exercises.length}
      />

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : exercises.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <BookOpen className="w-14 h-14 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground font-medium">Biblioteca vazia</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isAdmin
                ? 'Clique em "Gerar com IA" para criar os primeiros exercícios.'
                : 'Nenhum exercício foi adicionado à biblioteca ainda.'}
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">Nenhum exercício encontrado com esses filtros.</p>
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setFilters({ search: '', muscles: [], categories: [], difficulties: [], equipment: '' })}>
              Limpar filtros
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((ex) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              isAdmin={!!isAdmin}
              onAddToGroup={() => setAddToGroupExercise(ex)}
              onDelete={() => handleDelete(ex.id, ex.name)}
            />
          ))}
        </div>
      )}

      {/* AI Generate Dialog */}
      <AiGenerateDialog
        open={aiDialogOpen}
        onClose={() => setAiDialogOpen(false)}
        onGenerated={loadData}
      />

      {/* Add to Group Dialog */}
      {addToGroupExercise && (
        <AddToGroupDialog
          exercise={addToGroupExercise}
          groups={groups}
          open={!!addToGroupExercise}
          onClose={() => setAddToGroupExercise(null)}
          onAdded={loadData}
        />
      )}
    </div>
  )
}
