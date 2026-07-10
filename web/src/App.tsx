import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import Sidebar, { SidebarToggle } from './components/Sidebar'
import StorageBanner from './components/storage-banner'
import Dashboard from './pages/Dashboard'
import Channels from './pages/Channels'
import ChannelDetail from './pages/ChannelDetail'
import Sources from './pages/Sources'
import Jobs from './pages/Jobs'
import Player from './pages/Player'
import Login from './pages/Login'
import Users from './pages/Users'
import { Loader2 } from 'lucide-react'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()

  return (
    <div className="flex h-screen bg-background">
      <SidebarToggle onClick={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <StorageBanner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/player/:outputId" element={
            <div className="flex-1 overflow-hidden">
              <Player />
            </div>
          } />
          <Route path="*" element={
            <ProtectedRoute>
              <main className="flex-1 overflow-y-auto">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/channels" element={<Channels />} />
                  <Route path="/channels/:id" element={<ChannelDetail />} />
                  {user?.role === 'admin' && (
                    <>
                      <Route path="/sources" element={<Sources />} />
                      <Route path="/jobs" element={<Jobs />} />
                      <Route path="/users" element={<Users />} />
                    </>
                  )}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </ProtectedRoute>
          } />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
