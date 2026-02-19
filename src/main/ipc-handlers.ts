import { app, ipcMain, Notification, dialog, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'

export function setupIpcHandlers(): void {
  // --- Native Notifications ---
  ipcMain.handle(
    'show-notification',
    (_event, title: string, body: string, options?: { silent?: boolean }) => {
      const notification = new Notification({
        title,
        body,
        silent: options?.silent ?? false,
        icon: undefined, // Uses app icon by default
      })
      notification.show()

      notification.on('click', () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          if (win.isMinimized()) win.restore()
          win.focus()
        }
      })
    },
  )

  // --- File Save Dialog ---
  ipcMain.handle(
    'save-file',
    async (
      _event,
      buffer: ArrayBuffer,
      defaultName: string,
      filters?: { name: string; extensions: string[] }[],
    ) => {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { canceled: true }

      const result = await dialog.showSaveDialog(win, {
        defaultPath: defaultName,
        filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
      })

      if (result.canceled || !result.filePath) return { canceled: true }

      await writeFile(result.filePath, Buffer.from(buffer))
      return { canceled: false, filePath: result.filePath }
    },
  )

  // --- Window Title ---
  ipcMain.on('set-title', (event, title: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.setTitle(title)
  })

  // --- App Info ---
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('is-electron', () => true)
}
