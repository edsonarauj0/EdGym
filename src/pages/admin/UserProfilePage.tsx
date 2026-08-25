import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore'
import { ArrowLeft, Dumbbell, Loader2, UserCheck, Users } from 'lucide-react'
import { toast } from 'sonner'

import { db } from '@/lib/firebase'
import { AppUser, WorkoutGroup } from '@/types'
import { PersonalWorkoutEditorDialog } from '@/components/admin/PersonalWorkoutEditorDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function UserProfilePage() {
  const { uid } = useParams<{ uid: string }>()
  const navigate = useNavigate()
  const [user, setUser] = useState<AppUser | null>(null)
  const [groups, setGroups] = useState<WorkoutGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [editingWorkout, setEditingWorkout] = useState(false)

  const load = async () => {
    if (!uid) return
    setLoading(true)
    try {
      const [userSnapshot, groupsSnapshot] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDocs(collection(db, 'workoutGroups')),
      ])
      if (userSnapshot.exists()) setUser({ uid: userSnapshot.id, ...userSnapshot.data() } as AppUser)
      setGroups(groupsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() } as WorkoutGroup)))
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível carregar o perfil do aluno.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [uid])

  const toggleGroup = async (group: WorkoutGroup) => {
    if (!user) return
    const current = user.assignedGroupIds || []
    const assignedGroupIds = current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id]
    try {
      await updateDoc(doc(db, 'users', user.uid), { assignedGroupIds, currentGroupIndex: 0 })
      await updateDoc(doc(db, 'workoutGroups', group.id), {
        assignedUserIds: assignedGroupIds.includes(group.id)
          ? Array.from(new Set([...(group.assignedUserIds || []), user.uid]))
          : (group.assignedUserIds || []).filter((id) => id !== user.uid),
      })
      setUser({ ...user, assignedGroupIds, currentGroupIndex: 0 })
      setGroups((items) => items.map((item) => item.id === group.id ? {
        ...item,
        assignedUserIds: assignedGroupIds.includes(group.id)
          ? Array.from(new Set([...(item.assignedUserIds || []), user.uid]))
          : (item.assignedUserIds || []).filter((id) => id !== user.uid),
      } : item))
      toast.success('Grupos atualizados.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível atualizar os grupos.')
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>
  if (!user) return <div className="space-y-4"><Button variant="ghost" onClick={() => navigate('/admin/users')}><ArrowLeft className="size-4" /> Voltar</Button><p className="text-muted-foreground">Usuário não encontrado.</p></div>

  return <div className="mx-auto max-w-4xl space-y-6">
    <Button variant="ghost" onClick={() => navigate('/admin/users')}><ArrowLeft className="size-4" /> Usuários</Button>
    <Card className="border-primary/25"><CardContent className="flex items-center gap-4 p-5"><div className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-xl font-bold text-primary">{user.name?.charAt(0).toUpperCase() || 'U'}</div><div className="min-w-0 flex-1"><h1 className="text-2xl font-bold">{user.name}</h1><p className="text-muted-foreground">{user.email}</p></div><Badge>{user.assignedGroupIds?.length || 0} grupos</Badge></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Dumbbell className="size-5 text-primary" /> Treino personalizado</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-muted-foreground">Monte uma lista exclusiva de exercícios ou deixe a IA criar uma sugestão para este aluno.</p><Button onClick={() => setEditingWorkout(true)}>Editar treino</Button></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-5 text-primary" /> Grupos de treino</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{groups.map((group) => { const assigned = user.assignedGroupIds?.includes(group.id); return <button key={group.id} onClick={() => toggleGroup(group)} className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${assigned ? 'border-primary bg-primary/10' : 'hover:border-primary/40'}`}><span className="size-3 rounded-full" style={{ backgroundColor: group.colorHex || '#22c55e' }} /><span className="flex-1 text-sm font-medium">{group.name}</span>{assigned && <UserCheck className="size-4 text-primary" />}</button> })}{groups.length === 0 && <p className="text-sm text-muted-foreground">Nenhum grupo criado ainda.</p>}</CardContent></Card>
    <PersonalWorkoutEditorDialog user={user} open={editingWorkout} onOpenChange={setEditingWorkout} />
  </div>
}
