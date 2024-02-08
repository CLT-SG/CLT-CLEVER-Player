(async function () {
    const express = require('express')
    const path = require('path')
    const os = require('os')
    const fs = require('fs')
    const cors = require('cors')
    const bodyParser = require('body-parser')
    const si = require('systeminformation')
    const shutdown = require('electron-shutdown-command')
    const log = require('electron-log')

    const homedir = os.homedir()
    const appdir = path.normalize(homedir + '/clever-console')
    const logdir = path.join(appdir, 'logs')
    const config = require(appdir + '/config')
    const datelog = new Date()
    const cpuInfoInterval = 10000 // Interval for updating CPU info in milliseconds
    const port = 9000

    let mainWindow
    var desktopCapturer
    var screen

    log.transports.file.file = path.join(logdir, `${datelog.toISOString().split('T')[0]}.log`)

    // Function to set the mainWindow reference
    function setMainWindow(mainWin, desktopCapturerInstance, screenInstance) {
        mainWindow = mainWin
        desktopCapturer = desktopCapturerInstance
        screen = screenInstance
    }

    const app = express()

    app.use(bodyParser.urlencoded({
        extended: false
    }))
    app.use(bodyParser.json())

    app.use(cors({
        credentials: true,
        origin: true
    }))

    app.get('/api/restartapp', (req, res) => {
        res.end('restarted')
    })

    app.get('/api/reboot', (req, res) => {
        res.end('rebooted')
        shutdown.reboot({
            force: true,
            timerseconds: 0,
            quitapp: true
        })
    })

    app.get('/api/shutdown', (req, res) => {
        res.end('shutdown')
        shutdown.shutdown({
            force: true,
            timerseconds: 0,
            quitapp: true
        })
    })

    app.get('/api/deviceinfo', async (req, res) => {
        try {
            const data = await si.cpu()
            const cpuInfo = JSON.stringify(data)
            log.info('CPU Info:', cpuInfo)
            res.end(cpuInfo)
        } catch (error) {
            log.warn('CPU Info Error:', error)
            res.status(500).end('Internal Server Error')
        }
    })

    app.post('/api/pushFromConsole', async (req, res) => {
        var templateData = req.body.templateData
        try { //update template id in the config file
            if (config.ctrltype == 'console') return res.status(200).end('Not allowed')
            if (config.ctrltype == 'videowall') {
                await mainWindow.webContents
                    .executeJavaScript(`window.localStorage.setItem("templateData", ${JSON.stringify(templateData)});`, true)
                    .then(result => {
                        console.log(result)
                    })
                await mainWindow.loadURL('http://' + config.controller + '/preview/' + templateData.id + '/videowall' + '/true') // load template url from server to vw
            }
            log.info('PUSH CONSOLE : Pushed from console preset updated successfully.')
            return res.status(200).end('Push to console ok') //success loaded
        } catch (error) {
            console.error('Error:', error);
            res.status(500).send('Internal Server Error');
        }
    })

    app.post('/api/push', async (req, res) => {
        var template_id = req.body.id
        try { //update template id in the config file
            searchAndReplace(appdir + '/config.js', 'var tempid', `var tempid  = '${template_id}'; // insert template id`)
                .then(async () => {
                    if (config.ctrltype == 'videowall') await mainWindow.loadURL('http://' + config.controller + '/preview/' + template_id + '/videowall') // load template url from server to vw
                    if (config.ctrltype == 'console') await mainWindow.loadURL('http://' + config.controller + '/preview/login') // load template url from server to console
                    log.info('PUSH CONSOLE : Template id updated successfully.')
                    return res.status(200).end('Push to console ok') //success loaded
                })
        } catch (error) {
            console.error('Error:', error);
            res.status(500).send('Internal Server Error');
        }
    })

    app.get('/api/getScreenshot', async (req, res) => {
        try { //update template id in the config file
            const image = await takeScreenshot()
            return res.status(200).end(image)
        } catch (error) {
            console.error('Error:', error);
            return res.status(500).send('Internal Server Error');
        }
    })

    app.get('/img/screenshot.png', async (req, res) => {
        try {
            // Replace the following line with the logic to generate your dynamic image
            const dynamicImageData = await takeScreenshot(); // Assuming takeScreenshot returns base64 image
            // Remove the "data:image/png;base64," prefix if it's included in your base64 data
            const base64WithoutPrefix = dynamicImageData.replace(/^data:image\/png;base64,/, '');

            // Send the appropriate content type in the response headers
            res.setHeader('Content-Type', 'image/png');

            // Send the binary image data directly in the response
            res.status(200).send(Buffer.from(base64WithoutPrefix, 'base64'));
        } catch (error) {
            console.error('Error generating dynamic image:', error);
            res.status(500).send('Internal Server Error');
        }
    })

    app.listen(port, () => {
        log.info(`Express server listening on port ${port}`)
        console.log(`Express server listening on port ${port}`)
    })

    setInterval(async () => {
        try {
            const data = await si.cpu()
            const cpuInfo = JSON.stringify(data)
            return cpuInfo
        } catch (error) {
            log.warn('CPU Info Update Error:', error)
        }
    }, cpuInfoInterval)


    module.exports = {
        app,
        setMainWindow
    }

    function searchAndReplace(filePath, searchLine, replacementLine) {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, 'utf-8', (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Split the content into lines
                const lines = data.split('\n');

                // Search for the line to replace and modify the content
                const modifiedLines = lines.map((line) => {
                    if (line.includes(searchLine)) {
                        // Replace the line
                        return replacementLine;
                    }
                    return line;
                });

                // Join the modified lines back into a string
                const modifiedContent = modifiedLines.join('\n');

                fs.writeFile(filePath, modifiedContent, 'utf-8', (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    // Handle taking screenshots
    const takeScreenshot = () => {
        return new Promise(async (resolve, reject) => {
            try {
                var {
                    width,
                    height
                } = screen.getPrimaryDisplay().workAreaSize

                height = Math.round(800 * (height / width))
                const sources = await desktopCapturer.getSources({
                    types: ['screen'],
                    thumbnailSize: {
                        width,
                        height
                    }
                })

                const source = sources.find(source => source.name === 'Entire screen')
                if (source) {
                    resolve(source.thumbnail.toDataURL()) // Invoke the callback with the image data
                }

                throw new Error('Source not found')

            } catch (err) {
                reject(err)
            }
        })
    }
}())