import { app, ipcMain } from 'electron'
import { soDoApp } from './origem'

export function setupStartup(enderecoDoApp: string): void {
  // IPC: renderer can toggle auto-start
  ipcMain.handle('get-auto-start', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle(
    'set-auto-start',
    soDoApp(enderecoDoApp, (_event, enabled: boolean) => {
      app.setLoginItemSettings({ openAtLogin: enabled })
      return enabled
    }),
  )
}
