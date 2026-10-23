import path from 'node:path'
import type { AppSettings } from '@shared/types'
import { readJson, writeJson } from './util/fsx'

export class SettingsStore {
  private file: string
  private value: AppSettings

  constructor(dataDir: string, defaults: AppSettings) {
    this.file = path.join(dataDir, 'settings.json')
    this.value = defaults
  }

  async load(): Promise<void> {
    this.value = { ...this.value, ...(await readJson<Partial<AppSettings>>(this.file, {})) }
  }

  get(): AppSettings {
    return this.value
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.value = { ...this.value, ...patch }
    await writeJson(this.file, this.value)
    return this.value
  }
}
