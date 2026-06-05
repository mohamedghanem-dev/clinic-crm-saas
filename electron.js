// ================================================
//  عيادتي CRM — Electron Main Process
//  + Offline License System (ECDSA P-256)
// ================================================

const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const crypto = require('crypto');

app.commandLine.appendSwitch('lang', 'ar');

// ════════════════════════════════════════════════════════════
//  LICENSE CONFIG — المفتاح العام مُضمَّن في التطبيق
// ════════════════════════════════════════════════════════════
const PUBLIC_KEY_B64 =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAAp+E9uSUiUEwzL3WZX/' +
  'TQTB3WfkUa1lmotR7Go2z+vAleV9T+Xe0h2SLXRM/cR9uC74XVOpN9n5I+yzsO454g==';

const LICENSE_FILE = path.join(app.getPath('userData'), 'license.json');

// ════════════════════════════════════════════════════════════
//  HARDWARE ID — معرّف الجهاز الفريد
// ════════════════════════════════════════════════════════════
function getHardwareId() {
  const interfaces = os.networkInterfaces();
  let mac = '';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        mac = iface.mac.toUpperCase(); break;
      }
    }
    if (mac) break;
  }
  const raw  = [mac, os.hostname(), os.platform(), os.arch()].join('|');
  const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
  const h    = hash.slice(0, 16);
  return `${h.slice(0,4)}-${h.slice(4,8)}-${h.slice(8,12)}-${h.slice(12,16)}`;
}

// ════════════════════════════════════════════════════════════
//  LICENSE VERIFICATION — تحقق أوفلاين بـ ECDSA P-256
// ════════════════════════════════════════════════════════════
function verifyLicenseKey(licenseKey) {
  try {
    if (!licenseKey || typeof licenseKey !== 'string')
      return { valid: false, reason: 'مفتاح فارغ' };

    const parts = licenseKey.trim().split('.');
    if (parts.length !== 2)
      return { valid: false, reason: 'صيغة المفتاح غير صحيحة' };

    const [payloadB64, sigB64] = parts;

    function b64url(s) {
      const b = s.replace(/-/g,'+').replace(/_/g,'/');
      return Buffer.from(b + '='.repeat((4 - b.length%4)%4), 'base64');
    }

    const payloadBytes = b64url(payloadB64);
    const sigBytes     = b64url(sigB64);

    if (sigBytes.length !== 64)
      return { valid: false, reason: 'طول التوقيع خاطئ' };

    const pubKey = crypto.createPublicKey({
      key: Buffer.from(PUBLIC_KEY_B64, 'base64'),
      format: 'der', type: 'spki',
    });

    // raw r||s (64 bytes) → DER SEQUENCE
    function rawToDer(raw) {
      function encInt(buf) {
        let i = 0;
        while (i < buf.length-1 && buf[i]===0) i++;
        let d = buf.slice(i);
        if (d[0] & 0x80) d = Buffer.concat([Buffer.from([0]), d]);
        return Buffer.concat([Buffer.from([0x02, d.length]), d]);
      }
      const r = encInt(raw.slice(0,32));
      const s = encInt(raw.slice(32,64));
      return Buffer.concat([Buffer.from([0x30, r.length+s.length]), r, s]);
    }

    const v = crypto.createVerify('SHA256');
    v.update(payloadBytes);
    if (!v.verify({ key: pubKey, format: 'der', type: 'spki' }, rawToDer(sigBytes)))
      return { valid: false, reason: 'التوقيع الرقمي غير صحيح — المفتاح مزوّر' };

    let payload;
    try { payload = JSON.parse(payloadBytes.toString('utf8')); }
    catch { return { valid: false, reason: 'بيانات المفتاح تالفة' }; }

    const hwid = getHardwareId();
    if (payload.hwid !== hwid)
      return { valid: false, reason: `المفتاح مرتبط بجهاز آخر\nجهازك: ${hwid}\nالمفتاح: ${payload.hwid}` };

    if (payload.exp !== 0 && Math.floor(Date.now()/1000) > payload.exp) {
      const d = new Date(payload.exp*1000).toLocaleDateString('ar-EG');
      return { valid: false, reason: `انتهت صلاحية الترخيص بتاريخ ${d}` };
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, reason: `خطأ: ${err.message}` };
  }
}

function readLicenseFile() {
  try {
    if (!fs.existsSync(LICENSE_FILE)) return null;
    return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf-8'));
  } catch { return null; }
}

function checkLocalLicense() {
  const file = readLicenseFile();
  if (!file?.key) return { licensed: false, reason: 'لم يتم تفعيل النظام' };
  const r = verifyLicenseKey(file.key);
  if (!r.valid) return { licensed: false, reason: r.reason };
  return { licensed: true, payload: r.payload };
}

// ════════════════════════════════════════════════════════════
//  WINDOW
// ════════════════════════════════════════════════════════════
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    title: 'عيادتي CRM',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
    backgroundColor: '#0D1B2A', show: false, autoHideMenuBar: true,
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => { mainWindow.show(); mainWindow.focus(); });
  mainWindow.on('closed', () => { mainWindow = null; });

  const template = [
    { label: 'النظام', submenu: [
      { label: 'إعادة تحميل', accelerator: 'F5',    role: 'reload' },
      { label: 'تكبير/تصغير', accelerator: 'F11',   role: 'togglefullscreen' },
      { type: 'separator' },
      { label: 'إغلاق',       accelerator: 'Alt+F4', role: 'quit' },
    ]},
    { label: 'تحرير', submenu: [
      { label: 'نسخ',         role: 'copy' },
      { label: 'لصق',         role: 'paste' },
      { label: 'تحديد الكل', role: 'selectAll' },
    ]},
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ════════════════════════════════════════════════════════════
//  IPC — LICENSE
// ════════════════════════════════════════════════════════════
ipcMain.handle('license:get-hwid', () => getHardwareId());
ipcMain.handle('license:check',    () => checkLocalLicense());

ipcMain.handle('license:activate', (event, licenseKey) => {
  const r = verifyLicenseKey(licenseKey);
  if (!r.valid) return { success: false, reason: r.reason };
  fs.writeFileSync(LICENSE_FILE, JSON.stringify({
    key: licenseKey, activatedAt: new Date().toISOString(), hwid: getHardwareId(),
  }, null, 2), 'utf-8');
  return { success: true, payload: r.payload };
});

// ════════════════════════════════════════════════════════════
//  IPC — PDF / BACKUP (الأصليين)
// ════════════════════════════════════════════════════════════
ipcMain.handle('save-pdf', async (event, { htmlContent, defaultFileName }) => {
  if (!mainWindow) return { success: false, error: 'Window not available' };
  const r = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(os.homedir(), 'Downloads', defaultFileName || 'export.html'),
    filters: [{ name: 'HTML Files', extensions: ['html'] }, { name: 'All Files', extensions: ['*'] }],
  });
  if (r.canceled) return { success: false, error: 'Save canceled' };
  try { fs.writeFileSync(r.filePath, htmlContent, 'utf-8'); shell.openPath(r.filePath); return { success: true, filePath: r.filePath }; }
  catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('save-backup', async (event, { backupData, defaultFileName }) => {
  if (!mainWindow) return { success: false, error: 'Window not available' };
  const r = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(os.homedir(), 'Downloads', defaultFileName || 'clinic-backup.json'),
    filters: [{ name: 'JSON Files', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }],
  });
  if (r.canceled) return { success: false, error: 'Save canceled' };
  try { fs.writeFileSync(r.filePath, JSON.stringify(backupData, null, 2), 'utf-8'); return { success: true, filePath: r.filePath }; }
  catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('load-backup', async () => {
  if (!mainWindow) return { success: false, error: 'Window not available' };
  const r = await dialog.showOpenDialog(mainWindow, {
    defaultPath: os.homedir(),
    filters: [{ name: 'JSON Files', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }],
    properties: ['openFile'],
  });
  if (r.canceled) return { success: false, error: 'Open canceled' };
  try {
    const data = fs.readFileSync(r.filePaths[0], 'utf-8');
    return { success: true, data: JSON.parse(data), filePath: r.filePaths[0] };
  } catch (err) { return { success: false, error: err.message }; }
});
