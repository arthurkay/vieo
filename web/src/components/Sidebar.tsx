import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useTheme } from './theme-provider'
import { useAuth } from '@/hooks/use-auth'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard,
  Radio,
  Video,
  Activity,
  Moon,
  Sun,
  Menu,
  X,
  LogOut,
} from 'lucide-react'

export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-md bg-card border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      aria-label="Toggle menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  )
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setTheme, resolvedTheme } = useTheme()
  const { user, logout } = useAuth()
  const location = useLocation()
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    onClose()
  }, [location.pathname])

  const links = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/channels', label: 'Channels', icon: Radio },
    ...(isAdmin ? [
      { to: '/sources', label: 'Sources', icon: Video },
      { to: '/jobs', label: 'Jobs', icon: Activity },
    ] : []),
  ]

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-56 bg-card flex flex-col border-r transition-transform duration-200 ease-in-out',
          'md:relative md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-primary-foreground font-bold text-sm">
              v
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">vieo</h1>
              <p className="text-[10px] text-muted-foreground -mt-0.5">streaming platform</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded text-muted-foreground hover:bg-accent"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t space-y-3">
          {user && (
            <div className="px-3 py-1">
              <p className="text-xs text-muted-foreground">Signed in as</p>
              <p className="text-sm font-medium truncate">{user.username}</p>
            </div>
          )}
          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <Separator />
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
