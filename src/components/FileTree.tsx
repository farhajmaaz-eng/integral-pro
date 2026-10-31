import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { api } from '../lib/api'
import { basename, dirname } from '../lib/format'
import { useAppStore } from '../store'
import type { FileNode } from '../lib/types'

function iconFor(node: FileNode, expanded: boolean) {
  if (node.type === 'dir') {
    const Icon = expanded ? FolderOpen : Folder
    return <Icon className="file-icon" size={13} />
  }
  const ext = node.name.split('.').pop()?.toLowerCase() || ''
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'rs', 'go', 'py', 'rb', 'java', 'c', 'cpp', 'h', 'css', 'scss', 'html', 'vue', 'svelte'].includes(ext)) {
    return <FileCode className="file-icon" size={13} />
  }
  if (['md', 'mdx', 'txt'].includes(ext)) return <FileText className="file-icon" size={13} />
  return <File className="file-icon" size={13} />
}

type MenuState = { node: FileNode; x: number; y: number } | null

export function FileTree({ nodes, depth = 0 }: { nodes: FileNode[]; depth?: number }) {
  const expanded = useAppStore((state) => state.expanded)
  const toggleDir = useAppStore((state) => state.toggleDir)
  const openFile = useAppStore((state) => state.openFile)
  const activePath = useAppStore((state) => state.activePath)
  const setFileDialog = useAppStore((state) => state.setFileDialog)
  const dropPath = useAppStore((state) => state.dropPath)
  const loadTree = useAppStore((state) => state.loadTree)
  const pushToast = useAppStore((state) => state.pushToast)
  const [menu, setMenu] = useState<MenuState>(null)

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [menu])

  function openMenu(event: React.MouseEvent, node: FileNode) {
    event.preventDefault()
    event.stopPropagation()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const x = event.type === 'contextmenu' ? event.clientX : rect.right - 168
    const y = event.type === 'contextmenu' ? event.clientY : rect.bottom + 2
    setMenu({
      node,
      x: Math.min(Math.max(4, x), window.innerWidth - 176),
      y: Math.min(Math.max(4, y), window.innerHeight - 170),
    })
  }

  async function remove(node: FileNode) {
    const ok = window.confirm(`Delete ${node.path}${node.type === 'dir' ? ' and everything inside it' : ''}?`)
    if (!ok) return
    try {
      await api.deleteEntry(node.path)
      dropPath(node.path)
      await loadTree()
      pushToast(`deleted ${node.path}`, 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Delete failed', 'error')
    }
  }

  return (
    <>
      <div className="tree">
        {nodes.map((node) => {
          const open = Boolean(expanded[node.path])
          const selected = activePath === node.path
          return (
            <div key={node.path}>
              <div
                className={`tree-row ${selected ? 'selected' : ''}`}
                style={{ paddingLeft: depth * 12 + 6 }}
                onClick={() => {
                  if (node.type === 'dir') toggleDir(node.path)
                  else void openFile(node.path)
                }}
                onContextMenu={(event) => openMenu(event, node)}
                title={node.path}
              >
                <span className="chev">
                  {node.type === 'dir' ? (
                    open ? <ChevronDown size={11} /> : <ChevronRight size={11} />
                  ) : null}
                </span>
                {iconFor(node, open)}
                <span className="tree-name">{node.name}</span>
                <button
                  className="tree-menu-btn"
                  onClick={(event) => openMenu(event, node)}
                  aria-label={`Actions for ${node.name}`}
                >
                  <MoreHorizontal size={12} />
                </button>
              </div>
              {node.type === 'dir' && open && node.children ? (
                <FileTree nodes={node.children} depth={depth + 1} />
              ) : null}
            </div>
          )
        })}
      </div>

      {menu
        ? createPortal(
            <div
              className="ctx-menu"
              style={{ left: menu.x, top: menu.y }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {menu.node.type === 'file' ? (
                <button
                  onClick={() => {
                    void openFile(menu.node.path)
                    setMenu(null)
                  }}
                >
                  <FileCode size={12} /> OPEN
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setFileDialog({ mode: 'file', target: menu.node.path })
                      setMenu(null)
                    }}
                  >
                    <FilePlus size={12} /> NEW FILE HERE
                  </button>
                  <button
                    onClick={() => {
                      setFileDialog({ mode: 'dir', target: menu.node.path })
                      setMenu(null)
                    }}
                  >
                    <FolderPlus size={12} /> NEW FOLDER HERE
                  </button>
                </>
              )}
              <div className="ctx-sep" />
              <button
                onClick={() => {
                  setFileDialog({ mode: 'rename', target: menu.node.path })
                  setMenu(null)
                }}
              >
                <Pencil size={12} /> RENAME
              </button>
              <button
                className="danger"
                onClick={() => {
                  void remove(menu.node)
                  setMenu(null)
                }}
              >
                <Trash2 size={12} /> DELETE
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export function FilesToolbar() {
  const setFileDialog = useAppStore((state) => state.setFileDialog)
  const loadTree = useAppStore((state) => state.loadTree)
  const setExpanded = useAppStore((state) => state.setExpanded)
  const tree = useAppStore((state) => state.tree)

  function collapseAll() {
    const collect = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === 'dir') {
          setExpanded(node.path, false)
          if (node.children) collect(node.children)
        }
      }
    }
    collect(tree)
  }

  return (
    <div className="side-toolbar">
      <span className="label">WORKSPACE</span>
      <button
        className="icon-btn"
        title="New file"
        onClick={() => setFileDialog({ mode: 'file' })}
      >
        <FilePlus size={13} />
      </button>
      <button
        className="icon-btn"
        title="New folder"
        onClick={() => setFileDialog({ mode: 'dir' })}
      >
        <FolderPlus size={13} />
      </button>
      <button className="icon-btn" title="Refresh tree" onClick={() => void loadTree()}>
        <RefreshCw size={12} />
      </button>
      <button className="icon-btn" title="Collapse all folders" onClick={collapseAll}>
        <ChevronRight size={13} />
      </button>
    </div>
  )
}
