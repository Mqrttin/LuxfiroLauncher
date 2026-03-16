/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { app, ipcMain, nativeTheme, Tray, Menu } = require('electron');
const { Microsoft } = require('minecraft-java-core');
const { autoUpdater } = require('electron-updater');

const path = require('path');
const fs = require('fs');

const UpdateWindow = require("./assets/js/windows/updateWindow.js");
const MainWindow = require("./assets/js/windows/mainWindow.js");

let tray = null;
let isQuitting = false;

// ---------------- Discord RPC ----------------
const RPC = require('discord-rpc');
const clientId = '1482516527696842914';
const rpcClient = new RPC.Client({ transport: 'ipc' });

let rpcReady = false;
let currentRPCData = {
    instanceName: 'Luxfiro Launcher',
    minecraftVersion: '',
    loader: '',
    loaderVersion: ''
};

/**
 * Construye la actividad del RPC usando datos de la instancia.
 * Espera un objeto como:
 * {
 *   instanceName: 'Cobblemon Altos Recursos',
 *   minecraftVersion: '1.20.1',
 *   loader: 'Forge',
 *   loaderVersion: '47.2.0'
 * }
 */
function buildRPCActivity(data = {}) {
    const instanceName =
        data.instanceName ||
        data.instance ||
        data.name ||
        currentRPCData.instanceName ||
        'Luxfiro Launcher';

    const minecraftVersion =
        data.minecraftVersion ||
        data.mcVersion ||
        data.version ||
        currentRPCData.minecraftVersion ||
        '';

    const loader =
        data.loader ||
        data.loaderName ||
        currentRPCData.loader ||
        '';

    const loaderVersion =
        data.loaderVersion ||
        data.modloaderVersion ||
        currentRPCData.loaderVersion ||
        '';

    let state = '';

    if (minecraftVersion && loader && loaderVersion) {
        state = `${minecraftVersion} | ${loader} ${loaderVersion}`;
    } else if (minecraftVersion && loader) {
        state = `${minecraftVersion} | ${loader}`;
    } else if (minecraftVersion) {
        state = `${minecraftVersion}`;
    } else if (loader && loaderVersion) {
        state = `${loader} ${loaderVersion}`;
    } else if (loader) {
        state = `${loader}`;
    }

    const activity = {
        details: `Jugando a ${instanceName}`,
        startTimestamp: Date.now(),
        largeImageKey: 'logo',
        largeImageText: 'Luxfiro Studios',
        instance: true
    };

    if (state && state.trim().length > 0) {
        activity.state = state;
    }

    return activity;
}

/**
 * Guarda los datos actuales del RPC.
 */
function saveRPCData(data = {}) {
    currentRPCData = {
        instanceName:
            data.instanceName ||
            data.instance ||
            data.name ||
            currentRPCData.instanceName ||
            'Luxfiro Launcher',

        minecraftVersion:
            data.minecraftVersion ||
            data.mcVersion ||
            data.version ||
            currentRPCData.minecraftVersion ||
            '',

        loader:
            data.loader ||
            data.loaderName ||
            currentRPCData.loader ||
            '',

        loaderVersion:
            data.loaderVersion ||
            data.modloaderVersion ||
            currentRPCData.loaderVersion ||
            ''
    };
}

/**
 * Aplica la actividad al RPC si está listo y no se está cerrando la app.
 */
function setRPCActivity(data = {}) {
    if (isQuitting) return;
    if (!rpcReady) return;

    try {
        saveRPCData(data);
        const activity = buildRPCActivity(currentRPCData);
        rpcClient.setActivity(activity);
        console.log('Discord RPC actualizado:', activity);
    } catch (error) {
        console.error('Error actualizando Discord RPC:', error);
    }
}

rpcClient.on('ready', () => {
    rpcReady = true;

    try {
        // Ya no mostramos "Seleccionando instancia".
        // Se muestra el último/fallback limpio hasta que home.js mande la instancia real.
        const activity = buildRPCActivity(currentRPCData);
        rpcClient.setActivity(activity);
        console.log('Discord RPC activado.');
    } catch (error) {
        console.error('Error iniciando Discord RPC:', error);
    }
});

rpcClient.login({ clientId }).catch(console.error);

// ---------------- Función para limpiar RPC ----------------
function cleanupRPC() {
    if (!isQuitting) {
        isQuitting = true;

        try {
            if (rpcReady) {
                rpcClient.clearActivity();
                rpcClient.destroy();
            }
            console.log('Discord RPC desconectado correctamente.');
        } catch (e) {
            console.error('Error desconectando RPC:', e);
        }
    }
}

// ---------------- Función para salir del launcher ----------------
function quitLauncher() {
    cleanupRPC();

    const mainWin = MainWindow.getWindow();
    if (mainWin && !mainWin.isDestroyed()) {
        try {
            mainWin.destroy();
        } catch (e) {}
    }

    const updateWin = UpdateWindow.getWindow();
    if (updateWin && !updateWin.isDestroyed()) {
        try {
            updateWin.destroy();
        } catch (e) {}
    }

    if (tray && !tray.isDestroyed()) {
        try {
            tray.destroy();
        } catch (e) {}
    }

    app.exit(0);
}

// ---------------- Resto de tu código original ----------------
let dev = process.env.NODE_ENV === 'dev';

if (dev) {
    let appPath = path.resolve('./data/Launcher').replace(/\\/g, '/');
    let appdata = path.resolve('./data').replace(/\\/g, '/');

    if (!fs.existsSync(appPath)) fs.mkdirSync(appPath, { recursive: true });
    if (!fs.existsSync(appdata)) fs.mkdirSync(appdata, { recursive: true });

    app.setPath('userData', appPath);
    app.setPath('appData', appdata);
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.whenReady().then(() => {
        if (dev) MainWindow.createWindow();
        else UpdateWindow.createWindow();

        // ---------------- Tray ----------------
        tray = new Tray(path.join(__dirname, 'assets', 'images', 'icon.png'));
        tray.setToolTip('Luxfiro Launcher');

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Abrir Launcher',
                click: () => {
                    let win = MainWindow.getWindow();
                    if (win) {
                        win.show();
                        win.focus();
                    } else {
                        MainWindow.createWindow();
                    }
                }
            },
            {
                label: 'Cerrar',
                click: () => quitLauncher()
            }
        ]);

        tray.setContextMenu(contextMenu);

        tray.on('double-click', () => {
            let win = MainWindow.getWindow();
            if (win) win.show();
        });

        let win = MainWindow.getWindow();
        if (win) {
            win.on('close', (event) => {
                event.preventDefault();
                quitLauncher();
            });
        }
    });
}

// ---------------- IPC ----------------
ipcMain.on('main-window-open', () => MainWindow.createWindow());

ipcMain.on('main-window-dev-tools', () => {
    const win = MainWindow.getWindow();
    if (win) win.webContents.openDevTools({ mode: 'detach' });
});

ipcMain.on('main-window-dev-tools-close', () => {
    const win = MainWindow.getWindow();
    if (win) win.webContents.closeDevTools();
});

ipcMain.on('main-window-close', () => MainWindow.destroyWindow());

ipcMain.on('main-window-reload', () => {
    const win = MainWindow.getWindow();
    if (win) win.reload();
});

ipcMain.on('main-window-progress', (event, options) => {
    const win = MainWindow.getWindow();
    if (win) win.setProgressBar(options.progress / options.size);
});

ipcMain.on('main-window-progress-reset', () => {
    const win = MainWindow.getWindow();
    if (win) win.setProgressBar(-1);
});

ipcMain.on('main-window-progress-load', () => {
    const win = MainWindow.getWindow();
    if (win) win.setProgressBar(2);
});

ipcMain.on('main-window-minimize', () => {
    const win = MainWindow.getWindow();
    if (win) win.minimize();
});

ipcMain.on('main-window-maximize', () => {
    const win = MainWindow.getWindow();
    if (!win) return;

    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
});

ipcMain.on('main-window-hide', () => {
    const win = MainWindow.getWindow();
    if (win) win.hide();
});

ipcMain.on('main-window-show', () => {
    const win = MainWindow.getWindow();
    if (win) win.show();
});

ipcMain.on('minecraft-launch', () => {
    const win = MainWindow.getWindow();
    if (win) win.webContents.send('pause-audio');
});

ipcMain.on('minecraft-close', () => {
    const win = MainWindow.getWindow();
    if (win) win.webContents.send('resume-audio');
});

ipcMain.on('force-exit', () => quitLauncher());

ipcMain.handle('Microsoft-window', async (_, client_id) => {
    return await new Microsoft(client_id).getAuth();
});

ipcMain.handle('is-dark-theme', (_, theme) => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return nativeTheme.shouldUseDarkColors;
});

ipcMain.on('update-window-close', () => UpdateWindow.destroyWindow());

ipcMain.on('update-window-dev-tools', () => {
    const win = UpdateWindow.getWindow();
    if (win) win.webContents.openDevTools({ mode: 'detach' });
});

ipcMain.on('update-window-progress', (event, options) => {
    const win = UpdateWindow.getWindow();
    if (win) win.setProgressBar(options.progress / options.size);
});

ipcMain.on('update-window-progress-reset', () => {
    const win = UpdateWindow.getWindow();
    if (win) win.setProgressBar(-1);
});

ipcMain.on('update-window-progress-load', () => {
    const win = UpdateWindow.getWindow();
    if (win) win.setProgressBar(2);
});

ipcMain.handle('path-user-data', () => app.getPath('userData'));
ipcMain.handle('appData', () => app.getPath('appData'));

// ---------------- Auto Updater ----------------
autoUpdater.autoDownload = false;

ipcMain.handle('update-app', async () => {
    return await new Promise(async (resolve, reject) => {
        autoUpdater.checkForUpdates()
            .then(res => resolve(res))
            .catch(error => reject({ error: true, message: error }));
    });
});

autoUpdater.on('update-available', () => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('updateAvailable');
});

ipcMain.on('start-update', () => autoUpdater.downloadUpdate());

autoUpdater.on('update-not-available', () => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('update-not-available');
});

autoUpdater.on('update-downloaded', () => autoUpdater.quitAndInstall());

autoUpdater.on('download-progress', (progress) => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('download-progress', progress);
});

autoUpdater.on('error', (err) => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('error', err);
});

// ---------------- Manejo de cierres globales ----------------
app.on('window-all-closed', () => {
    cleanupRPC();
    if (process.platform !== 'darwin') app.quit();
});

process.on('SIGINT', () => {
    cleanupRPC();
    process.exit();
});

process.on('exit', () => {
    cleanupRPC();
});

// ---------------- Actualización dinámica del RPC ----------------
// Debe llegar desde renderer algo así:
//
// ipcRenderer.send('update-rpc', {
//     instanceName: 'Cobblemon Altos Recursos',
//     minecraftVersion: '1.20.1',
//     loader: 'Forge',
//     loaderVersion: '47.2.0'
// });
//
ipcMain.on('update-rpc', (event, data) => {
    if (isQuitting) return;
    if (!data || typeof data !== 'object') return;
    setRPCActivity(data);
});