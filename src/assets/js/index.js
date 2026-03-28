/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { ipcRenderer, shell } = require('electron');
const pkg = require('../package.json');
const os = require('os');
import { config, database } from './utils.js';
const nodeFetch = require("node-fetch");

class Splash {
    constructor() {
        this.splash = document.querySelector(".splash");
        this.splashMessage = document.querySelector(".splash-message");
        this.splashAuthor = document.querySelector(".splash-author");
        this.message = document.querySelector(".message");
        this.progress = document.querySelector(".progress");

        document.addEventListener('DOMContentLoaded', async () => {
            try {
                await this.applyWindowLayout();

                let databaseLauncher = new database();
                let configClient = await databaseLauncher.readData('configClient');
                let theme = configClient?.launcher_config?.theme || "auto";
                let isDarkTheme = await ipcRenderer.invoke('is-dark-theme', theme).then(res => res);

                document.body.className = isDarkTheme ? 'dark global' : 'light global';

                if (process.platform === 'win32') {
                    ipcRenderer.send('update-window-progress-load');
                }

                this.startAnimation();
            } catch (error) {
                console.error('[Splash] Error al iniciar tema del splash:', error);
                document.body.className = 'dark global';
                this.startAnimation();
            }
        });
    }

    async applyWindowLayout() {
        const splashElement = document.querySelector('#splash');
        if (!splashElement) return;

        splashElement.style.width = '1280px';
        splashElement.style.height = '720px';

        document.documentElement.style.width = '1280px';
        document.documentElement.style.height = '720px';
        document.body.style.width = '1280px';
        document.body.style.height = '720px';
        document.body.style.margin = '0';
        document.body.style.overflow = 'hidden';
    }

    async startAnimation() {
        try {
            if (this.splashMessage) {
                this.splashMessage.textContent = "Luxfiro";
            }

            if (this.splashAuthor && this.splashAuthor.children[0]) {
                this.splashAuthor.children[0].textContent = "@ImNotRuso/Mqrttin";
            }

            this.setStatus('Iniciando launcher');

            await sleep(100);

            const splashElement = document.querySelector("#splash");
            if (splashElement) splashElement.style.display = "block";

            this.checkUpdate();
        } catch (error) {
            console.error('[Splash] Error en startAnimation:', error);
            this.checkUpdate();
        }
    }

    async checkUpdate() {
        this.setStatus('Buscando actualizaciones...');

        ipcRenderer.invoke('update-app').catch(err => {
            return this.shutdown(`Error al buscar actualización :<br>${err.message}`);
        });

        ipcRenderer.on('updateAvailable', () => {
            this.setStatus('Hay una actualización disponible!');

            if (os.platform() === 'win32') {
                this.toggleProgress();
                ipcRenderer.send('start-update');
            } else {
                return this.dowloadUpdate();
            }
        });

        ipcRenderer.on('error', (event, err) => {
            if (err) {
                return this.shutdown(`${err.message}`);
            }
        });

        ipcRenderer.on('download-progress', (event, progress) => {
            ipcRenderer.send('update-window-progress', {
                progress: progress.transferred,
                size: progress.total
            });

            this.setProgress(progress.transferred, progress.total);
        });

        ipcRenderer.on('update-not-available', () => {
            console.error("Actualización no disponible");
            this.maintenanceCheck();
        });
    }

    getLatestReleaseForOS(targetOS, preferredFormat, assets) {
        return assets
            .filter(asset => {
                const name = asset.name.toLowerCase();
                const isOSMatch = name.includes(targetOS);
                const isFormatMatch = name.endsWith(preferredFormat);
                return isOSMatch && isFormatMatch;
            })
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    }

    async dowloadUpdate() {
        try {
            const repoURL = pkg.repository.url
                .replace("git+", "")
                .replace(".git", "")
                .replace("https://github.com/", "")
                .split("/");

            const githubAPI = await nodeFetch('https://api.github.com')
                .then(res => res.json())
                .catch(err => err);

            const githubAPIRepoURL = githubAPI.repository_url
                .replace("{owner}", repoURL[0])
                .replace("{repo}", repoURL[1]);

            const githubAPIRepo = await nodeFetch(githubAPIRepoURL)
                .then(res => res.json())
                .catch(err => err);

            const releasesURL = await nodeFetch(githubAPIRepo.releases_url.replace("{/id}", ''))
                .then(res => res.json())
                .catch(err => err);

            const latestRelease = releasesURL[0].assets;
            let latest;

            if (os.platform() === 'darwin') {
                latest = this.getLatestReleaseForOS('mac', '.dmg', latestRelease);
            } else if (os.platform() === 'linux') {
                latest = this.getLatestReleaseForOS('linux', '.appimage', latestRelease);
            }

            if (!latest) {
                return this.shutdown("No se encontró un archivo de actualización compatible.");
            }

            this.setStatus(`Hay una actualización disponible !<br><div class="download-update">Actualizar</div>`);

            const updateButtonWait = setInterval(() => {
                const button = document.querySelector(".download-update");
                if (!button) return;

                clearInterval(updateButtonWait);

                button.addEventListener("click", () => {
                    shell.openExternal(latest.browser_download_url);
                    return this.shutdown("Actualización en curso...");
                });
            }, 50);
        } catch (error) {
            console.error('[Splash] Error al descargar actualización:', error);
            return this.shutdown(`Error al preparar la actualización.<br>${error.message || error}`);
        }
    }

    async maintenanceCheck() {
        config.GetConfig().then(res => {
            if (res.maintenance) {
                return this.shutdown(res.maintenance_message);
            }

            this.startLauncher();
        }).catch(e => {
            console.error(e);
            return this.shutdown("No hay conexión a internet,<br>Intentalo más tarde.");
        });
    }

    startLauncher() {
        this.setStatus('Iniciando launcher');
        ipcRenderer.send('main-window-open');
        ipcRenderer.send('update-window-close');
    }

    shutdown(text) {
        this.setStatus(`${text}<br>Apagando en 5s`);

        let i = 4;
        const timer = setInterval(() => {
            this.setStatus(`${text}<br>Apagando en ${i--}s`);

            if (i < 0) {
                clearInterval(timer);
                ipcRenderer.send('update-window-close');
            }
        }, 1000);
    }

    setStatus(text) {
        if (this.message) {
            this.message.innerHTML = text;
        }
    }

    toggleProgress() {
        if (!this.progress) return;

        if (this.progress.classList.toggle("show")) {
            this.setProgress(0, 1);
        }
    }

    setProgress(value, max) {
        if (!this.progress) return;

        this.progress.value = value;
        this.progress.max = max;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey && e.shiftKey && e.keyCode === 73) || e.keyCode === 123) {
        ipcRenderer.send("update-window-dev-tools");
    }
});

new Splash();