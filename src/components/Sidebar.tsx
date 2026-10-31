import { FolderTree, GitBranch, Minus, Search } from 'lucide-react'
import { useAppStore } from '../store'
import { Window } from './Chrome'
import { FileTree, FilesToolbar } from './FileTree'
import { SearchPanel } from './SearchPanel'
import { GitPanel } from './GitPanel'

export function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const tree = useAppStore((state) => state.tree)
  const treeLoading = useAppStore((state) => state.treeLoading)
  const sidebarView = useAppStore((state) => state.sidebarView)
  const setSidebarView = useAppStore((state) => state.setSidebarView)
  const health = useAppStore((state) => state.health)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const isMobile = useAppStore((state) => state.isMobile)

  return (
    <Window
      className="sidebar-win"
      title="EXPLORER"
      meta={health?.workspace.name || 'workspace'}
      actions={
        !mobile && !isMobile ? (
          <button className="win-btn" title="Collapse sidebar (Ctrl+B)" onClick={toggleSidebar}>
            <Minus size={12} />
          </button>
        ) : null
      }
    >
      <div className="side-tabs">
        <button
          className={`side-tab ${sidebarView === 'files' ? 'active' : ''}`}
          onClick={() => setSidebarView('files')}
        >
          <FolderTree size={11} /> FILES
        </button>
        <button
          className={`side-tab ${sidebarView === 'search' ? 'active' : ''}`}
          onClick={() => setSidebarView('search')}
        >
          <Search size={11} /> SEARCH
        </button>
        <button
          className={`side-tab ${sidebarView === 'git' ? 'active' : ''}`}
          onClick={() => setSidebarView('git')}
        >
          <GitBranch size={11} /> GIT
        </button>
      </div>

      {sidebarView === 'files' ? (
        <>
          <FilesToolbar />
          <div className="side-scroll">
            {treeLoading && tree.length === 0 ? (
              <div className="side-empty">
                <span className="blink-square" style={{ display: 'inline-block', width: 5, height: 5, background: 'var(--accent)', marginRight: 6 }} />
                READING WORKSPACE
              </div>
            ) : tree.length === 0 ? (
              <div className="side-empty">WORKSPACE IS EMPTY<br />Create a file to begin.</div>
            ) : (
              <FileTree nodes={tree} />
            )}
          </div>
        </>
      ) : null}

      {sidebarView === 'search' ? <SearchPanel /> : null}
      {sidebarView === 'git' ? <GitPanel /> : null}
    </Window>
  )
}
