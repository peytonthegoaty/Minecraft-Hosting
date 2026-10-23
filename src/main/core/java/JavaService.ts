import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { x as untar } from 'tar'
import type { JavaRuntime } from '@shared/types'
import { acceptableJava, installableJava, isJavaAcceptable } from '@shared/versions'
import type { DownloadManager } from '../downloads/DownloadManager'
import { UserError } from '../../util/errors'
import { exists, readJson, writeJson } from '../../util/fsx'
import { getJson } from '../../util/http'
import { extractZip } from '../../util/zip'
import { adoptiumArch, adoptiumOs, majorFromVersion, parseJavaProperties, parseRegValues } from './parse'

const IS_WIN = process.platform === 'win32'
const JAVA_BIN = IS_WIN ? 'java.exe' : 'java'

function run(cmd: string, args: string[], timeoutMs = 10000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ stdout: String(stdout), stderr: String(stderr), code: err ? 1 : 0 })
    })
  })
}

interface AdoptiumAsset {
  binary: { package: { link: string; checksum: string; name: string; size: number } }
  version: { semver: string; openjdk_version?: string }
}

/** Finds Java installs on this PC and installs Eclipse Temurin into the app's own folder when needed. */
export class JavaService {
  private cache: JavaRuntime[] | null = null
  private manualFile: string

  constructor(
    private runtimesDir: string,
    dataDir: string,
    private downloads: DownloadManager
  ) {
    this.manualFile = path.join(dataDir, 'java-manual.json')
  }

  async list(refresh = false): Promise<JavaRuntime[]> {
    if (this.cache && !refresh) return this.cache
    const candidates = await this.candidates()
    const probed = await Promise.all(candidates.map((c) => this.probe(c).catch(() => null)))
    const seen = new Set<string>()
    const result: JavaRuntime[] = []
    for (const r of probed) {
      if (!r) continue
      const key = `${r.version}|${r.vendor}|${path.dirname(path.dirname(r.path)).toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push(r)
    }
    result.sort((a, b) => Number(b.managed) - Number(a.managed) || b.major - a.major)
    this.cache = result
    return result
  }

  /** Best runtime for a server needing `required`, preferring an exact major and app-managed installs. */
  async findFor(required: number, preferredPath?: string | null): Promise<JavaRuntime | null> {
    const all = await this.list()
    if (preferredPath) {
      const hit = all.find((r) => r.path === preferredPath) ?? (await this.probe(preferredPath).catch(() => null))
      if (hit && isJavaAcceptable(required, hit.major)) return hit
    }
    const ok = all.filter((r) => isJavaAcceptable(required, r.major))
    const target = installableJava(required)
    ok.sort((a, b) => Number(b.major === target) - Number(a.major === target) || Number(b.managed) - Number(a.managed) || a.major - b.major)
    return ok[0] ?? null
  }

  describeRequirement(required: number): string {
    const [min, max] = acceptableJava(required)
    if (max === min) return `Java ${min}`
    if (max >= 99) return `Java ${min} or newer`
    return `Java ${min}–${max}`
  }

  async install(requiredMajor: number): Promise<JavaRuntime> {
    const major = installableJava(requiredMajor)
    const osName = adoptiumOs(process.platform)
    const arch = adoptiumArch(process.arch)
    let assets: AdoptiumAsset[] = []
    for (const image of ['jre', 'jdk']) {
      const url = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${arch}&image_type=${image}&os=${osName}&vendor=eclipse`
      assets = await getJson<AdoptiumAsset[]>(url).catch(() => [])
      if (assets.length) break
    }
    if (!assets.length) throw new UserError(`Java ${major} isn't available for this computer (${osName}/${arch}) from Eclipse Temurin.`)
    const pkg = assets[0].binary.package
    const tmpDir = path.join(this.runtimesDir, `.tmp-${major}-${Date.now()}`)
    const archive = path.join(tmpDir, pkg.name)
    await this.downloads.download(pkg.link, archive, { label: `Java ${major} (Temurin ${assets[0].version.semver})`, hash: { algo: 'sha256', value: pkg.checksum } })
    const extracted = path.join(tmpDir, 'x')
    if (pkg.name.endsWith('.zip')) await extractZip(archive, extracted, { stripTopDir: true })
    else {
      await fs.mkdir(extracted, { recursive: true })
      await untar({ file: archive, cwd: extracted, strip: 1 })
    }
    const finalDir = path.join(this.runtimesDir, `java-${major}`)
    await fs.rm(finalDir, { recursive: true, force: true })
    await fs.rename(extracted, finalDir)
    await fs.rm(tmpDir, { recursive: true, force: true })
    const bin = await this.binIn(finalDir)
    if (!bin) throw new UserError(`Java ${major} was downloaded but its java program wasn't found.`)
    const rt = await this.probe(bin)
    if (!rt) throw new UserError(`Java ${major} was installed but won't run on this computer.`)
    this.cache = null
    return rt
  }

  async remove(javaPath: string): Promise<void> {
    const root = path.resolve(this.runtimesDir)
    const p = path.resolve(javaPath)
    if (p.startsWith(root + path.sep)) {
      const dir = p.slice(root.length + 1).split(path.sep)[0]
      await fs.rm(path.join(root, dir), { recursive: true, force: true })
    } else {
      const manual = await readJson<string[]>(this.manualFile, [])
      await writeJson(this.manualFile, manual.filter((m) => m !== javaPath))
    }
    this.cache = null
  }

  async addManual(javaPath: string): Promise<JavaRuntime> {
    let bin = javaPath
    const st = await fs.stat(javaPath).catch(() => null)
    if (st?.isDirectory()) bin = (await this.binIn(javaPath)) ?? path.join(javaPath, 'bin', JAVA_BIN)
    const rt = await this.probe(bin)
    if (!rt) throw new UserError("That doesn't look like a working Java install.")
    const manual = await readJson<string[]>(this.manualFile, [])
    if (!manual.includes(bin)) await writeJson(this.manualFile, [...manual, bin])
    this.cache = null
    return rt
  }

  async probe(bin: string): Promise<JavaRuntime | null> {
    if (bin !== 'java' && !(await exists(bin))) return null
    const { stdout, stderr } = await run(bin, ['-XshowSettings:properties', '-version'])
    const info = parseJavaProperties(stderr + '\n' + stdout)
    if (!info) return null
    let resolved = bin
    if (bin === 'java' && info.home) resolved = path.join(info.home, 'bin', JAVA_BIN)
    return {
      path: resolved,
      major: majorFromVersion(info.version),
      version: info.version,
      vendor: info.vendor,
      arch: info.arch,
      managed: path.resolve(resolved).startsWith(path.resolve(this.runtimesDir) + path.sep)
    }
  }

  private async binIn(dir: string): Promise<string | null> {
    for (const rel of [['bin', JAVA_BIN], ['Contents', 'Home', 'bin', JAVA_BIN], ['jre', 'bin', JAVA_BIN]]) {
      const p = path.join(dir, ...rel)
      if (await exists(p)) return p
    }
    return null
  }

  private async childBins(parent: string): Promise<string[]> {
    const out: string[] = []
    let kids: string[] = []
    try {
      kids = await fs.readdir(parent)
    } catch {
      return out
    }
    for (const k of kids) {
      if (k.startsWith('.tmp-')) continue
      const b = await this.binIn(path.join(parent, k))
      if (b) out.push(b)
    }
    return out
  }

  private async candidates(): Promise<string[]> {
    const c = new Set<string>()
    for (const b of await this.childBins(this.runtimesDir)) c.add(b)
    for (const b of await readJson<string[]>(this.manualFile, [])) c.add(b)
    if (process.env.JAVA_HOME) {
      const b = await this.binIn(process.env.JAVA_HOME)
      if (b) c.add(b)
    }
    const which = await run(IS_WIN ? 'where' : 'which', IS_WIN ? ['java'] : ['-a', 'java'], 5000)
    for (const line of which.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      // Skip the Windows "java.exe" shim in system32 / Oracle's javapath; probing the real ones below is enough.
      c.add(line)
    }
    if (IS_WIN) {
      const keys: [string, string][] = [
        ['HKLM\\SOFTWARE\\JavaSoft', 'JavaHome'],
        ['HKLM\\SOFTWARE\\Eclipse Adoptium', 'Path'],
        ['HKLM\\SOFTWARE\\Eclipse Foundation', 'Path'],
        ['HKLM\\SOFTWARE\\Microsoft\\JDK', 'Path'],
        ['HKLM\\SOFTWARE\\Azul Systems\\Zulu', 'InstallationPath'],
        ['HKLM\\SOFTWARE\\Amazon Corretto', 'InstallationPath']
      ]
      for (const [key, value] of keys) {
        const r = await run('reg', ['query', key, '/s', '/v', value], 5000)
        for (const home of parseRegValues(r.stdout)) {
          const b = await this.binIn(home)
          if (b) c.add(b)
        }
      }
      const pf = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']].filter(Boolean) as string[]
      for (const base of pf) {
        for (const vendor of ['Java', 'Eclipse Adoptium', 'Eclipse Foundation', 'Microsoft', 'Zulu', 'Amazon Corretto', 'BellSoft', 'Semeru']) {
          for (const b of await this.childBins(path.join(base, vendor))) c.add(b)
        }
      }
    } else if (process.platform === 'darwin') {
      for (const b of await this.childBins('/Library/Java/JavaVirtualMachines')) c.add(b)
      for (const b of await this.childBins(path.join(os.homedir(), 'Library/Java/JavaVirtualMachines'))) c.add(b)
    } else {
      for (const b of await this.childBins('/usr/lib/jvm')) c.add(b)
    }
    for (const b of await this.childBins(path.join(os.homedir(), '.jdks'))) c.add(b)
    return [...c]
  }
}
