import path from 'node:path'
import type { VersionOption } from '@shared/types'
import { fallbackJavaFor } from '@shared/versions'
import { UserError } from '../../../util/errors'
import { getJson, memo } from '../../../util/http'
import type { InstallContext, InstallResult, Provider } from './types'

interface Manifest {
  latest: { release: string; snapshot: string }
  versions: { id: string; type: string; url: string; sha1: string; releaseTime: string }[]
}

interface VersionJson {
  downloads?: { server?: { url: string; sha1: string; size: number } }
  javaVersion?: { majorVersion: number }
}

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const manifestCache = memo<Manifest>(10 * 60 * 1000)
const versionCache = memo<VersionJson>(60 * 60 * 1000)

export function getManifest(): Promise<Manifest> {
  return manifestCache('manifest', () => getJson<Manifest>(MANIFEST_URL))
}

export async function getVersionJson(id: string): Promise<VersionJson> {
  const manifest = await getManifest()
  const entry = manifest.versions.find((v) => v.id === id)
  if (!entry) throw new UserError(`Minecraft ${id} wasn't found in Mojang's version list.`)
  return versionCache(id, () => getJson<VersionJson>(entry.url))
}

/** The Java major a Minecraft version needs, straight from Mojang when reachable. */
export async function javaForMinecraft(mcVersion: string): Promise<number> {
  try {
    const v = await getVersionJson(mcVersion)
    if (v.javaVersion?.majorVersion) return v.javaVersion.majorVersion
  } catch {
    // offline or unknown version: use the built-in table
  }
  return fallbackJavaFor(mcVersion)
}

export const vanilla: Provider = {
  async listVersions(includeSnapshots) {
    const m = await getManifest()
    const out: VersionOption[] = []
    for (const v of m.versions) {
      if (v.type !== 'release' && !(includeSnapshots && v.type === 'snapshot')) continue
      // Releases before 1.2.5 have no official server download.
      if (v.releaseTime < '2012-03-29') continue
      out.push({ id: v.id, stable: v.type === 'release', latest: v.id === m.latest.release, label: v.type === 'snapshot' ? 'Snapshot' : undefined })
    }
    return out
  },
  async listLoaderVersions() {
    return []
  },
  async install(mcVersion: string, _loader: string | undefined, ctx: InstallContext): Promise<InstallResult> {
    const v = await getVersionJson(mcVersion)
    const server = v.downloads?.server
    if (!server) throw new UserError(`Mojang doesn't offer a server download for ${mcVersion}.`)
    await ctx.downloads.download(server.url, path.join(ctx.dir, 'server.jar'), { label: `Minecraft ${mcVersion} server`, hash: { algo: 'sha1', value: server.sha1 } })
    return { launch: { kind: 'jar', jar: 'server.jar' } }
  }
}
