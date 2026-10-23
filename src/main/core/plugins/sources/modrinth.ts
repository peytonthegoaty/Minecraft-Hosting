import type { AddonSearchResult } from '@shared/types'
import { getJson, request } from '../../../util/http'

const API = 'https://api.modrinth.com/v2'

export interface ModrinthFile {
  url: string
  filename: string
  primary: boolean
  hashes: { sha1: string; sha512: string }
}

export interface ModrinthVersion {
  id: string
  project_id: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha'
  files: ModrinthFile[]
  dependencies: { project_id: string | null; version_id: string | null; dependency_type: string }[]
}

/** Modrinth loader names to search for, by addon kind. */
export function modrinthLoaders(serverType: string): string[] {
  if (serverType === 'paper' || serverType === 'purpur') return ['paper', 'spigot', 'bukkit', 'purpur']
  if (serverType === 'fabric') return ['fabric']
  if (serverType === 'forge') return ['forge']
  if (serverType === 'neoforge') return ['neoforge']
  return []
}

export async function searchModrinth(query: string, serverType: string, mcVersion: string): Promise<AddonSearchResult[]> {
  const loaders = modrinthLoaders(serverType)
  const facets: string[][] = [loaders.map((l) => `categories:${l}`)]
  if (/^\d/.test(mcVersion)) facets.push([`versions:${mcVersion}`])
  // Mods need the server side; plugins are server-only already.
  if (serverType === 'fabric' || serverType === 'forge' || serverType === 'neoforge') facets.push(['project_type:mod'], ['server_side:required', 'server_side:optional'])
  const url = `${API}/search?limit=24&index=${query ? 'relevance' : 'downloads'}&query=${encodeURIComponent(query)}&facets=${encodeURIComponent(JSON.stringify(facets))}`
  const res = await getJson<{ hits: { project_id: string; slug: string; title: string; description: string; downloads: number; icon_url?: string; author: string; project_type: string }[] }>(url)
  return res.hits.map((h) => ({
    source: 'modrinth',
    id: h.project_id,
    name: h.title,
    description: h.description,
    downloads: h.downloads,
    iconUrl: h.icon_url || undefined,
    author: h.author,
    pageUrl: `https://modrinth.com/${h.project_type || 'project'}/${h.slug}`
  }))
}

export function pickVersion(versions: ModrinthVersion[]): ModrinthVersion | undefined {
  return versions.find((v) => v.version_type === 'release') ?? versions[0]
}

export function primaryFile(v: ModrinthVersion): ModrinthFile | undefined {
  return v.files.find((f) => f.primary) ?? v.files[0]
}

export async function modrinthVersions(projectId: string, serverType: string, mcVersion: string): Promise<ModrinthVersion[]> {
  const loaders = encodeURIComponent(JSON.stringify(modrinthLoaders(serverType)))
  const versions = /^\d/.test(mcVersion) ? `&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}` : ''
  return getJson<ModrinthVersion[]>(`${API}/project/${encodeURIComponent(projectId)}/version?loaders=${loaders}${versions}`)
}

/** Asks Modrinth which installed files (by sha1) have newer compatible versions. */
export async function modrinthUpdates(sha1s: string[], serverType: string, mcVersion: string): Promise<Record<string, ModrinthVersion>> {
  if (!sha1s.length) return {}
  const body = JSON.stringify({ hashes: sha1s, algorithm: 'sha1', loaders: modrinthLoaders(serverType), game_versions: /^\d/.test(mcVersion) ? [mcVersion] : [] })
  const res = await request(`${API}/version_files/update`, { method: 'POST', body, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } })
  return (await res.json()) as Record<string, ModrinthVersion>
}
