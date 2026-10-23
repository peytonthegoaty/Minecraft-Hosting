// Builds the Java command line for a server.
import type { ServerConfig } from '@shared/types'

/** Aikar's G1 flags (https://docs.papermc.io/paper/aikars-flags), tuned for heaps above 12 GB. */
export function aikarFlags(memoryMb: number): string[] {
  const big = memoryMb > 12 * 1024
  return [
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
    `-XX:G1NewSizePercent=${big ? 40 : 30}`,
    `-XX:G1MaxNewSizePercent=${big ? 50 : 40}`,
    `-XX:G1HeapRegionSize=${big ? '16M' : '8M'}`,
    `-XX:G1ReservePercent=${big ? 15 : 20}`,
    '-XX:G1HeapWastePercent=5',
    '-XX:G1MixedGCCountTarget=4',
    `-XX:InitiatingHeapOccupancyPercent=${big ? 20 : 15}`,
    '-XX:G1MixedGCLiveThresholdPercent=90',
    '-XX:G1RSetUpdatingPauseTimePercent=5',
    '-XX:SurvivorRatio=32',
    '-XX:+PerfDisableSharedMem',
    '-XX:MaxTenuringThreshold=1',
    '-Dusing.aikars.flags=https://mcflags.emc.gs',
    '-Daikars.new.flags=true'
  ]
}

/** Splits extra JVM args typed by the user, honouring double quotes. */
export function splitArgs(s: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) out.push(m[1] ?? m[2])
  return out
}

export function buildJavaArgs(cfg: ServerConfig, platform: string = process.platform): string[] {
  if (!cfg.launch) throw new Error('Server is not installed')
  const mem = Math.max(512, Math.round(cfg.memoryMb))
  const args = [`-Xmx${mem}M`, `-Xms${cfg.optimizedFlags ? mem : Math.min(1024, mem)}M`]
  if (cfg.optimizedFlags) args.push(...aikarFlags(mem))
  args.push(...splitArgs(cfg.extraJvmArgs ?? ''))
  if (cfg.launch.kind === 'jar') args.push('-jar', cfg.launch.jar, 'nogui')
  else args.push(`@${platform === 'win32' ? cfg.launch.winArgs : cfg.launch.unixArgs}`, 'nogui')
  return args
}
