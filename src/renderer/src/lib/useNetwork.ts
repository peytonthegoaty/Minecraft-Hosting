import { useEffect, useState } from 'react'
import type { NetworkStatus } from '@shared/types'
import { api, on } from '../api'

/** Live network status for a server (refreshes public IP / firewall once on mount). */
export function useNetwork(id: string): [NetworkStatus | null, (s: NetworkStatus) => void] {
  const [status, setStatus] = useState<NetworkStatus | null>(null)
  useEffect(() => {
    let alive = true
    void api.getNetwork(id).then((s) => alive && setStatus(s))
    void api.refreshNetwork(id).then((s) => alive && setStatus(s)).catch(() => undefined)
    const off = on('network', (s) => {
      if (s.serverId === id) setStatus(s)
    })
    return () => {
      alive = false
      off()
    }
  }, [id])
  return [status, setStatus]
}
