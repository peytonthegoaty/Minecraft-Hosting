import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveInside, slugify } from '../src/main/util/fsx'
import { createZip, extractZip, listZipTopLevel, readZipEntries } from '../src/main/util/zip'
import { makeJar, tmpDir } from './helpers'

describe('resolveInside', () => {
  it('keeps paths inside the root', () => {
    const root = path.resolve('/srv/mc')
    expect(resolveInside(root, 'plugins/a.jar')).toBe(path.join(root, 'plugins', 'a.jar'))
    expect(resolveInside(root, '/server.properties')).toBe(path.join(root, 'server.properties'))
    expect(resolveInside(root, '')).toBe(root)
  })
  it('refuses escapes', () => {
    expect(() => resolveInside('/srv/mc', '../etc/passwd')).toThrow()
    expect(() => resolveInside('/srv/mc', 'world/../../x')).toThrow()
  })
  it('slugifies names', () => {
    expect(slugify('Survival SMP!')).toBe('survival-smp')
    expect(slugify('***')).toBe('server')
  })
})

describe('zip helpers', () => {
  it('round-trips folders and strips a top directory', async () => {
    const dir = await tmpDir()
    await fs.mkdir(path.join(dir, 'src/world/region'), { recursive: true })
    await fs.writeFile(path.join(dir, 'src/world/level.dat'), 'level')
    await fs.writeFile(path.join(dir, 'src/world/region/r.0.0.mca'), 'region')
    await fs.writeFile(path.join(dir, 'src/server.properties'), 'motd=x')
    await fs.writeFile(path.join(dir, 'src/skip.lock'), 'x')
    const zip = path.join(dir, 'out.zip')
    await createZip(path.join(dir, 'src'), [path.join(dir, 'src/world'), path.join(dir, 'src/server.properties'), path.join(dir, 'src/skip.lock')], zip, (rel) => rel.endsWith('.lock'))
    expect((await listZipTopLevel(zip)).sort()).toEqual(['server.properties', 'world'])
    await extractZip(zip, path.join(dir, 'restored'))
    expect(await fs.readFile(path.join(dir, 'restored/world/region/r.0.0.mca'), 'utf8')).toBe('region')

    const jdk = path.join(dir, 'jdk.zip')
    await makeJar(jdk, { 'jdk-21.0.5+11-jre/bin/java': '#!/bin/sh', 'jdk-21.0.5+11-jre/release': 'JAVA_VERSION="21"' })
    await extractZip(jdk, path.join(dir, 'java-21'), { stripTopDir: true })
    expect(await fs.readFile(path.join(dir, 'java-21/release'), 'utf8')).toContain('21')
  })
  it('reads selected entries', async () => {
    const dir = await tmpDir()
    const jar = path.join(dir, 'p.jar')
    await makeJar(jar, { 'plugin.yml': 'name: X', 'a/b.class': 'zz' })
    const e = await readZipEntries(jar, ['plugin.yml', 'fabric.mod.json'])
    expect(e.get('plugin.yml')?.toString()).toBe('name: X')
    expect(e.has('fabric.mod.json')).toBe(false)
  })
})
