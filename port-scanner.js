// PortScanner.js
const net = require('net');
const si = require('systeminformation');

class PortScanner {
    constructor() {
        this.port = 9100;
    }

    async getLocalIpRange() {
        return new Promise(async (resolve, reject) => {
            try {
                const ifaces = await si.networkInterfaces();
                const activeInterface = ifaces.find(
                    (iface) => iface.type === 'wired' && iface.virtual === false && iface.operstate === 'up'
                );

                if (activeInterface) {
                    const parts = activeInterface.ip4.split('.');
                    const startIp = parts.slice(0, 3).join('.') + '.1';
                    const endIp = parts.slice(0, 3).join('.') + '.254';
                    resolve({
                        startIp,
                        endIp
                    });
                } else {
                    reject(new Error('No active wired network interface found.'));
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    async checkPort(ip) {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            socket.setTimeout(200);

            socket.on('connect', () => {
                socket.destroy();
                resolve(ip);
            });

            socket.on('timeout', () => {
                // Handle timeout here
                socket.destroy();
                reject(null);
            });

            socket.on('error', (err) => {
                // Handle other errors
                socket.destroy();
                reject(null);
            });

            socket.connect(this.port, ip);
        });
    }

    async scanIPRange() {
        try {
            const {
                startIp,
                endIp
            } = await this.getLocalIpRange();
            const startArray = startIp.split('.').map(Number);
            const endArray = endIp.split('.').map(Number);

            const allPromises = [];

            // Limiting the number of concurrent connections to 10 (adjust as needed)
            const concurrencyLimit = 10;

            for (let i = startArray[3]; i <= endArray[3] && i <= 254; i += concurrencyLimit) {
                const ipRange = Array.from({
                    length: concurrencyLimit
                }, (_, index) => {
                    const currentIpIndex = i + index;
                    if (currentIpIndex <= 254) {
                        return `${startArray[0]}.${startArray[1]}.${startArray[2]}.${currentIpIndex}`;
                    }
                    return null;
                }).filter(ip => ip !== null);

                const promisesBatch = ipRange.map(currentIp =>
                    this.checkPortPromise(currentIp)
                    .then(() => currentIp)
                    .catch(() => null)
                );

                allPromises.push(Promise.all(promisesBatch));
            }

            const openPorts = await Promise.all(allPromises).then((done) => {
                // Flatten the 2D array and filter out null values
                const flattened = done.flat().filter((ip) => ip !== null);
                return flattened;
            });

            return openPorts;
        } catch (error) {
            console.error(error.message);
            return []; // Return an empty array in case of an error
        }
    }

    checkPortPromise(ip) {
        return new Promise((resolve, reject) => {
            this.checkPort(ip)
                .then(ip => resolve(ip))
                .catch(() => reject(null));
        });
    }
}

module.exports = PortScanner;