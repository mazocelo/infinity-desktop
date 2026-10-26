import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { BrowserWindow, ipcMain } from 'electron'
import { soDoApp } from './origem'

export function setupAutoUpdater(
  mainWindow: BrowserWindow,
  enderecoDoApp: string,
  marcarSaida: () => void,
): void {
  // Don't check for updates in dev mode
  if (!mainWindow) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-available', { version: info.version })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('update-downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message)
  })

  // "Reiniciar agora" do aviso de atualização: fechar a janela só a esconde na
  // bandeja, então a instalação precisa sair daqui, com a saída já liberada.
  ipcMain.on(
    'instalar-atualizacao',
    soDoApp(enderecoDoApp, () => {
      marcarSaida()
      autoUpdater.quitAndInstall()
    }),
  )

  // Check for updates after 10 seconds, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}
