import { describe, expect, it } from 'vitest'
import { adoptiumArch, adoptiumOs, majorFromVersion, parseJavaProperties, parseRegValues } from '../src/main/core/java/parse'

const JAVA21 = `Property settings:
    file.encoding = UTF-8
    java.home = C:\\Program Files\\Eclipse Adoptium\\jre-21.0.5.11-hotspot
    java.vendor = Eclipse Adoptium
    java.version = 21.0.5
    os.arch = amd64

openjdk version "21.0.5" 2024-10-15 LTS`

const JAVA8 = `Property settings:
    java.home = C:\\Program Files\\Java\\jre1.8.0_421
    java.vendor = Oracle Corporation
    java.version = 1.8.0_421
    os.arch = amd64
java version "1.8.0_421"`

describe('java parsing', () => {
  it('reads version, vendor and home', () => {
    const p = parseJavaProperties(JAVA21)!
    expect(p.version).toBe('21.0.5')
    expect(p.vendor).toBe('Eclipse Adoptium')
    expect(p.home).toContain('jre-21')
    expect(majorFromVersion(p.version)).toBe(21)
  })
  it('handles Java 8 version strings', () => {
    expect(majorFromVersion(parseJavaProperties(JAVA8)!.version)).toBe(8)
    expect(majorFromVersion('17')).toBe(17)
    expect(majorFromVersion('25-ea')).toBe(25)
  })
  it('falls back to the version banner', () => {
    expect(parseJavaProperties('openjdk version "17.0.9" 2023-10-17\nOpenJDK 64-Bit Server VM')?.version).toBe('17.0.9')
    expect(parseJavaProperties('garbage')).toBeNull()
  })
  it('parses reg query output', () => {
    const out = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\Eclipse Adoptium\\JRE\\21.0.5.11\\hotspot\\MSI
    Path    REG_SZ    C:\\Program Files\\Eclipse Adoptium\\jre-21.0.5.11-hotspot\\

End of search: 1 match(es) found.`
    expect(parseRegValues(out)).toEqual(['C:\\Program Files\\Eclipse Adoptium\\jre-21.0.5.11-hotspot\\'])
  })
  it('maps platform names to Adoptium names', () => {
    expect(adoptiumOs('win32')).toBe('windows')
    expect(adoptiumOs('darwin')).toBe('mac')
    expect(adoptiumArch('arm64')).toBe('aarch64')
    expect(adoptiumArch('x64')).toBe('x64')
  })
})
