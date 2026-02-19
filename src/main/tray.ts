import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let tray: Tray | null = null
let currentCallState: 'idle' | 'ringing' | 'in-call' = 'idle'

function getIconPath(): string {
  // In dev: icon is in project resources folder
  // In prod: electron-builder copies it to process.resourcesPath via extraResources
  return is.dev
    ? join(__dirname, '../../resources/icon.png')
    : join(process.resourcesPath, 'icon.png')
}

export function createTray(mainWindow: BrowserWindow): Tray {
  const icon = nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('Infinity')

  updateTrayMenu(mainWindow)

  tray.on('double-click', () => {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  return tray
}

export function updateTrayMenu(mainWindow: BrowserWindow): void {
  if (!tray) return

  const baseItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Abrir Infinity',
      click: () => {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
      },
    },
    { type: 'separator' },
  ]

  // Dynamic call items based on state
  const callItems: Electron.MenuItemConstructorOptions[] = []

  if (currentCallState === 'ringing') {
    callItems.push(
      {
        label: 'Atender',
        click: () => mainWindow.webContents.send('tray-action', 'answer'),
      },
      {
        label: 'Rejeitar',
        click: () => mainWindow.webContents.send('tray-action', 'reject'),
      },
      { type: 'separator' },
    )
  }

  if (currentCallState === 'in-call') {
    callItems.push(
      {
        label: 'Mute',
        click: () => mainWindow.webContents.send('tray-action', 'mute'),
      },
      {
        label: 'Desligar',
        click: () => mainWindow.webContents.send('tray-action', 'hangup'),
      },
      { type: 'separator' },
    )
  }

  const footerItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Sair',
      click: () => {
        app.quit()
      },
    },
  ]

  const contextMenu = Menu.buildFromTemplate([...baseItems, ...callItems, ...footerItems])
  tray.setContextMenu(contextMenu)
}

export function updateCallState(
  state: 'idle' | 'ringing' | 'in-call',
  mainWindow: BrowserWindow,
): void {
  currentCallState = state
  updateTrayMenu(mainWindow)

  // Update tooltip based on call state
  if (tray) {
    switch (state) {
      case 'ringing':
        tray.setToolTip('Infinity - Chamada entrante')
        break
      case 'in-call':
        tray.setToolTip('Infinity - Em chamada')
        break
      default:
        tray.setToolTip('Infinity')
    }
  }
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
