import { Bot, FileCode, Folder, GitBranch, Terminal } from 'lucide-react'
import { useAppStore } from '../store'
import type { MobileTab } from '../lib/types'

const TABS: Array<{ id: MobileTab; label: string; icon: typeof Folder }> = [
  { id: 'files', label: 'FILES', icon: Folder },
  { id: 'editor', label: 'EDIT', icon: FileCode },
  { id: 'agent', label: 'AGENT', icon: Bot },
  { id: 'terminal', label: 'TERM', icon: Terminal },
  { id: 'git', label: 'GIT', icon: GitBranch },
]

export function MobileNav() {
  const mobileTab = useAppStore((state) => state.mobileTab)
  const setMobileTab = useAppStore((state) => state.setMobileTab)
  const running = useAppStore((state) => state.running)

  return (
    <nav className="mobile-nav" aria-label="Workspace panels">
      {TABS.map((tab, index) => {
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            className={mobileTab === tab.id ? 'active' : ''}
            onClick={() => setMobileTab(tab.id)}
            aria-current={mobileTab === tab.id ? 'page' : undefined}
          >
            <span className="nav-index">{index + 1}</span>
            <Icon className="nav-icon" size={15} />
            <span className="nav-label">{tab.label}</span>
            {tab.id === 'agent' && running ? (
              <span
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 8,
                  width: 5,
                  height: 5,
                  background: 'var(--accent)',
                }}
              />
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}
