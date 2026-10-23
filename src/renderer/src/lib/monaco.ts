import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import { loader } from '@monaco-editor/react'
import { configureMonacoYaml } from 'monaco-yaml'
import { SCHEMAS } from './schemas'
import YamlWorker from './yaml.worker.js?worker'

// Monaco runs fully offline from the app bundle (no CDN).
self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'json') return new JsonWorker()
    if (label === 'yaml') return new YamlWorker()
    return new EditorWorker()
  }
}
loader.config({ monaco })

configureMonacoYaml(monaco, {
  enableSchemaRequest: false,
  validate: true,
  completion: true,
  hover: true,
  schemas: SCHEMAS
})

monaco.editor.defineTheme('blockhost-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'type', foreground: '60A5FA' },
    { token: 'string', foreground: '86EFAC' },
    { token: 'number', foreground: 'FDBA74' },
    { token: 'keyword', foreground: 'FBBF24' },
    { token: 'comment', foreground: '7C8794', fontStyle: 'italic' }
  ],
  colors: {
    'editor.background': '#0A0D10',
    'editor.lineHighlightBackground': '#14181C',
    'editorLineNumber.foreground': '#4B5560',
    'editorLineNumber.activeForeground': '#99A3AD',
    'editorGutter.background': '#0A0D10',
    'editor.selectionBackground': '#264F78'
  }
})
monaco.editor.defineTheme('blockhost-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'type', foreground: '1D4ED8' },
    { token: 'string', foreground: '15803D' },
    { token: 'number', foreground: '9A3412' },
    { token: 'keyword', foreground: 'B45309' },
    { token: 'comment', foreground: '6B7580', fontStyle: 'italic' }
  ],
  colors: {
    'editor.background': '#FBFCFD',
    'editor.lineHighlightBackground': '#F0F3F6',
    'editorLineNumber.foreground': '#A0A9B2',
    'editorGutter.background': '#FBFCFD'
  }
})

export function languageFor(path: string): string {
  const name = path.toLowerCase().split('/').pop() ?? ''
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  if (ext === 'yml' || ext === 'yaml') return 'yaml'
  if (ext === 'json' || ext === 'mcmeta' || ext === 'json5') return 'json'
  if (['properties', 'toml', 'cfg', 'conf', 'ini'].includes(ext)) return 'ini'
  if (ext === 'js' || ext === 'mjs') return 'javascript'
  if (ext === 'sh') return 'shell'
  if (ext === 'bat' || ext === 'cmd') return 'bat'
  if (ext === 'xml') return 'xml'
  if (ext === 'md') return 'markdown'
  return 'plaintext'
}

export { monaco }
