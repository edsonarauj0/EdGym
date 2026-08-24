import { useEffect, useState } from 'react'
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { WorkoutGroup, Equipment, Exercise } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Trash2,
  Layers,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Dumbbell,
} from 'lucide-react'
import { getYouTubeSearchUrl } from '@/lib/utils'
import { toast } from 'sonner'

const GROUP_COLORS = [
  '#22c55e', '#3b82f6', '#a855f7', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#84cc16',
]

export function WorkoutGroupsPage() {
  const [groups, setGroups] = useState<WorkoutGroup[]>([])
  const [equipment, setEquipment] = useState<(Equipment & { exercises?: Exercise[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    muscleTarget: '',
    colorHex: GROUP_COLORS[0],
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const [groupsSnap, equipSnap] = await Promise.all([
        getDocs(collection(db, 'workoutGroups')),
        getDocs(collection(db, 'equipment')),
      ])
      setGroups(groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkoutGroup)))
      setEquipment(equipSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Equipment & { exercises?: Exercise[] })))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    try {
      await addDoc(collection(db, 'workoutGroups'), {
        ...form,
        exercises: [],
        assignedUserIds: [],
        createdAt: serverTimestamp(),
      })
      toast.success(`Grupo "${form.name}" criado com sucesso!`)
      setForm({ name: '', description: '', muscleTarget: '', colorHex: GROUP_COLORS[0] })
      setShowCreateForm(false)
      await loadData()
    } catch {
      toast.error('Erro ao criar grupo.')
    }
  }

  const handleAddExercise = async (groupId: string, ex: Exercise) => {
    const group = groups.find((g) => g.id === groupId)
    if (!group) return
    const updated = [...(group.exercises || []), { ...ex, id: crypto.randomUUID(), orderIndex: group.exercises?.length || 0 }]
    await updateDoc(doc(db, 'workoutGroups', groupId), { exercises: updated })
    toast.success('Exercício adicionado!')
    await loadData()
  }

  const handleRemoveExercise = async (groupId: string, exId: string) => {
    const group = groups.find((g) => g.id === groupId)
    if (!group) return
    const updated = (group.exercises || []).filter((e) => e.id !== exId)
    await updateDoc(doc(db, 'workoutGroups', groupId), { exercises: updated })
    await loadData()
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remover grupo "${name}"?`)) return
    await deleteDoc(doc(db, 'workoutGroups', id))
    toast.success('Grupo removido.')
    await loadData()
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" />
            Grupos de Treino
          </h1>
          <p className="text-muted-foreground mt-1">
            Crie grupos (A, B, C...) com exercícios dos aparelhos cadastrados
          </p>
        </div>
        <Button  onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="w-4 h-4" />
          Novo Grupo
        </Button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Criar novo grupo de treino</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="group-name">Nome do grupo *</Label>
                  <Input
                    id="group-name"
                    placeholder="Ex: Grupo A - Superiores Frente"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="muscle-target">Músculos alvo</Label>
                  <Input
                    id="muscle-target"
                    placeholder="Ex: Peito, Ombro, Tríceps"
                    value={form.muscleTarget}
                    onChange={(e) => setForm({ ...form, muscleTarget: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="group-desc">Descrição</Label>
                <Textarea
                  id="group-desc"
                  placeholder="Descrição do grupo de treino..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor identificadora</Label>
                <div className="flex gap-2">
                  {GROUP_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`w-7 h-7 rounded-full border-2 transition-all ${form.colorHex === color ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setForm({ ...form, colorHex: color })}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="submit" >Criar Grupo</Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Groups list */}
      {groups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum grupo criado ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.id} className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: group.colorHex || '#22c55e' }}
                    />
                    <div>
                      <CardTitle className="text-base">{group.name}</CardTitle>
                      {group.muscleTarget && (
                        <CardDescription>{group.muscleTarget}</CardDescription>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{group.exercises?.length || 0} exercícios</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
                    >
                      {expandedGroup === group.id
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />
                      }
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
                      onClick={() => handleDelete(group.id, group.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expandedGroup === group.id && (
                <CardContent className="space-y-4">
                  {group.description && (
                    <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
                      {group.description}
                    </p>
                  )}

                  {/* Existing exercises */}
                  {(group.exercises || []).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Exercícios do grupo</p>
                      {group.exercises.map((ex) => (
                        <div key={ex.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Dumbbell className="w-4 h-4 text-primary shrink-0" />
                            <div>
                              <p className="text-sm font-medium">{ex.name}</p>
                              <p className="text-xs text-muted-foreground">{ex.equipmentName} • {ex.sets}x{ex.reps} • {ex.restSeconds}s descanso</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <a
                              href={getYouTubeSearchUrl(ex.videoSearchQuery)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:text-primary/80"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-400"
                              onClick={() => handleRemoveExercise(group.id, ex.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add exercises from equipment */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                      Adicionar exercício de um aparelho
                    </p>
                    <div className="space-y-3">
                      {equipment.map((eq) =>
                        (eq.exercises as Exercise[] | undefined)?.map((ex) => (
                          <div key={`${eq.id}-${ex.name}`} className="flex items-center justify-between p-3 border border-border rounded-lg hover:border-primary/30 transition-colors">
                            <div>
                              <p className="text-sm font-medium">{ex.name}</p>
                              <p className="text-xs text-muted-foreground">{eq.name} • {ex.sets}x{ex.reps}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleAddExercise(group.id, {
                                  ...ex,
                                  equipmentId: eq.id,
                                  equipmentName: eq.name,
                                  imageUrl: eq.imageUrl,
                                })
                              }
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Adicionar
                            </Button>
                          </div>
                        ))
                      )}
                      {equipment.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhum aparelho cadastrado. Cadastre aparelhos primeiro.
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
