const { app, BrowserWindow, ipcMain, session, net } = (() => {
  try {
    return require("electron");
  } catch {
    return global.electron || {};
  }
})();
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

app.commandLine.appendSwitch("force-device-scale-factor", "1");

let isDev = !app.isPackaged;
const SERVER_PORT = 5002;
const API_URL = `http://127.0.0.1:${SERVER_PORT}`;
const AUTH_TOKEN = "workanabot-dev-token";

let mainWindow = null;
let serverProc = null;
let splashWin = null;
let loginWin = null;

const URL_WORKANA_LOGIN = "https://www.workana.com/login";

// ── UTILITÁRIOS ───────────────────────────────────────────────────────────────

function log(...args) {
  console.log("[WorkanaBot]", ...args);
}

function waitForPort(port, retries = 30, delay = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(400, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (++attempts >= retries)
        return reject(new Error(`Porta ${port} não respondeu.`));
      setTimeout(check, delay);
    };
    check();
  });
}

// ── SERVIDOR PYTHON ───────────────────────────────────────────────────────────

function startPythonServer() {
  const pythonPath = isDev
    ? "python"
    : path.join(process.resourcesPath, "python", "python.exe");

  const scriptPath = isDev
    ? path.join(__dirname, "server.py")
    : path.join(process.resourcesPath, "server.py");

  log(`Iniciando servidor Python: ${scriptPath}`);

  const proc = spawn(pythonPath, [scriptPath], {
    stdio: "pipe",
    detached: false,
  });
  proc.stdout.on("data", (d) => log("[server]", d.toString().trim()));
  proc.stderr.on("data", (d) => log("[server ERR]", d.toString().trim()));
  return proc;
}

// ── SPLASH ────────────────────────────────────────────────────────────────────

const SPLASH_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#0f1117;border:1px solid #1e2130;border-radius:18px;font-family:sans-serif;width:420px;height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;position:relative;-webkit-app-region:drag;}#bar-track{position:absolute;top:0;left:0;right:0;height:3px;background:#1e2130;}#bar-fill{height:100%;background:linear-gradient(90deg,#3b82f6,#6366f1);width:0%;transition:width 0.5s ease;}.logo-wrap{display:flex;align-items:center;gap:14px;margin-bottom:28px;}.logo-icon{width:44px;height:44px;background:linear-gradient(135deg,#3b82f6,#6366f1);border-radius:11px;display:flex;align-items:center;justify-content:center;}.logo-name{font-size:20px;font-weight:600;color:#f0f4ff;}#msg{font-size:11px;color:#3b4568;}</style></head><body><div id="bar-track"><div id="bar-fill"></div></div><div class="logo-wrap"><div class="logo-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg></div><span class="logo-name">WorkanaBot</span></div><span id="msg">Iniciando...</span><script>const {ipcRenderer}=require("electron");ipcRenderer.on("splash:done",()=>{document.getElementById("bar-fill").style.width="100%";document.getElementById("msg").textContent="Pronto!";});let p=0;setInterval(()=>{if(p<90){p+=5;document.getElementById("bar-fill").style.width=p+"%";}},800);</script></body></html>`;

function createSplash() {
  splashWin = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  splashWin.loadURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(SPLASH_HTML)
  );
}

// ── JANELA DE LOGIN ───────────────────────────────────────────────────────────

async function abrirLoginWorkana() {
  if (loginWin) return loginWin.focus();

  loginWin = new BrowserWindow({
    width: 1100,
    height: 760,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: "persist:workana",
    },
  });

  loginWin.loadURL(URL_WORKANA_LOGIN);

  // Monitora navegação: quando sair da página de login, sessão foi estabelecida
  loginWin.webContents.on("did-navigate", async (_, url) => {
    if (!url.includes("/login")) {
      log("Login detectado, capturando cookies...");
      await capturarEEnviarSessao();
    }
  });

  loginWin.on("closed", () => {
    loginWin = null;
  });
}

async function capturarEEnviarSessao() {
  try {
    const ses = session.fromPartition("persist:workana");
    const cookies = await ses.cookies.get({ domain: "workana.com" });

    log(`Cookies capturados: ${cookies.length}`);

    // Normaliza para o formato que o Playwright entende
    const cookiesNorm = cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || "/",
      secure: c.secure || false,
      httpOnly: c.httpOnly || false,
      sameSite: c.sameSite || "Lax",
    }));

    // Envia ao servidor Python
    const body = JSON.stringify({ cookies: cookiesNorm });
    const req = net.request({
      method: "POST",
      url: `${API_URL}/api/workana/sessao`,
    });
    req.setHeader("Content-Type", "application/json");
    req.setHeader("Authorization", `Bearer ${AUTH_TOKEN}`);
    req.write(body);
    req.end();

    req.on("response", (res) => {
      log(`Sessão enviada ao servidor. Status: ${res.statusCode}`);
      // Notifica o frontend
      mainWindow?.webContents.send("workana:sessao-capturada", {
        ok: true,
        cookies: cookiesNorm.length,
      });
      // Fecha a janela de login
      loginWin?.close();
    });

    req.on("error", (e) => log("Erro ao enviar sessão:", e.message));
  } catch (e) {
    log("Erro ao capturar cookies:", e.message);
  }
}

// ── JANELA PRINCIPAL ──────────────────────────────────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0a0b10",
      symbolColor: "#9399b2",
      height: 40,
    },
    backgroundColor: "#0a0b10",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const url = isDev
    ? "http://localhost:5173"
    : `file://${path.join(__dirname, "dist", "index.html")}`;

  mainWindow.loadURL(url);

  mainWindow.webContents.on("did-finish-load", () => {
    if (splashWin) {
      splashWin.webContents.send("splash:done");
      setTimeout(() => {
        splashWin?.close();
        mainWindow.show();
      }, 800);
    } else {
      mainWindow.show();
    }
  });
}

// ── IPC HANDLERS ──────────────────────────────────────────────────────────────

function abrirProjetoWorkana(url) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: "persist:workana", // mesma sessão do login
    },
  });
  win.loadURL(url);
}

ipcMain.on("win:minimize", () => mainWindow?.minimize());
ipcMain.on("win:maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on("win:close", () => app.quit());
ipcMain.on("workana:abrir-login", () => abrirLoginWorkana());
ipcMain.on("workana:abrir-projeto", (_, url) => abrirProjetoWorkana(url));

ipcMain.on("workana:preencher-proposta", (_, { url, texto }) => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: "persist:workana",
    },
  });
  win.loadURL(url);

  win.webContents.on("did-finish-load", () => {
    const escapedTexto = texto
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$/g, "\\$");
    win.webContents
      .executeJavaScript(
        `
      (async function() {
        const btn = document.querySelector(
          'a[href*="proposal"], button[class*="proposal"], .send-proposal, [data-cy="send-proposal"], a.btn-proposal, .js-send-proposal'
        );
        if (btn) btn.click();

        await new Promise(r => setTimeout(r, 1500));

        const ta = document.querySelector(
          'textarea[name*="cover"], textarea[name*="proposal"], textarea[name*="message"], textarea[placeholder*="proposta"], textarea[placeholder*="proposal"], textarea[class*="cover"]'
        );
        if (ta) {
          ta.focus();
          ta.value = \`${escapedTexto}\`;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })();
    `
      )
      .catch(() => {});
  });
});

// Scraping manual disparado pelo botão SYNC NOW do frontend
ipcMain.handle("workana:iniciar-scraping", async () => {
  try {
    const req = net.request({
      method: "POST",
      url: `${API_URL}/api/workana/scraping/iniciar`,
    });
    req.setHeader("Authorization", `Bearer ${AUTH_TOKEN}`);
    req.setHeader("Content-Type", "application/json");
    req.write("{}");
    req.end();
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

// ── INICIALIZAÇÃO ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  createSplash();
  serverProc = startPythonServer();

  try {
    await waitForPort(SERVER_PORT);
    createMainWindow();
  } catch (e) {
    log("Servidor Python não subiu — abrindo mesmo assim.");
    createMainWindow();
  }
});

app.on("will-quit", () => serverProc?.kill());
