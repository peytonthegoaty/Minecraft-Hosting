import { describe, expect, it } from 'vitest'
import { Properties } from '../src/main/core/servers/properties'

const SAMPLE = `#Minecraft server properties
#Thu Oct 23 12:00:00 UTC 2026
enable-rcon=false
motd=\\u00A7aWelcome\\! to the server
server-port=25565
level-seed=
`

describe('server.properties', () => {
  it('reads values including unicode escapes', () => {
    const p = Properties.parse(SAMPLE)
    expect(p.get('motd')).toBe('§aWelcome! to the server')
    expect(p.get('server-port')).toBe('25565')
    expect(p.get('level-seed')).toBe('')
  })
  it('keeps comments and order when saving', () => {
    const p = Properties.parse(SAMPLE)
    p.set('server-port', '25570')
    p.set('enable-rcon', 'true')
    p.set('rcon.port', '25575')
    const out = p.toString()
    expect(out.startsWith('#Minecraft server properties\n#Thu Oct 23')).toBe(true)
    expect(out).toContain('server-port=25570')
    expect(out).toContain('motd=\\u00A7aWelcome! to the server')
    expect(out.trim().endsWith('rcon.port=25575')).toBe(true)
    expect(Properties.parse(out).get('motd')).toBe('§aWelcome! to the server')
  })
})
