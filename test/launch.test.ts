import { describe, expect, it } from 'vitest'
import type { ServerConfig } from '@shared/types'
import { neoforgeToMc } from '../src/main/core/servers/providers/forge'
import { sortVersionsDesc } from '../src/main/core/servers/providers/paper'
import { parseMavenVersions } from '../src/main/core/servers/providers/types'
import { buildJavaArgs, splitArgs } from '../src/main/core/servers/launch'

const base = { memoryMb: 6144, optimizedFlags: false, extraJvmArgs: '' } as ServerConfig

describe('java command line', () => {
  it('builds jar launches', () => {
    expect(buildJavaArgs({ ...base, launch: { kind: 'jar', jar: 'server.jar' } })).toEqual(['-Xmx6144M', '-Xms1024M', '-jar', 'server.jar', 'nogui'])
  })
  it('uses the platform args file for Forge/NeoForge', () => {
    const cfg = { ...base, launch: { kind: 'argsfile', winArgs: 'libraries/x/win_args.txt', unixArgs: 'libraries/x/unix_args.txt' } } as ServerConfig
    expect(buildJavaArgs(cfg, 'win32').slice(-2)).toEqual(['@libraries/x/win_args.txt', 'nogui'])
    expect(buildJavaArgs(cfg, 'linux').slice(-2)).toEqual(['@libraries/x/unix_args.txt', 'nogui'])
  })
  it('adds Aikar flags and extra args', () => {
    const args = buildJavaArgs({ ...base, optimizedFlags: true, extraJvmArgs: '-Dfoo=bar "-Dname=two words"', launch: { kind: 'jar', jar: 's.jar' } })
    expect(args).toContain('-XX:+UseG1GC')
    expect(args).toContain('-Xms6144M')
    expect(args).toContain('-Dname=two words')
    expect(splitArgs('  ')).toEqual([])
  })
})

describe('version lists', () => {
  it('maps NeoForge versions to Minecraft versions', () => {
    expect(neoforgeToMc('21.1.77')).toBe('1.21.1')
    expect(neoforgeToMc('21.0.167')).toBe('1.21')
    expect(neoforgeToMc('20.4.237')).toBe('1.20.4')
    expect(neoforgeToMc('20.2.3-beta')).toBe('1.20.2')
    expect(neoforgeToMc('26.1.0.5-beta')).toBe('26.1')
    expect(neoforgeToMc('19.0.0')).toBe(null)
  })
  it('sorts Paper versions newest first with pre-releases after releases', () => {
    expect(sortVersionsDesc(['1.20.4', '1.21.4', '1.21.10', '1.21.4-rc1', '1.21.9'])).toEqual(['1.21.10', '1.21.9', '1.21.4', '1.21.4-rc1', '1.20.4'])
  })
  it('parses maven metadata', () => {
    expect(parseMavenVersions('<metadata><versioning><versions><version>21.1.1</version><version>21.1.2</version></versions></versioning></metadata>')).toEqual(['21.1.1', '21.1.2'])
  })
})
