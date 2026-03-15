/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { ipcRenderer } = require('electron');

export default class popup {
    constructor() {
        this.popup = document.querySelector('.popup');
        this.popupTitle = document.querySelector('.popup-title');
        this.popupContent = document.querySelector('.popup-content');
        this.popupOptions = document.querySelector('.popup-options');
        this.popupButton = document.querySelector('.popup-button');

        this.handleButtonClick = null;
        this.ensurePopupBaseStyles();
    }

    ensurePopupBaseStyles() {
        if (!this.popup || !this.popupTitle || !this.popupContent || !this.popupOptions || !this.popupButton) return;

        // Overlay general
        Object.assign(this.popup.style, {
            display: 'none',
            position: 'fixed',
            inset: '0',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: 'rgba(5, 10, 20, 0.72)',
            backdropFilter: 'blur(10px)',
            zIndex: '99999',
            opacity: '0',
            transition: 'opacity 0.22s ease'
        });

        // Intentar localizar el contenedor real del popup
        const popupCard =
            this.popupContent?.parentElement ||
            this.popupTitle?.parentElement ||
            this.popupOptions?.parentElement;

        if (popupCard && popupCard !== this.popup) {
            Object.assign(popupCard.style, {
                width: 'min(100%, 440px)',
                maxWidth: '440px',
                minWidth: '320px',
                borderRadius: '22px',
                padding: '28px 24px 22px',
                boxSizing: 'border-box',
                background: 'linear-gradient(180deg, rgba(10, 20, 38, 0.94), rgba(6, 14, 29, 0.96))',
                border: '1px solid rgba(133, 210, 255, 0.16)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.02), 0 24px 50px rgba(0,0,0,0.30), 0 0 30px rgba(111, 192, 255, 0.08)',
                backdropFilter: 'blur(14px)',
                transform: 'translateY(10px) scale(0.985)',
                opacity: '0',
                transition: 'transform 0.22s ease, opacity 0.22s ease, box-shadow 0.22s ease'
            });

            this.popupCard = popupCard;
        } else {
            this.popupCard = null;
        }

        Object.assign(this.popupTitle.style, {
            margin: '0 0 10px 0',
            fontSize: '24px',
            fontWeight: '800',
            letterSpacing: '-0.02em',
            lineHeight: '1.1',
            color: '#eef8ff',
            textAlign: 'center'
        });

        Object.assign(this.popupContent.style, {
            margin: '0',
            fontSize: '14px',
            lineHeight: '1.65',
            color: 'rgba(225, 244, 255, 0.78)',
            textAlign: 'center',
            wordBreak: 'break-word'
        });

        Object.assign(this.popupOptions.style, {
            display: 'none',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            marginTop: '20px'
        });

        Object.assign(this.popupButton.style, {
            minWidth: '140px',
            height: '42px',
            padding: '0 16px',
            border: '1px solid rgba(138, 210, 255, 0.18)',
            borderRadius: '12px',
            background: 'linear-gradient(180deg, rgba(120, 202, 255, 0.18), rgba(65, 145, 212, 0.10))',
            color: '#eef8ff',
            fontWeight: '700',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'transform .18s ease, background .18s ease, border-color .18s ease, box-shadow .18s ease',
            boxShadow: '0 8px 18px rgba(0,0,0,0.14)'
        });

        this.popupButton.onmouseenter = () => {
            this.popupButton.style.transform = 'translateY(-1px)';
            this.popupButton.style.background = 'linear-gradient(180deg, rgba(120, 202, 255, 0.24), rgba(65, 145, 212, 0.14))';
            this.popupButton.style.borderColor = 'rgba(148, 219, 255, 0.30)';
            this.popupButton.style.boxShadow = '0 12px 22px rgba(0,0,0,0.18), 0 0 14px rgba(111, 192, 255, 0.10)';
        };

        this.popupButton.onmouseleave = () => {
            this.popupButton.style.transform = 'translateY(0)';
            this.popupButton.style.background = 'linear-gradient(180deg, rgba(120, 202, 255, 0.18), rgba(65, 145, 212, 0.10))';
            this.popupButton.style.borderColor = 'rgba(138, 210, 255, 0.18)';
            this.popupButton.style.boxShadow = '0 8px 18px rgba(0,0,0,0.14)';
        };
    }

    getPopupColor(color) {
        if (!color) return '#8fd7ff';

        const normalized = String(color).trim().toLowerCase();

        if (normalized === 'red') return '#ff8f8f';
        if (normalized === 'green') return '#7be7b4';
        if (normalized === 'yellow') return '#ffd36f';
        if (normalized === 'orange') return '#ffb36b';
        if (normalized === 'blue') return '#8fd7ff';
        if (normalized === 'var(--color)') return '#8fd7ff';

        return color;
    }

    removeButtonListener() {
        if (this.handleButtonClick) {
            this.popupButton.removeEventListener('click', this.handleButtonClick);
            this.handleButtonClick = null;
        }
    }

    async animateOpen() {
        if (!this.popup) return;

        requestAnimationFrame(() => {
            this.popup.style.opacity = '1';

            if (this.popupCard) {
                this.popupCard.style.opacity = '1';
                this.popupCard.style.transform = 'translateY(0) scale(1)';
            }
        });
    }

    async animateClose() {
        if (!this.popup) return;

        this.popup.style.opacity = '0';

        if (this.popupCard) {
            this.popupCard.style.opacity = '0';
            this.popupCard.style.transform = 'translateY(10px) scale(0.985)';
        }

        await new Promise(resolve => setTimeout(resolve, 180));
    }

    openPopup(info = {}) {
        if (!this.popup || !this.popupTitle || !this.popupContent || !this.popupOptions || !this.popupButton) return;

        this.ensurePopupBaseStyles();
        this.removeButtonListener();

        this.popup.style.display = 'flex';

        if (info.background === false) {
            this.popup.style.background = 'transparent';
            this.popup.style.backdropFilter = 'none';
        } else {
            this.popup.style.background = 'rgba(5, 10, 20, 0.72)';
            this.popup.style.backdropFilter = 'blur(10px)';
        }

        this.popupTitle.innerHTML = info.title || '';
        this.popupContent.style.color = this.getPopupColor(info.color);
        this.popupContent.innerHTML = info.content || '';

        if (info.options) {
            this.popupOptions.style.display = 'flex';
        } else {
            this.popupOptions.style.display = 'none';
        }

        // Ajuste visual según tipo/color
        if (this.popupCard) {
            let glow = 'rgba(111, 192, 255, 0.08)';

            const color = String(info.color || '').toLowerCase();
            if (color === 'red') glow = 'rgba(255, 110, 110, 0.10)';
            if (color === 'green') glow = 'rgba(100, 235, 170, 0.10)';
            if (color === 'yellow' || color === 'orange') glow = 'rgba(255, 190, 90, 0.10)';

            this.popupCard.style.boxShadow =
                `inset 0 0 0 1px rgba(255,255,255,0.02), 0 24px 50px rgba(0,0,0,0.30), 0 0 30px ${glow}`;
        }

        if (this.popupOptions.style.display !== 'none') {
            this.handleButtonClick = async () => {
                if (info.exit) {
                    ipcRenderer.send('main-window-close');
                    ipcRenderer.send('tray-destroy');
                    ipcRenderer.send('app-quit');
                    return;
                }

                await this.closePopup();
            };

            this.popupButton.addEventListener('click', this.handleButtonClick);
        }

        this.animateOpen();
    }

    async closePopup() {
        if (!this.popup) return;

        this.removeButtonListener();

        await this.animateClose();

        this.popup.style.display = 'none';
        this.popupTitle.innerHTML = '';
        this.popupContent.innerHTML = '';
        this.popupContent.style.color = '#8fd7ff';
        this.popupOptions.style.display = 'none';
    }
}