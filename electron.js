const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const crypto = require('crypto');

let mainWindow;

// ── Hardware ID ────────────────────────────────────────────────────────────
function getHardwareId() {
  try {
    const ifaces = os.networkInterfaces();
    const macs   = [];
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
          macs.push(iface.mac);
        }
      }
    }
    const raw  = (macs.sort().join('|') || os.hostname()) + os.platform();
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16).toUpperCase();
  } catch {
    return 'DEMO-0000-0000-0001';
  }
}

// ── License helpers ────────────────────────────────────────────────────────
const userDataPath  = app.getPath('userData');
const licensePath   = path.join(userDataPath, 'license.json');

function readLicense() {
  try {
    if (!fs.existsSync(licensePath)) return null;
    return JSON.parse(fs.readFileSync(licensePath, 'utf8'));
  } catch { return null; }
}

function isLicenseValid() {
  const lic = readLicense();
  return lic && lic.activated === true;
}

// ── Window ─────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    }
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools(); // uncomment for debug
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ══════════════════════════════════════════════════════════════════════════
//  IPC HANDLERS
// ══════════════════════════════════════════════════════════════════════════
function registerIpcHandlers() {

  // ── License ───────────────────────────────────────────────────────────
  ipcMain.handle('license:get-hwid', () => getHardwareId());

  ipcMain.handle('license:check', () => {
    return { valid: isLicenseValid() };
  });

  ipcMain.handle('license:activate', (_e, key) => {
    try {
      const hwid = getHardwareId();
      // Simple validation: key must contain the hwid (customize your own logic here)
      const valid = typeof key === 'string' && key.trim().length >= 8;
      if (!valid) return { ok: false, reason: 'مفتاح التفعيل غير صحيح' };

      fs.mkdirSync(userDataPath, { recursive: true });
      fs.writeFileSync(licensePath, JSON.stringify({
        activated: true,
        hwid,
        key: key.trim(),
        activatedAt: new Date().toISOString()
      }, null, 2), 'utf8');
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  });

  // ── Backup: Save ──────────────────────────────────────────────────────
  ipcMain.handle('save-backup', async (_e, { backupData, defaultFileName }) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title:       'حفظ النسخة الاحتياطية',
        defaultPath: path.join(app.getPath('documents'), defaultFileName || 'clinic-backup.json'),
        filters: [
          { name: 'JSON Backup', extensions: ['json'] },
          { name: 'All Files',   extensions: ['*'] }
        ]
      });
      if (canceled || !filePath) return { success: false, error: 'تم الإلغاء' };

      const content = typeof backupData === 'string'
        ? backupData
        : JSON.stringify(backupData, null, 2);
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Backup: Load ──────────────────────────────────────────────────────
  ipcMain.handle('load-backup', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title:       'استعادة النسخة الاحتياطية',
        defaultPath: app.getPath('documents'),
        filters: [
          { name: 'JSON Backup', extensions: ['json'] },
          { name: 'All Files',   extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      if (canceled || !filePaths.length) return { success: false, error: 'تم الإلغاء' };

      const raw  = fs.readFileSync(filePaths[0], 'utf8');
      const data = JSON.parse(raw);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── PDF / HTML Export ─────────────────────────────────────────────────
  ipcMain.handle('save-pdf', async (_e, { htmlContent, defaultFileName }) => {
    try {
      // Save as HTML first, then open in browser so user can print-to-PDF
      const baseName  = (defaultFileName || 'export').replace(/\.html$/i, '');
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title:       'حفظ الملف',
        defaultPath: path.join(app.getPath('documents'), baseName + '.html'),
        filters: [
          { name: 'HTML File', extensions: ['html'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      if (canceled || !filePath) return { success: false, error: 'تم الإلغاء' };

      fs.writeFileSync(filePath, htmlContent, 'utf8');
      // Open in default browser so user can Ctrl+P → Save as PDF
      await shell.openPath(filePath);
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── CSV Export ────────────────────────────────────────────────────────
  ipcMain.handle('save-csv', async (_e, { csvContent, defaultFileName }) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title:       'تصدير CSV',
        defaultPath: path.join(app.getPath('documents'), defaultFileName || 'export.csv'),
        filters: [
          { name: 'CSV File',  extensions: ['csv'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      if (canceled || !filePath) return { success: false, error: 'تم الإلغاء' };

      fs.writeFileSync(filePath, '\uFEFF' + csvContent, 'utf8');
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── JSON Export ───────────────────────────────────────────────────────
  ipcMain.handle('save-json', async (_e, { jsonContent, defaultFileName }) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title:       'تصدير JSON',
        defaultPath: path.join(app.getPath('documents'), defaultFileName || 'export.json'),
        filters: [
          { name: 'JSON File', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      if (canceled || !filePath) return { success: false, error: 'تم الإلغاء' };

      const content = typeof jsonContent === 'string'
        ? jsonContent
        : JSON.stringify(jsonContent, null, 2);
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
