// Regras puras de navegação da casca: que endereço a janela abre, para onde
// ela pode ir, o que vai para o navegador do sistema e como um link
// infinity:// vira rota do front. Sem import do Electron para ser testável.

const SITE_DE_PRODUCAO = 'https://infinity.voxcity.com.br'
const VITE_DO_FRONT = 'http://localhost:5173'

// Hosts que a janela atravessa no login pela Microsoft (#26546): o front leva
// a janela inteira ao authorize_url e o core devolve ao site. Sufixo cobre os
// subdomínios (device., passwordreset., autologon.).
const DOMINIOS_DE_LOGIN = ['microsoftonline.com', 'login.windows.net', 'login.live.com', 'account.live.com', 'login.microsoft.com', 'mysignins.microsoft.com']

// A API devolve o retorno do login para o site.
const HOSTS_DA_API = ['api-gateway.voxcity.com.br']

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * O endereço que a janela carrega. `override` (INFINITY_DESKTOP_URL) serve para
 * apontar a casca para a homolog ou um preview; só https, ou http em localhost.
 */
export function resolverEnderecoDoApp(opcoes: { dev: boolean; override?: string }): string {
  const padrao = opcoes.dev ? VITE_DO_FRONT : SITE_DE_PRODUCAO
  if (!opcoes.override) return padrao
  const url = parse(opcoes.override)
  if (!url) return padrao
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return padrao
  return url.origin
}

/** A URL é do próprio site carregado na janela (mesma origem). */
export function ehDoApp(url: string, enderecoDoApp: string): boolean {
  const u = parse(url)
  return !!u && u.origin === new URL(enderecoDoApp).origin
}

function ehLoginExterno(host: string): boolean {
  return DOMINIOS_DE_LOGIN.some((d) => host === d || host.endsWith(`.${d}`))
}

/**
 * Se a janela principal pode ir até a URL. `emLogin` diz que a janela saiu do
 * site para o login da Microsoft: até voltar ao site, qualquer https passa,
 * porque a empresa pode federar o login num servidor dela (ADFS) com domínio
 * que não dá para listar. A ponte electronAPI continua recusando fora do site.
 */
export function decidirNavegacao(
  url: string,
  enderecoDoApp: string,
  emLogin: boolean,
): { permitir: boolean; emLogin: boolean } {
  if (ehDoApp(url, enderecoDoApp)) return { permitir: true, emLogin: false }
  const u = parse(url)
  if (!u || u.protocol !== 'https:') return { permitir: false, emLogin }
  if (ehLoginExterno(u.hostname)) return { permitir: true, emLogin: true }
  if (HOSTS_DA_API.includes(u.hostname)) return { permitir: true, emLogin }
  return { permitir: emLogin, emLogin }
}

/** Só web e e-mail vão para o sistema; file:, smb:, protocolos de app não. */
export function podeAbrirFora(url: string): boolean {
  const u = parse(url)
  return !!u && ['http:', 'https:', 'mailto:'].includes(u.protocol)
}

export type DeepLink = { tipo: 'rota'; rota: string } | { tipo: 'discar'; numero: string }

/**
 * Formatos aceitos:
 *   infinity://chat/CONVERSA_ID  → /tela-operacao/chat?id=CONVERSA_ID
 *   infinity://call/NUMERO       → discagem no softphone
 *   infinity://dashboard         → /dashboard
 *   infinity://caminho/...?q     → /caminho/...?q (a query vai junto, #32894:
 *                                  os avisos do sino levam a /usuarios?pendencias=<id>)
 */
export function interpretarDeepLink(url: string): DeepLink | null {
  const u = parse(url)
  if (!u || u.protocol !== 'infinity:') return null

  // Barras repetidas viram uma: a rota nunca pode virar //host (fora do app).
  const caminho = (u.hostname + u.pathname).replace(/\/{2,}/g, '/').replace(/^\//, '')
  if (!caminho) return null

  if (caminho.startsWith('chat/')) {
    return { tipo: 'rota', rota: `/tela-operacao/chat?id=${encodeURIComponent(caminho.slice(5))}` }
  }
  if (caminho.startsWith('call/')) {
    const numero = decodeURIComponent(caminho.slice(5)).replace(/[^0-9+*#]/g, '')
    return numero ? { tipo: 'discar', numero } : null
  }
  if (caminho === 'dashboard' || caminho === 'dashboard/') return { tipo: 'rota', rota: '/dashboard' }
  return { tipo: 'rota', rota: `/${caminho}${u.search}` }
}
