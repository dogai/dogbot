/*
 * Copyright (C) 2015 dog.ai, Hugo Freire <hugo@dog.ai>. All rights reserved.
 */

var iwconfig = require('wireless-tools/iwconfig');
var procfs = require('procfs-stats');

function core() {
  var moduleManager = {};
}

core.prototype.type = "PROCESS";

core.prototype.name = "core";

core.prototype.info = function() {
  return "*" + this.name + "* - " +
    "_" + this.name.charAt(0).toUpperCase() + this.name.slice(1) + " " +
    this.type.toLowerCase() + " module_";
};

core.prototype.help = function() {
  var help = '';

  help += '*!help* - _List help information_' + '\n';
  help += '*!status* - _Hardware/OS/Network status information_';

  return help;
};

core.prototype.load = function(moduleManager) {
    this.moduleManager = moduleManager;
};

core.prototype.unload = function() {
};

core.prototype.process = function(message, callback) {

  if (message === "!help") {
    var help = 'Available commands:\n';
    this.moduleManager.findAllLoadedModulesByType('PROCESS').forEach(function(module) {
      try {
        help += module.help() + '\n';
      } catch (exception) {
      }
    });

    help += '\nLoaded process modules:\n';
    this.moduleManager.findAllLoadedModulesByType('PROCESS').forEach(function(module) {
      try {
        help += module.info() + '\n';
      } catch (exception) {
      }
    });

    help += '\nLoaded schedule modules:\n';
    this.moduleManager.findAllLoadedModulesByType('SCHEDULE').forEach(function(module) {
      try {
        help += module.info() + '\n';
      } catch (exception) {
      }
    });

    help += '\nLoaded I/O modules:\n';
    this.moduleManager.findAllLoadedModulesByType('IO').forEach(function(module) {
      try {
        help += module.info() + '\n';
      } catch (exception) {
      }
    });

    help += '\nLoaded monitor modules:\n';
    this.moduleManager.findAllLoadedModulesByType('MONITOR').forEach(function(module) {
      try {
        help += module.info() + '\n';
      } catch (exception) {
      }
    });

    help += '\nLoaded auth modules:\n';
    this.moduleManager.findAllLoadedModulesByType('AUTH').forEach(function(module) {
      try {
        help += module.info() + '\n';
      } catch (exception) {
      }
    });

    help += '\nLoaded person modules:\n';
    this.moduleManager.findAllLoadedModulesByType('PERSON').forEach(function(module) {
      try {
        help += module.info() + '\n';
      } catch (exception) {
      }
    });

    help += '\nLoaded statistics modules:\n';
    this.moduleManager.findAllLoadedModulesByType('STATS').forEach(function (module) {
      try {
        help += module.info() + '\n';
      } catch (exception) {
      }
    });

    callback(help);
  } else if (message === "!status") {
    var os = require('os');


    var response = '';
    response += 'Uptime: ' + parseInt(os.uptime() / 86400) + 'd ' + (new Date(os.uptime() % 86400 * 1000)).toUTCString().replace(/.*(\d{2}):(\d{2}):(\d{2}).*/, "$1h $2m $3s") + '\n';
    response += 'CPU load averages:' + os.loadavg().map(function (loadavg) {
          return ' ' + Math.ceil(loadavg * 10) / 10;
        }) + '\n';
    response += 'Memory usage: ' + Math.ceil(((os.totalmem() - os.freemem()) / 1024 / 1024)) + '/' + Math.ceil((os.totalmem() / 1024 / 1024)) + ' MiB\n';

    var interfaces = os.networkInterfaces();
    var addresses = [];
    for (var k in interfaces) {
      for (var k2 in interfaces[k]) {
        var address = interfaces[k][k2];
        if (address.family === 'IPv4' && !address.internal) {
          addresses.push(address.address);
        }
      }
    }
    response += 'Network addresses: ' + addresses;

    if (process.platform === 'linux') {
      iwconfig.status(function (error, status) {
        if (error === undefined || error === null) {
          response += '\nWireless status:\n' +
              '\t\tSSID: ' + status[0].ssid + '\n' + '' +
              '\t\tChannel frequency: ' + status[0].frequency + ' GHz\n';

          procfs.wifi(function (error, status) {
            if (error === undefined || error === null) {
              response += '\t\tRSSI: ' + status[0].level.Quality.replace('.', '') + ' dBm';
            }
            callback(response);
          });
        }
      });
    } else {
      callback(response);
    }
  }
};

module.exports = new core();
