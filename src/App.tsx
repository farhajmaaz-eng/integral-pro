import { useEffect } from 'react'
import { useAppStore } from './store'
import { useMediaQuery } from './lib/hooks'
import { TopBar } from './components/TopBar'
import { Workspace } from './components/Workspace'
import { StatusBar } from './components/StatusBar'
import { MobileNav } from './components/MobileNav'
import { SettingsModal } from './components/SettingsModal'
import { ApprovalModal } from './components/ApprovalModal'
import { DiffModal } from './components/DiffModal'
import { Palette } from './components/Palette'
import { FileDialog } from './components/FileDialog'
import { Toasts } from './components/Toasts'
import { AuthGate, BootScreen } from './components/AuthGate'

export function App() {
  const authChecked = useAppStore((state) => state.authChecked)
  const authRequired = useAppStore((state) => state.authRequired)
  const loadHealth = useAppStore((state) => state.loadHealth)
  const setIsMobile = useAppStore((state) => state.setIsMobile)
  const isMobile = useMediaQuery('(max-width: 900px)')

  useEffect(() => {
    setIsMobile(isMobile)
  }, [isMobile, setIsMobile])

  useEffect(() => {
    void loadHealth()
  }, [loadHealth])

  useEffect(() => {
    const onUnauthorized = () => useAppStore.getState().setAuthRequired(true)
    window.addEventListener('integral:unauthorized', onUnauthorized)
    return () => window.removeEventListener('integral:unauthorized', onUnauthorized)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useAppStore.getState()
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        if (event.shiftKey) void state.saveAll()
        else if (state.activePath) void state.saveTab(state.activePath)
      } else if (key === 'p') {
        event.preventDefault()
        state.setPalette('files')
      } else if (key === 'k') {
        event.preventDefault()
        state.setPalette('commands')
      } else if (key === 'j') {
        event.preventDefault()
        state.setTerminalOpen(!state.terminalOpen)
        if (state.isMobile) state.setMobileTab(state.mobileTab === 'terminal' ? 'editor' : 'terminal')
      } else if (key === 'b') {
        event.preventDefault()
        state.toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!authChecked) return <BootScreen />
  if (authRequired) {
    return (
      <>
        <AuthGate />
        <Toasts />
      </>
    )
  }

  return (
    <div className="app-shell">
      <TopBar />
      <Workspace />
      <StatusBar />
      <MobileNav />
      <SettingsModal />
      <ApprovalModal />
      <DiffModal />
      <Palette />
      <FileDialog />
      <Toasts />
    </div>
  )
}
