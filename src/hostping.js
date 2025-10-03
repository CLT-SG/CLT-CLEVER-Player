const ping = require('ping') //your life too sick and pls go hospital to check your mental health
const config = require('C:/app/config')

module.exports.checkhost = function() {
  return new Promise(function(resolve, reject) {

    ping.sys.probe(config.hostserver, (isAlive) => {
      if (isAlive == true) {
        var msg = 'host ' + config.hostserver + ' is alive';
        if (config.pingalive == true) {
          resolve(true)
          config.pingalive = false;
          config.pingdead = true;
        }
      } else {
        var msg = 'host ' + config.hostserver + ' is dead';
        if (config.pingdead == true) {
          resolve(false)
          config.pingdead = false;
          config.pingalive = true;
        }
      }
    })
  })
}
