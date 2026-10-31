import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          pre: ({ children }) => <pre className="md-pre">{children}</pre>,
          code: ({ className, children }) => {
            const block = Boolean(className && className.includes('language-'))
            return <code className={block ? 'md-code-block' : 'md-inline-code'}>{children}</code>
          },
          table: ({ children }) => (
            <div className="md-table-wrap">
              <table>{children}</table>
            </div>
          ),
          input: ({ checked, type }) =>
            type === 'checkbox' ? <input type="checkbox" checked={checked} readOnly /> : null,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
