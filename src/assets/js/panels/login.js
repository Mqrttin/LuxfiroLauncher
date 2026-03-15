/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
const { AZauth, Mojang } = require('minecraft-java-core');
const { ipcRenderer } = require('electron');

import { popup, database, changePanel, accountSelect, addAccount, config, setStatus } from '../utils.js';

class Login {
    static id = "login";

    async init(config) {
        this.config = config;
        this.db = new database();

        // Determinar tipo de login
        if (typeof this.config.online === 'boolean') {
            this.config.online ? this.getMicrosoft() : this.getCrack();
        } else if (typeof this.config.online === 'string' && this.config.online.match(/^(http|https):\/\/[^ "]+$/)) {
            this.getAZauth();
        }

        // Botón "Cancelar" general
        document.querySelector('.cancel-home').addEventListener('click', () => {
            document.querySelector('.cancel-home').style.display = 'none';
            changePanel('settings');
        });

        // Botón para crear No-Premium
        document.querySelector('.connect-button-offline').addEventListener('click', () => {
            this.getCrack();
        });
    }

    // ---------------- PREMIUM ----------------
    async getMicrosoft() {
        console.log('Conectando por Microsoft...');
        const popupLogin = new popup();
        const loginHome = document.querySelector('.login-home');
        const microsoftBtn = document.querySelector('.connect-home');
        loginHome.style.display = 'block';

        microsoftBtn.onclick = () => {
            popupLogin.openPopup({ title: 'Iniciando sesión', content: 'Cargando...', color: 'var(--color)' });

            ipcRenderer.invoke('Microsoft-window', this.config.client_id)
                .then(async account_connect => {
                    if (!account_connect || account_connect === 'cancel') {
                        popupLogin.closePopup();
                        return;
                    }
                    await this.saveData(account_connect);
                    popupLogin.closePopup();
                })
                .catch(err => popupLogin.openPopup({ title: 'Error', content: err, options: true }));
        };
    }

    async getAZauth() {
        console.log('Conectando por AZauth...');
        const AZauthClient = new AZauth(this.config.online);
        const popupLogin = new popup();
        const loginAZauth = document.querySelector('.login-AZauth');
        const loginAZauthA2F = document.querySelector('.login-AZauth-A2F');

        const AZauthEmail = document.querySelector('.email-AZauth');
        const AZauthPassword = document.querySelector('.password-AZauth');
        const AZauthA2F = document.querySelector('.A2F-AZauth');
        const AZauthConnectBTN = document.querySelector('.connect-AZauth');
        const connectAZauthA2F = document.querySelector('.connect-AZauth-A2F');
        const AZauthCancelA2F = document.querySelector('.cancel-AZauth-A2F');

        loginAZauth.style.display = 'block';

        AZauthConnectBTN.onclick = async () => {
            popupLogin.openPopup({ title: 'Iniciando sesión...', content: 'Cargando...', color: 'var(--color)' });

            if (!AZauthEmail.value || !AZauthPassword.value) {
                popupLogin.openPopup({ title: 'Error', content: 'Por favor, rellene todos los campos.', options: true });
                return;
            }

            let AZauthConnect = await AZauthClient.login(AZauthEmail.value, AZauthPassword.value);

            if (AZauthConnect.error) {
                popupLogin.openPopup({ title: 'Error', content: AZauthConnect.message, options: true });
                return;
            }

            // Manejo 2FA
            if (AZauthConnect.A2F) {
                loginAZauthA2F.style.display = 'block';
                loginAZauth.style.display = 'none';
                popupLogin.closePopup();

                AZauthCancelA2F.onclick = () => {
                    loginAZauthA2F.style.display = 'none';
                    loginAZauth.style.display = 'block';
                };

                connectAZauthA2F.onclick = async () => {
                    popupLogin.openPopup({ title: 'Iniciando sesión...', content: 'Cargando...', color: 'var(--color)' });

                    if (!AZauthA2F.value) {
                        popupLogin.openPopup({ title: 'Error', content: 'Ingrese el código 2FA.', options: true });
                        return;
                    }

                    AZauthConnect = await AZauthClient.login(AZauthEmail.value, AZauthPassword.value, AZauthA2F.value);

                    if (AZauthConnect.error) {
                        popupLogin.openPopup({ title: 'Error', content: AZauthConnect.message, options: true });
                        return;
                    }

                    await this.saveData(AZauthConnect);
                    popupLogin.closePopup();
                };
            } else {
                await this.saveData(AZauthConnect);
                popupLogin.closePopup();
            }
        };
    }

    // ---------------- NO-PREMIUM ----------------
    async getCrack() {
        console.log('Conectando No-Premium...');
        const popupLogin = new popup();
        const loginOffline = document.querySelector('.login-offline');
        const loginHome = document.querySelector('.login-home');
        const emailOffline = document.querySelector('.email-offline');
        const connectOffline = document.querySelector('.connect-offline');
        const cancelOffline = document.querySelector('.cancel-offline');

        loginHome.style.display = 'none';
        loginOffline.style.display = 'block';

        connectOffline.onclick = async () => {
            connectOffline.disabled = true;
            popupLogin.openPopup({ title: "Iniciando sesión...", content: "Espere por favor...", color: "var(--color)" });

            try {
                let username = emailOffline.value.trim();
                if (username.length < 3) throw new Error("Tu nick debe ser de al menos 3 caracteres.");
                if (username.match(/ /)) throw new Error("Tu nick no debe contener espacios.");
                if (username.length > 16) username = username.substring(0, 16);

                const MojangConnect = await Mojang.login(username);
                if (MojangConnect.error) throw new Error(MojangConnect.message);

                await this.saveData(MojangConnect);
            } catch (error) {
                popupLogin.openPopup({ title: "Error", content: error.message || "Ocurrió un error al crear la cuenta.", options: true });
            } finally {
                connectOffline.disabled = false;
                popupLogin.closePopup();
            }
        };

        cancelOffline.onclick = () => {
            loginOffline.style.display = 'none';
            loginHome.style.display = 'block';
            popupLogin.closePopup();
        };
    }

    // ---------------- SAVE DATA ----------------
    async saveData(connectionData) {
    const configClient = await this.db.readData('configClient');
    const account = await this.db.createData('accounts', connectionData);
    const instanceSelect = configClient.instance_selct;
    const instancesList = await config.getInstanceList();
    configClient.account_selected = account.ID;

    for (let instance of instancesList) {
        if (instance.whitelistActive) {
            const whitelisted = instance.whitelist.find(w => w === account.name);
            if (!whitelisted && instance.name === instanceSelect) {
                const newInstanceSelect = instancesList.find(i => !i.whitelistActive);
                if (newInstanceSelect) {
                    configClient.instance_selct = newInstanceSelect.name;
                    await setStatus(newInstanceSelect.status);
                }
            }
        }
    }

    await this.db.updateData('configClient', configClient);

    document.dispatchEvent(new CustomEvent('account:selected', {
        detail: { account }
    }));

    await addAccount(account);
    await accountSelect(account);
    changePanel('home');
}
}

export default Login;