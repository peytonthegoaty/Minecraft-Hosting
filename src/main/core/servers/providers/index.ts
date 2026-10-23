import type { ServerType } from '@shared/types'
import { fabric } from './fabric'
import { forge, neoforge } from './forge'
import { vanilla } from './mojang'
import { paper, purpur } from './paper'
import type { Provider } from './types'

const providers: Record<ServerType, Provider> = { paper, purpur, vanilla, fabric, forge, neoforge }

export function getProvider(type: ServerType): Provider {
  return providers[type]
}

export { javaForMinecraft } from './mojang'
export type { InstallContext, Provider } from './types'
