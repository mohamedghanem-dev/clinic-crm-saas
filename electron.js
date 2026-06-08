const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
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

// المفتاح العام ECDSA P-256 — يطابق private_key.pem
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAAp+E9uSUiUEwzL3WZX/TQTB3Wfk
Ua1lmotR7Go2z+vAleV9T+Xe0h2SLXRM/cR9uC74XVOpN9n5I+yzsO454g==
-----END PUBLIC KEY-----`;

function verifyLicenseKey(rawKey, hwid) {
  try {
    if (typeof rawKey !== 'string') return { ok: false, reason: 'مفتاح غير صالح' };
    const key    = rawKey.trim();
    const dotIdx = key.lastIndexOf('.');
    if (dotIdx === -1) return { ok: false, reason: 'صيغة المفتاح غير صحيحة' };

    const payloadB64   = key.substring(0, dotIdx);
    const sigB64       = key.substring(dotIdx + 1);
    const payloadBytes = Buffer.from(payloadB64.replace(/-/g,'+').replace(/_/g,'/'), 'base64');
    const payload      = JSON.parse(payloadBytes.toString('utf8'));

    // فك تشفير التوقيع raw r||s → DER
    const sigRaw = Buffer.from(sigB64.replace(/-/g,'+').replace(/_/g,'/'), 'base64');
    if (sigRaw.length !== 64) return { ok: false, reason: 'توقيع غير صالح' };

    function encodeInt(buf) {
      let i = 0;
      while (i < buf.length - 1 && buf[i] === 0) i++;
      buf = buf.subarray(i);
      if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0x00]), buf]);
      return Buffer.concat([Buffer.from([0x02, buf.length]), buf]);
    }
    const rDer = encodeInt(sigRaw.subarray(0, 32));
    const sDer = encodeInt(sigRaw.subarray(32, 64));
    const seq  = Buffer.concat([Buffer.from([0x30, rDer.length + sDer.length]), rDer, sDer]);

    // التحقق من التوقيع
    const verify = crypto.createVerify('SHA256');
    verify.update(payloadBytes);
    if (!verify.verify(PUBLIC_KEY_PEM, seq)) {
      return { ok: false, reason: 'مفتاح التفعيل غير صحيح' };
    }

    // التحقق من الـ HWID
    if (payload.hwid !== hwid.trim().toUpperCase()) {
      return { ok: false, reason: 'هذا المفتاح مرتبط بجهاز آخر' };
    }

    // التحقق من تاريخ الانتهاء
    if (payload.exp && payload.exp > 0) {
      if (Math.floor(Date.now() / 1000) > payload.exp) {
        return { ok: false, reason: 'انتهت صلاحية مفتاح التفعيل' };
      }
    }

    return { ok: true, exp: payload.exp || 0 };
  } catch (e) {
    return { ok: false, reason: 'خطأ في التحقق من المفتاح' };
  }
}

function readLicense() {
  try {
    if (!fs.existsSync(licensePath)) return null;
    return JSON.parse(fs.readFileSync(licensePath, 'utf8'));
  } catch { return null; }
}

function isLicenseValid() {
  const lic = readLicense();
  if (!lic || lic.activated !== true) return false;
  // فحص انتهاء الصلاحية تلقائياً
  if (lic.exp && lic.exp > 0) {
    if (Math.floor(Date.now() / 1000) > lic.exp) {
      try { fs.unlinkSync(licensePath); } catch {}
      return false;
    }
  }
  return true;
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
  // إخفاء الـ Menu Bar تماماً
  Menu.setApplicationMenu(null);

  registerIpcHandlers();
  createWindow();

  // ── فحص الترخيص كل 60 ثانية أثناء التشغيل ──────────────────────────
  setInterval(() => {
    if (mainWindow && !isLicenseValid()) {
      try { fs.unlinkSync(licensePath); } catch {}
      mainWindow.webContents.send('license:expired');
    }
  }, 60000);

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

  ipcMain.on('app:quit', () => app.quit());

  ipcMain.handle('license:check', () => {
    return { licensed: isLicenseValid() };
  });

  ipcMain.handle('license:activate', (_e, key) => {
    try {
      const hwid   = getHardwareId();
      const result = verifyLicenseKey(key, hwid);
      if (!result.ok) return { ok: false, reason: result.reason };

      fs.mkdirSync(userDataPath, { recursive: true });
      fs.writeFileSync(licensePath, JSON.stringify({
        activated:   true,
        hwid,
        key:         key.trim(),
        exp:         result.exp,
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
