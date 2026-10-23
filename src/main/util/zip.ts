import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import yazl from 'yazl'

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (err, zip) => (err || !zip ? reject(err) : resolve(zip)))
  })
}

function readStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => (err || !stream ? reject(err) : resolve(stream)))
  })
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

/** Reads the first entry whose name matches one of `names` (exact path inside the zip). */
export async function readZipEntries(file: string, names: string[]): Promise<Map<string, Buffer>> {
  const zip = await openZip(file)
  const found = new Map<string, Buffer>()
  const wanted = new Set(names)
  return new Promise((resolve, reject) => {
    zip.on('error', reject)
    zip.on('end', () => resolve(found))
    zip.on('entry', async (entry: yauzl.Entry) => {
      try {
        if (wanted.has(entry.fileName)) {
          found.set(entry.fileName, await streamToBuffer(await readStream(zip, entry)))
          if (found.size === wanted.size) {
            zip.close()
            resolve(found)
            return
          }
        }
        zip.readEntry()
      } catch (e) {
        reject(e)
      }
    })
    zip.readEntry()
  })
}

/**
 * Extracts a zip into `dest`. With `stripTopDir`, a single top-level folder is removed
 * (JDK archives ship as `jdk-21.0.5+11-jre/...`). Entries escaping `dest` are rejected.
 */
export async function extractZip(file: string, dest: string, opts: { stripTopDir?: boolean } = {}): Promise<void> {
  const zip = await openZip(file)
  const root = path.resolve(dest)
  await fs.mkdir(root, { recursive: true })
  await new Promise<void>((resolve, reject) => {
    zip.on('error', reject)
    zip.on('end', () => resolve())
    zip.on('entry', async (entry: yauzl.Entry) => {
      try {
        let name = entry.fileName.replace(/\\/g, '/')
        if (opts.stripTopDir) name = name.split('/').slice(1).join('/')
        if (!name) {
          zip.readEntry()
          return
        }
        const target = path.resolve(root, name)
        if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`Unsafe path in archive: ${entry.fileName}`)
        if (name.endsWith('/')) {
          await fs.mkdir(target, { recursive: true })
        } else {
          await fs.mkdir(path.dirname(target), { recursive: true })
          await pipeline(await readStream(zip, entry), createWriteStream(target))
          const mode = (entry.externalFileAttributes >>> 16) & 0o777
          if (mode & 0o111) await fs.chmod(target, mode).catch(() => undefined)
        }
        zip.readEntry()
      } catch (e) {
        reject(e)
      }
    })
    zip.readEntry()
  })
}

/** Lists top-level names inside a zip (first path segment of each entry). */
export async function listZipTopLevel(file: string): Promise<string[]> {
  const zip = await openZip(file)
  const names = new Set<string>()
  await new Promise<void>((resolve, reject) => {
    zip.on('error', reject)
    zip.on('end', () => resolve())
    zip.on('entry', (entry: yauzl.Entry) => {
      const top = entry.fileName.replace(/\\/g, '/').split('/')[0]
      if (top) names.add(top)
      zip.readEntry()
    })
    zip.readEntry()
  })
  return [...names]
}

/**
 * Zips `entries` (absolute paths, files or folders) into `target`, storing them relative to `base`.
 * `exclude` gets each path relative to `base` with forward slashes.
 */
export async function createZip(base: string, entries: string[], target: string, exclude?: (rel: string) => boolean): Promise<void> {
  const zip = new yazl.ZipFile()
  const add = async (abs: string): Promise<void> => {
    const rel = path.relative(base, abs).split(path.sep).join('/')
    if (exclude?.(rel)) return
    const st = await fs.stat(abs)
    if (st.isDirectory()) {
      const kids = await fs.readdir(abs)
      if (kids.length === 0) zip.addEmptyDirectory(rel)
      for (const k of kids) await add(path.join(abs, k))
    } else {
      zip.addFile(abs, rel, { mtime: st.mtime })
    }
  }
  for (const e of entries) await add(e)
  zip.end()
  await fs.mkdir(path.dirname(target), { recursive: true })
  await pipeline(zip.outputStream, createWriteStream(target))
}
