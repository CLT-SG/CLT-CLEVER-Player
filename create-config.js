const fs = require('fs').promises
const path = require('path')
const os = require('os')
const homedir = os.homedir()
const logdir = path.normalize(homedir + '/clever-console/logs')
const {
    app,
    dialog,
    screen
} = require('electron')
const isReachable = require('is-reachable')
const macaddress = require('macaddress')
const Crypto = require('crypto')

const now = new Date()
const date = require('date-and-time')
const datelog = date.format(now, 'YYYY-MM-DD')
var log = require('electron-log')
log.transports.file.file = logdir + '/' + datelog + '.log'

class CreateConfig {
    static async createConfigFile(ipAddress, appDir, ex) {
        log.warn(ex);
        const configFilePath = `${appDir}/config.js`;
        const configFileContent = CreateConfig.generateConfigContent(ipAddress);

        try {
            await fs.writeFile(configFilePath, configFileContent, 'utf-8');
            CreateConfig.showSuccessDialog(configFilePath, 'created');
        } catch (error) {
            log.warn(`Error writing file: ${error}`);
        }
    }

    static async checkVarExistingConfigFile(appDir) {
        const configFilePath = `${appDir}/config.js`;

        try {
            const configFileContent = await fs.readFile(configFilePath, 'utf-8');

            const variableOrder = this.variableOrder()
            const missingVariables = variableOrder.filter(variable => !configFileContent.includes(variable));

            if (missingVariables.length > 0) {
                // Some variables are missing
                console.warn('Missing variables:', missingVariables);
                return false;
            } else {
                // All variables are present
                console.log('All variables are present in the file.');
                return true;
            }
        } catch (error) {
            log.warn(`Error reading file: ${error}`);
            return false;
        }
    }

    static async updateSpecificVarOnlyConfigFile(appDir, varArgs) {
        const configFilePath = path.join(appDir, 'config.js');

        try {
            let configFileContent = await fs.readFile(configFilePath, 'utf-8');

            // Edit the hostname and serialkey variables
            configFileContent = configFileContent.replace(/var hostserver = '.*?';/, `var hostserver = '${varArgs.hostaddress}';`);
            configFileContent = configFileContent.replace(/var tempid = '.*?';/, `var tempid = '${varArgs.tempid}';`);
            configFileContent = configFileContent.replace(/var ctrltype = '.*?';/, `var ctrltype = '${varArgs.ctrltype}';`);
            configFileContent = configFileContent.replace(/var serialkey = '.*?';/, `var serialkey = '${varArgs.serialkey}';`);

            // Write the updated content back to the file
            await fs.writeFile(configFilePath, configFileContent, 'utf-8');

            CreateConfig.showSuccessDialog(configFilePath, 'modify');
        } catch (error) {
            log.warn(`Error reading/writing file: ${error}`);
        }
    }

    static async updateExistingConfigFile(ipAddress, appDir) {
        const configFilePath = `${appDir}/config.js`;

        try {
            let configFileContent = await fs.readFile(configFilePath, 'utf-8');
            const configFileContent1 = CreateConfig.generateConfigContent(ipAddress);

            const variableOrder = this.variableOrder()

            let updatedContent = configFileContent;

            const areAllVariablesPresent = variableOrder.every(variable => configFileContent.includes(variable));

            if (!areAllVariablesPresent) {
                variableOrder.forEach(variable => {
                    if (!configFileContent.includes(variable)) {
                        const insertIndex = configFileContent1.indexOf(variable);
                        const endIndex = configFileContent1.indexOf('; // Controller type', insertIndex);
                        updatedContent =
                            `${updatedContent.slice(0, insertIndex)}${configFileContent1.slice(insertIndex, endIndex + 1)}${updatedContent.slice(insertIndex)}`;
                    }
                });
            }

            await fs.writeFile(configFilePath, updatedContent, 'utf-8');
            CreateConfig.showSuccessDialog(configFilePath, 'updated');
        } catch (error) {
            log.warn(`Error reading/writing file: ${error}`);
        }
    }

    static variableOrder() {
        return [
            'var hostserver',
            'var controllerport',
            'var cleverwebport',
            'var mediaserverport',
            'var screenserverport',
            'var screenapiport',
            'var tempid',
            'var serialkey',
            'var ctrltype',
        ];
    }

    static generateConfigContent(ipAddress) {
        return `
        var hostserver = '${ipAddress}'; // IP or Hostname Hosted
        var controllerport = '80'; // Clever Controller Port Number
        var cleverwebport = '9100'; // Clever Web Hosting Port Number
        var mediaserverport = '9200'; // Media Server Services Port Number
        var screenserverport = '9300'; // Screen Cast Web Hosting Services Port Number
        var screenapiport = '9301'; // Screen Cast Socket API Services Port Number
        var tempid = '1'; // insert template id
        var serialkey = '1d74f3eda4dd9d1065a6216c84c27d67301779b76996dc867f4403d48f9ad91e'; // Serial key
        var ctrltype = 'console'; // Controller type
        /*=======================================================================================================
        DO NOT MODIFY ANYTHING BELOW THIS SECTION. IT MAY CORRUPTED THIS APPLICATION
        ========================================================================================================*/
        module.exports.hostserver = hostserver;
        module.exports.controller = \`\${hostserver}:\${controllerport}\`;
        module.exports.cleverweb = \`\${hostserver}:\${cleverwebport}\`;
        module.exports.mediaserver = \`\${hostserver}:\${mediaserverport}\`;
        module.exports.screenserver = \`\${hostserver}:\${screenserverport}\`;
        module.exports.screenapi = \`\${hostserver}:\${screenapiport}\`;
        module.exports.remotedesktop = \`\${hostserver}:9400\`;
        module.exports.controllerport1 = controllerport;
        module.exports.cleverwebport1 = cleverwebport;
        module.exports.mediaserverport1 = mediaserverport;
        module.exports.screenserverport1 = screenserverport;
        module.exports.screenapiport1 = screenapiport;
        module.exports.timeout = 10000;
        module.exports.tempid = tempid;
        module.exports.serialkey = serialkey;
        module.exports.ctrltype = ctrltype;
      `;
    }

    static showSuccessDialog(configFilePath, msg) {
        log.info('Config file updated.');

        const options = {
            type: 'info',
            buttons: ['Ok'],
            defaultId: 2,
            title: 'Setup and configuration',
            message: `Config file has been ${msg}.`,
            detail: `Please change hostserver at this location ${configFilePath}\r\n\r\n\r\nCopyright © 2000-${date.format(new Date(), 'YYYY')} by Closed-loop Technology Pte Ltd. All rights reserved\r\nwww.closed-loop.biz`,
        };

        dialog.showMessageBox(null, options).then((data) => {
            if (data.response === 0) {
                if (msg == 'created') {
                    app.exit();
                    app.relaunch();
                }
            }
        });
    }

    static getConfigPath(appdir) {
        return path.join(appdir, 'config.js');
    }

    static readConfig(appdir) {
        const configPath = this.getConfigPath(appdir);
        try {
            // Clear the require cache to ensure we get the latest file
            delete require.cache[require.resolve(configPath)];
            return require(configPath);
        } catch (error) {
            console.error('Error reading config file:', error);
            return null;
        }
    }

    static async checkSerial(appdir, {
        mainWin,
        serverWin
    }) {
        const config = this.readConfig(appdir);
        if (!config) {
            console.error('Failed to load configuration. Check the config file.');
            return;
        }
        await isReachable('http://' + config.controller, {
            timeout: 10000
        }).then((status) => {
            macaddress.one(function (err, mac) {
                const secret = 'Clt@2022';
                const hash = Crypto.createHash('sha256', secret).update(mac).digest('hex');
                if (config.serialkey == hash) {
                    if (status == true) {
                        if (mainWin) {
                            if (config.ctrltype == 'videowall') mainWin.loadURL('http://' + config.controller + '/preview/' + config.tempid + '/videowall')
                            if (config.ctrltype == 'console' && serverWin) {
				mainWin.loadURL('http://' + config.controller + '/preview/' + config.tempid + '/console')
                                serverWin.show()
                                serverWin.setBounds({
                                    x: 0,
                                    y: 0,
                                    width: screen.getPrimaryDisplay().workArea.width,
                                    height: screen.getPrimaryDisplay().workArea.height
                                })
                                serverWin.loadURL('http://' + config.controller)
                                serverWin.blur()
                            }
                            mainWin.setBounds({
                                x: 0,
                                y: 0,
                                width: screen.getPrimaryDisplay().workArea.width,
                                height: screen.getPrimaryDisplay().workArea.height
                            })
                            mainWin.focus()
                        }
                        log.info('Server https://' + config.controller + '/preview/' + config.tempid + ' is online')
                    } else {
                        mainWin.loadURL("file://" + __dirname + "/src/offline.html")
                        log.warn('Server https://' + config.cleverweb + ' is offline')
                    }
                } else {
                    mainWin.loadURL("file://" + __dirname + "/src/activate.html")
                }
            });
        });
    }
}

module.exports = CreateConfig;