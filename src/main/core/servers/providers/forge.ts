import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LaunchSpec, VersionOption } from '@shared/types'
import { compareMcVersions } from '@shared/versions'
import { UserError } from '../../../util/errors'
import { exists } from '../../../util/fsx'
import { getJson, getText, memo } from '../../../util/http'
import type { InstallContext, Provider } from './types'
import { parseMavenVersions } from './types'

const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge'
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
const NEO_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge'
const metaCache = memo<string[]>(30 * 60 * 1000)

/** NeoForge "21.1.77" targets Minecraft 1.21.1; "20.4.237" → 1.20.4; "21.0.x" → 1.21; "26.1.0.x" → 26.1. */
export function neoforgeToMc(v: string): string | null {
  const parts = v.split('-')[0].split('.').map((n) => parseInt(n, 10))
  if (parts.length < 2 || parts.some(Number.isNaN)) return null
  const [major, minor] = parts
  if (major >= 26) return parts.length >= 4 && parts[2] !== 0 ? `${major}.${minor}.${parts[2]}` : `${major}.${minor}`
  if (major < 20) return null
  return minor === 0 ? `1.${major}` : `1.${major}.${minor}`
}

/** Runs the official installer headless and works out how to launch the result. */
async function runInstaller(
  ctx: InstallContext,
  url: string,
  label: string,
  argsDir: string,
  legacyJarPattern: RegExp
): Promise<LaunchSpec> {
  const installer = path.join(ctx.dir, 'installer.jar')
  await ctx.downloads.download(url, installer, { label })
  const java = await ctx.javaPath()
  ctx.log(`Running the ${label} installer — this can take a few minutes…`)
  const code = await ctx.runJava(java, ['-jar', 'installer.jar', '--installServer'], ctx.dir, (l) => ctx.log(l))
  await fs.rm(installer, { force: true })
  await fs.rm(path.join(ctx.dir, 'installer.jar.log'), { force: true })
  if (code !== 0) throw new UserError(`The ${label} installer failed (exit code ${code}). See the console for details.`)
  const win = path.join(argsDir, 'win_args.txt')
  const unix = path.join(argsDir, 'unix_args.txt')
  if (await exists(path.join(ctx.dir, unix))) {
    return { kind: 'argsfile', winArgs: win.split(path.sep).join('/'), unixArgs: unix.split(path.sep).join('/') }
  }
  const files = await fs.readdir(ctx.dir)
  const jar = files.find((f) => legacyJarPattern.test(f) && !f.includes('installer'))
  if (!jar) throw new UserError(`The ${label} installer finished but no server jar was found.`)
  return { kind: 'jar', jar }
}

export const forge: Provider = {
  async listVersions() {
    const promos = await getJson<{ promos: Record<string, string> }>(FORGE_PROMOS)
    const mcs = new Set<string>()
    for (const key of Object.keys(promos.promos)) mcs.add(key.replace(/-(latest|recommended)$/, ''))
    const list = [...mcs].filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v) && compareMcVersions(v, '1.12.2') >= 0).sort((a, b) => compareMcVersions(b, a))
    return list.map<VersionOption>((id, i) => ({ id, stable: true, latest: i === 0 }))
  },
  async listLoaderVersions(mcVersion) {
    const all = await metaCache('forge', async () => parseMavenVersions(await getText(`${FORGE_MAVEN}/maven-metadata.xml`)))
    const promos = await getJson<{ promos: Record<string, string> }>(FORGE_PROMOS).catch(() => ({ promos: {} as Record<string, string> }))
    const rec = promos.promos[`${mcVersion}-recommended`]
    const latest = promos.promos[`${mcVersion}-latest`]
    const versions = all.filter((v) => v.startsWith(`${mcVersion}-`)).map((v) => v.slice(mcVersion.length + 1))
    versions.sort((a, b) => compareMcVersions(b, a))
    return versions.slice(0, 40).map((id) => ({ id, stable: id === rec || !latest || id !== latest, latest: id === (rec ?? latest), label: id === rec ? 'Recommended' : id === latest ? 'Latest' : undefined }))
  },
  async install(mcVersion, loaderVersion, ctx) {
    let fv = loaderVersion
    if (!fv) {
      const promos = await getJson<{ promos: Record<string, string> }>(FORGE_PROMOS)
      fv = promos.promos[`${mcVersion}-recommended`] ?? promos.promos[`${mcVersion}-latest`]
    }
    if (!fv) throw new UserError(`Forge isn't available for Minecraft ${mcVersion}.`)
    const full = `${mcVersion}-${fv}`
    const launch = await runInstaller(
      ctx,
      `${FORGE_MAVEN}/${full}/forge-${full}-installer.jar`,
      `Forge ${full}`,
      path.join('libraries', 'net', 'minecraftforge', 'forge', full),
      /^forge-.*\.jar$/
    )
    return { launch, loaderVersion: fv }
  }
}

export const neoforge: Provider = {
  async listVersions(includeSnapshots) {
    const all = await metaCache('neoforge', async () => parseMavenVersions(await getText(`${NEO_MAVEN}/maven-metadata.xml`)))
    const mcs = new Set<string>()
    for (const v of all) {
      if (!includeSnapshots && v.includes('-')) continue
      const mc = neoforgeToMc(v)
      if (mc) mcs.add(mc)
    }
    const list = [...mcs].sort((a, b) => compareMcVersions(b, a))
    return list.map((id, i) => ({ id, stable: true, latest: i === 0 }))
  },
  async listLoaderVersions(mcVersion) {
    const all = await metaCache('neoforge', async () => parseMavenVersions(await getText(`${NEO_MAVEN}/maven-metadata.xml`)))
    const matching = all.filter((v) => neoforgeToMc(v) === mcVersion)
    matching.sort((a, b) => compareMcVersions(b.split('-')[0], a.split('-')[0]))
    const firstStable = matching.find((v) => !v.includes('-'))
    return matching.slice(0, 40).map((id) => ({ id, stable: !id.includes('-'), latest: id === (firstStable ?? matching[0]), label: id.includes('-') ? 'Beta' : undefined }))
  },
  async install(mcVersion, loaderVersion, ctx) {
    let v = loaderVersion
    if (!v) {
      const opts = await this.listLoaderVersions(mcVersion)
      v = (opts.find((o) => o.latest) ?? opts[0])?.id
    }
    if (!v) throw new UserError(`NeoForge isn't available for Minecraft ${mcVersion}.`)
    const launch = await runInstaller(
      ctx,
      `${NEO_MAVEN}/${v}/neoforge-${v}-installer.jar`,
      `NeoForge ${v}`,
      path.join('libraries', 'net', 'neoforged', 'neoforge', v),
      /^neoforge-.*\.jar$/
    )
    return { launch, loaderVersion: v }
  }
}
