import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword as fbCreateUser, signOut } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { AppUser, WorkoutGroup } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Users, Plus, Loader2, UserCheck, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'

export function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [groups, setGroups] = useState<WorkoutGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersSnap, groupsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'workoutGroups')),
      ])
      const allUsers = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser))
      setUsers(allUsers.filter((u) => u.role !== 'admin'))
      setGroups(groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkoutGroup)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)

    // Instância secundária e isolada do Auth: criar o usuário aqui não afeta
    // a sessão do admin que está logado na instância principal (`auth`).
    const secondaryApp = initializeApp(auth.app.options, `secondary-${Date.now()}`)
    const secondaryAuth = getAuth(secondaryApp)

    try {
      const cred = await fbCreateUser(secondaryAuth, newUser.email, newUser.password)

      // setDoc com o uid como ID do documento — é assim que o AuthContext
      // consegue encontrar o perfil depois via doc(db, 'users', uid)
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name: newUser.name,
        email: newUser.email,
        role: 'user',
        assignedGroupIds: [],
        currentGroupIndex: 0,
        createdAt: serverTimestamp(),
      })

      toast.success(`Usuário ${newUser.name} criado com sucesso!`)
      setNewUser({ name: '', email: '', password: '' })
      setShowCreateForm(false)
      await loadData()
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code
      if (errorCode === 'auth/email-already-in-use') {
        toast.error('Este email já está em uso.')
      } else {
        toast.error('Erro ao criar usuário.')
        console.error(err)
      }
    } finally {
      await signOut(secondaryAuth).catch(() => {})
      await deleteApp(secondaryApp).catch(() => {})
      setCreating(false)
    }
  }

  const handleToggleGroup = async (user: AppUser, groupId: string) => {
    const current = user.assignedGroupIds || []
    const updated = current.includes(groupId)
      ? current.filter((id) => id !== groupId)
      : [...current, groupId]

    // Find the user's doc by uid
    const usersSnap = await getDocs(collection(db, 'users'))
    const userDoc = usersSnap.docs.find((d) => d.data().uid === user.uid)
    if (!userDoc) return

    await updateDoc(doc(db, 'users', userDoc.id), {
      assignedGroupIds: updated,
      currentGroupIndex: 0, // reset rotation
    })

    // Update group's assignedUserIds
    for (const g of groups) {
      const wasAssigned = g.assignedUserIds?.includes(user.uid)
      const shouldBeAssigned = updated.includes(g.id)
      if (wasAssigned !== shouldBeAssigned) {
        const newAssigned = shouldBeAssigned
          ? [...(g.assignedUserIds || []), user.uid]
          : (g.assignedUserIds || []).filter((id) => id !== user.uid)
        await updateDoc(doc(db, 'workoutGroups', g.id), { assignedUserIds: newAssigned })
      }
    }

    toast.success('Grupos atualizados!')
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
            <Users className="w-6 h-6 text-primary" />
            Usuários
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie usuários e atribua grupos de treino
          </p>
        </div>
        <Button  onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="w-4 h-4" />
          Novo Usuário
        </Button>
      </div>

      {/* Create user form */}
      {showCreateForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Criar novo usuário</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="user-name">Nome completo *</Label>
                  <Input
                    id="user-name"
                    placeholder="João Silva"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-email">Email *</Label>
                  <Input
                    id="user-email"
                    type="email"
                    placeholder="joao@email.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-password">Senha inicial *</Label>
                  <Input
                    id="user-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    minLength={6}
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="submit"  disabled={creating}>
                  {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : 'Criar Usuário'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Users list */}
      {users.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum usuário cadastrado ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader><CardTitle className="text-base">Perfis dos alunos</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-y bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-6 py-3 font-medium">Aluno</th><th className="px-6 py-3 font-medium">E-mail</th><th className="px-6 py-3 font-medium">Grupos</th></tr></thead>
                  <tbody>{users.map((user) => <tr key={user.uid} className="border-b last:border-0 hover:bg-muted/30"><td className="px-6 py-3"><button className="font-semibold text-primary hover:underline" onClick={() => navigate(`/admin/users/${user.uid}`)}>{user.name}</button></td><td className="px-6 py-3 text-muted-foreground">{user.email}</td><td className="px-6 py-3"><Badge variant="secondary">{user.assignedGroupIds?.length || 0}</Badge></td></tr>)}</tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          {users.map((user) => (
            <Card key={user.uid} className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                      {user.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <p className="font-semibold">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>
                      {user.assignedGroupIds?.length || 0} grupos
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setExpandedUser(expandedUser === user.uid ? null : user.uid)}
                    >
                      {expandedUser === user.uid ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expandedUser === user.uid && (
                <CardContent>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                    Grupos atribuídos (clique para ativar/desativar)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {groups.map((group) => {
                      const isAssigned = user.assignedGroupIds?.includes(group.id)
                      return (
                        <button
                          key={group.id}
                          onClick={() => handleToggleGroup(user, group.id)}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                            isAssigned
                              ? 'border-primary/50 bg-primary/10 text-foreground'
                              : 'border-border hover:border-primary/30 text-muted-foreground'
                          }`}
                        >
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: group.colorHex || '#22c55e' }}
                          />
                          <span className="text-sm flex-1">{group.name}</span>
                          {isAssigned && <UserCheck className="w-4 h-4 text-primary" />}
                        </button>
                      )
                    })}
                    {groups.length === 0 && (
                      <p className="text-sm text-muted-foreground col-span-2">
                        Nenhum grupo criado ainda.
                      </p>
                    )}
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
