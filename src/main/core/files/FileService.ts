import { promises as fs } from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import type { FileContent, FileEntry } from '@shared/types'
import { UserError } from '../../util/errors'
import { exists, resolveInside, writeFileAtomic } from '../../util/fsx'
import { createZip, extractZip } from '../../util/zip'
import { Properties } from '../servers/properties'

const MAX_EDIT_BYTES = 2 * 1024 * 1024

/** Checks YAML/JSON before saving so a typo can't stop the server from starting. */
export function validateText(rel: string, content: string): void {
  const lower = rel.toLowerCase()
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) {
    const docs = YAML.parseAllDocuments(content)
    for (const d of docs) {
      const err = d.errors[0]
      if (err) {
        const line = err.linePos?.[0]?.line
        throw new UserError(`Not saved — YAML error${line ? ` on line ${line}` : ''}: ${err.message.split('\n')[0]}`)
      }
    }
  } else if (lower.endsWith('.json') || lower.endsWith('.mcmeta')) {
    try {
      JSON.parse(content)
    } catch (e) {
      throw new UserError(`Not saved — JSON error: ${(e as Error).message}`)
    }
  }
}

export class FileService {
  constructor(private rootOf: (id: string) => string) {}

  private abs(id: string, rel: string): string {
    return resolveInside(this.rootOf(id), rel)
  }

  async list(id: string, rel: string): Promise<FileEntry[]> {
    const dir = this.abs(id, rel)
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => {
      throw new UserError('That folder no longer exists.')
    })
    const out: FileEntry[] = []
    for (const e of entries) {
      const p = path.join(dir, e.name)
      const st = await fs.stat(p).catch(() => null)
      if (!st) continue
      out.push({
        name: e.name,
        path: path.relative(this.rootOf(id), p).split(path.sep).join('/'),
        isDir: st.isDirectory(),
        size: st.isDirectory() ? 0 : st.size,
        mtime: st.mtimeMs
      })
    }
    return out.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }

  async read(id: string, rel: string): Promise<FileContent> {
    const p = this.abs(id, rel)
    const st = await fs.stat(p)
    if (st.isDirectory()) throw new UserError('That is a folder.')
    const base = { path: rel, size: st.size, mtime: st.mtimeMs }
    if (st.size > MAX_EDIT_BYTES) return { ...base, content: '', binary: false, tooLarge: true }
    const buf = await fs.readFile(p)
    const binary = buf.subarray(0, 8000).includes(0)
    return { ...base, content: binary ? '' : buf.toString('utf8'), binary, tooLarge: false }
  }

  async write(id: string, rel: string, content: string): Promise<{ mtime: number }> {
    validateText(rel, content)
    const p = this.abs(id, rel)
    await writeFileAtomic(p, content)
    return { mtime: (await fs.stat(p)).mtimeMs }
  }

  async create(id: string, rel: string, isDir: boolean): Promise<void> {
    const p = this.abs(id, rel)
    if (await exists(p)) throw new UserError('Something with that name already exists.')
    if (isDir) await fs.mkdir(p, { recursive: true })
    else {
      await fs.mkdir(path.dirname(p), { recursive: true })
      await fs.writeFile(p, '')
    }
  }

  async rename(id: string, from: string, to: string): Promise<void> {
    const a = this.abs(id, from)
    const b = this.abs(id, to)
    if (await exists(b)) throw new UserError('Something with that name already exists.')
    await fs.mkdir(path.dirname(b), { recursive: true })
    await fs.rename(a, b)
  }

  async remove(id: string, rel: string): Promise<void> {
    const p = this.abs(id, rel)
    if (p === path.resolve(this.rootOf(id))) throw new UserError("The server folder itself can't be deleted here.")
    await fs.rm(p, { recursive: true, force: true })
  }

  async importFiles(id: string, relDir: string, sources: string[]): Promise<void> {
    const dir = this.abs(id, relDir)
    await fs.mkdir(dir, { recursive: true })
    for (const src of sources) {
      const target = resolveInside(dir, path.basename(src))
      await fs.cp(src, target, { recursive: true, force: true })
    }
  }

  async zip(id: string, rels: string[], targetRel: string): Promise<void> {
    const target = this.abs(id, targetRel)
    const entries = rels.map((r) => this.abs(id, r))
    await createZip(path.dirname(entries[0] ?? target), entries, target)
  }

  async unzip(id: string, rel: string): Promise<void> {
    const p = this.abs(id, rel)
    const dest = p.replace(/\.zip$/i, '')
    await extractZip(p, dest)
  }

  async readProperties(id: string): Promise<Record<string, string>> {
    const text = await fs.readFile(this.abs(id, 'server.properties'), 'utf8').catch(() => '')
    return Properties.parse(text).toObject()
  }

  async writeProperties(id: string, values: Record<string, string>): Promise<void> {
    const p = this.abs(id, 'server.properties')
    const props = Properties.parse(await fs.readFile(p, 'utf8').catch(() => ''))
    for (const [k, v] of Object.entries(values)) props.set(k, v)
    await writeFileAtomic(p, props.toString())
  }
}
