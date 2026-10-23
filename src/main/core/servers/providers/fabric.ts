import path from 'node:path'
import { UserError } from '../../../util/errors'
import { getJson } from '../../../util/http'
import type { Provider } from './types'

const META = 'https://meta.fabricmc.net/v2/versions'

export const fabric: Provider = {
  async listVersions(includeSnapshots) {
    const games = await getJson<{ version: string; stable: boolean }[]>(`${META}/game`)
    const list = games.filter((g) => g.stable || includeSnapshots)
    return list.map((g, i) => ({ id: g.version, stable: g.stable, latest: i === 0 }))
  },
  async listLoaderVersions() {
    const loaders = await getJson<{ version: string; stable: boolean }[]>(`${META}/loader`)
    return loaders.slice(0, 30).map((l, i) => ({ id: l.version, stable: l.stable, latest: i === 0 }))
  },
  async install(mcVersion, loaderVersion, ctx) {
    const loaders = await getJson<{ version: string; stable: boolean }[]>(`${META}/loader`)
    const installers = await getJson<{ version: string; stable: boolean }[]>(`${META}/installer`)
    const loader = loaderVersion ?? (loaders.find((l) => l.stable) ?? loaders[0])?.version
    const installer = (installers.find((i) => i.stable) ?? installers[0])?.version
    if (!loader || !installer) throw new UserError('Fabric version information is unavailable right now.')
    const url = `${META}/loader/${mcVersion}/${loader}/${installer}/server/jar`
    await ctx.downloads.download(url, path.join(ctx.dir, 'fabric-server-launch.jar'), { label: `Fabric ${mcVersion} (loader ${loader})` })
    // The launcher downloads the vanilla server and libraries itself on first start.
    return { launch: { kind: 'jar', jar: 'fabric-server-launch.jar' }, loaderVersion: loader }
  }
}
