import { promises as fs } from 'node:fs'
import path from 'node:path'

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function readJson<T>(p: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8')) as T
  } catch {
    return fallback
  }
}

/** Writes via a temp file + rename so a crash never leaves a half-written file. */
export async function writeFileAtomic(p: string, data: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true })
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, p)
}

export async function writeJson(p: string, value: unknown): Promise<void> {
  await writeFileAtomic(p, JSON.stringify(value, null, 2))
}

export async function dirSize(dir: string): Promise<number> {
  let total = 0
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) total += await dirSize(p)
    else {
      try {
        total += (await fs.stat(p)).size
      } catch {
        // file vanished
      }
    }
  }
  return total
}

/**
 * Resolves `rel` inside `root` and refuses anything that escapes it
 * (`..`, absolute paths, drive letters). Used for every file operation the UI asks for.
 */
export function resolveInside(root: string, rel: string): string {
  const base = path.resolve(root)
  const target = path.resolve(base, rel.replace(/^[/\\]+/, ''))
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error('That path is outside the server folder.')
  }
  return target
}

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return s || 'server'
}
