// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    sendMessage: (channel: string, ...args: any[]) => {
        ipcRenderer.send(channel, ...args);
    },
    onMessage: (channel: string, callback: (event: any, ...args: any[]) => void) => {
        ipcRenderer.on(channel, (event, ...args) => callback(event, ...args));
    },
    fs: {
        readFile: (filePath: string, encoding: string) => {
            return new Promise((resolve, reject) => {
                ipcRenderer.send('read-file', filePath, encoding);
                ipcRenderer.once('read-file-response', (event, error, content) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(content);
                    }
                });
            });
        }
    }
});

window.addEventListener('keydown',(event: KeyboardEvent) => {
    if(event.key.toLowerCase() === 'f5'){
        ipcRenderer.send('reload-window');
    }
})