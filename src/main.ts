// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-nocheck
import {app, BrowserWindow, dialog, Menu, ipcRenderer, ipcMain} from 'electron';
import path from 'path';
import * as ipaddr from 'ipaddr.js';
import fs from 'fs';
import {spawn} from "child_process";
import config from "../forge.config";

let mainWindow: BrowserWindow;

const templateMenu = [
    {
        label: '设置',
        submenu: [
            {
                label: '配置frp名称',
                click: async () => {
                    const isDev = process.env.NODE_ENV === 'development';
                    const dialogPath = isDev
                        ? path.join(__dirname, '../../static/frp/configDialog.html') // 开发环境
                        : path.join(process.resourcesPath, '/configDialog.html'); // 生产环境
                    mainWindow.loadFile(dialogPath)
                }
            }
        ]
    }
]
const createWindow = () => {
    app.commandLine.appendSwitch('ignore-certificate-errors');
    // Create the browser window.
    mainWindow = new BrowserWindow({
        autoHideMenuBar: true,
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });
    const menu = Menu.buildFromTemplate(templateMenu);
    Menu.setApplicationMenu(menu)
    // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    }
    runFrpc();
};
const saveConfig = (configData) => {
    const isDev = process.env.NODE_ENV === 'development';
    const configFilePath = isDev
        ? path.join(__dirname, '../../static/config.json') // 开发环境
        : path.join(process.resourcesPath, 'config.json'); // 生产环境
    fs.writeFileSync(configFilePath, JSON.stringify(configData))
    stopFrpc()
    runFrpc();
}
ipcMain.on('save-config', (event, configData) => {
    stopFrpc()
    saveConfig(configData)
})
let frpcProcess: ReturnType<typeof spawn> | null = null;
const runFrpc = async (): void => {
    const isDev = process.env.NODE_ENV === 'development';
    const exePath = isDev
        ? path.join(__dirname, '../../static/frp/frpc.exe') // 开发环境
        : path.join(process.resourcesPath, 'frpc.exe'); // 生产环境

    const configPath = isDev
        ? path.join(__dirname, '../../static/frp/frpc.toml') // 开发环境
        : path.join(process.resourcesPath, 'frpc.toml'); // 生产环境
    const configFilePath = isDev
        ? path.join(__dirname, '../../static/config.json') // 开发环境
        : path.join(process.resourcesPath, 'config.json'); // 生产环境
    try {
        const configJSON = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        if (Object.keys(configJSON).length == 0) {
            const isDev = process.env.NODE_ENV === 'development';
            const dialogPath = isDev
                ? path.join(__dirname, '../../static/frp//configDialog.html') // 开发环境
                : path.join(process.resourcesPath, '/configDialog.html'); // 生产环境
            mainWindow.loadFile(dialogPath)
            return
        } else {
            if (ipaddr.isValid(configJSON.ip) && configJSON.name.length > 0 && configJSON.secretKey.length > 0) {
                const frpcConfig = `serverAddr = "${configJSON.ip}"
serverPort = ${configJSON.port}

[[visitors]]
name = "p2p_fnos_visitor"
type = "xtcp"
# 要访问的 P2P 代理的名称
serverName = "${configJSON.name}"
secretKey = "${configJSON.secretKey}"
# 绑定本地端口以访问 SSH 服务
bindAddr = "127.0.0.1"
bindPort = 5667
keepTunnelOpen = true
                `
                fs.writeFileSync(configPath, frpcConfig)
            } else {
                const isDev = process.env.NODE_ENV === 'development';
                const dialogPath = isDev
                    ? path.join(__dirname, '../../static/frp//configDialog.html') // 开发环境
                    : path.join(process.resourcesPath, '/configDialog.html'); // 生产环境
                mainWindow.loadFile(dialogPath)
                return
            }
        }
    } catch (e) {
        const isDev = process.env.NODE_ENV === 'development';
        const dialogPath = isDev
            ? path.join(__dirname, '../../static/frp//configDialog.html') // 开发环境
            : path.join(process.resourcesPath, '/configDialog.html'); // 生产环境
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
    mainWindow.loadURL('https://localhost:5667')
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
setTimeout(runFrpc, 1000)
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
    const isDev = process.env.NODE_ENV === 'development';
    const configFilePath = isDev
        ? path.join(__dirname, '../../static/config.json') // 开发环境
        : path.join(process.resourcesPath, 'config.json'); // 生产环境
    fs.readFile(configFilePath, 'utf8', (error, content) => {
        event.reply('read-file-response', error ? error.message : null, content);
    });
})
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.