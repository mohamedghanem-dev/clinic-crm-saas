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

  // --- 🔒 نظام الحماية والترخيص الحديدي من Nexus Arab 🔒 ---
  // تحديد مسار ملف الترخيص المحمي في مجلد بيانات التطبيق الافتراضي لمنع التلاعب
  const userDataPath = app.getPath('userData');
  const licensePath = path.join(userDataPath, 'license.json');

  console.log("Checking license at:", licensePath);

  // 1. التحقق من وجود الملف
  if (!fs.existsSync(licensePath)) {
    console.log("❌ No license file found. Redirecting to activation screen...");
    // لو ملف الترخيص مش موجود -> إجبار البرنامج على فتح شاشة التفعيل فوراً ومنع الدخول
    mainWindow.loadFile('index.html'); 
    // تأكيد توجيه الـ Frontend لشاشة التفعيل (يمكنك إرسال حدث أو جعل شاشة التفعيل هي الافتراضية في index)
    return;
  }

  // 2. قراءة وقفل فحص بيانات الترخيص لو الملف موجود
  try {
    const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
    
    // هنا تضع شروط فحص المفتاح (مثال: تاريخ انتهاء أو مفتاح صالح)
    if (licenseData && licenseData.activated === true) {
      console.log("✅ License valid. Welcome to Clinic CRM Pro!");
      // الترخيص سليم ومفعل -> يدخل علطول على السيستم وصفحة تسجيل الدخول القديمة
      mainWindow.loadFile('dashboard.html'); // أو اسم صفحة السيستم الرئيسية عندك
    } else {
      console.log("⚠️ License data invalid. Activation required.");
      mainWindow.loadFile('index.html');
    }
  } catch (err) {
    console.error("🔥 Error reading license file, core block triggered.");
    mainWindow.loadFile('index.html');
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
