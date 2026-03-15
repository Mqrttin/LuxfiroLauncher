/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
import { config, database, logger, changePanel, appdata, setStatus, pkg, popup, setBackgroundAnimated } from '../utils.js'

const { Launch, Microsoft } = require('minecraft-java-core')
const { shell, ipcRenderer } = require('electron')

class Home {
    static id = "home";

    // =================================================
    // EDITA ESTO FÁCILMENTE
    // =================================================
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
        const name = String(instanceName).toLowerCase()

        if (name.includes("cobblemon")) return "cobblemon"
        if (name.includes("pixelmon")) return "pixelmon"

        return null
    }

    getLoaderLabel(instanceInfo = null) {
        const loadder = instanceInfo?.loadder
        if (!loadder) return "Sin loader"

        const type = String(loadder.loadder_type || 'none').toLowerCase()
        const version = loadder.loadder_version ? String(loadder.loadder_version) : ""

        if (type === 'none') return "Vanilla"
        if (!version) return type.charAt(0).toUpperCase() + type.slice(1)

        return `${type.charAt(0).toUpperCase() + type.slice(1)} ${version}`
    }

    getMinecraftVersion(instanceInfo = null) {
        return instanceInfo?.loadder?.minecraft_version || "--"
    }

    getStudioLabel() {
        return this.launcherDisplayName || "Launcher Studio"
    }

    getInstanceDescription(instanceName = "", instanceInfo = null) {
        const mcVersion = this.getMinecraftVersion(instanceInfo)
        const loaderLabel = this.getLoaderLabel(instanceInfo)

        return `Selecciona <strong>JUGAR</strong> para iniciar <strong>${instanceName || 'esta instancia'}</strong> y abrir la configuración del launcher con <strong>${loaderLabel}</strong> sobre <strong>Minecraft ${mcVersion}</strong>.`
    }

    updateDiscordRPC(instanceName = "", instanceInfo = null) {
        const loadder = instanceInfo?.loadder
        const loaderType = String(loadder?.loadder_type || 'none').toLowerCase()
        const loaderVersion = loadder?.loadder_version ? String(loadder.loadder_version) : ""

        ipcRenderer.send('update-rpc', {
            instanceName: instanceName || "Minecraft",
            minecraftVersion: this.getMinecraftVersion(instanceInfo),
            loader: loaderType === 'none'
                ? 'Vanilla'
                : loaderType.charAt(0).toUpperCase() + loaderType.slice(1),
            loaderVersion: loaderType === 'none' ? '' : loaderVersion
        })
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
            const instance = e.detail?.instance
            if (!instance) return

            const instanceName = instance.name || ""

            if (instance.status) {
                setStatus(instance.status)
            }

            this.updateSelectedInstanceUI(instanceName, instance)
            this.updateDiscordRPC(instanceName, instance)

            const instanceType = this.getInstanceType(instanceName)
            setBackgroundAnimated(undefined, undefined, instanceType)

            await this.loadNewsAndTikTok(instanceType || "cobblemon")
        })
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
        const realName = instanceName || "Minecraft"
        const version = this.getMinecraftVersion(instanceInfo)
        const loader = this.getLoaderLabel(instanceInfo)
        const description = this.getInstanceDescription(realName, instanceInfo)
        const subtitleText = this.getStudioLabel()

        const topbarVersion = document.getElementById('topbar-instance-version')
        const topbarLoader = document.getElementById('topbar-instance-loader')

        const heroTitle = document.getElementById('selected-instance-title')
        const heroSubtitle = document.getElementById('selected-instance-subtitle')
        const heroVersion = document.getElementById('selected-instance-version')
        const heroLoader = document.getElementById('selected-instance-loader')
        const heroDescription = document.getElementById('selected-instance-description')

        const compatName = document.querySelector('.server-status-name')
        const compatText = document.querySelector('.server-status-text')

        if (topbarVersion) topbarVersion.textContent = version
        if (topbarLoader) topbarLoader.textContent = loader

        if (heroTitle) heroTitle.textContent = realName
        if (heroSubtitle) heroSubtitle.textContent = subtitleText
        if (heroVersion) heroVersion.textContent = `Versión ${version}`
        if (heroLoader) heroLoader.textContent = loader
        if (heroDescription) heroDescription.innerHTML = description

        if (compatName) compatName.textContent = realName
        if (compatText) compatText.textContent = `${loader} • ${version}`
    }

    async instancesSelect() {
        let configClient = await this.db.readData('configClient')
        let instancesList = await config.getInstanceList()
        let instanceSelect = configClient.instance_selct

        let playBTN = document.querySelector('.play-instance')

        if (instanceSelect) {
            let instanceType = this.getInstanceType(instanceSelect)
            let instanceInfo = instancesList.find(i => i.name === instanceSelect)

            if (instanceInfo) {
                setStatus(instanceInfo.status)
                this.updateSelectedInstanceUI(instanceSelect, instanceInfo)
                this.updateDiscordRPC(instanceSelect, instanceInfo)
            } else {
                this.updateSelectedInstanceUI(instanceSelect, null)
                this.updateDiscordRPC(instanceSelect, null)
            }

            setBackgroundAnimated(undefined, undefined, instanceType)
        } else if (instancesList?.length > 0) {
            const firstInstance = instancesList[0]
            this.updateSelectedInstanceUI(firstInstance.name, firstInstance)
            this.updateDiscordRPC(firstInstance.name, firstInstance)
        }

        if (playBTN) {
            playBTN.onclick = () => {
                this.startGame()
            }
        }
    }

    async startGame() {
        const fs = require('fs');
        const path = require('path');

        let launch = new Launch()

        let configClient = await this.db.readData('configClient')
        console.log("CONFIG CLIENT =>", configClient)

        let instance = await config.getInstanceList()

        console.log("ACCOUNT_SELECTED =>", configClient.account_selected)

        let authenticator = await this.db.readData('accounts', configClient.account_selected)
        console.log("AUTH OBJECT =>", authenticator)

        if (authenticator && authenticator.meta?.type === 'Xbox') {
            console.log("Refrescando sesión Microsoft antes de iniciar...")

            try {
                let refreshed = await new Microsoft(this.config.client_id).refresh(authenticator)

                if (refreshed.error) {
                    throw new Error("Refresh inválido")
                }

                refreshed.ID = authenticator.ID

                await this.db.updateData('accounts', refreshed, authenticator.ID)

                authenticator = refreshed

                console.log("Sesión refrescada correctamente ✅")
                await this.refreshAccountUI(authenticator)

            } catch (err) {
                console.log("Error refrescando sesión:", err)

                let pop = new popup()
                pop.openPopup({
                    title: 'Sesión expirada',
                    content: 'Tu sesión expiró. Inicia sesión nuevamente.',
                    color: 'red',
                    options: true
                })

                changePanel('login')
                return
            }
        }

        if (!configClient.account_selected) {
            let pop = new popup()
            pop.openPopup({
                title: 'Cuenta no seleccionada',
                content: 'Debes iniciar sesión con una cuenta premium para jugar.',
                color: 'red',
                options: true
            })
            changePanel('login')
            return
        }

        if (!authenticator) {
            let pop = new popup()
            pop.openPopup({
                title: 'Cuenta inválida',
                content: 'La cuenta seleccionada no existe. Inicia sesión nuevamente.',
                color: 'red',
                options: true
            })
            changePanel('login')
            return
        }

        if (
            !authenticator.access_token ||
            !authenticator.client_token ||
            !authenticator.uuid ||
            !authenticator.name
        ) {
            let pop = new popup()
            pop.openPopup({
                title: 'Sesión expirada',
                content: 'Tu sesión premium expiró. Inicia sesión nuevamente.',
                color: 'red',
                options: true
            })
            changePanel('login')
            return
        }

        if (authenticator.offline === true) {
            let pop = new popup()
            pop.openPopup({
                title: 'Cuenta no premium',
                content: 'Esta instancia requiere una cuenta premium.',
                color: 'red',
                options: true
            })
            return
        }

        let options = instance.find(i => i.name == configClient.instance_selct)

        let playInstanceBTN = document.querySelector('.play-instance')
        let infoStartingBOX = document.querySelector('.info-starting-game')
        let infoStarting = document.querySelector(".info-starting-game-text")
        let progressBar = document.querySelector('.progress-bar')

        let opt = {
            url: options.url,
            authenticator: authenticator,
            timeout: 30000,
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
            ignored: [...options.ignored],
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
        }

        ipcRenderer.send('minecraft-launch');

        try {
            const baseDir = path.join(process.env.APPDATA, '.SUH');

            const asmDir = path.join(baseDir, 'libraries', 'org', 'ow2', 'asm', '9.6');
            const asmJar = path.join(baseDir, 'libraries', 'org', 'ow2', 'asm', 'asm-9.6.jar');
            if (fs.existsSync(asmDir)) {
                fs.rmSync(asmDir, { recursive: true, force: true });
                console.log('[Launcher]: Eliminada carpeta vieja ASM 9.6');
            }
            if (fs.existsSync(asmJar)) {
                fs.rmSync(asmJar, { force: true });
                console.log('[Launcher]: Eliminado archivo asm-9.6.jar');
            }

            const versionsDir = path.join(baseDir, 'versions');
            if (fs.existsSync(versionsDir)) {
                const versions = fs.readdirSync(versionsDir).filter(v => {
                    const jsonFile = path.join(versionsDir, v, `${v}.json`);
                    return fs.existsSync(jsonFile);
                });

                for (const version of versions) {
                    const versionPath = path.join(versionsDir, version, `${version}.json`);
                    try {
                        let json = fs.readFileSync(versionPath, 'utf8');
                        if (json.includes('org.ow2.asm:asm:9.6')) {
                            json = json.replace(/,\s*{\s*"downloads"[\s\S]+?"org\.ow2\.asm:asm:9\.6"[\s\S]+?}/, '');
                            fs.writeFileSync(versionPath, json);
                            console.log(`[Launcher]: Eliminada referencia a ASM 9.6 en ${version}.json`);
                        }
                    } catch (err) {
                        console.warn(`[Launcher]: No se pudo editar ${version}.json:`, err);
                    }
                }
            }
        } catch (err) {
            console.warn('[Launcher]: Error al limpiar ASM 9.6 automáticamente:', err);
        }

        launch.Launch(opt);

        console.log("AUTH OBJECT =>", authenticator);
        playInstanceBTN.style.display = "none";
        infoStartingBOX.style.display = "flex";
        progressBar.style.display = "";
        progressBar.value = 0;
        progressBar.max = 100;

        const steps = [
            { text: 'Verificando archivos...', value: 25 },
            { text: 'Preparando librerías...', value: 50 },
            { text: 'Configurando instancia...', value: 75 },
            { text: 'Ejecutando!', value: 100 }
        ];

        let currentStep = 0;
        const prepInterval = setInterval(() => {
            progressBar.value = steps[currentStep].value;
            infoStarting.innerHTML = steps[currentStep].text;
            currentStep++;

            if (currentStep >= steps.length) {
                clearInterval(prepInterval);
            }
        }, 700);

        launch.on('progress', (percent) => {
            clearInterval(prepInterval);
            const clean = Math.min(Math.max(percent, 0), 100);
            infoStarting.innerHTML = `Descargando ${clean.toFixed(0)}%`;
            progressBar.value = clean;
            progressBar.max = 100;
        });

        launch.on('extract', file => {
            infoStarting.innerHTML = `Verificando ${file}`
        });

        launch.on('estimated', (time) => {
            let hours = Math.floor(time / 3600);
            let minutes = Math.floor((time - hours * 3600) / 60);
            let seconds = Math.floor(time - hours * 3600 - minutes * 60);
            console.log(`${hours}h ${minutes}m ${seconds}s`);
        })

        launch.on('speed', (speed) => {
            console.log(`${(speed / 1067008).toFixed(2)} Mb/s`)
        })

        launch.on('patch', patch => {
            console.log(patch);
            ipcRenderer.send('main-window-progress-load')
            infoStarting.innerHTML = `Configurando el juego...`
        });

        launch.on('data', (e) => {
            progressBar.style.display = "none"
            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-hide")
            };
            new logger('Minecraft', '#36b030');
            ipcRenderer.send('main-window-progress-load')
            infoStarting.innerHTML = `Ejecutando...`
            console.log(e);
        })

        launch.on('close', () => {
            ipcRenderer.send('force-exit');
            return;
        });

        launch.on('error', err => {
            let popupError = new popup()
            popupError.openPopup({
                title: 'Error',
                content: err.error,
                color: 'red',
                options: true
            })
            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-show")
            };
            ipcRenderer.send('main-window-progress-reset')
            infoStartingBOX.style.display = "none"
            playInstanceBTN.style.display = "flex"
            infoStarting.innerHTML = `Verificación`
            new logger(pkg.name, '#7289da');
            console.log(err);
        });
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
        let date = new Date(e)
        let year = date.getFullYear()
        let month = date.getMonth() + 1
        let day = date.getDate()
        let allMonth = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        return { year: year, month: allMonth[month - 1], day: day }
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