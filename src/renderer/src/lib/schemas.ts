// Partial JSON schemas for common server config files. Only well-known keys are typed so that
// typos like `max-joins-per-tick: five` are flagged; unknown keys are always allowed.
import type { JSONSchema } from 'monaco-yaml'

const int: JSONSchema = { type: 'integer' }
const num: JSONSchema = { type: 'number' }
const bool: JSONSchema = { type: 'boolean' }
const obj = (properties: Record<string, JSONSchema>): JSONSchema => ({ type: 'object', properties })

export const SCHEMAS: { fileMatch: string[]; uri: string; schema: JSONSchema }[] = [
  {
    fileMatch: ['**/bukkit.yml'],
    uri: 'blockhost://schemas/bukkit.json',
    schema: obj({
      settings: obj({ 'allow-end': bool, 'warn-on-overload': bool, 'connection-throttle': int, 'query-plugins': bool, 'shutdown-message': { type: 'string' }, 'minimum-api': { type: 'string' } }),
      'spawn-limits': obj({ monsters: int, animals: int, 'water-animals': int, 'water-ambient': int, 'water-underground-creature': int, axolotls: int, ambient: int }),
      'chunk-gc': obj({ 'period-in-ticks': int }),
      'ticks-per': obj({ 'animal-spawns': int, 'monster-spawns': int, autosave: int })
    })
  },
  {
    fileMatch: ['**/spigot.yml'],
    uri: 'blockhost://schemas/spigot.json',
    schema: obj({
      settings: obj({ debug: bool, 'restart-on-crash': bool, 'restart-script': { type: 'string' }, 'timeout-time': int, 'netty-threads': int, bungeecord: bool, 'save-user-cache-on-stop-only': bool, 'player-shuffle': int }),
      'world-settings': { type: 'object', additionalProperties: obj({ 'view-distance': { anyOf: [int, { enum: ['default'] }] }, 'simulation-distance': { anyOf: [int, { enum: ['default'] }] }, 'mob-spawn-range': int, 'item-despawn-rate': int }) }
    })
  },
  {
    fileMatch: ['**/config/paper-global.yml'],
    uri: 'blockhost://schemas/paper-global.json',
    schema: obj({
      _version: int,
      'chunk-loading-basic': obj({ 'autoconfig-send-distance': bool, 'player-max-chunk-generate-rate': num, 'player-max-chunk-load-rate': num, 'player-max-chunk-send-rate': num }),
      'chunk-system': obj({ 'io-threads': int, 'worker-threads': int, 'gen-parallelism': { type: 'string' } }),
      misc: obj({ 'max-joins-per-tick': int, 'region-file-cache-size': int, 'use-alternative-luck-formula': bool, 'fix-entity-position-desync': bool, 'load-permissions-yml-before-plugins': bool }),
      proxies: obj({ velocity: obj({ enabled: bool, 'online-mode': bool, secret: { type: 'string' } }), 'bungee-cord': obj({ 'online-mode': bool }) }),
      watchdog: obj({ 'early-warning-delay': int, 'early-warning-every': int }),
      'spam-limiter': obj({ 'tab-spam-increment': int, 'tab-spam-limit': int, 'recipe-spam-increment': int, 'recipe-spam-limit': int })
    })
  },
  {
    fileMatch: ['**/purpur.yml'],
    uri: 'blockhost://schemas/purpur.json',
    schema: obj({ version: int, settings: obj({ 'use-alternative-keepalive': bool, 'server-mod-name': { type: 'string' } }) })
  }
]
