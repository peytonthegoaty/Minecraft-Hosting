// Understands Minecraft server console output: log levels, chat, joins/leaves, startup and TPS replies.
import type { LogLevel } from '@shared/types'

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g
const MC_COLOR = /§[0-9a-fk-orx]/gi

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '').replace(/\r/g, '')
}

export interface ParsedLine {
  level: LogLevel
  message: string
}

const LEVEL_RE = /^((?:\[[^\]]*\]\s*)*?)\[(?:[^\]]*?[\s/])?(INFO|WARN|WARNING|ERROR|SEVERE|FATAL|DEBUG)\]/

function toLevel(lvl: string): LogLevel {
  if (lvl === 'WARN' || lvl === 'WARNING') return 'WARN'
  if (lvl === 'ERROR' || lvl === 'SEVERE' || lvl === 'FATAL') return 'ERROR'
  return 'INFO'
}

/**
 * Pulls the level and message out of Paper ("[14:02:11 INFO]: msg"), Vanilla/Fabric
 * ("[14:02:11] [Server thread/INFO]: msg") and Forge ("... [Server thread/INFO] [minecraft/DedicatedServer]: msg").
 */
export function parseLine(line: string): ParsedLine {
  const clean = stripAnsi(line)
  const m = clean.match(LEVEL_RE)
  if (m) {
    const rest = clean.slice(m[0].length)
    // Skip logger-name brackets that come before the colon.
    const msg = rest.match(/^(?:\s*\[[^\]]*\])*\s*(?:\([^)]*\))?\s*:\s?(.*)$/s)
    const message = msg ? msg[1] : rest.trim()
    let level = toLevel(m[2])
    if (level === 'INFO' && /^(?:\[Not Secure\] )?<[^>]{1,32}> /.test(message)) level = 'CHAT'
    return { level, message }
  }
  if (/^\s+at |^\S*(Exception|Error)\b|^Caused by:/.test(clean)) return { level: 'ERROR', message: clean }
  return { level: 'INFO', message: clean }
}

export function isStartupDone(message: string): boolean {
  return /^Done \([\d.,]+s\)!/.test(message) || /Done \([\d.,]+s\)! For help/.test(message)
}

export function playerJoined(message: string): string | null {
  const m = message.match(/^(\.?[A-Za-z0-9_]{1,16})(?: \(formerly known as [^)]+\))? joined the game$/)
  return m ? m[1] : null
}

export function playerLeft(message: string): string | null {
  const m = message.match(/^(\.?[A-Za-z0-9_]{1,16}) left the game$/)
  return m ? m[1] : null
}

export interface PlayerList {
  online: number
  max: number
  names: string[]
}

export function parseList(text: string): PlayerList | null {
  const t = text.replace(MC_COLOR, '')
  const m = t.match(/There are (\d+)(?: of a max(?: of)? |\/)(\d+) players online:?\s*(.*)/s)
  if (!m) return null
  const names = m[3]
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return { online: parseInt(m[1], 10), max: parseInt(m[2], 10), names }
}

/** Parses replies to `tps` (Paper/Purpur), `forge tps` / `neoforge tps` and `tick query` (vanilla 1.20.3+). */
export function parseTps(text: string): { tps?: number; mspt?: number } | null {
  const t = text.replace(MC_COLOR, '')
  const paper = t.match(/TPS from last [^:]*:\s*\*?([\d.]+)/)
  if (paper) return { tps: Math.min(20, parseFloat(paper[1])) }
  const forge = t.match(/Overall\s*:\s*Mean tick time:\s*([\d.]+)\s*ms\.?\s*Mean TPS:\s*([\d.]+)/i)
  if (forge) return { mspt: parseFloat(forge[1]), tps: Math.min(20, parseFloat(forge[2])) }
  const vanilla = t.match(/Average time per tick:\s*([\d.]+)\s*ms/i)
  if (vanilla) {
    const mspt = parseFloat(vanilla[1])
    return { mspt, tps: Math.min(20, mspt > 0 ? 1000 / Math.max(mspt, 50) : 20) }
  }
  return null
}

export function tpsCommand(type: string): string {
  if (type === 'paper' || type === 'purpur') return 'tps'
  if (type === 'forge') return 'forge tps'
  if (type === 'neoforge') return 'neoforge tps'
  return 'tick query'
}
