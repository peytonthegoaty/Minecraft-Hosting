import Editor, { type OnMount } from '@monaco-editor/react'
import { ChevronDown, ChevronRight, File, FileArchive, FilePlus, Folder, FolderOpen, FolderPlus, Pencil, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FileEntry, ServerSummary } from '@shared/types'
import { formatBytes } from '@shared/versions'
import { api, errorText } from '../api'
import { Button, cx, inputCls, Modal, PageHeader, Spinner } from '../components/ui'
import { languageFor, monaco } from '../lib/monaco'
import { attempt, useStore } from '../store'

interface Tab {
  path: string
  content: string
  saved: string
  binary: boolean
  tooLarge: boolean
  size: number
  mtime: number
}

type Dialog = { kind: 'newFile' | 'newFolder'; dir: string } | { kind: 'rename'; entry: FileEntry } | { kind: 'delete'; entry: FileEntry } | null

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

export default function Files({ server }: { server: ServerSummary }) {
  const dark = useStore((s) => s.dark)
  const openFileReq = useStore((s) => s.openFile)
  const setOpenFile = useStore((s) => s.setOpenFile)
  const [dirs, setDirs] = useState<Record<string, FileEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']))
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [selectedDir, setSelectedDir] = useState('')
  const [filter, setFilter] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [problems, setProblems] = useState(0)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs

  const loadDir = useCallback(
    async (rel: string) => {
      const list = await attempt(() => api.listDir(server.id, rel))
      if (list) setDirs((d) => ({ ...d, [rel]: list }))
    },
    [server.id]
  )

  useEffect(() => {
    setDirs({})
    setTabs([])
    setActive(null)
    setExpanded(new Set(['']))
    void loadDir('')
  }, [server.id, loadDir])

  const openFile = useCallback(
    async (path: string) => {
      setSelectedDir(dirOf(path))
      if (tabsRef.current.some((t) => t.path === path)) {
        setActive(path)
        return
      }
      const f = await attempt(() => api.readFile(server.id, path))
      if (!f) return
      setTabs((t) => [...t, { path, content: f.content, saved: f.content, binary: f.binary, tooLarge: f.tooLarge, size: f.size, mtime: f.mtime }])
      setActive(path)
    },
    [server.id]
  )

  // Another screen asked to open a file (e.g. "Raw file" in server settings).
  useEffect(() => {
    if (openFileReq) {
      void openFile(openFileReq)
      setOpenFile(null)
    }
  }, [openFileReq, openFile, setOpenFile])

  const tab = tabs.find((t) => t.path === active) ?? null
  const dirty = (t: Tab) => t.content !== t.saved

  const save = useCallback(async () => {
    const t = tabsRef.current.find((x) => x.path === active)
    if (!t || t.binary || t.tooLarge) return
    setSaving(true)
    const r = await attempt(() => api.writeFile(server.id, t.path, t.content))
    setSaving(false)
    if (r) setTabs((all) => all.map((x) => (x.path === t.path ? { ...x, saved: t.content, mtime: r.mtime } : x)))
  }, [active, server.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  // Reload a clean tab if the file changed on disk (e.g. the server rewrote it).
  useEffect(() => {
    if (!tab || dirty(tab)) return
    let alive = true
    void api
      .readFile(server.id, tab.path)
      .then((f) => {
        if (alive && f.mtime !== tab.mtime) setTabs((all) => all.map((x) => (x.path === f.path && !dirty(x) ? { ...x, content: f.content, saved: f.content, mtime: f.mtime } : x)))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => {
    const sub = monaco.editor.onDidChangeMarkers(() => {
      const model = editorRef.current?.getModel()
      setProblems(model ? monaco.editor.getModelMarkers({ resource: model.uri }).filter((m) => m.severity >= monaco.MarkerSeverity.Warning).length : 0)
    })
    return () => sub.dispose()
  }, [])

  const closeTab = (path: string) => {
    const t = tabs.find((x) => x.path === path)
    if (t && dirty(t) && !window.confirm(`${path} has unsaved changes. Close it anyway?`)) return
    const rest = tabs.filter((x) => x.path !== path)
    setTabs(rest)
    if (active === path) setActive(rest[rest.length - 1]?.path ?? null)
    monaco.editor.getModel(monaco.Uri.file(`/${path}`))?.dispose()
  }

  const toggleDir = (rel: string) => {
    setSelectedDir(rel)
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(rel)) n.delete(rel)
      else {
        n.add(rel)
        void loadDir(rel)
      }
      return n
    })
  }

  const refresh = () => {
    for (const d of expanded) void loadDir(d)
  }

  const upload = async () => {
    const files = await api.pickFiles()
    if (!files.length) return
    await attempt(() => api.importFiles(server.id, selectedDir, files), `Added ${files.length} file${files.length > 1 ? 's' : ''}.`)
    void loadDir(selectedDir)
  }

  const rows = useMemo(() => {
    const out: { entry: FileEntry; depth: number }[] = []
    const q = filter.toLowerCase()
    const walk = (rel: string, depth: number) => {
      for (const e of dirs[rel] ?? []) {
        if (q && !e.isDir && !e.name.toLowerCase().includes(q)) continue
        out.push({ entry: e, depth })
        if (e.isDir && expanded.has(e.path)) walk(e.path, depth + 1)
      }
    }
    walk('', 0)
    return out
  }, [dirs, expanded, filter])

  const crumbs = (active ?? selectedDir).split('/').filter(Boolean)

  return (
    <div className="flex h-full min-h-[640px] flex-col gap-4 px-7 pb-6 pt-6">
      <PageHeader
        title="Files"
        subtitle={
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5">
            <button type="button" className="hover:text-fg" onClick={() => setSelectedDir('')}>
              {server.name}
            </button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span aria-hidden>/</span>
                <span className={i === crumbs.length - 1 ? 'font-medium text-fg' : ''}>{c}</span>
              </span>
            ))}
          </nav>
        }
      >
        <Button icon={<Upload size={15} />} onClick={upload}>
          Upload
        </Button>
        <Button icon={<FilePlus size={15} />} onClick={() => setDialog({ kind: 'newFile', dir: selectedDir })}>
          New file
        </Button>
        <Button icon={<FolderPlus size={15} />} onClick={() => setDialog({ kind: 'newFolder', dir: selectedDir })}>
          New folder
        </Button>
        <Button variant="primary" disabled={!tab || !dirty(tab) || tab.binary} loading={saving} onClick={save}>
          Save · Ctrl+S
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-wrap overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex max-h-full min-h-[300px] w-full flex-[1_1_240px] flex-col border-r border-line md:max-w-[300px]">
          <div className="flex items-center gap-1.5 p-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-bg px-2.5 text-muted">
              <Search size={14} />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find file" aria-label="Find file" className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none" />
            </label>
            <button type="button" aria-label="Refresh" title="Refresh" onClick={refresh} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg">
              <RefreshCw size={15} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 text-[13px]" role="tree" aria-label="Server files">
            {!dirs[''] && (
              <div className="p-3">
                <Spinner />
              </div>
            )}
            {rows.map(({ entry: e, depth }) => {
              const isOpen = expanded.has(e.path)
              const isActive = active === e.path
              return (
                <div
                  key={e.path}
                  role="treeitem"
                  aria-expanded={e.isDir ? isOpen : undefined}
                  aria-selected={isActive}
                  className={cx('group flex min-h-[30px] items-center gap-1.5 rounded-md pr-1', isActive ? 'bg-accent/10 text-accent' : selectedDir === e.path && e.isDir ? 'bg-hover' : 'hover:bg-hover')}
                  style={{ paddingLeft: 6 + depth * 16 }}
                >
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left" onClick={() => (e.isDir ? toggleDir(e.path) : openFile(e.path))} title={e.path}>
                    {e.isDir ? isOpen ? <ChevronDown size={13} className="shrink-0 text-muted" /> : <ChevronRight size={13} className="shrink-0 text-muted" /> : <span className="w-[13px] shrink-0" />}
                    {e.isDir ? isOpen ? <FolderOpen size={15} className="shrink-0 text-warn" /> : <Folder size={15} className="shrink-0 text-warn" /> : e.name.endsWith('.zip') ? <FileArchive size={15} className="shrink-0 text-muted" /> : <File size={15} className="shrink-0 text-muted" />}
                    <span className="truncate">{e.name}</span>
                    {!e.isDir && <span className="ml-auto shrink-0 pl-2 text-[11px] text-muted group-hover:hidden">{formatBytes(e.size)}</span>}
                  </button>
                  <span className="hidden shrink-0 items-center group-hover:flex">
                    {e.name.endsWith('.zip') && (
                      <button type="button" aria-label={`Unzip ${e.name}`} title="Unzip here" className="rounded p-1 text-muted hover:text-fg" onClick={() => attempt(() => api.unzipEntry(server.id, e.path), 'Unzipped.').then(() => loadDir(dirOf(e.path)))}>
                        <FileArchive size={13} />
                      </button>
                    )}
                    {e.isDir && (
                      <button type="button" aria-label={`Zip ${e.name}`} title="Make a zip" className="rounded p-1 text-muted hover:text-fg" onClick={() => attempt(() => api.zipEntries(server.id, [e.path], `${e.path}.zip`), 'Zip created.').then(() => loadDir(dirOf(e.path)))}>
                        <FileArchive size={13} />
                      </button>
                    )}
                    <button type="button" aria-label={`Rename ${e.name}`} title="Rename" className="rounded p-1 text-muted hover:text-fg" onClick={() => setDialog({ kind: 'rename', entry: e })}>
                      <Pencil size={13} />
                    </button>
                    <button type="button" aria-label={`Delete ${e.name}`} title="Delete" className="rounded p-1 text-muted hover:text-danger" onClick={() => setDialog({ kind: 'delete', entry: e })}>
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex min-h-[420px] min-w-0 flex-[999_1_420px] flex-col bg-code">
          <div role="tablist" aria-label="Open files" className="flex overflow-x-auto border-b border-line bg-surface">
            {tabs.map((t) => (
              <div key={t.path} className={cx('flex h-10 shrink-0 items-center border-b-2', t.path === active ? 'border-accent bg-code' : 'border-transparent')}>
                <button type="button" role="tab" aria-selected={t.path === active} onClick={() => setActive(t.path)} className={cx('flex h-full items-center gap-2 pl-3.5 pr-1 text-[13px] font-medium', t.path === active ? 'text-fg' : 'text-muted')}>
                  {t.path.split('/').pop()}
                  {dirty(t) && <span className="h-[7px] w-[7px] rounded-full bg-warn" aria-label="Unsaved changes" />}
                </button>
                <button type="button" aria-label={`Close ${t.path}`} onClick={() => closeTab(t.path)} className="mr-1.5 rounded p-1 text-muted hover:bg-hover hover:text-fg">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="relative min-h-0 flex-1">
            {!tab && (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-[13px] text-muted">
                <File size={22} />
                Pick a file on the left to edit it. YAML and JSON files are checked as you type.
              </div>
            )}
            {tab && (tab.binary || tab.tooLarge) && (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-[13px] text-muted">
                {tab.binary ? "This file isn't text, so it can't be edited here." : `This file is ${formatBytes(tab.size)} — too large to edit here.`}
                <Button size="sm" onClick={() => api.openPath(server.id, dirOf(tab.path))}>
                  Show in folder
                </Button>
              </div>
            )}
            {tab && !tab.binary && !tab.tooLarge && (
              <Editor
                path={monaco.Uri.file(`/${tab.path}`).toString()}
                language={languageFor(tab.path)}
                value={tab.content}
                theme={dark ? 'crabhost-dark' : 'crabhost-light'}
                loading={<Spinner />}
                onMount={(ed) => {
                  editorRef.current = ed
                  ed.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, col: e.position.column }))
                }}
                onChange={(v) => setTabs((all) => all.map((x) => (x.path === tab.path ? { ...x, content: v ?? '' } : x)))}
                options={{
                  fontFamily: '"JetBrains Mono", Consolas, monospace',
                  fontSize: 13,
                  lineHeight: 22,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                  insertSpaces: true,
                  renderWhitespace: 'boundary',
                  automaticLayout: true,
                  padding: { top: 10 }
                }}
              />
            )}
          </div>
          <div className="flex min-h-[32px] flex-wrap items-center gap-4 border-t border-line bg-surface px-3.5 text-xs text-muted">
            {tab && !tab.binary ? (
              <>
                <span className={cx('font-semibold', problems ? 'text-danger' : 'text-success')}>{problems ? `${problems} problem${problems > 1 ? 's' : ''}` : 'No problems'}</span>
                <span>{languageFor(tab.path) === 'yaml' ? 'YAML · checked as you type' : languageFor(tab.path)}</span>
                <span className="ml-auto">
                  Ln {cursor.line}, Col {cursor.col}
                </span>
                <span>UTF-8</span>
              </>
            ) : (
              <span>{server.dir}</span>
            )}
          </div>
        </div>
      </div>

      <FileDialog dialog={dialog} serverId={server.id} onClose={() => setDialog(null)} onDone={(dir, opened) => {
        setDialog(null)
        void loadDir(dir)
        if (opened) void openFile(opened)
      }} onRenamed={(from, to) => setTabs((all) => all.map((t) => (t.path === from ? { ...t, path: to } : t)))} onDeleted={(p) => {
        setTabs((all) => all.filter((t) => t.path !== p && !t.path.startsWith(`${p}/`)))
        if (active === p) setActive(null)
      }} />
    </div>
  )
}

function FileDialog({
  dialog,
  serverId,
  onClose,
  onDone,
  onRenamed,
  onDeleted
}: {
  dialog: Dialog
  serverId: string
  onClose: () => void
  onDone: (dir: string, opened?: string) => void
  onRenamed: (from: string, to: string) => void
  onDeleted: (path: string) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setError(null)
    setName(dialog?.kind === 'rename' ? dialog.entry.name : '')
  }, [dialog])
  if (!dialog) return null
  let title = 'New file'
  if (dialog.kind === 'newFolder') title = 'New folder'
  else if (dialog.kind === 'rename') title = `Rename ${dialog.entry.name}`
  else if (dialog.kind === 'delete') title = `Delete ${dialog.entry.name}?`
  const submit = async () => {
    try {
      if (dialog.kind === 'delete') {
        await api.deleteEntry(serverId, dialog.entry.path)
        onDeleted(dialog.entry.path)
        onDone(dirOf(dialog.entry.path))
        return
      }
      if (!name.trim() || /[\\/]/.test(name)) {
        setError('Use a plain name without slashes.')
        return
      }
      if (dialog.kind === 'rename') {
        const to = [dirOf(dialog.entry.path), name.trim()].filter(Boolean).join('/')
        await api.renameEntry(serverId, dialog.entry.path, to)
        onRenamed(dialog.entry.path, to)
        onDone(dirOf(dialog.entry.path))
        return
      }
      const p = [dialog.dir, name.trim()].filter(Boolean).join('/')
      await api.createEntry(serverId, p, dialog.kind === 'newFolder')
      onDone(dialog.dir, dialog.kind === 'newFile' ? p : undefined)
    } catch (e) {
      setError(errorText(e))
    }
  }
  return (
    <Modal open onClose={onClose} title={title} width={440}>
      {dialog.kind === 'delete' ? (
        <p className="text-[13px] text-muted">{dialog.entry.isDir ? 'This folder and everything in it will be deleted.' : 'This file will be deleted.'} This can&apos;t be undone — make a backup first if you&apos;re unsure.</p>
      ) : (
        <input
          className={inputCls}
          value={name}
          aria-label="Name"
          placeholder={dialog.kind === 'newFolder' ? 'folder-name' : 'config.yml'}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
      )}
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={dialog.kind === 'delete' ? 'danger' : 'primary'} onClick={submit}>
          {dialog.kind === 'delete' ? 'Delete' : dialog.kind === 'rename' ? 'Rename' : 'Create'}
        </Button>
      </div>
    </Modal>
  )
}
