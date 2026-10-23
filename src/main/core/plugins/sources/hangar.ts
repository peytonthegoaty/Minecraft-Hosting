import type { AddonSearchResult } from '@shared/types'
import { UserError } from '../../../util/errors'
import { getJson } from '../../../util/http'

const API = 'https://hangar.papermc.io/api/v1'

interface HangarProject {
  id: number
  name: string
  namespace: { owner: string; slug: string }
  stats: { downloads: number }
  description: string
  avatarUrl?: string
}

interface HangarVersion {
  name: string
  downloads: Record<string, { fileInfo?: { name: string; sizeBytes: number; sha256Hash: string }; externalUrl?: string | null; downloadUrl?: string | null }>
  pluginDependencies?: Record<string, { name: string; required: boolean; externalUrl?: string | null }[]>
}

export async function searchHangar(query: string, mcVersion: string): Promise<AddonSearchResult[]> {
  const v = /^\d/.test(mcVersion) ? `&version=${encodeURIComponent(mcVersion)}` : ''
  const res = await getJson<{ result: HangarProject[] }>(`${API}/projects?limit=24&offset=0&platform=PAPER&sort=${query ? '-stars' : '-downloads'}&q=${encodeURIComponent(query)}${v}`)
  return res.result.map((p) => ({
    source: 'hangar',
    id: `${p.namespace.owner}/${p.namespace.slug}`,
    name: p.name,
    description: p.description,
    downloads: p.stats.downloads,
    iconUrl: p.avatarUrl,
    author: p.namespace.owner,
    pageUrl: `https://hangar.papermc.io/${p.namespace.owner}/${p.namespace.slug}`
  }))
}

export async function hangarDownload(id: string, mcVersion: string): Promise<{ url: string; fileName: string; sha256?: string; version: string; depends: string[] }> {
  const [owner, slug] = id.split('/')
  const pv = /^\d/.test(mcVersion) ? `&platformVersion=${encodeURIComponent(mcVersion)}` : ''
  const qs = `?limit=10&offset=0&platform=PAPER${pv}`
  const res = await getJson<{ result: HangarVersion[] }>(`${API}/projects/${encodeURIComponent(slug)}/versions${qs}`).catch(() =>
    getJson<{ result: HangarVersion[] }>(`${API}/projects/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/versions${qs}`)
  )
  const v = res.result[0]
  if (!v) throw new UserError(`No version of ${slug} supports Minecraft ${mcVersion} yet.`)
  const d = v.downloads.PAPER ?? Object.values(v.downloads)[0]
  if (!d?.downloadUrl) throw new UserError(`${slug} is hosted outside Hangar — open its page to download it.`)
  return {
    url: d.downloadUrl,
    fileName: d.fileInfo?.name ?? `${slug}-${v.name}.jar`,
    sha256: d.fileInfo?.sha256Hash,
    version: v.name,
    depends: (v.pluginDependencies?.PAPER ?? []).filter((x) => x.required).map((x) => x.name)
  }
}
