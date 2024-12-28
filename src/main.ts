// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-nocheck
import {app, BrowserWindow, dialog, Menu, ipcRenderer, ipcMain, globalShortcut, webFrame} from 'electron';
import path from 'path';
import * as ipaddr from 'ipaddr.js';
import fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import {URL} from 'url';
import {spawn} from "child_process";
import config from "../forge.config";

let mainWindow: BrowserWindow;
import started from 'electron-squirrel-startup'

if (started) {
    app.quit();
}
const isDev = process.env.NODE_ENV === 'development';
const configFilePath = isDev
    ? path.join(__dirname, '../../develop_config/config.json') // 开发环境
    : path.join(process.resourcesPath, 'config.json'); // 生产环境
const exePath = isDev
    ? path.join(__dirname, '../../static/frp/frpc.exe') // 开发环境
    : path.join(process.resourcesPath, 'frpc.exe'); // 生产环境

const configPath = isDev
    ? path.join(__dirname, '../../develop_config/frpc.toml') // 开发环境
    : path.join(process.resourcesPath, 'frpc.toml'); // 生产环境
const dialogPath = isDev
    ? path.join(__dirname, '../../static/frp/configDialog.html') // 开发环境
    : path.join(process.resourcesPath, '/configDialog.html'); // 生产环境
const loadingPath = isDev
    ? path.join(__dirname, '../../loading.html')
    : path.join(process.resourcesPath, 'loading.html');
const createWindow = () => {
    app.commandLine.appendSwitch('ignore-certificate-errors');
    // Create the browser window.
    mainWindow = new BrowserWindow({
        autoHideMenuBar: true,
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            autoHideMenuBar: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });
    Menu.setApplicationMenu(null)
    // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    }
    globalShortcut.register('Control+Shift+Alt+P', () => {
        mainWindow.loadFile(dialogPath)
    });
    globalShortcut.register('Control+Shift+Alt+S', () => {
        mainWindow.webContents.openDevTools()
    });
    runFrpc();
};
const saveConfig = (configData) => {
    fs.writeFileSync(configFilePath, JSON.stringify(configData))
    runFrpc();
}
ipcMain.on('save-config', (event, configData) => {
    console.log(JSON.stringify(configData),'45678989')
    saveConfig(configData)
})
ipcMain.on('reload-window', (event) => {
    runFrpc()
})
let frpcProcess: ReturnType<typeof spawn> | null = null;
const runFrpc = async (): void => {
    stopFrpc()
    try {
        const configJSON = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        if (Object.keys(configJSON).length == 0) {
            mainWindow.loadFile(dialogPath)
            return
        } else {
            if (ipaddr.isValid(configJSON.ip) && configJSON.name.length > 0 && configJSON.secretKey.length > 0) {
                const frpcConfig = `serverAddr = "${configJSON.ip}"
serverPort = ${configJSON.port}

[[visitors]]
name = "${configJSON.name}_visitor"
type = "xtcp"
# 要访问的 P2P 代理的名称
serverName = "${configJSON.name}"
secretKey = "${configJSON.secretKey}"
# 绑定本地端口以访问 SSH 服务
bindAddr = "0.0.0.0"
bindPort = 5667
keepTunnelOpen = true
                `
                fs.writeFileSync(configPath, frpcConfig)
            } else {
                mainWindow.loadFile(dialogPath)
                return
            }
        }
    } catch (e) {
        mainWindow.loadFile(dialogPath)
        return
    }
    // 启动 frpc.exe
    frpcProcess = spawn(exePath, ['-c', configPath]);

    // 捕获标准输出
    frpcProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data.toString()}`);
    });

    // 捕获标准错误
    frpcProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data.toString()}`);
    });

    // 监听错误事件
    frpcProcess.on('error', (error) => {
        console.error(`子进程启动失败: ${error.message}`);
    });

    // 监听退出事件
    frpcProcess.on('close', (code) => {
        console.log(`子进程退出，退出码: ${code}`);
        frpcProcess = null; // 子进程已退出，重置为 null
    });
    mainWindow.loadFile(loadingPath)
    setTimeout(() => {
        checkConnection('https://localhost:5667')
            .then(() => {
                mainWindow.loadURL('https://localhost:5667');
            })
            .catch((err) => {
                console.log(err)
            })
    },500)
}
const checkConnection = (url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname,
            method: 'GET',
            rejectUnauthorized: false, // 允许不受信任的证书
        };

        const request = https.request(options, (response) => {
            if (response.statusCode === 200) {
                resolve();
            } else {
                reject(new Error(`Request failed with status code ${response.statusCode}`));
            }
        });

        request.on('error', (err) => reject(err));
        request.end();
    });
}
const stopFrpc = () => {
    if (frpcProcess) {
        frpcProcess.kill(); // 停止子进程
        console.log('子进程已停止');
        frpcProcess = null;
    } else {
        console.log('没有正在运行的子进程');
    }
};
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
app.on('before-quit', () => {
    stopFrpc();
})
ipcMain.on('read-file', (event: Event, filePath, encoding) => {
    fs.readFile(configFilePath, 'utf8', (error, content) => {
        event.reply('read-file-response', error ? error.message : null, content);
    });
})