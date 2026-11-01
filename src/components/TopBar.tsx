import {
  Code2,
  Cpu,
  Database,
  Download,
  GitBranch,
  PanelLeft,
  Save,
  Settings,
  Terminal,
} from 'lucide-react'
import { useAppStore, effectiveModel } from '../store'
import { basename } from '../lib/format'
import { useClock } from '../lib/hooks'
import { modelShort } from '../lib/providers'
import { Logo } from './Chrome'

export function TopBar() {
  const health = useAppStore((state) => state.health)
  const settings = useAppStore((state) => state.settings)
  const git = useAppStore((state) => state.git)
  const indexStatus = useAppStore((state) => state.indexStatus)
  const tabs = useAppStore((state) => state.tabs)
  const activePath = useAppStore((state) => state.activePath)
  const chatMode = useAppStore((state) => state.chatMode)
  const chatModel = useAppStore((state) => state.chatModel)
  const terminalOpen = useAppStore((state) => state.terminalOpen)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const isMobile = useAppStore((state) => state.isMobile)
  const saveTab = useAppStore((state) => state.saveTab)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const setTerminalOpen = useAppStore((state) => state.setTerminalOpen)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const setExportOpen = useAppStore((state) => state.setExportOpen)
  const setSidebarView = useAppStore((state) => state.setSidebarView)
  const setMobileTab = useAppStore((state) => state.setMobileTab)

  const activeTab = tabs.find((tab) => tab.path === activePath)
  const model = effectiveModel(settings, chatMode, chatModel)
  const branch = git?.isRepo ? git.branch : null
  const indexed = indexStatus?.indexed ?? health?.index.indexed ?? 0
  const projectName = health?.workspace.name || 'workspace'
  const clock = useClock()

  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <span className="brand-name">INTEGRAL</span>
        <span className="brand-pro">PRO</span>
      </div>
      <div className="top-sep" />
      <div className="top-project" title={health?.workspace.path}>
        <span>{isMobile && activeTab ? 'FILE' : 'PROJECT'}</span>
        <strong>{isMobile && activeTab ? basename(activeTab.path) : projectName}</strong>
      </div>
      {branch ? (
        <div className="top-branch" title="Current git branch">
          <span className="dot" />
          <GitBranch size={10} />
          {branch}
        </div>
      ) : null}
      <div className="top-spacer" />
      {!isMobile ? (
        <>
          <button
            className="top-chip model-chip"
            title={`${model?.provider.name || 'No provider'} · ${model?.model || 'no model'} — open routing settings`}
            onClick={() => setSettingsOpen(true)}
          >
            <Cpu size={11} />
            <span className="chip-value">{model ? modelShort(model.model) : 'NO MODEL'}</span>
          </button>
          <button
            className="top-chip index-chip"
            title="Project index — open search"
            onClick={() => {
              setSidebarView('search')
              setMobileTab('files')
            }}
          >
            <Database size={10} />
            <span className="chip-value">IDX {indexStatus?.indexing ? '…' : indexed}</span>
          </button>
          <span className="top-clock">{clock}</span>
          <div className="top-sep" />
          <button
            className={`icon-btn ${sidebarCollapsed ? '' : 'is-active'}`}
            title="Toggle sidebar (Ctrl+B)"
            onClick={toggleSidebar}
          >
            <PanelLeft size={14} />
          </button>
          <button
            className={`icon-btn ${terminalOpen ? 'is-active' : ''}`}
            title="Toggle terminal (Ctrl+J)"
            onClick={() => setTerminalOpen(!terminalOpen)}
          >
            <Terminal size={14} />
          </button>
        </>
      ) : null}
      {activeTab?.dirty ? (
        <button
          className="icon-btn is-active"
          title="Save current file (Ctrl+S)"
          onClick={() => void saveTab(activeTab.path)}
        >
          <Save size={14} />
        </button>
      ) : null}
      <a
        className="icon-btn"
        href="https://github.com/farhajmaaz-eng/integral-pro"
        target="_blank"
        rel="noreferrer"
        title="Source on GitHub"
        aria-label="GitHub repository"
        style={isMobile ? { display: 'none' } : undefined}
      >
        <Code2 size={14} />
      </a>
      <button
        className="icon-btn"
        title="Export workspace, chat or settings (Ctrl+Shift+E)"
        aria-label="Export"
        onClick={() => setExportOpen(true)}
      >
        <Download size={14} />
      </button>
      <button className="icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}>
        <Settings size={14} />
      </button>
    </header>
  )
}
