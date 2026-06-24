import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar, { SidebarToggle } from './components/Sidebar'
import StorageBanner from './components/storage-banner'
import Dashboard from './pages/Dashboard'
import Channels from './pages/Channels'
import ChannelDetail from './pages/ChannelDetail'
import Sources from './pages/Sources'
import Jobs from './pages/Jobs'
import Player from './pages/Player'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      <SidebarToggle onClick={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <StorageBanner />
        <Routes>
          <Route path="/player/:outputId" element={
            <div className="flex-1 overflow-hidden">
              <Player />
            </div>
          } />
          <Route path="*" element={
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/channels" element={<Channels />} />
                <Route path="/channels/:id" element={<ChannelDetail />} />
                <Route path="/sources" element={<Sources />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          } />
        </Routes>
      </div>
    </div>
  )
}
