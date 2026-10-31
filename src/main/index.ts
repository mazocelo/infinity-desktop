import { app, BrowserWindow, ipcMain, Menu, nativeTheme, session, shell } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { is } from '@electron-toolkit/utils'
import { setupIpcHandlers } from './ipc-handlers'
import { createTray, updateCallState, updateBadgeCount, destroyTray } from './tray'
import { setupAutoUpdater } from './updater'
import { setupStartup } from './startup'
import { soDoApp } from './origem'
import {
  ehDoApp,
  interpretarDeepLink,
  linkNoArgv,
  podeEntregarLink,
  podeAbrirFora,
  decidirNavegacao,
  resolverEnderecoDoApp,
} from './navegacao'

// A janela abre o próprio site (decision board "Infinity Desktop no padrão do
// Infinity", 26/10/2026): o desktop anda junto com cada deploy do front e a
// casca fica só com o que é nativo (bandeja, notificação, auto-start, links
// infinity://). INFINITY_DESKTOP_URL aponta para a homolog ou um preview.
const ENDERECO_DO_APP = resolverEnderecoDoApp({
  dev: is.dev,
  override: process.env.INFINITY_DESKTOP_URL,
})

// O fundo da janela enquanto o site carrega: o vm-bg-primary do Vox Midnight.
const FUNDO_VOX_MIDNIGHT = '#080c16'

// Hostnames whose window.open popups must open as an in-app child window
// (preserving window.opener + postMessage) instead of being shunted to the
// system browser. Used by Meta Embedded Signup (WhatsApp Oficial) FB.login().
// STRICT allowlist — do not add arbitrary hosts.
const OAUTH_POPUP_HOSTS = ['facebook.com', 'www.facebook.com']

// Permissões que o site pede: microfone/câmera do softphone e do vídeo,
// notificação, e copiar ata/transcrição.
const PERMISSOES_DO_APP = [
  'media',
  'mediaKeySystem',
  'notifications',
  'clipboard-read',
  'clipboard-sanitized-write',
  'fullscreen',
]

function getIconPath(): string {
  return is.dev
    ? join(__dirname, '../../resources/icon.png')
    : join(process.resourcesPath, 'icon.png')
}

let mainWindow: BrowserWindow | null = null
let isQuitting = false
let pendingDeepLink: string | null = null
// Quadro principal com o front carregado (did-finish-load depois da última
// navegação dele). Iframe carregando não conta.
let frontCarregado = false

// Register infinity:// protocol as default handler
if (!is.dev) {
  app.setAsDefaultProtocolClient('infinity')
}

function mostrarJanela(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function handleDeepLink(url: string): void {
  const link = interpretarDeepLink(url)
  if (!link) return

  if (link.tipo === 'discar') {
    mainWindow?.webContents.send('tray-action', `dial:${link.numero}`)
    return
  }
  mostrarJanela()
  // Só entrega a uma tela do site já carregada: durante o carregamento (ou na
  // página "sem conexão") o front ainda não ouve o canal e o link se perderia.
  // Fica pendente e sai no did-finish-load.
  pendingDeepLink = link.rota
  entregarLinkPendente()
}

function entregarLinkPendente(): void {
  if (!pendingDeepLink || !mainWindow) return
  const urlAtual = mainWindow.webContents.getURL()
  if (!podeEntregarLink({ frontCarregado, urlAtual, enderecoDoApp: ENDERECO_DO_APP })) return
  mainWindow.webContents.send('deep-link', pendingDeepLink)
  pendingDeepLink = null
}

function abrirFora(url: string): void {
  if (podeAbrirFora(url)) shell.openExternal(url)
}

// Sem rede o site não carrega: a casca mostra a própria página "sem conexão",
// que volta para o site sozinha quando a rede volta.
const PAGINA_SEM_CONEXAO = join(__dirname, '../renderer/index.html')
const URL_SEM_CONEXAO = pathToFileURL(PAGINA_SEM_CONEXAO).href

function mostrarSemConexao(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.loadFile(PAGINA_SEM_CONEXAO, { query: { volta: ENDERECO_DO_APP } }).catch(() => {})
}

// A janela saiu do site para o login da Microsoft e ainda não voltou
// (decidirNavegacao, navegacao.ts).
let emLogin = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Infinity',
    icon: getIconPath(),
    backgroundColor: FUNDO_VOX_MIDNIGHT,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Show window when ready (avoids white flash)
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // O link que abriu o app (ou chegou enquanto o site carregava) sai quando o
  // front já rodou: no ready-to-show os scripts de módulo podem não ter
  // registrado o onDeepLink ainda.
  mainWindow.webContents.on('did-start-navigation', (event) => {
    if (event.isMainFrame && !event.isSameDocument) frontCarregado = false
  })
  mainWindow.webContents.on('did-finish-load', () => {
    frontCarregado = true
    entregarLinkPendente()
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // OAuth popups that must stay INSIDE Electron as a child window so that
    // window.opener is preserved and the provider's postMessage reaches the
    // renderer. Meta Embedded Signup (WhatsApp Oficial) FB.login() relies on this.
    // Keep this allowlist STRICT — never allow arbitrary https, or external
    // links would stop going to the system browser.
    let host = ''
    try {
      host = new URL(url).hostname
    } catch {
      // Invalid URL — fall through to the default handling below.
    }
    if (OAUTH_POPUP_HOSTS.includes(host)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 600,
          height: 750,
          autoHideMenuBar: true,
          backgroundColor: FUNDO_VOX_MIDNIGHT,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      }
    }

    // tel: links — send to renderer so softphone can handle them
    if (url.startsWith('tel:')) {
      const link = interpretarDeepLink(`infinity://call/${url.slice(4)}`)
      if (link?.tipo === 'discar') mainWindow?.webContents.send('tray-action', `dial:${link.numero}`)
      return { action: 'deny' }
    }

    abrirFora(url)
    return { action: 'deny' }
  })

  // A janela só navega pelo site, pela API e pelo login da Microsoft; qualquer
  // outro destino vai para o navegador do sistema. Só o quadro principal: o
  // will-redirect também dispara em iframe (mapa, telas de outros sistemas) e
  // conter ali deixaria o iframe em branco e abriria o navegador sozinho.
  const conterNavegacao = (
    event: Electron.Event<Electron.WebContentsWillNavigateEventParams>,
  ): void => {
    if (!event.isMainFrame || event.url.startsWith(URL_SEM_CONEXAO)) return
    const decisao = decidirNavegacao(event.url, ENDERECO_DO_APP, emLogin)
    emLogin = decisao.emLogin
    if (decisao.permitir) return
    event.preventDefault()
    abrirFora(event.url)
  }
  mainWindow.webContents.on('will-navigate', conterNavegacao)
  mainWindow.webContents.on('will-redirect', conterNavegacao)

  mainWindow.webContents.on('did-fail-load', (_event, codigo, _descricao, url, quadroPrincipal) => {
    // -3 = ERR_ABORTED: navegação trocada por outra, não é falta de rede.
    if (!quadroPrincipal || codigo === -3) return
    if (!ehDoApp(url, ENDERECO_DO_APP) && !emLogin) return
    emLogin = false
    mostrarSemConexao()
  })

  // Falha de rede vira a página "sem conexão" pelo did-fail-load.
  mainWindow.loadURL(ENDERECO_DO_APP).catch(() => {})
  if (is.dev) mainWindow.webContents.openDevTools()

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Create system tray
  createTray(mainWindow)
}

// Registrado uma vez: no macOS a janela renasce pelo dock e o listener dobraria.
function registrarIpcDaJanela(): void {
  // Listen for call state updates from renderer
  ipcMain.on(
    'call-state-changed',
    soDoApp(ENDERECO_DO_APP, (_event, state: 'idle' | 'ringing' | 'in-call') => {
      if (mainWindow) {
        updateCallState(state, mainWindow)
      }
    }),
  )

  // Listen for badge count updates from renderer
  ipcMain.on(
    'set-badge-count',
    soDoApp(ENDERECO_DO_APP, (_event, count: number) => {
      updateBadgeCount(count)

      // macOS / Linux: native dock badge
      if (process.platform !== 'win32') {
        app.setBadgeCount(count)
      }

      // Windows: flash taskbar when new notifications arrive
      if (mainWindow && count > 0 && !mainWindow.isFocused()) {
        mainWindow.flashFrame(true)
      }
    }),
  )
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    mostrarJanela()

    // Windows/Linux: deep link URL comes as last argv argument
    const deepLinkUrl = argv.find((arg) => arg.startsWith('infinity://'))
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl)
    }
  })

  // macOS: deep link via open-url event
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleDeepLink(url)
  })

  app.whenReady().then(() => {
    // Barra de título escura no Windows 10/11 e no macOS, como o Vox Midnight.
    nativeTheme.themeSource = 'dark'

    // Sem o menu nativo em inglês (File/Edit/View) no Windows e no Linux. No
    // macOS o menu de Editar é o que liga Cmd+C/Cmd+V, então fica o mínimo.
    Menu.setApplicationMenu(
      process.platform === 'darwin'
        ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
        : null,
    )

    // Microfone, câmera e notificação só para o site do app; popup do Facebook
    // e qualquer outra origem levam não.
    session.defaultSession.setPermissionRequestHandler((_webContents, permissao, callback, detalhes) => {
      callback(PERMISSOES_DO_APP.includes(permissao) && ehDoApp(detalhes.requestingUrl, ENDERECO_DO_APP))
    })

    // Windows/Linux: o link que ABRIU o app (estava fechado) chega no argv
    // desta instância, não no second-instance. Ex.: a volta do login Google
    // pelo navegador do sistema (#34766) com o app fechado.
    const linkDaPartida = linkNoArgv(process.argv)
    if (linkDaPartida) handleDeepLink(linkDaPartida)

    setupIpcHandlers(ENDERECO_DO_APP)
    setupStartup(ENDERECO_DO_APP)
    registrarIpcDaJanela()
    createWindow()

    // Auto-updater only in production
    if (!is.dev && mainWindow) {
      setupAutoUpdater(mainWindow, ENDERECO_DO_APP, () => {
        isQuitting = true
      })
    }

    app.on('activate', () => {
      // macOS: re-create window when dock icon clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('before-quit', () => {
  isQuitting = true
  destroyTray()
})

app.on('window-all-closed', () => {
  // On macOS, apps stay active until Cmd+Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export { mainWindow }
