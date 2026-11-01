import { useAppStore, effectiveModel } from '../store'
import { basename } from '../lib/format'
import { modelShort } from '../lib/providers'

export function StatusBar() {
  const activePath = useAppStore((state) => state.activePath)
  const cursor = useAppStore((state) => state.cursor)
  const settings = useAppStore((state) => state.settings)
  const health = useAppStore((state) => state.health)
  const git = useAppStore((state) => state.git)
  const indexStatus = useAppStore((state) => state.indexStatus)
  const running = useAppStore((state) => state.running)
  const connected = useAppStore((state) => state.connected)
  const chatMode = useAppStore((state) => state.chatMode)
  const chatModel = useAppStore((state) => state.chatModel)
  const model = effectiveModel(settings, chatMode, chatModel)
  const branch = git?.isRepo ? git.branch : 'no-git'
  const indexed = indexStatus?.indexed ?? health?.index.indexed ?? 0

  return (
    <footer className="statusbar">
      <div className={`status-mode ${running ? 'agent' : ''}`}>
        {running ? 'AGENT' : 'NORMAL'}
      </div>
      <div className="status-item" title={activePath || 'No file open'}>
        {activePath ? basename(activePath) : 'no file'}
      </div>
      <div className="status-item">
        <span className="dim">Ln</span> {cursor.line}
        <span className="dim">, Col</span> {cursor.column}
      </div>
      <div className="status-item">SPACES: 2</div>
      <div className="status-item">UTF-8</div>
      <div className="status-item">LF</div>
      <div className="status-spacer" />
      <div className="status-item right" title="Project index">
        <span className={`status-dot ${indexStatus?.indexing ? 'amber' : indexed > 0 ? '' : 'off'}`} />
        IDX {indexStatus?.indexing ? 'INDEXING' : indexed}
      </div>
      <div className="status-item right" title="Git branch">
        <span className="dim">git:</span>
        {branch}
      </div>
      <div className="status-item right" title={model ? `${model.provider.name} · ${model.model}` : 'No model configured'}>
        <span className="dim">model:</span>
        {model ? modelShort(model.model) : 'none'}
      </div>
      <div className="status-item right">
        <span className={`status-dot ${connected ? '' : 'off'}`} />
        {connected ? 'LIVE' : 'OFFLINE'}
      </div>
      <div className="status-item right">∫ v{health?.version || '0.2.0'}</div>
    </footer>
  )
}
