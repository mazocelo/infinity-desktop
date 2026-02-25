import { app, BrowserWindow, shell, ipcMain, protocol, net, session } from 'electron'
import { join } from 'path'
import { existsSync, statSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { setupIpcHandlers } from './ipc-handlers'
import { createTray, updateCallState, updateBadgeCount, destroyTray } from './tray'
import { setupAutoUpdater } from './updater'
import { setupStartup } from './startup'

// The URL of infinity-frontend's Vite dev server
const DEV_SERVER_URL = 'http://localhost:5173'

// Path to the pre-built infinity-frontend dist (production)
// In packaged app: out/main/ → ../../renderer → <app>/renderer/ (copied by electron-builder)
const RENDERER_DIST = join(__dirname, '../../renderer')

// Custom protocol for production SPA routing.
// Any route (e.g. app:///login) serves index.html so React Router handles it.
const PROTOCOL = 'app'
const PROTOCOL_URL = `${PROTOCOL}://./`

if (!is.dev) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ])
}

function getIconPath(): string {
  return is.dev
    ? join(__dirname, '../../resources/icon.png')
    : join(process.resourcesPath, 'icon.png')
}

let mainWindow: BrowserWindow | null = null
let isQuitting = false
let pendingDeepLink: string | null = null

// Register infinity:// protocol as default handler
if (!is.dev) {
  app.setAsDefaultProtocolClient('infinity')
}

/**
 * Parse infinity:// deep link URLs and send navigation to renderer.
 * Supported formats:
 *   infinity://chat/CONVERSA_ID  → /tela-operacao/chat?id=CONVERSA_ID
 *   infinity://call/NUMBER       → triggers dial:NUMBER via tray-action
 *   infinity://dashboard         → /dashboard
 *   infinity://path/...          → /path/...
 */
function handleDeepLink(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'infinity:') return

    const path = parsed.hostname + parsed.pathname
    let route: string | null = null

    if (path.startsWith('chat/')) {
      const conversaId = path.replace('chat/', '')
      route = `/tela-operacao/chat?id=${conversaId}`
    } else if (path.startsWith('call/')) {
      const number = path.replace('call/', '')
      mainWindow?.webContents.send('tray-action', `dial:${number}`)
      return
    } else if (path === 'dashboard' || path === 'dashboard/') {
      route = '/dashboard'
    } else {
      route = `/${path}`
    }

    if (mainWindow && route) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('deep-link', route)
    } else if (route) {
      // Window not ready yet — store for when it initializes
      pendingDeepLink = route
    }
  } catch {
    // Invalid URL — ignore
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Infinity',
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Show window when ready (avoids white flash)
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()

    // Send pending deep link if app was launched via infinity:// URL
    if (pendingDeepLink && mainWindow) {
      mainWindow.webContents.send('deep-link', pendingDeepLink)
      pendingDeepLink = null
    }
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  // Open external links in the default browser, handle tel: for softphone
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    // tel: links — send to renderer so softphone can handle them
    if (url.startsWith('tel:')) {
      const number = url.replace('tel:', '')
      mainWindow?.webContents.send('tray-action', `dial:${number}`)
    }
    return { action: 'deny' }
  })

  // Dev: load from Vite dev server | Prod: load via custom protocol (SPA routing)
  if (is.dev && DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadURL(`${PROTOCOL_URL}index.html`)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Create system tray
  createTray(mainWindow)

  // Listen for call state updates from renderer
  ipcMain.on('call-state-changed', (_event, state: 'idle' | 'ringing' | 'in-call') => {
    if (mainWindow) {
      updateCallState(state, mainWindow)
    }
  })

  // Listen for badge count updates from renderer
  ipcMain.on('set-badge-count', (_event, count: number) => {
    updateBadgeCount(count)

    // macOS / Linux: native dock badge
    if (process.platform !== 'win32') {
      app.setBadgeCount(count)
    }

    // Windows: flash taskbar when new notifications arrive
    if (mainWindow && count > 0 && !mainWindow.isFocused()) {
      mainWindow.flashFrame(true)
    }
  })
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }

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
    // Register custom protocol for production SPA routing
    if (!is.dev) {
      protocol.handle(PROTOCOL, (request) => {
        const { pathname } = new URL(request.url)
        const filePath = join(RENDERER_DIST, decodeURIComponent(pathname))

        // Serve the actual file if it exists (JS, CSS, images, etc.)
        if (existsSync(filePath) && !statSync(filePath).isDirectory()) {
          return net.fetch(`file://${filePath}`)
        }
        // SPA fallback: serve index.html for any unknown route
        return net.fetch(`file://${join(RENDERER_DIST, 'index.html')}`)
      })
    }

    // Fix CORS for custom app:// protocol — backend doesn't know this origin
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders }
      // Spoof origin so backend CORS accepts the request
      if (details.url.includes('voxcity.com.br')) {
        headers['Origin'] = 'https://infinity.voxcity.com.br'
      }
      callback({ requestHeaders: headers })
    })

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders }
      // Allow credentials + our protocol as origin
      if (details.url.includes('voxcity.com.br')) {
        headers['access-control-allow-origin'] = [PROTOCOL_URL.replace(/\/$/, '')]
        headers['access-control-allow-credentials'] = ['true']
      }
      callback({ responseHeaders: headers })
    })

    // Grant microphone/camera permissions for WebRTC (softphone, video)
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowed = ['media', 'mediaKeySystem', 'notifications', 'clipboard-read']
      callback(allowed.includes(permission))
    })

    setupIpcHandlers()
    setupStartup()
    createWindow()

    // Auto-updater only in production
    if (!is.dev && mainWindow) {
      setupAutoUpdater(mainWindow)
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
