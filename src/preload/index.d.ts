import type { Bridge } from '@shared/api'

declare global {
  interface Window {
    crabhost?: Bridge
    platform?: string
  }
}
