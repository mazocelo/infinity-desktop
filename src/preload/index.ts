import { contextBridge, ipcRenderer } from 'electron'

// Expose protected APIs to the renderer process via window.electronAPI
const electronAPI = {
  // --- Notifications ---
  showNotification: (title: string, body: string, options?: { silent?: boolean }) =>
    ipcRenderer.invoke('show-notification', title, body, options),

  // --- File Downloads ---
  saveFile: (
    buffer: ArrayBuffer,
    defaultName: string,
    filters?: { name: string; extensions: string[] }[],
  ) => ipcRenderer.invoke('save-file', buffer, defaultName, filters),

  // --- Window ---
  setTitle: (title: string) => ipcRenderer.send('set-title', title),

  // --- Call State (renderer → main, updates tray) ---
  setCallState: (state: 'idle' | 'ringing' | 'in-call') =>
    ipcRenderer.send('call-state-changed', state),

  // --- Auto-Start ---
  getAutoStart: () => ipcRenderer.invoke('get-auto-start') as Promise<boolean>,
  setAutoStart: (enabled: boolean) =>
    ipcRenderer.invoke('set-auto-start', enabled) as Promise<boolean>,

  // --- App Info ---
  getAppVersion: () => ipcRenderer.invoke('get-app-version') as Promise<string>,
  isElectron: () => ipcRenderer.invoke('is-electron') as Promise<boolean>,

  // --- IPC Listeners (main → renderer) ---
  onTrayAction: (callback: (action: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on('tray-action', handler)
    return () => ipcRenderer.removeListener('tray-action', handler)
  },

  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string }) =>
      callback(info)
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },

  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string }) =>
      callback(info)
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Type declaration for the renderer
export type ElectronAPI = typeof electronAPI
