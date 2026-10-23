import type { AddonSearchResult } from '@shared/types'
import { getJson } from '../../../util/http'

const API = 'https://api.spiget.org/v2'

interface SpigetResource {
  id: number
  name: string
  tag: string
  downloads: number
  external: boolean
  premium?: boolean
  file?: { type: string }
  icon?: { url: string }
  author?: { id: number }
}

export async function searchSpiget(query: string): Promise<AddonSearchResult[]> {
  const url = query
    ? `${API}/search/resources/${encodeURIComponent(query)}?field=name&size=30&sort=-downloads`
    : `${API}/resources?size=30&sort=-downloads`
  const res = await getJson<SpigetResource[]>(url)
  // Only plugins Spiget can download directly (not premium, not hosted elsewhere).
  return res
    .filter((r) => !r.external && !r.premium && (r.file?.type ?? '.jar') === '.jar')
    .slice(0, 24)
    .map((r) => ({
      source: 'spigot',
      id: String(r.id),
      name: r.name,
      description: r.tag,
      downloads: r.downloads,
      iconUrl: r.icon?.url ? `https://www.spigotmc.org/${r.icon.url}` : undefined,
      author: r.author ? `#${r.author.id}` : 'SpigotMC',
      pageUrl: `https://www.spigotmc.org/resources/${r.id}/`
    }))
}

export async function spigetInfo(id: string): Promise<{ name: string; version: string }> {
  const r = await getJson<{ name: string; version?: { id: number } }>(`${API}/resources/${encodeURIComponent(id)}`)
  const v = r.version ? await getJson<{ name: string }>(`${API}/resources/${encodeURIComponent(id)}/versions/${r.version.id}`).catch(() => ({ name: '' })) : { name: '' }
  return { name: r.name, version: v.name }
}

export function spigetDownloadUrl(id: string): string {
  return `${API}/resources/${encodeURIComponent(id)}/download`
}
