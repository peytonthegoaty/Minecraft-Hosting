import path from 'node:path'
import type { VersionOption } from '@shared/types'
import { compareMcVersions } from '@shared/versions'
import { UserError } from '../../../util/errors'
import { getJson } from '../../../util/http'
import type { InstallContext, InstallResult, Provider } from './types'

// PaperMC's Fill API (v3), with the older v2 API as a fallback.
const FILL = 'https://fill.papermc.io/v3/projects'
const V2 = 'https://api.papermc.io/v2/projects'

interface FillBuild {
  id: number
  channel: string
  downloads: Record<string, { name: string; checksums: { sha256: string }; size: number; url: string }>
}

function flattenVersions(versions: unknown): string[] {
  if (Array.isArray(versions)) return versions.map(String)
  if (versions && typeof versions === 'object') return Object.values(versions as Record<string, string[]>).flat().map(String)
  return []
}

export function sortVersionsDesc(ids: string[]): string[] {
  return [...new Set(ids)].sort((a, b) => compareMcVersions(b.split('-')[0], a.split('-')[0]) || (a.includes('-') ? 1 : 0) - (b.includes('-') ? 1 : 0))
}

export function paperLike(project: string, displayName: string): Provider {
  return {
    async listVersions(includeSnapshots) {
      let ids: string[]
      try {
        const p = await getJson<{ versions: unknown }>(`${FILL}/${project}`)
        ids = flattenVersions(p.versions)
      } catch {
        const p = await getJson<{ versions: string[] }>(`${V2}/${project}`)
        ids = p.versions
      }
      const sorted = sortVersionsDesc(ids).filter((v) => includeSnapshots || !v.includes('-'))
      return sorted.map<VersionOption>((id, i) => ({ id, stable: !id.includes('-'), latest: i === 0 }))
    },
    async listLoaderVersions() {
      return []
    },
    async install(mcVersion: string, _loader: string | undefined, ctx: InstallContext): Promise<InstallResult> {
      const jar = path.join(ctx.dir, 'server.jar')
      try {
        const b = await getJson<FillBuild>(`${FILL}/${project}/versions/${mcVersion}/builds/latest`)
        const d = b.downloads['server:default'] ?? Object.values(b.downloads)[0]
        if (!d) throw new Error('no download')
        await ctx.downloads.download(d.url, jar, { label: `${displayName} ${mcVersion} build ${b.id}`, hash: { algo: 'sha256', value: d.checksums.sha256 } })
        return { launch: { kind: 'jar', jar: 'server.jar' }, loaderVersion: String(b.id) }
      } catch (e) {
        // Fall back to the v2 API.
        const builds = await getJson<{ builds: { build: number; channel: string; downloads: { application: { name: string; sha256: string } } }[] }>(
          `${V2}/${project}/versions/${mcVersion}/builds`
        ).catch(() => null)
        const list = builds?.builds ?? []
        const b = [...list].reverse().find((x) => x.channel === 'default') ?? list[list.length - 1]
        if (!b) throw new UserError(`${displayName} has no download for ${mcVersion}: ${e instanceof Error ? e.message : e}`)
        const app = b.downloads.application
        const url = `${V2}/${project}/versions/${mcVersion}/builds/${b.build}/downloads/${app.name}`
        await ctx.downloads.download(url, jar, { label: `${displayName} ${mcVersion} build ${b.build}`, hash: { algo: 'sha256', value: app.sha256 } })
        return { launch: { kind: 'jar', jar: 'server.jar' }, loaderVersion: String(b.build) }
      }
    }
  }
}

export const paper = paperLike('paper', 'Paper')

export const purpur: Provider = {
  async listVersions(includeSnapshots) {
    const p = await getJson<{ versions: string[] }>('https://api.purpurmc.org/v2/purpur')
    const sorted = sortVersionsDesc(p.versions).filter((v) => includeSnapshots || !v.includes('-'))
    return sorted.map((id, i) => ({ id, stable: true, latest: i === 0 }))
  },
  async listLoaderVersions() {
    return []
  },
  async install(mcVersion, _loader, ctx) {
    const base = `https://api.purpurmc.org/v2/purpur/${mcVersion}/latest`
    const info = await getJson<{ build: string; md5?: string }>(base)
    await ctx.downloads.download(`${base}/download`, path.join(ctx.dir, 'server.jar'), {
      label: `Purpur ${mcVersion} build ${info.build}`,
      hash: info.md5 ? { algo: 'md5', value: info.md5 } : undefined
    })
    return { launch: { kind: 'jar', jar: 'server.jar' }, loaderVersion: String(info.build) }
  }
}
