'use strict'

const net = require('net')
const si = require('systeminformation')

class PortScanner {
  constructor() {
    this.port = 9100
  }

  async getLocalIpRange() {
    const ifaces = await si.networkInterfaces()
    const wired = ifaces.find(
      (iface) => iface.type === 'wired' && iface.virtual === false && iface.operstate === 'up' && iface.ip4
    )
    const fallback = ifaces.find(
      (iface) => iface.ip4 && iface.operstate === 'up' && iface.virtual === false && iface.internal === false
    )
    const activeInterface = wired || fallback

    if (!activeInterface) {
      throw new Error('No active network interface found.')
    }

    const parts = activeInterface.ip4.split('.')
    const startIp = parts.slice(0, 3).join('.') + '.1'
    const endIp = parts.slice(0, 3).join('.') + '.254'
    return { startIp, endIp }
  }

  checkPort(ip) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket()
      socket.setTimeout(200)

      socket.on('connect', () => {
        socket.destroy()
        resolve(ip)
      })

      socket.on('timeout', () => {
        socket.destroy()
        reject(new Error('timeout'))
      })

      socket.on('error', () => {
        socket.destroy()
        reject(new Error('error'))
      })

      socket.connect(this.port, ip)
    })
  }

  async scanIPRange() {
    try {
      const { startIp, endIp } = await this.getLocalIpRange()
      const startArray = startIp.split('.').map(Number)
      const endArray = endIp.split('.').map(Number)
      const allPromises = []
      const concurrencyLimit = 10

      for (let i = startArray[3]; i <= endArray[3] && i <= 254; i += concurrencyLimit) {
        const ipRange = Array.from({ length: concurrencyLimit }, (_, index) => {
          const currentIpIndex = i + index
          if (currentIpIndex <= 254 && currentIpIndex <= endArray[3]) {
            return `${startArray[0]}.${startArray[1]}.${startArray[2]}.${currentIpIndex}`
          }
          return null
        }).filter(Boolean)

        const promisesBatch = ipRange.map((currentIp) =>
          this.checkPort(currentIp)
            .then(() => currentIp)
            .catch(() => null)
        )
        allPromises.push(Promise.all(promisesBatch))
      }

      const done = await Promise.all(allPromises)
      return done.flat().filter((ip) => ip !== null)
    } catch (error) {
      console.error(error.message)
      return []
    }
  }
}

module.exports = PortScanner
