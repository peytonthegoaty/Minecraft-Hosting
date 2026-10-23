import { execFile } from 'node:child_process'

function run(cmd: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 120000 }, (err, stdout) => resolve({ code: err ? 1 : 0, out: String(stdout) }))
  })
}

const ruleName = (port: number) => `Crab Host Minecraft ${port}`

export async function firewallStatus(port: number): Promise<'allowed' | 'missing' | 'n/a'> {
  if (process.platform !== 'win32') return 'n/a'
  const r = await run('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${ruleName(port)}`])
  return r.code === 0 && /Enabled:\s+Yes/i.test(r.out) ? 'allowed' : 'missing'
}

/** Adds an inbound TCP allow rule. Windows asks the user for permission (UAC). */
export async function allowPort(port: number): Promise<void> {
  if (process.platform !== 'win32') return
  const netshArgs = `advfirewall firewall add rule name="${ruleName(port)}" dir=in action=allow protocol=TCP localport=${port} profile=any`
  const ps = `Start-Process -FilePath netsh -ArgumentList '${netshArgs.replace(/'/g, "''")}' -Verb RunAs -WindowStyle Hidden -Wait`
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps])
}
