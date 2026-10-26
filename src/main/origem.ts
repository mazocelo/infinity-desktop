import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { ehDoApp } from './navegacao'

// A ponte electronAPI só atende o site do app. Com o site carregado da rede,
// é aqui (e não no preload) que um popup ou uma página de fora deixa de poder
// mandar notificação, gravar arquivo ou mexer no auto-start.
export function soDoApp<E extends IpcMainEvent | IpcMainInvokeEvent, A extends unknown[], R>(
  enderecoDoApp: string,
  handler: (event: E, ...args: A) => R,
): (event: E, ...args: A) => R | undefined {
  return (event, ...args) => {
    const url = event.senderFrame?.url ?? ''
    if (!ehDoApp(url, enderecoDoApp)) {
      console.warn('[ipc] chamada recusada de fora do app:', url.slice(0, 120))
      return undefined
    }
    return handler(event, ...args)
  }
}
