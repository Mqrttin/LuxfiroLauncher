/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { ipcRenderer } = require('electron')
const { Status } = require('minecraft-java-core')
const pkg = require('../package.json');

import config from './utils/config.js';
import database from './utils/database.js';
import logger from './utils/logger.js';
import popup from './utils/popup.js';
import { skin2D } from './utils/skin.js';
import slider from './utils/slider.js';

/* ================================================= */
/* FONDO GLOBAL DEL LAUNCHER */
/* ================================================= */

const DEFAULT_BACKGROUND = "./assets/images/fondo.png";

/**
 * Aplica el fondo del launcher
 * @param {string} theme
 * @param {string} urlFondo
 */
async function setBackground(theme, urlFondo) {
    if (typeof theme == 'undefined') {
        let databaseLauncher = new database();
        let configClient = await databaseLauncher.readData('configClient');
        theme = configClient?.launcher_config?.theme || "auto";
        theme = await ipcRenderer.invoke('is-dark-theme', theme).then(res => res);
    }

    const body = document.body;

    body.className = theme ? 'dark global' : 'light global';

    const background = `linear-gradient(#00000080, #00000080), url(${urlFondo || DEFAULT_BACKGROUND})`;

    body.style.backgroundImage = background;
    body.style.backgroundSize = 'cover';
    body.style.backgroundPosition = 'center';
    body.style.backgroundRepeat = 'no-repeat';
}

/**
 * Cambia el fondo con animación fade
 * @param {string} theme
 * @param {string} urlFondo
 */
async function setBackgroundAnimated(theme, urlFondo) {
    const body = document.body;

    if (!body.style.transition) {
        body.style.transition = 'opacity 0.5s ease-in-out';
    }

    body.style.opacity = 0;

    setTimeout(async () => {
        await setBackground(theme, urlFondo);
        body.style.opacity = 1;
    }, 500);
}

setBackground();

/* ================================================= */
/* CAMBIO DE PANEL */
/* ================================================= */

async function changePanel(id) {
    const panels = document.querySelectorAll('.panel');
    panels.forEach(panel => panel.classList.remove('active'));

    const targetPanel = document.querySelector(`.panel.${id}`);
    if (targetPanel) targetPanel.classList.add('active');

    void document.body.offsetHeight;
}

/* ================================================= */
/* APPDATA */
/* ================================================= */

async function appdata() {
    return await ipcRenderer.invoke('appData').then(path => path);
}

/* ================================================= */
/* CUENTAS */
/* ================================================= */

async function addAccount(data) {
    let skin = false;

    if (data?.profile?.skins[0]?.base64) {
        skin = await new skin2D().creatHeadTexture(data.profile.skins[0].base64);
    }

    let div = document.createElement("div");
    div.classList.add("account");
    div.id = data.ID;

    div.innerHTML = `
        <div class="profile-image" ${skin ? 'style="background-image: url(' + skin + ');"' : ''}></div>
        <div class="profile-infos">
            <div class="profile-pseudo">${data.name}</div>
            <div class="profile-uuid">${data.uuid}</div>
        </div>
        <div class="delete-profile" id="${data.ID}">
            <div class="icon-account-delete delete-profile-icon"></div>
        </div>
    `;

    return document.querySelector('.accounts-list').appendChild(div);
}

async function accountSelect(data) {
    let account = document.getElementById(`${data.ID}`);
    let activeAccount = document.querySelector('.account-select');

    if (activeAccount) activeAccount.classList.toggle('account-select');
    account.classList.add('account-select');

    if (data?.profile?.skins[0]?.base64) {
        headplayer(data.profile.skins[0].base64);
    }
}

async function headplayer(skinBase64) {
    let skin = await new skin2D().creatHeadTexture(skinBase64);
    document.querySelector(".player-head").style.backgroundImage = `url(${skin})`;
}

/* ================================================= */
/* ESTADO DEL SERVIDOR */
/* ================================================= */

async function setStatus(opt) {
    let nameServerElement = document.querySelector('.server-status-name');
    let statusServerElement = document.querySelector('.server-status-text');
    let playersOnline = document.querySelector('.status-player-count .player-count');

    if (!opt) {
        statusServerElement.classList.add('red');
        statusServerElement.innerHTML = `Apagado`;
        document.querySelector('.status-player-count').classList.add('red');
        playersOnline.innerHTML = '0';
        return;
    }

    let { ip, port, nameServer } = opt;
    nameServerElement.innerHTML = nameServer;

    let status = new Status(ip, port);
    let statusServer = await status.getStatus().then(res => res).catch(err => err);

    if (!statusServer.error) {
        statusServerElement.classList.remove('red');
        document.querySelector('.status-player-count').classList.remove('red');
        statusServerElement.innerHTML = `En línea`;
        playersOnline.innerHTML = statusServer.playersConnect;
    } else {
        statusServerElement.classList.add('red');
        statusServerElement.innerHTML = `Apagado`;
        document.querySelector('.status-player-count').classList.add('red');
        playersOnline.innerHTML = '0';
    }
}

/* ================================================= */
/* EXPORTS */
/* ================================================= */

export {
    appdata as appdata,
    changePanel as changePanel,
    config as config,
    database as database,
    logger as logger,
    popup as popup,
    setBackground as setBackground,
    setBackgroundAnimated as setBackgroundAnimated,
    skin2D as skin2D,
    addAccount as addAccount,
    accountSelect as accountSelect,
    slider as Slider,
    pkg as pkg,
    setStatus as setStatus
};