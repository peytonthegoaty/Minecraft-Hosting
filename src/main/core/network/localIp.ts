import os from 'node:os'

const VIRTUAL = /vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker|vbox|utun|tailscale|zerotier|hamachi|loopback|bridge|virbr|br-|veth|Npcap/i

function rank(addr: string): number {
  if (addr.startsWith('192.168.')) return 3
  if (addr.startsWith('10.')) return 2
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(addr)) return 1
  return 0
}

/** The LAN IPv4 address friends on the same network should use, plus any others. */
export function localAddresses(ifaces = os.networkInterfaces()): { primary: string | null; others: { name: string; address: string }[] } {
  const all: { name: string; address: string; virtual: boolean }[] = []
  for (const [name, list] of Object.entries(ifaces)) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal || i.address.startsWith('169.254.')) continue
      all.push({ name, address: i.address, virtual: VIRTUAL.test(name) })
    }
  }
  all.sort((a, b) => Number(a.virtual) - Number(b.virtual) || rank(b.address) - rank(a.address))
  const primary = all[0]?.address ?? null
  return { primary, others: all.slice(1).map(({ name, address }) => ({ name, address })) }
}
