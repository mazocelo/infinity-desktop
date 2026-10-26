import type { IpcMainEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { soDoApp } from './origem'

const APP = 'https://infinity.voxcity.com.br'

const evento = (url: string | null) =>
  ({ senderFrame: url === null ? null : { url } }) as unknown as IpcMainEvent

describe('soDoApp', () => {
  it('atende o site do app', () => {
    const handler = vi.fn((_event: IpcMainEvent, _n: number) => 'ok')
    expect(soDoApp(APP, handler)(evento(`${APP}/tela-operacao`), 1)).toBe('ok')
    expect(handler).toHaveBeenCalledWith(expect.anything(), 1)
  })

  it.each([
    ['outra origem', 'https://www.facebook.com/dialog/oauth'],
    ['subdomínio da Vox', 'https://bucket.voxcity.com.br/x.html'],
    ['página local', 'file:///app/out/renderer/index.html'],
    ['frame destruído', null],
  ])('recusa %s', (_caso, url) => {
    const handler = vi.fn()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(soDoApp(APP, handler)(evento(url))).toBeUndefined()
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('todo canal de IPC que age passa pelo soDoApp', () => {
  // Leitura sem efeito: pode responder a qualquer página da janela.
  const SO_LEITURA = ['get-app-version', 'is-electron', 'get-auto-start']

  it('nenhum canal novo nasce sem a guarda', async () => {
    const { readFileSync, readdirSync } = await import('fs')
    const { join } = await import('path')
    const pasta = join(__dirname)
    const canais: { canal: string; guardado: boolean }[] = []
    for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const fonte = readFileSync(join(pasta, arquivo), 'utf8')
      for (const m of fonte.matchAll(/ipcMain\.(?:on|handle)\(\s*'([^']+)',\s*(soDoApp)?/g)) {
        canais.push({ canal: m[1], guardado: m[2] === 'soDoApp' })
      }
    }
    expect(canais.length).toBeGreaterThan(8)
    const soltos = canais.filter((c) => !c.guardado && !SO_LEITURA.includes(c.canal)).map((c) => c.canal)
    expect(soltos).toEqual([])
  })
})
