const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // عشان نقدر نستخدم ipcRenderer جوه index.html
    }
  });

  mainWindow.loadFile('index.html');

  // أول ما الصفحة تخلص تحميل، نتشيك على الترخيص
  mainWindow.webContents.on('did-finish-load', () => {
    const userDataPath = app.getPath('userData');
    const licensePath = path.join(userDataPath, 'license.json');

    if (!fs.existsSync(licensePath)) {
      // 🔒 مفيش ترخيص -> ابعت أمر فوري للـ Frontend عشان يظهر الشاشة الزرقاء
      mainWindow.webContents.send('門-license-status', { activated: false });
    } else {
      try {
        const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
        if (licenseData && licenseData.activated === true) {
          mainWindow.webContents.send('門-license-status', { activated: true });
        } else {
          mainWindow.webContents.send('門-license-status', { activated: false });
        }
      } catch (e) {
        mainWindow.webContents.send('門-license-status', { activated: false });
      }
    }
  });
}

// استقبل التفعيل الناجح من الـ Frontend عشان يحفظ الملف
ipcMain.on('save-license', (event, licenseData) => {
  const userDataPath = app.getPath('userData');
  const licensePath = path.join(userDataPath, 'license.json');
  fs.writeFileSync(licensePath, JSON.stringify(licenseData, null, 2));
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
