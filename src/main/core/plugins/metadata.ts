// Reads name/version/authors/dependencies from plugin and mod jars.
import { parse as parseToml } from 'smol-toml'
import YAML from 'yaml'

export interface AddonMeta {
  name: string
  version: string
  authors: string[]
  description: string
  depends: string[]
}

export const META_FILES = [
  'plugin.yml',
  'paper-plugin.yml',
  'bungee.yml',
  'fabric.mod.json',
  'quilt.mod.json',
  'META-INF/mods.toml',
  'META-INF/neoforge.mods.toml',
  'META-INF/MANIFEST.MF',
  'mcmod.info'
]

const IGNORED_DEPS = new Set(['minecraft', 'java', 'fabricloader', 'fabric', 'forge', 'neoforge', 'quilt_loader'])

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function manifestVersion(entries: Map<string, Buffer>): string {
  const mf = entries.get('META-INF/MANIFEST.MF')?.toString('utf8') ?? ''
  return mf.match(/^Implementation-Version:\s*(.+)$/m)?.[1]?.trim() ?? ''
}

export function parseAddonMeta(entries: Map<string, Buffer>, fileName: string): AddonMeta {
  const fallback: AddonMeta = { name: fileName.replace(/\.jar(\.disabled)?$/i, ''), version: '', authors: [], description: '', depends: [] }
  try {
    const paper = entries.get('paper-plugin.yml') ?? entries.get('plugin.yml') ?? entries.get('bungee.yml')
    if (paper) {
      const y = (YAML.parse(paper.toString('utf8')) ?? {}) as Record<string, unknown>
      const authors = [y.author, ...(Array.isArray(y.authors) ? y.authors : [])].filter(Boolean).map(str)
      let depends: string[] = Array.isArray(y.depend) ? y.depend.map(str) : []
      const deps = (y.dependencies as Record<string, unknown> | undefined)?.server as Record<string, { required?: boolean }> | undefined
      if (deps && typeof deps === 'object') depends = Object.entries(deps).filter(([, v]) => v?.required !== false).map(([k]) => k)
      return { name: str(y.name) || fallback.name, version: str(y.version), authors, description: str(y.description), depends }
    }
    const fabricRaw = entries.get('fabric.mod.json') ?? entries.get('quilt.mod.json')
    if (fabricRaw) {
      const j = JSON.parse(fabricRaw.toString('utf8').replace(/^﻿/, '')) as Record<string, unknown>
      const q = (j.quilt_loader as Record<string, unknown> | undefined) ?? j
      const meta = (q.metadata as Record<string, unknown> | undefined) ?? j
      const authorsRaw = (meta.authors ?? meta.contributors ?? []) as unknown
      const authors = Array.isArray(authorsRaw) ? authorsRaw.map((a) => (typeof a === 'string' ? a : str((a as { name?: string }).name))) : Object.keys((authorsRaw as object) ?? {})
      const dependsRaw = (j.depends ?? {}) as Record<string, unknown>
      return {
        name: str(meta.name ?? j.name ?? q.id ?? j.id) || fallback.name,
        version: str(q.version ?? j.version),
        authors: authors.filter(Boolean),
        description: str(meta.description ?? j.description),
        depends: Object.keys(dependsRaw).filter((d) => !IGNORED_DEPS.has(d))
      }
    }
    const toml = entries.get('META-INF/neoforge.mods.toml') ?? entries.get('META-INF/mods.toml')
    if (toml) {
      const t = parseToml(toml.toString('utf8')) as Record<string, unknown>
      const mod = ((t.mods as Record<string, unknown>[] | undefined) ?? [])[0] ?? {}
      let version = str(mod.version)
      if (!version || version.includes('${')) version = manifestVersion(entries) || version.replace(/\$\{[^}]+\}/g, '').trim()
      const depTable = (t.dependencies as Record<string, { modId?: string; mandatory?: boolean; type?: string }[]> | undefined) ?? {}
      const deps = (depTable[str(mod.modId)] ?? Object.values(depTable)[0] ?? []) as { modId?: string; mandatory?: boolean; type?: string }[]
      return {
        name: str(mod.displayName ?? mod.modId) || fallback.name,
        version,
        authors: str(mod.authors ?? t.authors)
          .split(/,\s*/)
          .filter(Boolean),
        description: str(mod.description).trim(),
        depends: deps.filter((d) => d.mandatory === true || d.type === 'required').map((d) => str(d.modId)).filter((d) => d && !IGNORED_DEPS.has(d))
      }
    }
    const mcmod = entries.get('mcmod.info')
    if (mcmod) {
      const j = JSON.parse(mcmod.toString('utf8')) as unknown
      const m = (Array.isArray(j) ? j[0] : (j as { modList?: unknown[] }).modList?.[0]) as Record<string, unknown> | undefined
      if (m) return { name: str(m.name) || fallback.name, version: str(m.version), authors: Array.isArray(m.authorList) ? m.authorList.map(str) : [], description: str(m.description), depends: [] }
    }
  } catch {
    // Malformed metadata: show the file name.
  }
  return { ...fallback, version: manifestVersion(entries) }
}
