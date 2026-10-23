import { lazy, Suspense, useEffect } from 'react'
import { platform } from './api'
import { Brand, Sidebar } from './components/Sidebar'
import { DownloadsPanel } from './components/DownloadsPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import { JavaModal } from './components/JavaModal'
import { Toasts } from './components/Toasts'
import { Spinner } from './components/ui'
import { SERVER_VIEWS, useSelected, useStore } from './store'
import { Addons } from './views/Addons'
import { Backups } from './views/Backups'
import { Config } from './views/Config'
import { Console } from './views/Console'
import { Dashboard } from './views/Dashboard'
import { DownloadsView } from './views/DownloadsView'
import { Home } from './views/Home'
import { Network } from './views/Network'
import { NewServer } from './views/NewServer'
import { SettingsView } from './views/SettingsView'

// The editor (Monaco) is large, so it loads only when Files is opened.
const Files = lazy(() => import('./views/Files'))

function TitleBar() {
  // Windows draws its own buttons over the right edge (titleBarOverlay); macOS puts traffic lights on the left.
  return (
    <header className="drag flex h-10 shrink-0 items-center border-b border-line bg-surface" style={{ paddingLeft: platform === 'darwin' ? 84 : 16, paddingRight: platform === 'win32' ? 150 : 16 }}>
      <Brand />
    </header>
  )
}

function Content() {
  const view = useStore((s) => s.view)
  const server = useSelected()
  const go = useStore((s) => s.go)
  useEffect(() => {
    if (SERVER_VIEWS.includes(view) && !server) go('home', null)
  }, [view, server, go])
  if (view === 'home') return <Home />
  if (view === 'new') return <NewServer />
  if (view === 'downloads') return <DownloadsView />
  if (view === 'settings') return <SettingsView />
  if (!server) return null
  switch (view) {
    case 'dashboard':
      return <Dashboard server={server} />
    case 'console':
      return <Console server={server} />
    case 'files':
      return (
        <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner size={22} /></div>}>
          <Files server={server} />
        </Suspense>
      )
    case 'addons':
      return <Addons server={server} />
    case 'config':
      return <Config key={server.id} server={server} />
    case 'network':
      return <Network server={server} />
    case 'backups':
      return <Backups server={server} />
    default:
      return null
  }
}

export function App() {
  const ready = useStore((s) => s.ready)
  const view = useStore((s) => s.view)
  const selectedId = useStore((s) => s.selectedId)
  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[248px] shrink-0 border-r border-line bg-surface">
          <Sidebar />
        </aside>
        <main key={view} className="min-w-0 flex-1 overflow-y-auto">
          <ErrorBoundary resetKey={`${view}:${selectedId}`}>
            <Content />
          </ErrorBoundary>
        </main>
      </div>
      <JavaModal />
      <DownloadsPanel />
      <Toasts />
    </div>
  )
}
