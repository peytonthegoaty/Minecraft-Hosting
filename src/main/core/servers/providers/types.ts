import type { LaunchSpec, VersionOption } from '@shared/types'
import type { DownloadManager } from '../../downloads/DownloadManager'

export interface InstallContext {
  dir: string
  downloads: DownloadManager
  /** Resolves a Java runtime able to run installers for this Minecraft version. */
  javaPath: () => Promise<string>
  log: (line: string) => void
  runJava: (javaPath: string, args: string[], cwd: string, onLine: (l: string) => void) => Promise<number>
}

export interface InstallResult {
  launch: LaunchSpec
  loaderVersion?: string
}

export interface Provider {
  listVersions(includeSnapshots: boolean): Promise<VersionOption[]>
  listLoaderVersions(mcVersion: string): Promise<VersionOption[]>
  install(mcVersion: string, loaderVersion: string | undefined, ctx: InstallContext): Promise<InstallResult>
}

export function parseMavenVersions(xml: string): string[] {
  return [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1].trim())
}
