const { app, BrowserWindow } = require('electron');
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
      contextIsolation: false
    }
  });

  const userDataPath = app.getPath('userData');
  const licensePath = path.join(userDataPath, 'license.json');

  // 🔒 منطق الحماية: إذا لم يوجد ملف الترخيص، افتح صفحة التفعيل إجبارياً
  if (!fs.existsSync(licensePath)) {
    console.log("No license found, loading index.html (Activation Screen)");
    mainWindow.loadFile('index.html'); 
  } else {
    // تحقق من أن الترخيص فعال
    try {
      const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
      if (licenseData && licenseData.activated === true) {
        mainWindow.loadFile('dashboard.html');
      } else {
        mainWindow.loadFile('index.html');
      }
    } catch (e) {
      mainWindow.loadFile('index.html');
    }
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
