import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Dumbbell,
  LayoutDashboard,
  Users,
  Layers,
  Monitor,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Bot,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AiAssistantPanel } from '@/components/admin/AiAssistantPanel'

const adminLinks = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/equipment', label: 'Aparelhos', icon: Monitor },
  { to: '/admin/groups', label: 'Grupos de Treino', icon: Layers },
  { to: '/admin/users', label: 'Usuários', icon: Users },
]

export function AdminLayout() {
  const { appUser, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-primary to-emerald-400 rounded-lg flex items-center justify-center">
              <Dumbbell className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-bold text-sm">EdGym</p>
              <p className="text-xs text-primary font-medium">Admin</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {adminLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <link.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{link.label}</span>
                  {isActive && <ChevronRight className="w-3 h-3" />}
                </>
              )}
            </NavLink>
          ))}

          {/* Botão IA Personal Trainer */}
          <button
            onClick={() => { setAiOpen(true); setSidebarOpen(false) }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mt-2 text-muted-foreground hover:text-foreground group relative overflow-hidden border border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5"
          >
            <div className="w-4 h-4 shrink-0 relative">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <span className="flex-1 text-left">Personal Trainer IA</span>
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          </button>
        </nav>

        {/* User info + logout */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
              {appUser?.name?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{appUser?.name || 'Admin'}</p>
              <p className="text-xs text-muted-foreground truncate">{appUser?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-4 px-4 py-3 border-b border-border bg-card">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          <div className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm">EdGym Admin</span>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* AI Assistant Panel */}
      <AiAssistantPanel isOpen={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  )
}
