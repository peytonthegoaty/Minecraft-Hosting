import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { META_FILES, parseAddonMeta } from '../src/main/core/plugins/metadata'
import { readZipEntries } from '../src/main/util/zip'
import { makeJar, tmpDir } from './helpers'

async function meta(entries: Record<string, string>, name = 'x.jar') {
  const dir = await tmpDir()
  const jar = path.join(dir, name)
  await makeJar(jar, entries)
  return parseAddonMeta(await readZipEntries(jar, META_FILES), name)
}

describe('addon metadata', () => {
  it('reads plugin.yml', async () => {
    const m = await meta({ 'plugin.yml': 'name: EssentialsX\nversion: 2.21.0\nauthors: [md_5, zml]\ndescription: Core commands\ndepend: [Vault]\n' })
    expect(m).toEqual({ name: 'EssentialsX', version: '2.21.0', authors: ['md_5', 'zml'], description: 'Core commands', depends: ['Vault'] })
  })
  it('prefers paper-plugin.yml and its dependency format', async () => {
    const m = await meta({
      'paper-plugin.yml': 'name: Fancy\nversion: 1.0\nauthor: me\ndependencies:\n  server:\n    LuckPerms:\n      load: BEFORE\n      required: true\n    Optional:\n      required: false\n',
      'plugin.yml': 'name: Old'
    })
    expect(m.name).toBe('Fancy')
    expect(m.depends).toEqual(['LuckPerms'])
  })
  it('reads fabric.mod.json', async () => {
    const m = await meta({
      'fabric.mod.json': JSON.stringify({ id: 'lithium', name: 'Lithium', version: '0.14.3', authors: ['jellysquid3', { name: 'Someone' }], depends: { fabricloader: '>=0.15', minecraft: '1.21.x', 'fabric-api': '*' } })
    })
    expect(m).toMatchObject({ name: 'Lithium', version: '0.14.3', authors: ['jellysquid3', 'Someone'], depends: ['fabric-api'] })
  })
  it('reads neoforge.mods.toml and resolves ${file.jarVersion}', async () => {
    const toml = `modLoader="javafml"
loaderVersion="[4,)"
[[mods]]
modId="create"
version="\${file.jarVersion}"
displayName="Create"
authors="simibubi, Others"
description='''
Building tools'''
[[dependencies.create]]
modId="neoforge"
type="required"
[[dependencies.create]]
modId="flywheel"
type="required"
[[dependencies.create]]
modId="jei"
type="optional"
`
    const m = await meta({ 'META-INF/neoforge.mods.toml': toml, 'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\nImplementation-Version: 6.0.1\n' })
    expect(m).toMatchObject({ name: 'Create', version: '6.0.1', authors: ['simibubi', 'Others'], description: 'Building tools', depends: ['flywheel'] })
  })
  it('falls back to the file name', async () => {
    const m = await meta({ 'README.txt': 'hi' }, 'MysteryMod-1.2.jar.disabled')
    expect(m.name).toBe('MysteryMod-1.2')
  })
})
