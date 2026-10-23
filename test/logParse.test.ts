import { describe, expect, it } from 'vitest'
import { isStartupDone, parseLine, parseList, parseTps, playerJoined, playerLeft, tpsCommand } from '../src/main/core/servers/logParse'

describe('log parsing', () => {
  it('reads Paper, Vanilla and Forge formats', () => {
    expect(parseLine('[14:02:11 INFO]: Done (8.214s)! For help, type "help"')).toEqual({ level: 'INFO', message: 'Done (8.214s)! For help, type "help"' })
    expect(parseLine('[14:02:11] [Server thread/WARN]: Can\'t keep up!').level).toBe('WARN')
    expect(parseLine('[14:02:11] [Server thread/INFO] [minecraft/DedicatedServer]: Done (3.1s)! For help, type "help"').message).toMatch(/^Done/)
    expect(parseLine('[14:02:11 ERROR]: Could not pass event').level).toBe('ERROR')
    expect(parseLine('\x1b[33m[14:02:11 WARN]: colored\x1b[0m').level).toBe('WARN')
  })
  it('detects chat', () => {
    expect(parseLine('[14:06:03 INFO]: <Alex_Builds> hi').level).toBe('CHAT')
    expect(parseLine('[14:06:03] [Server thread/INFO]: [Not Secure] <Bob> yo').level).toBe('CHAT')
  })
  it('detects startup, joins and leaves', () => {
    expect(isStartupDone('Done (8.214s)! For help, type "help"')).toBe(true)
    expect(isStartupDone('Done (12,5s)! For help, type "help"')).toBe(true)
    expect(playerJoined('Alex_Builds joined the game')).toBe('Alex_Builds')
    expect(playerJoined('<Bob> Alex_Builds joined the game')).toBeNull()
    expect(playerLeft('Creeper99 left the game')).toBe('Creeper99')
  })
  it('parses the list command in old and new formats', () => {
    expect(parseList('There are 2 of a max of 20 players online: Alex_Builds, Creeper99')).toEqual({ online: 2, max: 20, names: ['Alex_Builds', 'Creeper99'] })
    expect(parseList('There are 0 of a max of 10 players online:')).toEqual({ online: 0, max: 10, names: [] })
    expect(parseList('There are 1/20 players online:\nSteve')).toEqual({ online: 1, max: 20, names: ['Steve'] })
    expect(parseList('nope')).toBeNull()
  })
  it('parses TPS replies', () => {
    expect(parseTps('§6TPS from last 1m, 5m, 15m: §a*20.0, §a20.0, §a19.97')).toEqual({ tps: 20 })
    expect(parseTps('TPS from last 1m, 5m, 15m: 17.53, 19.0, 19.8')).toEqual({ tps: 17.53 })
    expect(parseTps('Overall: Mean tick time: 2.345 ms. Mean TPS: 20.000')).toEqual({ mspt: 2.345, tps: 20 })
    expect(parseTps('Target tick rate: 20.0 per second.\nAverage time per tick: 80.0ms (Target: 50.0ms)')).toEqual({ mspt: 80, tps: 12.5 })
    expect(tpsCommand('paper')).toBe('tps')
    expect(tpsCommand('neoforge')).toBe('neoforge tps')
    expect(tpsCommand('vanilla')).toBe('tick query')
  })
})
