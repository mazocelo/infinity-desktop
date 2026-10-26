import { app, ipcMain, Notification, dialog, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import { soDoApp } from './origem'

export function setupIpcHandlers(enderecoDoApp: string): void {
  // --- Native Notifications ---
  ipcMain.handle(
    'show-notification',
    soDoApp(
      enderecoDoApp,
      (_event, title: string, body: string, options?: { silent?: boolean; tag?: string }) => {
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
            win.show()
            win.focus()
            // Notify renderer that this notification was clicked
            win.webContents.send('notification-clicked', options?.tag)
          }
        })
      },
    ),
  )

  // --- File Save Dialog ---
  ipcMain.handle(
    'save-file',
    soDoApp(
      enderecoDoApp,
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
          filters: filters ?? [{ name: 'Todos os arquivos', extensions: ['*'] }],
        })

        if (result.canceled || !result.filePath) return { canceled: true }

        await writeFile(result.filePath, Buffer.from(buffer))
        return { canceled: false, filePath: result.filePath }
      },
    ),
  )

  // --- Confirm Dialog (native OS) ---
  ipcMain.handle(
    'show-confirm-dialog',
    soDoApp(enderecoDoApp, async (_event, title: string, message: string) => {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return false

      const result = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Sim', 'Não'],
        defaultId: 1,
        cancelId: 1,
        title,
        message,
      })
      return result.response === 0
    }),
  )

  // --- Window Title ---
  ipcMain.on(
    'set-title',
    soDoApp(enderecoDoApp, (event, title: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) win.setTitle(title)
    }),
  )

  // --- Bloqueio de captura (#32852) ---
  // O "ver uma vez" do chat liga enquanto o visor está aberto: print e gravação
  // do sistema saem com a janela preta (Windows e macOS).
  ipcMain.on(
    'protecao-de-captura',
    soDoApp(enderecoDoApp, (event, ligada: boolean) => {
      BrowserWindow.fromWebContents(event.sender)?.setContentProtection(ligada === true)
    }),
  )

  // --- App Info ---
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('is-electron', () => true)
}
