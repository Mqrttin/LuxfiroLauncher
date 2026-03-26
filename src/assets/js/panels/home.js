/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
import { config, database, logger, changePanel, appdata, setStatus, pkg, popup, setBackgroundAnimated } from '../utils.js'

const { Launch, Microsoft } = require('minecraft-java-core')
const { shell, ipcRenderer } = require('electron')

const nodeFetch = require('node-fetch')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const extract = require('extract-zip')

class Home {
    static id = "home";

    launcherDisplayName = "Luxfiro Studio";

    lockViewportScroll() {
        if (document.documentElement) {
            document.documentElement.style.overflow = 'hidden';
            document.documentElement.style.overflowX = 'hidden';
        }

        if (document.body) {
            document.body.style.overflow = 'hidden';
            document.body.style.overflowX = 'hidden';
        }
    }

    syncSidebarState(panelId = 'home') {
        const targetMap = {
            home: 'nav-home',
            instances: 'nav-instances',
            settings: 'nav-settings'
        };

        const activeId = targetMap[panelId];

        document.querySelectorAll('#nav-home, #nav-instances, #nav-settings').forEach(btn => {
            btn.classList.remove('active');
        });

        if (!activeId) return;

        document.querySelectorAll(`#${activeId}`).forEach(btn => {
            btn.classList.add('active');
        });
    }

    changePanelSafely(panelId) {
        this.lockViewportScroll();
        this.syncSidebarState(panelId);
        changePanel(panelId);

        requestAnimationFrame(() => {
            this.lockViewportScroll();
            this.syncSidebarState(panelId);
        });

        setTimeout(() => {
            this.lockViewportScroll();
            this.syncSidebarState(panelId);
        }, 250);
    }

    getInstanceType(instanceName = "") {
        const name = String(instanceName).toLowerCase();

        if (name.includes("cobblemon")) return "cobblemon";
        if (name.includes("pixelmon")) return "pixelmon";

        return null;
    }

    getLoaderLabel(instanceInfo = null) {
        const loadder = instanceInfo?.loadder;
        if (!loadder) return "Sin loader";

        const type = String(loadder.loadder_type || 'none').toLowerCase();
        const version = loadder.loadder_version ? String(loadder.loadder_version) : "";

        if (type === 'none') return "Vanilla";
        if (!version) return type.charAt(0).toUpperCase() + type.slice(1);

        return `${type.charAt(0).toUpperCase() + type.slice(1)} ${version}`;
    }

    getMinecraftVersion(instanceInfo = null) {
        return instanceInfo?.loadder?.minecraft_version || "--";
    }

    getStudioLabel() {
        return this.launcherDisplayName || "Launcher Studio";
    }

    getInstanceDescription(instanceName = "", instanceInfo = null) {
        const mcVersion = this.getMinecraftVersion(instanceInfo);
        const loaderLabel = this.getLoaderLabel(instanceInfo);

        return `Selecciona <strong>JUGAR</strong> para iniciar <strong>${instanceName || 'esta instancia'}</strong> y abrir la configuración del launcher con <strong>${loaderLabel}</strong> sobre <strong>Minecraft ${mcVersion}</strong>.`;
    }

    updateDiscordRPC(instanceName = "", instanceInfo = null) {
        const loadder = instanceInfo?.loadder;
        const loaderType = String(loadder?.loadder_type || 'none').toLowerCase();
        const loaderVersion = loadder?.loadder_version ? String(loadder.loadder_version) : "";

        ipcRenderer.send('update-rpc', {
            instanceName: instanceName || "Minecraft",
            minecraftVersion: this.getMinecraftVersion(instanceInfo),
            loader: loaderType === 'none'
                ? 'Vanilla'
                : loaderType.charAt(0).toUpperCase() + loaderType.slice(1),
            loaderVersion: loaderType === 'none' ? '' : loaderVersion
        });
    }

    normalizeInstanceRelativePath(input) {
        return String(input || '')
            .replace(/\\/g, '/')
            .replace(/^\/+|\/+$/g, '')
            .trim();
    }

    getPackageMetaUrl(instanceUrl, instanceName) {
        try {
            const parsed = new URL(instanceUrl);
            parsed.pathname = '/luxfirolauncher/files/package.php';
            parsed.search = '';
            parsed.searchParams.set('instance', instanceName || '');
            return parsed.toString();
        } catch (err) {
            return null;
        }
    }

    getLocalInstanceDir(opt) {
        return path.join(opt.path, 'instances', opt.instance);
    }

    getPackageCachePaths(opt) {
        const safeName = String(opt.instance || 'instance')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

        const cacheDir = path.join(opt.path, '.package-cache');
        const zipPath = path.join(cacheDir, `${safeName}.zip`);
        const statePath = path.join(cacheDir, `${safeName}.json`);
        const preserveDir = path.join(cacheDir, `${safeName}-preserve`);

        return { cacheDir, zipPath, statePath, preserveDir };
    }

    async ensureDir(dirPath) {
        await fs.promises.mkdir(dirPath, { recursive: true });
    }

    async fileExists(targetPath) {
        try {
            await fs.promises.access(targetPath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    async pathExists(targetPath) {
        try {
            await fs.promises.access(targetPath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    async sha1File(filePath) {
        return await new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha1');
            const stream = fs.createReadStream(filePath);

            stream.on('data', chunk => hash.update(chunk));
            stream.on('error', reject);
            stream.on('end', () => resolve(hash.digest('hex')));
        });
    }

    async readJsonFile(filePath, fallback = null) {
        try {
            const raw = await fs.promises.readFile(filePath, 'utf8');
            return JSON.parse(raw);
        } catch {
            return fallback;
        }
    }

    async writeJsonFile(filePath, data) {
        await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    }

    async copyRecursive(source, destination) {
        const stats = await fs.promises.stat(source);

        if (stats.isDirectory()) {
            await this.ensureDir(destination);
            const entries = await fs.promises.readdir(source);

            for (const entry of entries) {
                const sourceEntry = path.join(source, entry);
                const destinationEntry = path.join(destination, entry);
                await this.copyRecursive(sourceEntry, destinationEntry);
            }

            return;
        }

        await this.ensureDir(path.dirname(destination));
        await fs.promises.copyFile(source, destination);
    }

    async backupIgnoredEntries(instanceDir, ignoredRules, preserveDir) {
        const normalizedRules = Array.isArray(ignoredRules)
            ? ignoredRules
                .map(rule => this.normalizeInstanceRelativePath(rule))
                .filter(Boolean)
            : [];

        await fs.promises.rm(preserveDir, { recursive: true, force: true });
        await this.ensureDir(preserveDir);

        for (const rule of normalizedRules) {
            const sourcePath = path.join(instanceDir, ...rule.split('/'));
            const targetPath = path.join(preserveDir, ...rule.split('/'));

            if (!(await this.pathExists(sourcePath))) {
                continue;
            }

            await this.copyRecursive(sourcePath, targetPath);
        }
    }

    async restoreIgnoredEntries(instanceDir, ignoredRules, preserveDir) {
        const normalizedRules = Array.isArray(ignoredRules)
            ? ignoredRules
                .map(rule => this.normalizeInstanceRelativePath(rule))
                .filter(Boolean)
            : [];

        for (const rule of normalizedRules) {
            const sourcePath = path.join(preserveDir, ...rule.split('/'));
            const targetPath = path.join(instanceDir, ...rule.split('/'));

            if (!(await this.pathExists(sourcePath))) {
                continue;
            }

            await this.copyRecursive(sourcePath, targetPath);
        }

        await fs.promises.rm(preserveDir, { recursive: true, force: true });
    }

    async downloadFile(url, destination, onProgress = null) {
        const response = await nodeFetch(url, {
            cache: 'no-store'
        });

        if (!response.ok || !response.body) {
            throw new Error(`No se pudo descargar el paquete (${response.status} ${response.statusText})`);
        }

        await this.ensureDir(path.dirname(destination));

        const total = Number(response.headers.get('content-length')) || 0;
        let downloaded = 0;

        await new Promise((resolve, reject) => {
            const fileStream = fs.createWriteStream(destination);

            response.body.on('data', chunk => {
                downloaded += chunk.length;
                if (onProgress) onProgress(downloaded, total);
            });

            response.body.on('error', reject);
            fileStream.on('error', reject);
            fileStream.on('finish', resolve);

            response.body.pipe(fileStream);
        });
    }

    async syncInstancePackage(options, opt, infoStarting, progressBar) {
        const metaUrl = this.getPackageMetaUrl(options.url, opt.instance);
        if (!metaUrl) {
            throw new Error('No se pudo construir la URL del paquete.');
        }

        console.log('PACKAGE META URL =>', metaUrl);

        if (infoStarting) {
            infoStarting.innerHTML = 'Consultando paquete de la instancia...';
        }

        const metaResponse = await nodeFetch(`${metaUrl}${metaUrl.includes('?') ? '&' : '?'}_=${Date.now()}`, {
            cache: 'no-store'
        });

        console.log('PACKAGE META STATUS =>', metaResponse.status);

        if (!metaResponse.ok) {
            throw new Error(`No se pudo obtener metadata del paquete (${metaResponse.status})`);
        }

        const meta = await metaResponse.json();
        console.log('PACKAGE META JSON =>', meta);

        const packageInfo = meta?.package;

        if (!packageInfo?.url || !packageInfo?.hash) {
            throw new Error('La metadata del paquete es inválida.');
        }

        const instanceDir = this.getLocalInstanceDir(opt);
        const { cacheDir, zipPath, statePath, preserveDir } = this.getPackageCachePaths(opt);

        await this.ensureDir(cacheDir);
        await this.ensureDir(instanceDir);

        const previousState = await this.readJsonFile(statePath, {});
        const installedHash = previousState?.package_hash || null;

        if (installedHash === packageInfo.hash) {
            if (infoStarting) {
                infoStarting.innerHTML = 'Paquete ya actualizado. Verificando archivos...';
            }

            if (progressBar) {
                progressBar.style.display = '';
                progressBar.max = 100;
                progressBar.value = 100;
            }

            return false;
        }

        if (infoStarting) {
            infoStarting.innerHTML = 'Descargando paquete de la instancia...';
        }

        if (await this.fileExists(zipPath)) {
            try {
                await fs.promises.unlink(zipPath);
            } catch {}
        }

        await this.downloadFile(packageInfo.url, zipPath, (downloaded, total) => {
            const percent = total > 0 ? Math.min(Math.max((downloaded / total) * 100, 0), 100) : 0;
            const downloadedMB = (downloaded / 1024 / 1024).toFixed(2);
            const totalMB = total > 0 ? (total / 1024 / 1024).toFixed(2) : '0.00';

            if (infoStarting) {
                infoStarting.innerHTML = `Descargando paquete ${percent.toFixed(0)}% · ${downloadedMB} MB / ${totalMB} MB`;
            }

            if (progressBar) {
                progressBar.style.display = '';
                progressBar.max = 100;
                progressBar.value = percent;
            }

            ipcRenderer.send('main-window-progress', {
                progress: downloaded,
                size: total > 0 ? total : 1
            });
        });

        if (infoStarting) {
            infoStarting.innerHTML = 'Verificando paquete descargado...';
        }

        const zipHash = await this.sha1File(zipPath);
        if (zipHash !== packageInfo.hash) {
            throw new Error('El hash del paquete no coincide con el del servidor.');
        }

        if (infoStarting) {
            infoStarting.innerHTML = 'Respaldando archivos ignorados...';
        }

        await this.backupIgnoredEntries(instanceDir, opt.ignored || [], preserveDir);

        if (infoStarting) {
            infoStarting.innerHTML = 'Extrayendo paquete de la instancia...';
        }

        await fs.promises.rm(instanceDir, { recursive: true, force: true });
        await this.ensureDir(instanceDir);

        await extract(zipPath, { dir: instanceDir });

        if (infoStarting) {
            infoStarting.innerHTML = 'Restaurando archivos ignorados...';
        }

        await this.restoreIgnoredEntries(instanceDir, opt.ignored || [], preserveDir);

        await this.writeJsonFile(statePath, {
            instance: opt.instance,
            package_hash: packageInfo.hash,
            updated_at: packageInfo.updated_at || null,
            package_url: packageInfo.url
        });

        if (infoStarting) {
            infoStarting.innerHTML = 'Paquete aplicado. Verificando archivos finales...';
        }

        if (progressBar) {
            progressBar.style.display = '';
            progressBar.max = 100;
            progressBar.value = 100;
        }

        return true;
    }

    async init(config) {
        this.config = config;
        this.db = new database();

        this.lockViewportScroll();
        this.syncSidebarState('home');

        let configClient = await this.db.readData('configClient');

        if (!configClient || Object.keys(configClient).length === 0) {
            console.log("Creando configClient por primera vez");

            await this.db.createData('configClient', {
                account_selected: null,
                instance_selct: null,
                launcher_config: {
                    closeLauncher: "close-launcher",
                    download_multi: true,
                    intelEnabledMac: false
                },
                java_config: {
                    java_path: null,
                    java_memory: {
                        min: 2,
                        max: 4
                    }
                },
                game_config: {
                    screen_size: {
                        width: 854,
                        height: 480
                    }
                }
            });
        }

        this.initNavigation();
        this.initTooltips();
        this.updateLauncherMeta();

        await this.instancesSelect();

        const settingsButtons = document.querySelectorAll('.settings-btn');
        settingsButtons.forEach(btn => {
            btn.addEventListener('click', () => this.changePanelSafely('settings'));
        });

        const openFolderBtn = document.getElementById('open-folder');
        if (openFolderBtn) {
            openFolderBtn.addEventListener('click', async () => {
                const launcherPath = `${await appdata()}/${process.platform == 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`}/instances`;
                shell.openPath(launcherPath);
            });
        }

        const playerHead = document.querySelector(".player-head");
        const accountChip = document.getElementById("account-chip");

        const openAccountsPanel = () => {
            this.changePanelSafely('settings');

            setTimeout(() => {
                let btn = document.getElementById("account");
                if (btn) btn.click();
            }, 150);
        };

        if (playerHead) {
            playerHead.addEventListener("click", (e) => {
                e.stopPropagation();
                openAccountsPanel();
            });
        }

        if (accountChip) {
            accountChip.addEventListener("click", () => {
                openAccountsPanel();
            });
        }

        await this.refreshAccountUI();

        document.addEventListener('account:selected', async (e) => {
            const account = e.detail?.account;

            if (account) {
                await this.refreshAccountUI(account);
            } else {
                await this.refreshAccountUI();
            }
        });

        let configClientFinal = await this.db.readData('configClient');
        let instancia = configClientFinal.instance_selct || "cobblemon";
        let tipoInstancia = this.getInstanceType(instancia) || "cobblemon";

        await this.loadNewsAndTikTok(tipoInstancia);

        document.addEventListener('instance:selected', async (e) => {
            const instance = e.detail?.instance;
            if (!instance) return;

            const instanceName = instance.name || "";

            if (instance.status) {
                setStatus(instance.status);
            }

            this.updateSelectedInstanceUI(instanceName, instance);
            this.updateDiscordRPC(instanceName, instance);

            const instanceType = this.getInstanceType(instanceName);
            setBackgroundAnimated(undefined, undefined, instanceType);

            await this.loadNewsAndTikTok(instanceType || "cobblemon");
        });
    }

    initNavigation() {
        document.querySelectorAll('#nav-home').forEach(btn => {
            btn.addEventListener('click', () => {
                this.changePanelSafely('home');
            });
        });

        document.querySelectorAll('#nav-instances').forEach(btn => {
            btn.addEventListener('click', () => {
                this.changePanelSafely('instances');
            });
        });

        document.querySelectorAll('#nav-settings').forEach(btn => {
            btn.addEventListener('click', () => {
                this.changePanelSafely('settings');
            });
        });

        document.querySelectorAll('#nav-exit').forEach(btn => {
            btn.addEventListener('click', () => {
                ipcRenderer.send('force-exit');
            });
        });

        const studioLogo = document.getElementById('studio-logo');
        if (studioLogo) {
            studioLogo.addEventListener('click', () => {
                this.changePanelSafely('home');
            });
        }
    }

    setActiveSidebarButton(targetBtn) {
        const targetId = targetBtn?.id;

        if (targetId === 'nav-home') {
            this.syncSidebarState('home');
            return;
        }

        if (targetId === 'nav-instances') {
            this.syncSidebarState('instances');
            return;
        }

        if (targetId === 'nav-settings') {
            this.syncSidebarState('settings');
        }
    }

    initTooltips() {
        const oldTooltip = document.querySelector('.tooltip');
        if (oldTooltip) oldTooltip.remove();

        const tooltip = document.createElement('div');
        tooltip.classList.add('tooltip');
        document.body.appendChild(tooltip);

        function showTooltip(e) {
            const text = e.currentTarget.dataset.tooltip;
            if (!text) return;

            tooltip.innerText = text;
            tooltip.style.opacity = "1";

            tooltip.style.left = "0px";
            tooltip.style.top = "0px";

            const rect = e.currentTarget.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();

            let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
            let top = rect.top - tooltipRect.height - 8;

            if (left < 4) left = 4;

            if (left + tooltipRect.width > window.innerWidth - 4) {
                left = window.innerWidth - tooltipRect.width - 4;
            }

            if (top < 4) {
                top = rect.bottom + 8;
            }

            tooltip.style.left = left + "px";
            tooltip.style.top = top + "px";
            tooltip.style.transform = "translateY(0)";
        }

        function hideTooltip() {
            tooltip.style.opacity = "0";
            tooltip.style.transform = "translateY(-4px)";
        }

        document.querySelectorAll('[data-tooltip]').forEach(el => {
            el.addEventListener('mouseenter', showTooltip);
            el.addEventListener('mouseleave', hideTooltip);
            el.addEventListener('mousemove', showTooltip);
        });
    }

    updateLauncherMeta() {
        const launcherName = document.getElementById('bottom-launcher-name');
        const launcherVersion = document.getElementById('bottom-launcher-version');
        const launcherExtra = document.getElementById('bottom-launcher-extra');
        const subtitle = document.getElementById('selected-instance-subtitle');

        const studioLabel = this.getStudioLabel();

        if (launcherName) {
            launcherName.textContent = studioLabel;
        }

        if (launcherVersion) {
            launcherVersion.textContent = `v${pkg?.version || "1.0.0"}`;
        }

        if (launcherExtra) {
            launcherExtra.textContent = this.config?.author || "Created by ImNotRuso";
        }

        if (subtitle) {
            subtitle.textContent = studioLabel;
        }
    }

    async refreshAccountUI(accountFromEvent = null) {
        try {
            const configClient = await this.db.readData('configClient');
            const accountId = configClient?.account_selected;

            const usernameEl = document.getElementById('account-username');
            const stateEl = document.getElementById('account-state');
            const accountDot = document.querySelector('.account-chip-dot');
            const playerName = document.querySelector('.player-name');
            const playerType = document.querySelector('.player-type');

            let account = accountFromEvent;

            if (!account) {
                if (!accountId) {
                    if (usernameEl) usernameEl.textContent = 'Invitado';
                    if (stateEl) stateEl.textContent = 'Sin sesión activa';
                    if (playerName) playerName.textContent = 'Cuenta seleccionada';
                    if (playerType) playerType.textContent = 'No Premium';
                    if (accountDot) accountDot.style.background = '#b7cad8';
                    if (accountDot) accountDot.style.boxShadow = '0 0 12px rgba(183, 202, 216, 0.55)';
                    await this.updatePlayerHead({
                        ID: null,
                        name: 'Cuenta seleccionada',
                        offline: true,
                        uuid: null
                    });
                    return;
                }

                account = await this.db.readData('accounts', accountId);
            }

            if (!account) {
                if (usernameEl) usernameEl.textContent = 'Cuenta inválida';
                if (stateEl) stateEl.textContent = 'Sin sesión activa';
                if (playerName) playerName.textContent = 'Cuenta seleccionada';
                if (playerType) playerType.textContent = 'No Premium';
                if (accountDot) accountDot.style.background = '#ffcf8d';
                if (accountDot) accountDot.style.boxShadow = '0 0 12px rgba(255, 207, 141, 0.55)';
                await this.updatePlayerHead({
                    ID: null,
                    name: 'Cuenta seleccionada',
                    offline: true,
                    uuid: null
                });
                return;
            }

            const visibleName = account.name || account.username || 'Jugador';
            const accountType = String(account.meta?.type || '').trim().toLowerCase();
            const isXbox = accountType === 'xbox';
            const isMojang = accountType === 'mojang';
            const isOffline = account.offline === true;

            if (usernameEl) {
                usernameEl.textContent = visibleName;
            }

            if (stateEl) {
                if (isOffline || isMojang) {
                    stateEl.textContent = 'Sesión activa · No Premium';
                } else if (isXbox) {
                    stateEl.textContent = 'Sesión activa · Premium';
                } else if (account.meta?.type) {
                    stateEl.textContent = `Sesión activa · ${account.meta.type}`;
                } else {
                    stateEl.textContent = 'Sesión activa';
                }
            }

            if (playerName) {
                playerName.textContent = visibleName;
            }

            if (playerType) {
                if (isOffline || isMojang) {
                    playerType.textContent = 'No Premium';
                } else if (isXbox) {
                    playerType.textContent = 'Premium';
                } else if (account.meta?.type) {
                    playerType.textContent = account.meta.type;
                } else {
                    playerType.textContent = 'Cuenta seleccionada';
                }
            }

            if (accountDot) {
                accountDot.style.background = '#6de1a9';
                accountDot.style.boxShadow = '0 0 12px rgba(109, 225, 169, 0.7)';
            }

            await this.updatePlayerHead(account);

        } catch (err) {
            console.error('Error cargando cuenta en home:', err);
        }
    }

    updateSelectedInstanceUI(instanceName = "", instanceInfo = null) {
        const realName = instanceName || "Minecraft";
        const version = this.getMinecraftVersion(instanceInfo);
        const loader = this.getLoaderLabel(instanceInfo);
        const description = this.getInstanceDescription(realName, instanceInfo);
        const subtitleText = this.getStudioLabel();

        const topbarVersion = document.getElementById('topbar-instance-version');
        const topbarLoader = document.getElementById('topbar-instance-loader');

        const heroTitle = document.getElementById('selected-instance-title');
        const heroSubtitle = document.getElementById('selected-instance-subtitle');
        const heroVersion = document.getElementById('selected-instance-version');
        const heroLoader = document.getElementById('selected-instance-loader');
        const heroDescription = document.getElementById('selected-instance-description');

        const compatName = document.querySelector('.server-status-name');
        const compatText = document.querySelector('.server-status-text');

        if (topbarVersion) topbarVersion.textContent = version;
        if (topbarLoader) topbarLoader.textContent = loader;

        if (heroTitle) heroTitle.textContent = realName;
        if (heroSubtitle) heroSubtitle.textContent = subtitleText;
        if (heroVersion) heroVersion.textContent = `Versión ${version}`;
        if (heroLoader) heroLoader.textContent = loader;
        if (heroDescription) heroDescription.innerHTML = description;

        if (compatName) compatName.textContent = realName;
        if (compatText) compatText.textContent = `${loader} • ${version}`;
    }

    async instancesSelect() {
        let configClient = await this.db.readData('configClient');
        let instancesList = await config.getInstanceList();
        let instanceSelect = configClient.instance_selct;

        let playBTN = document.querySelector('.play-instance');

        if (instanceSelect) {
            let instanceType = this.getInstanceType(instanceSelect);
            let instanceInfo = instancesList.find(i => i.name === instanceSelect);

            if (instanceInfo) {
                setStatus(instanceInfo.status);
                this.updateSelectedInstanceUI(instanceSelect, instanceInfo);
                this.updateDiscordRPC(instanceSelect, instanceInfo);
            } else {
                this.updateSelectedInstanceUI(instanceSelect, null);
                this.updateDiscordRPC(instanceSelect, null);
            }

            setBackgroundAnimated(undefined, undefined, instanceType);
        } else if (instancesList?.length > 0) {
            const firstInstance = instancesList[0];
            this.updateSelectedInstanceUI(firstInstance.name, firstInstance);
            this.updateDiscordRPC(firstInstance.name, firstInstance);
        }

        if (playBTN) {
            playBTN.onclick = () => {
                this.startGame();
            };
        }
    }

    async startGame() {
        let launch = new Launch();

        let configClient = await this.db.readData('configClient');
        console.log("CONFIG CLIENT =>", configClient);

        let instance = await config.getInstanceList();

        console.log("ACCOUNT_SELECTED =>", configClient.account_selected);

        let authenticator = await this.db.readData('accounts', configClient.account_selected);
        console.log("AUTH OBJECT =>", authenticator);

        if (authenticator && authenticator.meta?.type === 'Xbox') {
            console.log("Refrescando sesión Microsoft antes de iniciar...");

            try {
                let refreshed = await new Microsoft(this.config.client_id).refresh(authenticator);

                if (refreshed.error) {
                    throw new Error("Refresh inválido");
                }

                refreshed.ID = authenticator.ID;

                await this.db.updateData('accounts', refreshed, authenticator.ID);

                authenticator = refreshed;

                console.log("Sesión refrescada correctamente ✅");
                await this.refreshAccountUI(authenticator);

            } catch (err) {
                console.log("Error refrescando sesión:", err);

                let pop = new popup();
                pop.openPopup({
                    title: 'Sesión expirada',
                    content: 'Tu sesión expiró. Inicia sesión nuevamente.',
                    color: 'red',
                    options: true
                });

                changePanel('login');
                return;
            }
        }

        if (!configClient.account_selected) {
            let pop = new popup();
            pop.openPopup({
                title: 'Cuenta no seleccionada',
                content: 'Debes iniciar sesión con una cuenta premium para jugar.',
                color: 'red',
                options: true
            });
            changePanel('login');
            return;
        }

        if (!authenticator) {
            let pop = new popup();
            pop.openPopup({
                title: 'Cuenta inválida',
                content: 'La cuenta seleccionada no existe. Inicia sesión nuevamente.',
                color: 'red',
                options: true
            });
            changePanel('login');
            return;
        }

        if (
            !authenticator.access_token ||
            !authenticator.client_token ||
            !authenticator.uuid ||
            !authenticator.name
        ) {
            let pop = new popup();
            pop.openPopup({
                title: 'Sesión expirada',
                content: 'Tu sesión premium expiró. Inicia sesión nuevamente.',
                color: 'red',
                options: true
            });
            changePanel('login');
            return;
        }

        if (authenticator.offline === true) {
            let pop = new popup();
            pop.openPopup({
                title: 'Cuenta no premium',
                content: 'Esta instancia requiere una cuenta premium.',
                color: 'red',
                options: true
            });
            return;
        }

        let options = instance.find(i => i.name == configClient.instance_selct);

        if (!options) {
            let pop = new popup();
            pop.openPopup({
                title: 'Instancia no encontrada',
                content: 'No se encontró la instancia seleccionada.',
                color: 'red',
                options: true
            });
            return;
        }

        let playInstanceBTN = document.querySelector('.play-instance');
        let infoStartingBOX = document.querySelector('.info-starting-game');
        let infoStarting = document.querySelector(".info-starting-game-text");
        let progressBar = document.querySelector('.progress-bar');

        let opt = {
            url: options.url,
            authenticator: authenticator,
            timeout: 120000,
            path: `${await appdata()}/${process.platform == 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`}`,
            instance: options.name,
            version: options.loadder.minecraft_version,
            detached: configClient.launcher_config.closeLauncher == "close-all" ? false : true,
            downloadFileMultiple: configClient.launcher_config.download_multi,
            intelEnabledMac: configClient.launcher_config.intelEnabledMac,

            loader: {
                type: options.loadder.loadder_type,
                build: options.loadder.loadder_version,
                enable: options.loadder.loadder_type == 'none' ? false : true
            },

            verify: options.verify,
            ignored: Array.isArray(options.ignored) ? [...options.ignored] : [],
            java: {
                path: configClient.java_config.java_path
            },

            screen: {
                width: configClient.game_config.screen_size.width,
                height: configClient.game_config.screen_size.height
            },

            memory: {
                min: `${configClient.java_config.java_memory.min * 1024}M`,
                max: `${configClient.java_config.java_memory.max * 1024}M`
            }
        };

        ipcRenderer.send('minecraft-launch');

        console.log('INSTANCIA SELECCIONADA =>', options);
        console.log('JAVA PATH =>', configClient.java_config.java_path);
        console.log('MC VERSION =>', options?.loadder?.minecraft_version);
        console.log('LOADER TYPE =>', options?.loadder?.loadder_type);
        console.log('LOADER VERSION =>', options?.loadder?.loadder_version);
        console.log('FULL OPT =>', opt);

        if (playInstanceBTN) playInstanceBTN.style.display = "none";
        if (infoStartingBOX) infoStartingBOX.style.display = "flex";
        if (progressBar) {
            progressBar.style.display = "";
            progressBar.value = 0;
            progressBar.max = 100;
        }
        if (infoStarting) infoStarting.innerHTML = `Preparando descarga...`;

        try {
            await this.syncInstancePackage(options, opt, infoStarting, progressBar);
        } catch (packageError) {
            console.error('Package sync fallback =>', packageError);
            console.error('Package sync fallback message =>', packageError?.message);

            if (infoStarting) {
                infoStarting.innerHTML = 'El paquete falló. Usando descarga clásica...';
            }

            if (progressBar) {
                progressBar.style.display = '';
                progressBar.value = 0;
                progressBar.max = 100;
            }
        }

        launch.on('progress', (downloaded, total) => {
            const safeDownloaded = Number(downloaded) || 0;
            const safeTotal = Number(total) || 0;

            const percent = safeTotal > 0 ? (safeDownloaded / safeTotal) * 100 : 0;
            const clean = Math.min(Math.max(percent, 0), 100);

            const downloadedMB = (safeDownloaded / 1024 / 1024).toFixed(2);
            const totalMB = safeTotal > 0 ? (safeTotal / 1024 / 1024).toFixed(2) : '0.00';

            if (infoStarting) {
                infoStarting.innerHTML = `Descargando ${clean.toFixed(0)}% · ${downloadedMB} MB / ${totalMB} MB`;
            }

            if (progressBar) {
                progressBar.value = clean;
            }

            ipcRenderer.send('main-window-progress', {
                progress: safeDownloaded,
                size: safeTotal > 0 ? safeTotal : 1
            });
        });

        launch.on('extract', file => {
            if (infoStarting) {
                infoStarting.innerHTML = `Verificando ${file}`;
            }
        });

        launch.on('patch', () => {
            ipcRenderer.send('main-window-progress-reset');
            if (infoStarting) {
                infoStarting.innerHTML = `Configurando el juego...`;
            }
        });

        launch.on('data', (e) => {
            if (progressBar) {
                progressBar.style.display = "none";
            }

            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-hide");
            }

            new logger('Minecraft', '#36b030');

            ipcRenderer.send('main-window-progress-reset');
            if (infoStarting) {
                infoStarting.innerHTML = `Ejecutando...`;
            }

            console.log(e);
        });

        launch.on('debug', (e) => {
            console.log('[DEBUG]', e);
        });

        launch.on('close', () => {
            ipcRenderer.send('force-exit');
        });

        launch.on('error', err => {
            console.error('Launch error raw =>', err);
            console.error('Instancia actual =>', options);
            console.error('Launch opt =>', opt);

            const message =
                err?.error ||
                err?.message ||
                err?.stack ||
                (typeof err === 'string' ? err : null) ||
                'La instancia no pudo iniciarse. Revisa Forge, Java y la configuración de la instancia.';

            let popupError = new popup();
            popupError.openPopup({
                title: 'Error',
                content: message,
                color: 'red',
                options: true
            });

            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-show");
            }

            ipcRenderer.send('main-window-progress-reset');

            if (infoStartingBOX) infoStartingBOX.style.display = "none";
            if (playInstanceBTN) playInstanceBTN.style.display = "flex";
            if (progressBar) progressBar.value = 0;
            if (infoStarting) infoStarting.innerHTML = `Verificación`;

            new logger(pkg.name, '#7289da');
        });

        try {
            launch.Launch(opt);
        } catch (err) {
            console.error('Launch throw =>', err);
        }
    }

    async loadNewsAndTikTok(instanceType = "cobblemon") {
        try {
            const response = await fetch(`https://pokearena.wstr.fr/api_novedades?instancia=${instanceType}`);
            await response.json();
        } catch (err) {
            console.error("Error cargando novedades:", err);
        }
    }

    getdate(e) {
        let date = new Date(e);
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        let day = date.getDate();
        let allMonth = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return { year: year, month: allMonth[month - 1], day: day };
    }

    async updatePlayerHead(account) {
        const playerHeadList = document.querySelectorAll('.player-head');
        const playerCardHeadImg = document.querySelector('.player-card-head-img');

        const DEFAULT_HEAD = 'https://mc-heads.net/avatar/Steve/64';
        const cacheBuster = `?t=${Date.now()}`;

        let skinUrl = DEFAULT_HEAD + cacheBuster;

        if (account?.offline === true) {
            skinUrl = DEFAULT_HEAD + cacheBuster;
        } else if (account?.uuid) {
            skinUrl = `https://mc-heads.net/avatar/${account.uuid}/64${cacheBuster}`;
        } else if (account?.name) {
            skinUrl = `https://mc-heads.net/avatar/${encodeURIComponent(account.name)}/64${cacheBuster}`;
        }

        playerHeadList.forEach(playerHead => {
            playerHead.style.backgroundImage = `url("${skinUrl}")`;
            playerHead.style.backgroundSize = 'cover';
            playerHead.style.backgroundPosition = 'center';
            playerHead.style.backgroundRepeat = 'no-repeat';
        });

        if (playerCardHeadImg) {
            playerCardHeadImg.onerror = () => {
                if (account?.name) {
                    playerCardHeadImg.onerror = () => {
                        playerCardHeadImg.src = DEFAULT_HEAD + cacheBuster;
                    };
                    playerCardHeadImg.src = `https://minotar.net/helm/${encodeURIComponent(account.name)}/64?t=${Date.now()}`;
                } else {
                    playerCardHeadImg.src = DEFAULT_HEAD + cacheBuster;
                }
            };

            playerCardHeadImg.src = skinUrl;
        }
    }
}

export default Home;