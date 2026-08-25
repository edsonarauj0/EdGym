import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { UserLayout } from '@/components/user/UserLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { AdminDashboard } from '@/pages/admin/AdminDashboard'
import { EquipmentPage } from '@/pages/admin/EquipmentPage'
import { WorkoutGroupsPage } from '@/pages/admin/WorkoutGroupsPage'
import { UsersPage } from '@/pages/admin/UsersPage'
import { UserProfilePage } from '@/pages/admin/UserProfilePage'
import { UserDashboard } from '@/pages/user/UserDashboard'
import { SessionPage } from '@/pages/user/SessionPage'
import { CalendarPage } from '@/pages/user/CalendarPage'
import { ProgressPage } from '@/pages/user/ProgressPage'

// Redireciona baseado no role — dentro do AuthProvider para usar useAuth()
function RoleRedirect() {
  const { isAdmin, loading, currentUser } = useAuth()
  if (loading) return null
  if (!currentUser) return <Navigate to="/login" replace />
  return <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />
}

// Rotas separadas para que RoleRedirect possa usar useAuth() dentro do AuthProvider
function AppRoutes() {
  return (
    <>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RoleRedirect />} />

        {/* Admin routes */}
        <Route element={<ProtectedRoute requireAdmin />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/equipment" element={<EquipmentPage />} />
            <Route path="/admin/groups" element={<WorkoutGroupsPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/users/:uid" element={<UserProfilePage />} />
          </Route>
        </Route>

        {/* User routes — userOnly redireciona admins para /admin */}
        <Route element={<ProtectedRoute userOnly />}>
          <Route element={<UserLayout />}>
            <Route path="/dashboard" element={<UserDashboard />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/progress" element={<ProgressPage />} />
          </Route>
          <Route path="/session/:groupId" element={<SessionPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<RoleRedirect />} />
      </Routes>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'hsl(222.2 84% 6%)',
            border: '1px solid hsl(217.2 32.6% 17.5%)',
            color: 'hsl(210 40% 98%)',
          },
        }}
      />
    </>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
