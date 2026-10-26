import { describe, expect, it } from 'vitest'
import {
  ehDoApp,
  interpretarDeepLink,
  podeAbrirFora,
  podeNavegarNaJanela,
  resolverEnderecoDoApp,
} from './navegacao'

const APP = 'https://infinity.voxcity.com.br'

describe('resolverEnderecoDoApp', () => {
  it('usa o site de produção quando não há override', () => {
    expect(resolverEnderecoDoApp({ dev: false })).toBe(APP)
  })

  it('usa o Vite do front em dev', () => {
    expect(resolverEnderecoDoApp({ dev: true })).toBe('http://localhost:5173')
  })

  it('aceita override https sem a barra final', () => {
    expect(resolverEnderecoDoApp({ dev: false, override: 'https://homolog.voxcity.com.br/' })).toBe(
      'https://homolog.voxcity.com.br',
    )
  })

  it('recusa override http fora de localhost', () => {
    expect(resolverEnderecoDoApp({ dev: false, override: 'http://evil.com' })).toBe(APP)
  })

  it('recusa override que não é URL', () => {
    expect(resolverEnderecoDoApp({ dev: false, override: 'nada' })).toBe(APP)
  })
})

describe('ehDoApp', () => {
  it.each([
    [`${APP}/login`, true],
    [`${APP}`, true],
    ['https://infinity.voxcity.com.br.evil.com/', false],
    ['https://evil.com/?infinity.voxcity.com.br', false],
    ['http://infinity.voxcity.com.br/', false],
    ['file:///tmp/x.html', false],
    ['lixo', false],
  ])('%s → %s', (url, esperado) => {
    expect(ehDoApp(url, APP)).toBe(esperado)
  })
})

describe('podeNavegarNaJanela', () => {
  it.each([
    [`${APP}/tela-operacao/chat`, true],
    ['https://api-gateway.voxcity.com.br/core/auth/entra/callback?code=1', true],
    ['https://login.microsoftonline.com/common/oauth2/v2.0/authorize?x=1', true],
    ['https://login.live.com/oauth20_authorize.srf', true],
    ['https://evil-voxcity.com.br/', false],
    ['https://voxcity.com.br.evil.com/', false],
    ['http://api-gateway.voxcity.com.br/', false],
    ['https://www.google.com/', false],
  ])('%s → %s', (url, esperado) => {
    expect(podeNavegarNaJanela(url, APP)).toBe(esperado)
  })
})

describe('podeAbrirFora', () => {
  it.each([
    ['https://www.google.com/', true],
    ['http://exemplo.com.br/', true],
    ['mailto:a@b.com', true],
    ['file:///C:/Windows/System32/calc.exe', false],
    ['javascript:alert(1)', false],
    ['smb://servidor/pasta', false],
    ['ms-msdt:/id', false],
  ])('%s → %s', (url, esperado) => {
    expect(podeAbrirFora(url)).toBe(esperado)
  })
})

describe('interpretarDeepLink', () => {
  it('chat vira a tela de operação na conversa', () => {
    expect(interpretarDeepLink('infinity://chat/abc-123')).toEqual({
      tipo: 'rota',
      rota: '/tela-operacao/chat?id=abc-123',
    })
  })

  it('call vira discagem só com dígitos e símbolos de discagem', () => {
    expect(interpretarDeepLink('infinity://call/+55 (11) 9999-0000')).toEqual({
      tipo: 'discar',
      numero: '+551199990000',
    })
  })

  it('call sem número é ignorado', () => {
    expect(interpretarDeepLink('infinity://call/abc')).toBeNull()
  })

  it('dashboard vira /dashboard', () => {
    expect(interpretarDeepLink('infinity://dashboard/')).toEqual({ tipo: 'rota', rota: '/dashboard' })
  })

  it('caminho qualquer leva a query junto (#32894)', () => {
    expect(interpretarDeepLink('infinity://usuarios?pendencias=42')).toEqual({
      tipo: 'rota',
      rota: '/usuarios?pendencias=42',
    })
  })

  it('outro esquema é ignorado', () => {
    expect(interpretarDeepLink('https://infinity.voxcity.com.br/x')).toBeNull()
  })

  it('URL inválida é ignorada', () => {
    expect(interpretarDeepLink('infinity://')).toBeNull()
    expect(interpretarDeepLink('lixo')).toBeNull()
  })

  it('a rota nunca sai do app (//host vira caminho)', () => {
    const r = interpretarDeepLink('infinity://x//evil.com')
    expect(r).toEqual({ tipo: 'rota', rota: '/x/evil.com' })
  })
})
