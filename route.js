(async function () {
    const express = require('express')
    const path = require('path')
    const os = require('os')
    const fs = require('fs')
    const cors = require('cors')
    const bodyParser = require('body-parser')
    const si = require('systeminformation')
    const { createCanvas, loadImage } = require('@napi-rs/canvas')
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
                    .executeJavaScript(`
                    window.localStorage.setItem("templateData", '${templateData}');
                    `)
                    .then(result => {
                        mainWindow.loadURL('http://' + config.controller + '/preview/' + config.tempid + '/videowall/true') // load template url from server to vw
                    })
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
                    if (config.ctrltype == 'videowall') await mainWindow.loadURL('http://' + config.controller + '/preview/' + template_id + '/videowall/false') // load template url from server to vw
                    if (config.ctrltype == 'console') return res.status(200).end('Not allowed')
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
            // Capture screenshots from all screens
            const screenshots = await takeScreenshot();
            // Merge the screenshots into a single image
            const mergedImageData = await mergeScreenshots(screenshots);

            // Remove the "data:image/png;base64," prefix from the base64 data
            const base64WithoutPrefix = mergedImageData.replace(/^data:image\/png;base64,/, '');

            // Set the appropriate content type in the response headers
            res.setHeader('Content-Type', 'image/png');
            // Send the binary image data directly in the response
            res.status(200).send(Buffer.from(base64WithoutPrefix, 'base64'));
        } catch (error) {
            // Log any errors and send a 500 status code
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

    // Function to capture screenshots from all screens
    const takeScreenshot = () => {
        return new Promise(async (resolve, reject) => {
            try {
                // Get all displays (screens) connected to the system
                const displays = screen.getAllDisplays();

                // Calculate the total width of all displays combined
                const width = displays.reduce((acc, display) => acc + display.workAreaSize.width, 0);
                // Find the maximum height among all displays
                const height = Math.max(...displays.map(display => display.workAreaSize.height));

                // Get sources for all screens, specifying the desired thumbnail size
                const sources = await desktopCapturer.getSources({
                    types: ['screen'],
                    thumbnailSize: {
                        width,
                        height
                    }
                });

                // Throw an error if no sources are found
                if (sources.length === 0) {
                    throw new Error('No screen sources found');
                }

                // Extract the base64-encoded image data URLs from the sources
                const screenshots = sources.map(source => source.thumbnail.toDataURL());

                // Resolve the promise with the array of image data URLs
                resolve(screenshots);
            } catch (err) {
                // Reject the promise if an error occurs
                reject(err);
            }
        });
    };

    // Function to merge multiple screenshots into a single image
    const mergeScreenshots = async (screenshots) => {
        // Get all displays to determine the total canvas size
        const displays = screen.getAllDisplays();
        const width = displays.reduce((acc, display) => acc + display.workAreaSize.width, 0);
        const height = Math.max(...displays.map(display => display.workAreaSize.height));

        // Create a new canvas with the combined width and maximum height
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Variable to keep track of the current x-offset on the canvas
        let xOffset = 0;
        for (const screenshot of screenshots) {
            // Load the screenshot image
            const image = await loadImage(screenshot);
            // Draw the image onto the canvas at the current x-offset
            ctx.drawImage(image, xOffset, 0);
            // Update the x-offset to the right edge of the current image
            xOffset += image.width;
        }

        // Return the combined image as a base64-encoded data URL
        return canvas.toDataURL();
    };
}())