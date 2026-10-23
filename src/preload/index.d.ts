import type { Bridge } from '@shared/api'

declare global {
  interface Window {
    blockhost?: Bridge
    platform?: string
  }
}
