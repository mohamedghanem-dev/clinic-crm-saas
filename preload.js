const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // ── الوظائف الأصلية ──────────────────────────────────
  savePDF:    (htmlContent, defaultFileName) =>
    ipcRenderer.invoke('save-pdf',    { htmlContent, defaultFileName }),
  saveBackup: (backupData, defaultFileName) =>
    ipcRenderer.invoke('save-backup', { backupData, defaultFileName }),
  loadBackup: () =>
    ipcRenderer.invoke('load-backup'),

  // ── License System ────────────────────────────────────
  getHardwareId:   ()           => ipcRenderer.invoke('license:get-hwid'),
  checkLicense:    ()           => ipcRenderer.invoke('license:check'),
  activateLicense: (key)        => ipcRenderer.invoke('license:activate', key),
});
