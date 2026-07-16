import { useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import Sidebar, { SidebarToggle } from './components/Sidebar'
import StorageBanner from './components/storage-banner'
import ErrorBoundary from './components/error-boundary'
import Dashboard from './pages/Dashboard'
import Channels from './pages/Channels'
import ChannelDetail from './pages/ChannelDetail'
import Sources from './pages/Sources'
import Jobs from './pages/Jobs'
import Player from './pages/Player'
import Login from './pages/Login'
import Users from './pages/Users'
import Recordings from './pages/Recordings'
import Multiview from './pages/Multiview'
import Cameras from './pages/Cameras'
import BrowseChannels from './pages/BrowseChannels'
import BrowsePlayer from './pages/BrowsePlayer'
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
  const location = useLocation()

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
              <ErrorBoundary key={location.key}>
                <Player />
              </ErrorBoundary>
            </div>
          } />
          <Route path="/browse" element={
            <main className="flex-1 overflow-y-auto">
              <BrowseChannels />
            </main>
          } />
          <Route path="/browse/:channelIndex" element={
            <main className="flex-1 overflow-y-auto">
              <ErrorBoundary key={location.key}>
                <BrowsePlayer />
              </ErrorBoundary>
            </main>
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
                      <Route path="/recordings" element={<Recordings />} />
                      <Route path="/multiview" element={<Multiview />} />
                      <Route path="/cameras" element={<Cameras />} />
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
        <Toaster richColors position="bottom-right" />
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
