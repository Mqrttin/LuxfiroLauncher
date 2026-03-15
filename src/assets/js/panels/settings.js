/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

import { changePanel, accountSelect, database, Slider, config, setStatus, popup, appdata, setBackground } from '../utils.js'
const { ipcRenderer, shell } = require('electron');
const os = require('os');

class Settings {
    static id = "settings";

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

    syncSidebarState(panelId = 'settings') {
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

    async init(config) {
        this.config = config;
        this.db = new database();

        this.lockViewportScroll();

        this.ramSliderInitialized = false;
        this.ramSliderInstance = null;
        this.accountsObserver = null;

        requestAnimationFrame(() => {
            const settingsContainer = document.querySelector('.settings .container');
        });

        this.initSidebar();
        this.initTooltips();

        this.navBTN();
        this.accounts();
        this.observeAccountsList();
        this.bindAccountSelectionRefresh();
        this.resolution();
        this.launcher();

        await this.syncSelectedAccountCardState();
    }

    initSidebar() {
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

        const settingsBackHome = document.getElementById('settings-back-home');
        const settingsLogoHome = document.getElementById('settings-logo-home');

        if (settingsBackHome) {
            settingsBackHome.addEventListener('click', () => {
                this.changePanelSafely('home');
            });
        }

        if (settingsLogoHome) {
            settingsLogoHome.addEventListener('click', () => {
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

    navBTN() {
        const navBox = document.querySelector('.nav-box');
        if (!navBox) return;

        navBox.addEventListener('click', e => {
            if (!e.target.classList.contains('nav-settings-btn')) return;

            const id = e.target.id;
            const activeSettingsBTN = document.querySelector('.active-settings-BTN');
            const activeContainerSettings = document.querySelector('.active-container-settings');

            activeSettingsBTN?.classList.remove('active-settings-BTN');
            e.target.classList.add('active-settings-BTN');

            activeContainerSettings?.classList.remove('active-container-settings');
            document.querySelector(`#${id}-tab`)?.classList.add('active-container-settings');

            if (id === 'java') {
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        this.ram();
                    }, 30);
                });
            }

            if (id === 'account') {
                requestAnimationFrame(() => {
                    this.syncSelectedAccountCardState();
                });
            }
        });
    }

    bindAccountSelectionRefresh() {
        document.addEventListener('account:selected', async () => {
            await this.syncSelectedAccountCardState();
        });
    }

    observeAccountsList() {
        const accountsList = document.querySelector('.accounts-list');
        if (!accountsList) return;

        if (this.accountsObserver) {
            this.accountsObserver.disconnect();
        }

        this.accountsObserver = new MutationObserver(() => {
            this.syncSelectedAccountCardState();
        });

        this.accountsObserver.observe(accountsList, {
            childList: true,
            subtree: true
        });
    }

    async getSelectedAccountId() {
        try {
            const configClient = await this.db.readData('configClient');
            return configClient?.account_selected || null;
        } catch (err) {
            return null;
        }
    }

    removeAccountSelectedBadges() {
        document.querySelectorAll('.account-selected-badge').forEach(el => el.remove());
        document.querySelectorAll('.account').forEach(card => {
            card.classList.remove('account-selected');
        });
    }

    createSelectedBadge() {
        const badge = document.createElement('div');
        badge.className = 'account-selected-badge';
        badge.innerHTML = `
            <span class="account-selected-dot"></span>
            <span class="account-selected-text">Seleccionada</span>
        `;
        return badge;
    }

    async syncSelectedAccountCardState() {
        const selectedId = await this.getSelectedAccountId();
        const accountsList = document.querySelector('.accounts-list');
        if (!accountsList) return;

        this.removeAccountSelectedBadges();

        if (!selectedId) return;

        const selectedCard = accountsList.querySelector(`.account[id="${selectedId}"]`);
        if (!selectedCard) return;

        selectedCard.classList.add('account-selected');

        let badgeTarget = selectedCard.querySelector('.profile-infos');
        if (!badgeTarget) {
            badgeTarget = selectedCard;
        }

        if (!selectedCard.querySelector('.account-selected-badge')) {
            const badge = this.createSelectedBadge();
            badgeTarget.appendChild(badge);
        }
    }

    accounts() {
        const accountsList = document.querySelector('.accounts-list');
        if (!accountsList) return;

        accountsList.addEventListener('click', async e => {
            let popupAccount = new popup();
            try {
                let target = e.target.closest('.account, .delete-profile');
                if (!target) return;

                let id = target.id;

                if (target.classList.contains('account')) {
                    popupAccount.openPopup({
                        title: 'Iniciando',
                        content: 'Cargando...',
                        color: 'var(--color)'
                    });

                    if (id == 'add') {
                        const cancelHome = document.querySelector('.cancel-home');
                        if (cancelHome) cancelHome.style.display = 'inline';
                        return changePanel('login');
                    }

                    let account = await this.db.readData('accounts', id);
                    let configClient = await this.setInstance(account);
                    await accountSelect(account);
                    configClient.account_selected = account.ID;
                    await this.db.updateData('configClient', configClient);

                    await this.syncSelectedAccountCardState();

                    document.dispatchEvent(new CustomEvent('account:selected', {
                        detail: { account }
                    }));

                    return;
                }

                if (target.classList.contains("delete-profile")) {
                    popupAccount.openPopup({
                        title: 'Confirmar',
                        content: 'Cargando...',
                        color: 'var(--color)'
                    });

                    await this.db.deleteData('accounts', id);
                    let deleteProfile = document.getElementById(`${id}`);
                    let accountListElement = document.querySelector('.accounts-list');
                    if (deleteProfile && accountListElement) {
                        accountListElement.removeChild(deleteProfile);
                    }

                    if (accountListElement && accountListElement.children.length == 1) {
                        await this.syncSelectedAccountCardState();
                        return changePanel('login');
                    }

                    let configClient = await this.db.readData('configClient');

                    if (configClient.account_selected == id) {
                        let allAccounts = await this.db.readAllData('accounts');
                        const newAccount = allAccounts[0];

                        configClient.account_selected = newAccount.ID;
                        await accountSelect(newAccount);

                        let newInstanceSelect = await this.setInstance(newAccount);
                        configClient.instance_selct = newInstanceSelect.instance_selct;

                        await this.db.updateData('configClient', configClient);

                        await this.syncSelectedAccountCardState();

                        document.dispatchEvent(new CustomEvent('account:selected', {
                            detail: { account: newAccount }
                        }));

                        return;
                    }

                    await this.syncSelectedAccountCardState();
                }
            } catch (err) {
                console.error(err);
            } finally {
                popupAccount.closePopup();
            }
        });
    }

    async setInstance(auth) {
        let configClient = await this.db.readData('configClient');
        let instanceSelect = configClient.instance_selct;
        let instancesList = await config.getInstanceList();

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(whitelist => whitelist == auth.name);
                if (whitelist !== auth.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false);
                        configClient.instance_selct = newInstanceSelect.name;
                        await setStatus(newInstanceSelect.status);
                    }
                }
            }
        }
        return configClient;
    }

    async ram() {
        if (this.ramSliderInitialized) return;

        const javaTab = document.querySelector('#java-tab');
        const sliderDiv = document.querySelector(".memory-slider");
        const ramInfoBlock = document.querySelector(".ram-info-block");

        if (!javaTab || !sliderDiv || !ramInfoBlock) return;

        const isVisible = javaTab.classList.contains('active-container-settings');
        if (!isVisible) return;

        let configClient = await this.db.readData('configClient');
        let totalMem = Math.trunc(os.totalmem() / 1073741824 * 10) / 10;
        let freeMem = Math.trunc(os.freemem() / 1073741824 * 10) / 10;

        let ram = configClient?.java_config?.java_memory
            ? {
                ramMin: parseFloat(configClient.java_config.java_memory.min),
                ramMax: parseFloat(configClient.java_config.java_memory.max)
            }
            : { ramMin: 2, ramMax: 4 };

        const sliderMax = Math.max(2, Math.trunc((80 * totalMem) / 100));

        if (ram.ramMin < 1) ram.ramMin = 1;
        if (ram.ramMax < ram.ramMin) ram.ramMax = ram.ramMin;
        if (ram.ramMax > sliderMax) ram.ramMax = sliderMax;
        if (ram.ramMin > sliderMax) ram.ramMin = Math.max(1, sliderMax - 1);

        sliderDiv.setAttribute("min", "1");
        sliderDiv.setAttribute("max", String(sliderMax));
        sliderDiv.setAttribute("step", "1");

        ramInfoBlock.innerHTML = `
            <b>Tienes <span style="color:#8fd7ff">${totalMem}</span> GB de RAM total.</b><br>
            Estás usando desde <span style="color:#8fd7ff">${ram.ramMin}</span> GB hasta <span style="color:#8fd7ff">${ram.ramMax}</span> GB.
        `;

        try {
            this.ramSliderInstance = new Slider(".memory-slider", ram.ramMin, ram.ramMax);
            this.ramSliderInitialized = true;
        } catch (err) {
            console.error('[Settings] Error inicializando slider RAM:', err);
            return;
        }

        this.ramSliderInstance.on("change", async (min, max) => {
            const safeMin = Math.max(1, parseFloat(min));
            const safeMax = Math.max(safeMin, parseFloat(max));

            let config = await this.db.readData('configClient');

            ramInfoBlock.innerHTML = `
                <b>Tienes <span style="color:#8fd7ff">${totalMem}</span> GB de RAM total.</b><br>
                Estás usando desde <span style="color:#8fd7ff">${safeMin}</span> GB hasta <span style="color:#8fd7ff">${safeMax}</span> GB.
            `;

            config.java_config.java_memory = {
                min: safeMin,
                max: safeMax
            };

            await this.db.updateData('configClient', config);
        });
    }

    async resolution() {
        let configClient = await this.db.readData('configClient');
        let resolution = configClient?.game_config?.screen_size || { width: 1920, height: 1080 };

        let width = document.querySelector(".width-size");
        let height = document.querySelector(".height-size");
        let resolutionReset = document.querySelector(".size-reset");

        if (width) width.value = resolution.width;
        if (height) height.value = resolution.height;

        if (width) {
            width.addEventListener("change", async () => {
                let configClient = await this.db.readData('configClient');
                configClient.game_config.screen_size.width = width.value;
                await this.db.updateData('configClient', configClient);
            });
        }

        if (height) {
            height.addEventListener("change", async () => {
                let configClient = await this.db.readData('configClient');
                configClient.game_config.screen_size.height = height.value;
                await this.db.updateData('configClient', configClient);
            });
        }

        if (resolutionReset) {
            resolutionReset.addEventListener("click", async () => {
                let configClient = await this.db.readData('configClient');
                configClient.game_config.screen_size = { width: '854', height: '480' };
                if (width) width.value = '854';
                if (height) height.value = '480';
                await this.db.updateData('configClient', configClient);
            });
        }
    }

    async launcher() {
        let configClient = await this.db.readData('configClient');

        let maxDownloadFiles = configClient?.launcher_config?.download_multi || 100;
        let maxDownloadFilesInput = document.querySelector(".max-files");
        let maxDownloadFilesReset = document.querySelector(".max-files-reset");

        if (maxDownloadFilesInput) maxDownloadFilesInput.value = maxDownloadFiles;

        if (maxDownloadFilesReset) {
            maxDownloadFilesReset.addEventListener("click", async () => {
                let configClient = await this.db.readData('configClient');
                if (maxDownloadFilesInput) maxDownloadFilesInput.value = 100;
                configClient.launcher_config.download_multi = 100;
                await this.db.updateData('configClient', configClient);
            });
        }

        if (maxDownloadFilesInput) {
            maxDownloadFilesInput.value = maxDownloadFiles;

            maxDownloadFilesInput.addEventListener("change", async () => {
                let configClient = await this.db.readData('configClient');
                configClient.launcher_config.download_multi = maxDownloadFilesInput.value;
                await this.db.updateData('configClient', configClient);
            });
        }
    }
}

export default Settings;