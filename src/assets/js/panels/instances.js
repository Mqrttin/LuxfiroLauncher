/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
import { config, database, setStatus, setBackgroundAnimated, changePanel, popup } from '../utils.js'

class Instances {
    static id = "instances";

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

    syncSidebarState(panelId = 'instances') {
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

    async init(configJS) {
        this.config = configJS
        this.db = new database()

        this.instances = []
        this.visibleInstances = []
        this.selectedInstanceName = null
        this.selectedAccount = null
        this.selectedAccountName = ''

        this.rowsElement = document.getElementById('instances-rows')
        this.loadingElement = document.getElementById('instances-loading')
        this.emptyElement = document.getElementById('instances-empty')
        this.backButton = document.getElementById('back-home')

        this.lockViewportScroll()

        this.initSidebar()
        this.initTooltips()
        this.bindAccountSelectionListener()

        if (this.backButton) {
            this.backButton.onclick = () => {
                this.changePanelSafely('home')
            }
        }

        try {
            await this.loadSelectedInstance()
            await this.loadSelectedAccount()
            await this.loadInstances()
        } catch (err) {
            console.error('[Instances] Error al iniciar panel:', err)
            this.showEmpty()
        }
    }

    initSidebar() {
        document.querySelectorAll('#nav-home').forEach(btn => {
            btn.addEventListener('click', () => {
                this.changePanelSafely('home')
            })
        })

        document.querySelectorAll('#nav-instances').forEach(btn => {
            btn.addEventListener('click', () => {
                this.changePanelSafely('instances')
            })
        })

        document.querySelectorAll('#nav-settings').forEach(btn => {
            btn.addEventListener('click', () => {
                this.changePanelSafely('settings')
            })
        })

        const sidebarBackHome = document.getElementById('sidebar-back-home')
        if (sidebarBackHome) {
            sidebarBackHome.addEventListener('click', () => {
                this.changePanelSafely('home')
            })
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
        const oldTooltip = document.querySelector('.tooltip')
        if (oldTooltip) oldTooltip.remove()

        const tooltip = document.createElement('div')
        tooltip.classList.add('tooltip')
        document.body.appendChild(tooltip)

        function showTooltip(e) {
            const text = e.currentTarget.dataset.tooltip
            if (!text) return

            tooltip.innerText = text
            tooltip.style.opacity = "1"
            tooltip.style.left = "0px"
            tooltip.style.top = "0px"

            const rect = e.currentTarget.getBoundingClientRect()
            const tooltipRect = tooltip.getBoundingClientRect()

            let left = rect.left + rect.width / 2 - tooltipRect.width / 2
            let top = rect.top - tooltipRect.height - 8

            if (left < 4) left = 4

            if (left + tooltipRect.width > window.innerWidth - 4) {
                left = window.innerWidth - tooltipRect.width - 4
            }

            if (top < 4) {
                top = rect.bottom + 8
            }

            tooltip.style.left = left + "px"
            tooltip.style.top = top + "px"
            tooltip.style.transform = "translateY(0)"
        }

        function hideTooltip() {
            tooltip.style.opacity = "0"
            tooltip.style.transform = "translateY(-4px)"
        }

        document.querySelectorAll('[data-tooltip]').forEach(el => {
            el.addEventListener('mouseenter', showTooltip)
            el.addEventListener('mouseleave', hideTooltip)
            el.addEventListener('mousemove', showTooltip)
        })
    }

    bindAccountSelectionListener() {
        document.addEventListener('account:selected', async (e) => {
        try {
            const accountFromEvent = e?.detail?.account || null

            if (accountFromEvent) {
                this.selectedAccount = accountFromEvent
                this.selectedAccountName = String(
                    accountFromEvent?.name ||
                    accountFromEvent?.username ||
                    ''
                ).trim()
            } else {
                await this.loadSelectedAccount()
            }

            console.log('[Instances] Cuenta actualizada por evento:', this.selectedAccountName || '(sin cuenta)')

            await this.loadSelectedInstance()
            await this.loadInstances()
        } catch (err) {
            console.error('[Instances] Error refrescando instancias al cambiar de cuenta:', err)
        }
    })
}

    async loadSelectedInstance() {
        try {
            const configClient = await this.db.readData('configClient')
            this.selectedInstanceName = configClient?.instance_selct || null
        } catch (err) {
            this.selectedInstanceName = null
        }
    }

    async loadSelectedAccount() {
        try {
            const configClient = await this.db.readData('configClient')
            const accountId = configClient?.account_selected

            console.log('[Instances] account_selected ID =>', accountId)

            if (!accountId) {
                this.selectedAccount = null
                this.selectedAccountName = ''
                return
            }

            const account = await this.db.readData('accounts', accountId)

            console.log('[Instances] Cuenta completa =>', account)

            this.selectedAccount = account
            this.selectedAccountName = String(account?.name || account?.username || '').trim()

            console.log('[Instances] Cuenta seleccionada detectada:', this.selectedAccountName || '(sin cuenta)')
        } catch (err) {
            console.error('[Instances] Error leyendo cuenta seleccionada:', err)
            this.selectedAccount = null
            this.selectedAccountName = ''
        }
    }

    normalizeWhitelist(list) {
        if (!Array.isArray(list)) return []

        return list
            .map(item => String(item || '').trim().toLowerCase())
            .filter(Boolean)
    }

    isInstanceAllowed(instance, selectedAccount = null) {
        if (!instance) return false

        const whitelistActive = Boolean(instance?.whitelistActive)
        if (!whitelistActive) return true

        const whitelist = this.normalizeWhitelist(instance?.whitelist)
        if (!whitelist.length) return false

        const username = String(
            selectedAccount?.name ||
            selectedAccount?.username ||
            this.selectedAccountName ||
            ''
        ).trim().toLowerCase()

        console.log('[Instances] Validando instancia =>', {
            instance: instance?.name,
            whitelistActive,
            whitelist,
            detectedUsername: username
        })

        if (!username) return false

        return whitelist.includes(username)
    }

    filterInstancesByWhitelist(instancesList = []) {
        if (!Array.isArray(instancesList)) return []
        return instancesList.filter(instance => this.isInstanceAllowed(instance, this.selectedAccount))
    }

    async clearSelectedInstanceIfNotAllowed() {
        if (!this.selectedInstanceName) return

        const selected = this.instances.find(instance => instance?.name === this.selectedInstanceName)
        if (!selected) return

        if (this.isInstanceAllowed(selected, this.selectedAccount)) return

        try {
            const configClient = await this.db.readData('configClient')
            configClient.instance_selct = null
            await this.db.updateData('configClient', configClient)
        } catch (err) {
            console.error('[Instances] No se pudo limpiar la instancia seleccionada bloqueada:', err)
        }

        console.warn('[Instances] La instancia seleccionada estaba bloqueada para la cuenta actual:', this.selectedInstanceName)
        this.selectedInstanceName = null
    }

    async loadInstances() {
        this.showLoading()

        let instancesList = []
        try {
            instancesList = await config.getInstanceList()
            console.log('INSTANCIAS WEBHOST =>', instancesList.map(i => i.name))
        } catch (err) {
            console.error('[Instances] Error obteniendo instancias:', err)
            instancesList = []
        }

        if (!Array.isArray(instancesList) || !instancesList.length) {
            this.showEmpty()
            return
        }

        this.instances = instancesList.sort((a, b) => {
            const nameA = a?.name || ''
            const nameB = b?.name || ''
            return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' })
        })

        await this.clearSelectedInstanceIfNotAllowed()

        this.visibleInstances = this.filterInstancesByWhitelist(this.instances)

        console.log('[Instances] Instancias visibles para la cuenta actual =>', this.visibleInstances.map(i => i.name))

        if (!this.visibleInstances.length) {
            this.showEmpty()
            return
        }

        this.render()
    }

    chunkIntoRows(items, size = 4) {
        const rows = []

        for (let i = 0; i < items.length; i += size) {
            rows.push(items.slice(i, i + size))
        }

        return rows
    }

    getMinecraftVersion(instance) {
        return instance?.loadder?.minecraft_version || '--'
    }

    getLoaderLabel(instance) {
        const loader = instance?.loadder
        if (!loader) return 'Sin loader'

        const type = String(loader.loadder_type || 'none').toLowerCase()
        const version = loader.loadder_version ? String(loader.loadder_version) : ''

        if (type === 'none') return 'Vanilla'
        if (!version) return type.charAt(0).toUpperCase() + type.slice(1)

        return `${type.charAt(0).toUpperCase() + type.slice(1)} ${version}`
    }

    isSelected(instance) {
        return instance?.name && instance.name === this.selectedInstanceName
    }

    getInstanceType(instanceName = '') {
        const name = String(instanceName).toLowerCase()

        if (name.includes('cobblemon')) return 'cobblemon'
        if (name.includes('pixelmon')) return 'pixelmon'

        return null
    }

    createCard(instance) {
        const card = document.createElement('button')
        const selected = this.isSelected(instance)

        card.type = 'button'
        card.className = `instance-card${selected ? ' selected' : ''}`
        card.setAttribute('data-instance-name', instance?.name || '')
        card.setAttribute('aria-label', `Seleccionar instancia ${instance?.name || 'Instancia'}`)

        const imageHtml = instance?.image
            ? `<img class="instance-card-image" src="${this.escapeAttribute(instance.image)}" alt="${this.escapeAttribute(instance.name || 'Instancia')}">`
            : `<div class="instance-card-image-fallback">🖼️</div>`

        const minecraftVersion = this.getMinecraftVersion(instance)
        const loaderLabel = this.getLoaderLabel(instance)

        card.innerHTML = `
            <div class="instance-card-image-wrapper">
                ${imageHtml}
                <div class="instance-card-overlay"></div>
            </div>

            <div class="instance-card-body">
                <h2 class="instance-card-title">${this.escapeHtml(instance?.name || 'Instancia')}</h2>

                <div class="instance-card-meta">
                    <div class="instance-card-badge instance-card-badge-version">
                        <span class="instance-card-badge-label">Minecraft</span>
                        <span class="instance-card-badge-value">${this.escapeHtml(minecraftVersion)}</span>
                    </div>

                    <div class="instance-card-badge instance-card-badge-loader">
                        <span class="instance-card-badge-label">Loader</span>
                        <span class="instance-card-badge-value">${this.escapeHtml(loaderLabel)}</span>
                    </div>
                </div>

                <div class="instance-card-footer">
                    <span class="instance-card-selected-label">
                        ${selected ? 'Seleccionada' : ''}
                    </span>
                </div>
            </div>
        `

        card.addEventListener('click', () => this.selectInstance(instance))

        return card
    }

    async selectInstance(instance) {
        try {
            if (!instance?.name) return

            await this.loadSelectedAccount()

            if (!this.isInstanceAllowed(instance, this.selectedAccount)) {
                console.warn('[Instances] Acceso bloqueado a la instancia:', instance.name)

                if (popup && typeof popup === 'function') {
                    const modal = new popup()
                    if (typeof modal.openPopup === 'function') {
                        modal.openPopup({
                            title: 'Instancia bloqueada',
                            content: `La instancia <b>${this.escapeHtml(instance.name)}</b> no está disponible para la cuenta seleccionada.`
                        })
                    } else {
                        alert(`La instancia "${instance.name}" no está disponible para la cuenta seleccionada.`)
                    }
                } else {
                    alert(`La instancia "${instance.name}" no está disponible para la cuenta seleccionada.`)
                }

                return
            }

            const configClient = await this.db.readData('configClient')
            configClient.instance_selct = instance.name
            await this.db.updateData('configClient', configClient)

            this.selectedInstanceName = instance.name

            if (instance.status) {
                setStatus(instance.status)
            }

            const type = this.getInstanceType(instance.name)
            setBackgroundAnimated(undefined, undefined, type)

            this.render()

            document.dispatchEvent(new CustomEvent('instance:selected', {
                detail: { instance }
            }))

            console.log('[Instances] Instancia seleccionada:', instance.name)

            this.changePanelSafely('home')
        } catch (err) {
            console.error('[Instances] Error al seleccionar instancia:', err)
        }
    }

    render() {
        if (!this.rowsElement) return

        this.rowsElement.innerHTML = ''

        if (!Array.isArray(this.visibleInstances) || !this.visibleInstances.length) {
            this.showEmpty()
            return
        }

        for (const instance of this.visibleInstances) {
            this.rowsElement.appendChild(this.createCard(instance))
        }

        this.showRows()
    }

    showLoading() {
        if (this.loadingElement) this.loadingElement.style.display = 'flex'
        if (this.emptyElement) this.emptyElement.style.display = 'none'
        if (this.rowsElement) this.rowsElement.style.display = 'none'
    }

    showEmpty() {
        if (this.loadingElement) this.loadingElement.style.display = 'none'
        if (this.emptyElement) this.emptyElement.style.display = 'flex'
        if (this.rowsElement) this.rowsElement.style.display = 'none'
    }

    showRows() {
        if (this.loadingElement) this.loadingElement.style.display = 'none'
        if (this.emptyElement) this.emptyElement.style.display = 'none'
        if (this.rowsElement) this.rowsElement.style.display = 'grid'
    }

    escapeHtml(value = '') {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;')
    }

    escapeAttribute(value = '') {
        return this.escapeHtml(value)
    }
}

export default Instances;