const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // ── License ──────────────────────────────────────────────────────────
  getHardwareId:   ()      => ipcRenderer.invoke('license:get-hwid'),
  checkLicense:    ()      => ipcRenderer.invoke('license:check'),
  activateLicense: (key)   => ipcRenderer.invoke('license:activate', key),

  // ── Backup ───────────────────────────────────────────────────────────
  saveBackup: (backupData, defaultFileName) =>
    ipcRenderer.invoke('save-backup', { backupData, defaultFileName }),
  loadBackup: () =>
    ipcRenderer.invoke('load-backup'),

  // ── Export ───────────────────────────────────────────────────────────
  savePDF:  (htmlContent, defaultFileName) =>
    ipcRenderer.invoke('save-pdf',  { htmlContent, defaultFileName }),
  saveCSV:  (csvContent,  defaultFileName) =>
    ipcRenderer.invoke('save-csv',  { csvContent,  defaultFileName }),
  saveJSON: (jsonContent, defaultFileName) =>
    ipcRenderer.invoke('save-json', { jsonContent, defaultFileName }),
});
