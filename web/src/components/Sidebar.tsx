import { NavLink } from 'react-router-dom'
import { cn } from '../lib/utils'
import { useTheme } from './theme-provider'
import {
  LayoutDashboard,
  Radio,
  Video,
  HardDrive,
  Activity,
  Moon,
  Sun,
} from 'lucide-react'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/channels', label: 'Channels', icon: Radio },
  { to: '/sources', label: 'Sources', icon: Video },
  { to: '/jobs', label: 'Jobs', icon: Activity },
]

export default function Sidebar() {
  const { theme, toggleTheme } = useTheme()

  return (
    <aside className="w-56 border-r bg-card flex flex-col">
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-muted-foreground">vie</span>
          <span className="text-primary">o</span>
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">streaming platform</p>
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
      <div className="p-4 border-t space-y-2">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-3">
          <HardDrive className="h-3 w-3" />
          v1.0.0
        </div>
      </div>
    </aside>
  )
}
