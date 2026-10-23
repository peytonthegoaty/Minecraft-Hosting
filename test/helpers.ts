import { createWriteStream, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import yazl from 'yazl'

export async function tmpDir(prefix = 'bh-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

export async function makeJar(file: string, entries: Record<string, string>): Promise<void> {
  const zip = new yazl.ZipFile()
  for (const [name, content] of Object.entries(entries)) zip.addBuffer(Buffer.from(content), name)
  zip.end()
  await fs.mkdir(path.dirname(file), { recursive: true })
  await pipeline(zip.outputStream, createWriteStream(file))
}

export async function waitFor(cond: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((r) => setTimeout(r, 50))
  }
}
