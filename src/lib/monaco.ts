import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker: (moduleId: string, label: string) => Worker
    }
  }
}

window.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

loader.config({ monaco })

monaco.editor.defineTheme('integral', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '5f5d58', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'e8b15a' },
    { token: 'keyword.control', foreground: 'e8b15a' },
    { token: 'string', foreground: '8fb573' },
    { token: 'string.escape', foreground: 'b8c98a' },
    { token: 'number', foreground: 'd96c5f' },
    { token: 'regexp', foreground: 'b07aa1' },
    { token: 'operator', foreground: 'b8b3a7' },
    { token: 'delimiter', foreground: '8b8880' },
    { token: 'type', foreground: '7fa6c9' },
    { token: 'type.identifier', foreground: '7fa6c9' },
    { token: 'class', foreground: '7fa6c9' },
    { token: 'function', foreground: 'e7e3d9' },
    { token: 'variable', foreground: 'd8d3c7' },
    { token: 'variable.predefined', foreground: '7fb3a8' },
    { token: 'constant', foreground: 'd96c5f' },
    { token: 'tag', foreground: 'e8b15a' },
    { token: 'attribute.name', foreground: '7fa6c9' },
    { token: 'attribute.value', foreground: '8fb573' },
    { token: 'meta', foreground: '8b8880' },
    { token: 'key', foreground: '7fa6c9' },
    { token: 'string.key.json', foreground: '7fa6c9' },
    { token: 'string.value.json', foreground: '8fb573' },
    { token: 'invalid', foreground: 'd96c5f' },
  ],
  colors: {
    'editor.background': '#121214',
    'editor.foreground': '#e7e3d9',
    'editorLineNumber.foreground': '#4a4842',
    'editorLineNumber.activeForeground': '#e8b15a',
    'editorCursor.foreground': '#e8b15a',
    'editor.selectionBackground': '#e8b15a30',
    'editor.inactiveSelectionBackground': '#e8b15a18',
    'editor.selectionHighlightBackground': '#e8b15a18',
    'editor.wordHighlightBackground': '#7fa6c918',
    'editor.wordHighlightStrongBackground': '#7fa6c928',
    'editor.lineHighlightBackground': '#ffffff06',
    'editor.lineHighlightBorder': '#00000000',
    'editorIndentGuide.background1': '#26262a',
    'editorIndentGuide.activeBackground1': '#3a3a40',
    'editorWhitespace.foreground': '#2e2e33',
    'editorBracketMatch.background': '#e8b15a16',
    'editorBracketMatch.border': '#e8b15a66',
    'editorGutter.background': '#121214',
    'editorWidget.background': '#17171a',
    'editorWidget.border': '#3a3a40',
    'editorWidget.foreground': '#e7e3d9',
    'editorSuggestWidget.background': '#17171a',
    'editorSuggestWidget.border': '#3a3a40',
    'editorSuggestWidget.selectedBackground': '#2a2a2e',
    'editorSuggestWidget.highlightForeground': '#e8b15a',
    'editorHoverWidget.background': '#17171a',
    'editorHoverWidget.border': '#3a3a40',
    'editorFindMatch.background': '#e8b15a33',
    'editorFindMatchBorder': '#e8b15a88',
    'input.background': '#0e0e10',
    'input.border': '#3a3a40',
    'input.foreground': '#e7e3d9',
    'inputOption.activeBorder': '#e8b15a',
    'dropdown.background': '#17171a',
    'dropdown.border': '#3a3a40',
    'dropdown.foreground': '#e7e3d9',
    'list.hoverBackground': '#1c1c20',
    'list.activeSelectionBackground': '#2a2a2e',
    'list.activeSelectionForeground': '#e8b15a',
    'list.inactiveSelectionBackground': '#202024',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#ffffff14',
    'scrollbarSlider.hoverBackground': '#ffffff24',
    'scrollbarSlider.activeBackground': '#e8b15a55',
    'minimap.background': '#121214',
    'diffEditor.insertedTextBackground': '#8fb57322',
    'diffEditor.removedTextBackground': '#d96c5f22',
    'diffEditor.insertedLineBackground': '#8fb57310',
    'diffEditor.removedLineBackground': '#d96c5f10',
    'diffEditor.border': '#2a2a2e',
    'diffEditor.diagonalFill': '#1c1c20',
    'editorOverviewRuler.border': '#00000000',
    'editorError.foreground': '#d96c5f',
    'editorWarning.foreground': '#e8b15a',
    'editorInfo.foreground': '#7fa6c9',
    'menu.background': '#17171a',
    'menu.foreground': '#e7e3d9',
    'menu.border': '#3a3a40',
    'menu.selectionBackground': '#2a2a2e',
    'menu.selectionForeground': '#e8b15a',
    'quickInput.background': '#17171a',
    'quickInput.foreground': '#e7e3d9',
  },
})

export { monaco }
