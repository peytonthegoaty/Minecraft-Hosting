import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { AddonInfo, AddonSearchResult, AddonSource, ServerConfig } from '@shared/types'
import { addonKind } from '@shared/types'
import type { DownloadManager } from '../downloads/DownloadManager'
import { UserError, errorMessage } from '../../util/errors'
import { exists, readJson, resolveInside, writeJson } from '../../util/fsx'
import { hashFile } from '../../util/hash'
import { readZipEntries } from '../../util/zip'
import { META_FILES, parseAddonMeta } from './metadata'
import { hangarDownload, searchHangar } from './sources/hangar'
import { modrinthUpdates, modrinthVersions, pickVersion, primaryFile, searchModrinth } from './sources/modrinth'
import { searchSpiget, spigetDownloadUrl, spigetInfo } from './sources/spiget'

const INDEX_FILE = '.blockhost-addons.json'

interface IndexEntry {
  source: AddonSource
  projectId: string
  version?: string
}

/** Lists, toggles, installs and updates plugins (Paper/Purpur) or mods (Fabric/Forge/NeoForge). */
export class AddonService {
  private metaCache = new Map<string, { mtime: number; info: AddonInfo }>()

  constructor(
    private serverDir: (id: string) => string,
    private serverCfg: (id: string) => ServerConfig,
    private downloads: DownloadManager,
    private onChange: (id: string) => void
  ) {}

  folder(id: string): string {
    const kind = addonKind(this.serverCfg(id).type)
    if (kind === 'none') throw new UserError('Vanilla servers don\'t support plugins or mods. Create a Paper or Fabric server to use them.')
    return path.join(this.serverDir(id), kind === 'plugins' ? 'plugins' : 'mods')
  }

  private async index(id: string): Promise<Record<string, IndexEntry>> {
    return readJson<Record<string, IndexEntry>>(path.join(this.folder(id), INDEX_FILE), {})
  }

  private async saveIndex(id: string, idx: Record<string, IndexEntry>): Promise<void> {
    await writeJson(path.join(this.folder(id), INDEX_FILE), idx)
  }

  async list(id: string): Promise<AddonInfo[]> {
    const dir = this.folder(id)
    await fs.mkdir(dir, { recursive: true })
    const files = (await fs.readdir(dir)).filter((f) => /\.jar(\.disabled)?$/i.test(f))
    const out: AddonInfo[] = []
    for (const file of files) {
      const p = path.join(dir, file)
      const st = await fs.stat(p)
      const key = `${p}|${st.size}`
      const cached = this.metaCache.get(key)
      if (cached && cached.mtime === st.mtimeMs) {
        out.push({ ...cached.info, file, enabled: !file.endsWith('.disabled') })
        continue
      }
      const entries = await readZipEntries(p, META_FILES).catch(() => new Map<string, Buffer>())
      const meta = parseAddonMeta(entries, file)
      const info: AddonInfo = { file, enabled: !file.endsWith('.disabled'), ...meta, sha1: await hashFile(p, 'sha1'), size: st.size }
      this.metaCache.set(key, { mtime: st.mtimeMs, info })
      out.push(info)
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }

  async setEnabled(id: string, file: string, enabled: boolean): Promise<void> {
    const dir = this.folder(id)
    const from = resolveInside(dir, file)
    const base = file.replace(/\.disabled$/i, '')
    const to = resolveInside(dir, enabled ? base : `${base}.disabled`)
    if (from !== to) await fs.rename(from, to)
    const idx = await this.index(id)
    if (idx[file]) {
      idx[path.basename(to)] = idx[file]
      delete idx[file]
      await this.saveIndex(id, idx)
    }
    this.onChange(id)
  }

  async remove(id: string, file: string): Promise<void> {
    await fs.rm(resolveInside(this.folder(id), file), { force: true })
    const idx = await this.index(id)
    delete idx[file]
    await this.saveIndex(id, idx)
    this.onChange(id)
  }

  async addFiles(id: string, paths: string[]): Promise<void> {
    const dir = this.folder(id)
    await fs.mkdir(dir, { recursive: true })
    for (const p of paths) {
      if (!p.toLowerCase().endsWith('.jar')) throw new UserError(`${path.basename(p)} isn't a .jar file.`)
      await fs.copyFile(p, path.join(dir, path.basename(p)))
    }
    this.onChange(id)
  }

  async search(id: string, source: AddonSource | 'all', query: string): Promise<AddonSearchResult[]> {
    const cfg = this.serverCfg(id)
    const kind = addonKind(cfg.type)
    const sources: AddonSource[] = source === 'all' ? (kind === 'plugins' ? ['modrinth', 'hangar', 'spigot'] : ['modrinth']) : [source]
    const results = await Promise.allSettled(
      sources.map((s) => {
        if (s === 'modrinth') return searchModrinth(query, cfg.type, cfg.mcVersion)
        if (kind !== 'plugins') return Promise.resolve([] as AddonSearchResult[])
        if (s === 'hangar') return searchHangar(query, cfg.mcVersion)
        return searchSpiget(query)
      })
    )
    const ok = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    if (!ok.length && results.every((r) => r.status === 'rejected')) throw new UserError(errorMessage((results[0] as PromiseRejectedResult).reason))
    if (source !== 'all') return ok
    // Mixed results from several sites: most downloaded first.
    return ok.sort((a, b) => b.downloads - a.downloads)
  }

  async install(id: string, source: AddonSource, projectId: string): Promise<{ installed: string[] }> {
    const installed: string[] = []
    await this.installOne(id, source, projectId, installed, new Set())
    this.onChange(id)
    return { installed }
  }

  private async installOne(id: string, source: AddonSource, projectId: string, installed: string[], seen: Set<string>): Promise<void> {
    if (seen.has(`${source}:${projectId}`)) return
    seen.add(`${source}:${projectId}`)
    const cfg = this.serverCfg(id)
    const dir = this.folder(id)
    await fs.mkdir(dir, { recursive: true })
    const idx = await this.index(id)
    if (Object.values(idx).some((e) => e.source === source && e.projectId === projectId) && installed.length > 0) return

    if (source === 'modrinth') {
      const versions = await modrinthVersions(projectId, cfg.type, cfg.mcVersion)
      const v = pickVersion(versions)
      if (!v) throw new UserError(`This doesn't have a version for ${cfg.type} ${cfg.mcVersion} yet.`)
      const f = primaryFile(v)
      if (!f) throw new UserError('This version has no downloadable file.')
      await this.removeOldFor(id, idx, source, projectId)
      await this.downloads.download(f.url, path.join(dir, f.filename), { label: f.filename, hash: { algo: 'sha1', value: f.hashes.sha1 } })
      idx[f.filename] = { source, projectId, version: v.version_number }
      await this.saveIndex(id, idx)
      installed.push(f.filename)
      for (const dep of v.dependencies) {
        if (dep.dependency_type !== 'required' || !dep.project_id) continue
        await this.installOne(id, 'modrinth', dep.project_id, installed, seen).catch(() => undefined)
      }
      return
    }
    if (source === 'hangar') {
      const d = await hangarDownload(projectId, cfg.mcVersion)
      await this.removeOldFor(id, idx, source, projectId)
      await this.downloads.download(d.url, path.join(dir, d.fileName), { label: d.fileName, hash: d.sha256 ? { algo: 'sha256', value: d.sha256 } : undefined })
      idx[d.fileName] = { source, projectId, version: d.version }
      await this.saveIndex(id, idx)
      installed.push(d.fileName)
      return
    }
    const info = await spigetInfo(projectId)
    const fileName = `${info.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || `spigot-${projectId}`}.jar`
    await this.removeOldFor(id, idx, source, projectId)
    await this.downloads.download(spigetDownloadUrl(projectId), path.join(dir, fileName), { label: fileName })
    idx[fileName] = { source, projectId, version: info.version }
    await this.saveIndex(id, idx)
    installed.push(fileName)
  }

  private async removeOldFor(id: string, idx: Record<string, IndexEntry>, source: AddonSource, projectId: string): Promise<void> {
    const dir = this.folder(id)
    for (const [file, e] of Object.entries(idx)) {
      if (e.source === source && e.projectId === projectId) {
        await fs.rm(path.join(dir, file), { force: true })
        delete idx[file]
      }
    }
  }

  async checkUpdates(id: string): Promise<AddonInfo[]> {
    const cfg = this.serverCfg(id)
    const list = await this.list(id)
    let updates: Awaited<ReturnType<typeof modrinthUpdates>> = {}
    try {
      updates = await modrinthUpdates(list.map((a) => a.sha1), cfg.type, cfg.mcVersion)
    } catch (e) {
      throw new UserError(`Couldn't check for updates: ${errorMessage(e)}`)
    }
    for (const a of list) {
      const v = updates[a.sha1]
      const f = v ? primaryFile(v) : undefined
      if (v && f && f.hashes.sha1 !== a.sha1) a.update = { version: v.version_number, url: f.url, fileName: f.filename }
    }
    return list
  }

  async update(id: string, file: string): Promise<void> {
    const list = await this.checkUpdates(id)
    const a = list.find((x) => x.file === file)
    if (!a?.update) throw new UserError('No update is available for this one.')
    const dir = this.folder(id)
    const newName = a.enabled ? a.update.fileName : `${a.update.fileName}.disabled`
    const tmp = path.join(dir, `${a.update.fileName}.download`)
    await this.downloads.download(a.update.url, tmp, { label: a.update.fileName })
    await fs.rm(path.join(dir, file), { force: true })
    if (await exists(path.join(dir, newName))) await fs.rm(path.join(dir, newName), { force: true })
    await fs.rename(tmp, path.join(dir, newName))
    const idx = await this.index(id)
    if (idx[file]) {
      idx[newName] = { ...idx[file], version: a.update.version }
      delete idx[file]
      await this.saveIndex(id, idx)
    }
    this.onChange(id)
  }
}
