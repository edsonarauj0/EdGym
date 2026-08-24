import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  requireAdmin?: boolean
  userOnly?: boolean
}

export function ProtectedRoute({ requireAdmin = false, userOnly = false }: ProtectedRouteProps) {
  const { currentUser, appUser, isAdmin, loading } = useAuth()

  // 1. Aguarda Firebase Auth inicializar
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // 2. Não autenticado → login
  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  // 3. Autenticado mas perfil Firestore ainda não chegou → aguarda
  //    Evita redirect prematuro antes de saber o role real
  if (!appUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // 4. Rota admin → não-admin vai para dashboard
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  // 5. Rota de usuário → admin vai para painel admin
  if (userOnly && isAdmin) {
    return <Navigate to="/admin" replace />
  }

  return <Outlet />
}
