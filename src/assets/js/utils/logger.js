/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

class Logger {
    constructor(name, color) {
        this.name = name;
        this.color = color;
    }

    log(...args) {
        console.log(`%c[${this.name}]:`, `color: ${this.color};`, ...args);
    }

    info(...args) {
        console.info(`%c[${this.name}]:`, `color: ${this.color};`, ...args);
    }

    warn(...args) {
        console.warn(`%c[${this.name}]:`, `color: ${this.color};`, ...args);
    }

    debug(...args) {
        console.debug(`%c[${this.name}]:`, `color: ${this.color};`, ...args);
    }

    error(...args) {
        console.error(`%c[${this.name}]:`, `color: ${this.color};`, ...args);
    }
}

export default Logger;