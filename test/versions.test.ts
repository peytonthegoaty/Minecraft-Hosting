import { describe, expect, it } from 'vitest'
import { acceptableJava, compareMcVersions, fallbackJavaFor, formatBytes, installableJava, isJavaAcceptable, suggestMemoryMb } from '@shared/versions'

describe('Minecraft → Java mapping', () => {
  it.each([
    ['1.8.9', 8],
    ['1.12.2', 8],
    ['1.16.5', 8],
    ['1.17.1', 16],
    ['1.18.2', 17],
    ['1.20.4', 17],
    ['1.20.5', 21],
    ['1.21.4', 21],
    ['26.1', 25],
    ['24w14a', 21]
  ])('%s needs Java %i', (mc, java) => {
    expect(fallbackJavaFor(mc)).toBe(java)
  })

  it('installs 17 when 16 is required', () => {
    expect(installableJava(16)).toBe(17)
    expect(installableJava(21)).toBe(21)
  })

  it('accepts compatible newer Java but never newer than 8 for old versions', () => {
    expect(acceptableJava(8)).toEqual([8, 8])
    expect(isJavaAcceptable(17, 21)).toBe(true)
    expect(isJavaAcceptable(16, 17)).toBe(true)
    expect(isJavaAcceptable(21, 17)).toBe(false)
    expect(isJavaAcceptable(21, 25)).toBe(true)
    expect(isJavaAcceptable(8, 17)).toBe(false)
  })
})

describe('helpers', () => {
  it('compares versions numerically', () => {
    expect(compareMcVersions('1.21.10', '1.21.9')).toBeGreaterThan(0)
    expect(compareMcVersions('1.21', '1.21.0')).toBe(0)
    expect(compareMcVersions('26.1', '1.21.4')).toBeGreaterThan(0)
  })
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(6 * 1024 ** 3)).toBe('6.0 GB')
  })
  it('suggests sensible memory', () => {
    expect(suggestMemoryMb(16 * 1024 ** 3, 'paper')).toBe(4096)
    expect(suggestMemoryMb(16 * 1024 ** 3, 'neoforge')).toBe(6144)
    expect(suggestMemoryMb(4 * 1024 ** 3, 'paper')).toBe(2048)
  })
})
