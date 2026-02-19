import { app, ipcMain } from 'electron'

export function setupStartup(): void {
  // IPC: renderer can toggle auto-start
  ipcMain.handle('get-auto-start', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle('set-auto-start', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return enabled
  })
}
