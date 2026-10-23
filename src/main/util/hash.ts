import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export type HashAlgo = 'sha1' | 'sha256' | 'sha512' | 'md5'

export function hashFile(file: string, algo: HashAlgo): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash(algo)
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')))
  })
}
