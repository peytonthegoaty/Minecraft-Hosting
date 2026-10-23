import { FolderOpen } from 'lucide-react'
import { formatBytes } from '@shared/versions'
import { api, isMock } from '../api'
import { Button, Card, Field, inputCls, PageHeader, Segmented, ToggleRow } from '../components/ui'
import { attempt, useStore } from '../store'

export function SettingsView() {
  const { settings, sys, setTheme } = useStore()
  if (!settings || !sys) return null
  const update = async (patch: Parameters<typeof api.updateSettings>[0]) => {
    const s = await attempt(() => api.updateSettings(patch))
    if (s) useStore.setState({ settings: s })
  }
  return (
    <div className="flex max-w-3xl flex-col gap-4 px-7 pb-8 pt-6">
      <PageHeader title="App settings" />
      <Card className="flex flex-col gap-4 p-[18px]">
        <h2 className="text-[15px] font-semibold">Appearance</h2>
        <Segmented
          label="Theme"
          className="max-w-sm"
          value={settings.theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'Match Windows' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' }
          ]}
        />
      </Card>
      <Card className="flex flex-col gap-4 p-[18px]">
        <h2 className="text-[15px] font-semibold">New servers</h2>
        <Field label="Servers folder" hint="New servers are created here. Existing servers stay where they are.">
          <div className="flex gap-2">
            <input className={`${inputCls} font-mono`} readOnly value={settings.serversDir} aria-label="Servers folder" />
            <Button
              icon={<FolderOpen size={15} />}
              onClick={async () => {
                const d = await api.pickFolder()
                if (d) await update({ serversDir: d })
              }}
            >
              Change
            </Button>
          </div>
        </Field>
      </Card>
      <Card className="flex flex-col gap-1 p-[18px]">
        <h2 className="mb-2 text-[15px] font-semibold">Updates</h2>
        <ToggleRow title="Update Crab Host automatically" hint="New versions download in the background and install when you close the app." checked={settings.checkForUpdates} onChange={(v) => update({ checkForUpdates: v })} />
      </Card>
      <Card className="flex flex-col gap-2 p-[18px] text-[13px]">
        <h2 className="mb-1 text-[15px] font-semibold">About</h2>
        <div className="flex gap-3">
          <span className="w-28 text-muted">Version</span>
          <span>Crab Host {sys.appVersion}{isMock ? ' (preview)' : ''}</span>
        </div>
        <div className="flex gap-3">
          <span className="w-28 text-muted">This PC</span>
          <span>
            {sys.platform} {sys.arch} · {sys.cpus} CPU threads · {formatBytes(sys.totalMemBytes)} RAM
          </span>
        </div>
        <div className="flex gap-3">
          <span className="w-28 shrink-0 text-muted">App data</span>
          <span className="selectable truncate font-mono text-xs">{sys.dataDir}</span>
        </div>
      </Card>
    </div>
  )
}
