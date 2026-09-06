import { useEffect, useState } from 'react'
import { collection, query, where, getDocs, doc, getDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { WorkoutGroup, PersonalWorkout } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dumbbell, Plus, Trash2, Loader2, Play } from 'lucide-react'
import { WorkoutRegistrationDialog } from '@/components/user/WorkoutRegistrationDialog'
import { toast } from 'sonner'

export function UserWorkoutsPage() {
  const { appUser } = useAuth()
  const [personalGroups, setPersonalGroups] = useState<WorkoutGroup[]>([])
  const [assignedGroups, setAssignedGroups] = useState<WorkoutGroup[]>([])
  const [personalWorkout, setPersonalWorkout] = useState<PersonalWorkout | null>(null)
  
  const [loading, setLoading] = useState(true)
  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [selectedGroupToStart, setSelectedGroupToStart] = useState<string | undefined>()

  const loadWorkouts = async () => {
    if (!appUser) return
    setLoading(true)
    try {
      // Load personal groups created by the AI for this user
      const pgQuery = query(collection(db, 'workoutGroups'), where('ownerId', '==', appUser.uid))
      const pgSnap = await getDocs(pgQuery)
      setPersonalGroups(pgSnap.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutGroup)))

      // Load legacy single personal workout (created by admin)
      const pwSnap = await getDoc(doc(db, 'personalWorkouts', appUser.uid))
      if (pwSnap.exists()) {
        setPersonalWorkout({ id: pwSnap.id, ...pwSnap.data() } as PersonalWorkout)
      } else {
        setPersonalWorkout(null)
      }

      // Load assigned global groups
      const { assignedGroupIds = [] } = appUser
      const validGroupIds = assignedGroupIds.filter((id: string) => id && id.trim() !== '')
      if (validGroupIds.length > 0) {
        const groupsSnaps = await Promise.all(
          validGroupIds.map((groupId: string) => getDoc(doc(db, 'workoutGroups', groupId)))
        )
        setAssignedGroups(groupsSnaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() } as WorkoutGroup)))
      } else {
        setAssignedGroups([])
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro ao carregar treinos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorkouts()
  }, [appUser])

  const handleDeletePersonalGroup = async (groupId: string) => {
    if (!confirm('Deseja excluir este grupo de treino?')) return
    try {
      await deleteDoc(doc(db, 'workoutGroups', groupId))
      toast.success('Grupo excluído.')
      loadWorkouts()
    } catch (err) {
      toast.error('Erro ao excluir grupo.')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const allGroups = [
    ...(personalWorkout ? [{...personalWorkout, isLegacy: true} as any] : []),
    ...personalGroups,
    ...assignedGroups
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Dumbbell className="w-6 h-6 text-primary" />
          Meus Treinos
        </h1>
        <p className="text-muted-foreground mt-1">
          Seus grupos de treino personalizados e atribuídos.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {personalGroups.map(group => (
          <Card key={group.id} className="border-primary/50 relative">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{group.name}</CardTitle>
                  <CardDescription className="text-xs mt-1">Criado pela IA (Personalizado)</CardDescription>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive h-8 w-8 -mt-2 -mr-2" onClick={() => handleDeletePersonalGroup(group.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{group.exercises?.length || 0} exercícios</p>
              <Button className="w-full" onClick={() => { setSelectedGroupToStart(group.id); setRegistrationOpen(true) }}>
                <Play className="w-4 h-4 mr-2" /> Iniciar
              </Button>
            </CardContent>
          </Card>
        ))}

        {personalWorkout && (
          <Card key={personalWorkout.id} className="border-secondary">
            <CardHeader>
              <CardTitle className="text-lg">{personalWorkout.name}</CardTitle>
              <CardDescription className="text-xs mt-1">Treino Personalizado (Admin)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{personalWorkout.exercises?.length || 0} exercícios</p>
              <Button className="w-full" onClick={() => { setSelectedGroupToStart(personalWorkout.id); setRegistrationOpen(true) }}>
                <Play className="w-4 h-4 mr-2" /> Iniciar
              </Button>
            </CardContent>
          </Card>
        )}

        {assignedGroups.map(group => (
          <Card key={group.id} className="border-border">
            <CardHeader>
              <CardTitle className="text-lg">{group.name}</CardTitle>
              <CardDescription className="text-xs mt-1">Treino Padrão</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{group.exercises?.length || 0} exercícios</p>
              <Button className="w-full" onClick={() => { setSelectedGroupToStart(group.id); setRegistrationOpen(true) }}>
                <Play className="w-4 h-4 mr-2" /> Iniciar
              </Button>
            </CardContent>
          </Card>
        ))}

        {allGroups.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-lg">
            Você ainda não possui treinos.<br/>
            Peça para a IA (Robô Ed) criar grupos personalizados para você!
          </div>
        )}
      </div>

      <WorkoutRegistrationDialog
        groups={[...assignedGroups, ...personalGroups]}
        personalWorkout={personalWorkout}
        defaultGroupId={selectedGroupToStart}
        open={registrationOpen}
        onOpenChange={setRegistrationOpen}
        onRegistered={loadWorkouts}
      />
    </div>
  )
}
