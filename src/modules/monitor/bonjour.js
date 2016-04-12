/*
 * Copyright (C) 2016, Hugo Freire <hugo@dog.ai>. All rights reserved.
 */

var logger = require('../../utils/logger.js'),
  _ = require('lodash'),
  Promise = require('bluebird');

function bonjour() {
}

bonjour.prototype.type = 'MONITOR';

bonjour.prototype.name = 'bonjour';

bonjour.prototype.info = function () {
  return '*' + this.name + '* - ' +
    '_' + this.name.charAt(0).toUpperCase() + this.name.slice(1) + ' ' +
    this.type.toLowerCase() + ' module_';
};

bonjour.prototype.load = function (communication) {
  this.communication = communication;

  if (process.platform !== 'linux') {
    throw new Error(process.platform + ' platform is not supported');
  }

  this.start();
};

bonjour.prototype.unload = function () {
  this.stop();
};

bonjour.prototype.start = function () {
  this.communication.on('monitor:bonjour:discover', this._discover);

  this.communication.emit('worker:job:enqueue', 'monitor:bonjour:discover', null, {schedule: '1 minute'});
};

bonjour.prototype.stop = function () {
  this.communication.removeListener('monitor:bonjour:discover', this._discover);

  this.communication.emit('worker:job:dequeue', 'monitor:bonjour:discover');
};

bonjour.prototype._discover = function (params, callback) {
  return instance._execAvahiBrowse()
    .then(function (bonjours) {
      return Promise.mapSeries(bonjours, function (bonjour) {
          return instance._createOrUpdate(bonjour)
            .catch(function (error) {
              logger.warn(error.message + ' with bonjour as ' + JSON.stringify(bonjour), error);
            });
        })
        .then(instance._clean);
    })
    .then(function () {
      callback();
    })
    .catch(function (error) {
      callback(error);
    });
};

bonjour.prototype._execAvahiBrowse = function () {
  return new Promise(function (resolve, reject) {
    var bonjours = [];

    var timeout, spawn = require('child_process').spawn,
      process = spawn('avahi-browse', ['-alrpt']);

    timeout = setTimeout(function () {
      process.stdin.pause();
      process.stderr.pause();
      process.kill();
      resolve(bonjours);
    }, 15000); // wait 15 seconds for process to finish

    process.stdout.setEncoding('utf8');
    process.stdout.pipe(require('split')()).on('data', function (line) {

      if (line.charAt(0) !== '=') {
        return;
      }

      var values = line.split(';');

      var bonjour = {
        name: values[3],
        type: values[4],
        hostname: values[6],
        ip_address: values[7],
        port: values[8],
        txt: values[9]
      };

      if (bonjour.name && bonjour.name.length > 0 &&
        bonjour.type && bonjour.type.length > 0 &&
        bonjour.hostname && bonjour.hostname.length > 0 &&
        /^(([1-9]?\d|1\d\d|2[0-5][0-5]|2[0-4]\d)\.){3}([1-9]?\d|1\d\d|2[0-5][0-5]|2[0-4]\d)$/.test(bonjour.ip_address) &&
        bonjour.ip_address && bonjour.ip_address.length > 0 && bonjour.ip_address.indexOf('169.') !== 0 &&
        bonjour.port && bonjour.port.length > 0 &&
        bonjour.txt && bonjour.txt.length > 0) {

        // TODO: remove this after doing proper escaping of sql fields
        bonjour.name = bonjour.name.replace(/'/gi, '’');

        //{"name":"Figure (Ferruccio's iPhone)","type":"_audiobus._udp","hostname":"Ferruccios-iPhone.local","ip_address":"172.16.2.168","port":"55059","txt":"\"displayName=Figure\" \"allowsMultipleInstances=0\" \"triggersExtraInfo[0]=\" \"launchURL=phfigure.1.6.2.audiobus://\" \"launchPeersOverAudiobus=1\" \"DBVersion=3\" \"remoteTriggers[1]=+\" \"appIconResourceID=2706529516\" \"triggers[0]=\" \"inForeground=0\" \"capabilities=1\" \"remoteTriggers[0]=+\" \"outputs[0]=\u000b\" \"version=3\" \"sequence=13\" \"deviceID=BA5259F8-5DC4-4152-A057-2F6B5E44D2A9\" \"SDK version=2.2.1\"","updated_date":"2016-04-12T09:27:01.328Z"}
        // TODO: need to do this in the avahi-browse itself
        bonjour.txt = bonjour.txt.replace(/[^0-9a-z_:\/\s=\[\]+-\\"\(\)\'']/gi, '');
        
        bonjours.push(bonjour);

      }

    });

    process.stderr.pipe(require('split')()).on('data', function (line) {
      if (line === undefined ||
        line.length === 0 ||
        line.indexOf('Failed to resolve service') == 0) {
        return;
      }

      clearTimeout(timeout);
      reject(new Error(line));
    });

    process.on('error', function (error) {
      clearTimeout(timeout);
      reject(error);
    });

    process.on('close', function () {
      clearTimeout(timeout);
      resolve(bonjours);
    });
  })
};

bonjour.prototype._clean = function () {
  var now = new Date();
  
  return instance._deleteAllBeforeDate(new Date(now.setMinutes(now.getMinutes() - 10)))
    .mapSeries(function (bonjour) {
      instance.communication.emit('monitor:bonjour:delete', bonjour.ip_address);
    });
};

bonjour.prototype._createOrUpdate = function (bonjour) {
  return instance._findByTypeAndName(bonjour.type, bonjour.name)
    .then(function (row) {
      if (row === undefined) {
        return instance._create(bonjour)
          .then(function () {
            return instance.communication.emitAsync('monitor:bonjour:create', bonjour);
          });
      } else {
        bonjour.updated_date = new Date();
        return instance._updateByTypeAndName(bonjour.type, bonjour.name, bonjour)
          .then(function () {
            return instance.communication.emitAsync('monitor:bonjour:update', bonjour);
          });
      }
    });
};

bonjour.prototype._create = function (bonjour) {
  var _bonjour = _.clone(bonjour);

  if (_bonjour.created_date !== undefined && _bonjour.created_date !== null && _bonjour.created_date instanceof Date) {
    _bonjour.created_date = _bonjour.created_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  if (_bonjour.updated_date !== undefined && _bonjour.updated_date !== null && _bonjour.updated_date instanceof Date) {
    _bonjour.updated_date = _bonjour.updated_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  var keys = _.keys(_bonjour);
  var values = _.values(_bonjour);

  return instance.communication.emitAsync('database:monitor:create',
    'INSERT INTO bonjour (' + keys + ') VALUES (' + values.map(function () {
      return '?';
    }) + ');',
    values).then(function () {
    return _bonjour;
  });
};

bonjour.prototype._findByTypeAndName = function (type, name) {
  return instance.communication.emitAsync('database:monitor:retrieveOne',
    'SELECT * FROM bonjour WHERE type = ? AND name = ?;', [type, name])
    .then(function (row) {
      if (row !== undefined) {
        row.created_date = new Date(row.created_date.replace(' ', 'T'));
        row.updated_date = new Date(row.updated_date.replace(' ', 'T'));
      }
      return row;
    });
};

bonjour.prototype._updateByTypeAndName = function (type, name, bonjour) {
  var _bonjour = _.clone(bonjour);

  if (_bonjour.created_date !== undefined && _bonjour.created_date !== null && _bonjour.created_date instanceof Date) {
    _bonjour.created_date = _bonjour.created_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  if (_bonjour.updated_date !== undefined && _bonjour.updated_date !== null && _bonjour.updated_date instanceof Date) {
    _bonjour.updated_date = _bonjour.updated_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  var keys = _.keys(_bonjour);
  var values = _.values(_bonjour);

  // TODO: Fix this query by http://stackoverflow.com/questions/603572/how-to-properly-escape-a-single-quote-for-a-sqlite-database
  return instance.communication.emitAsync('database:monitor:update',
    'UPDATE bonjour SET ' + keys.map(function (key) {
      return key + ' = ?';
    }) + ' WHERE type = \'' + type + '\' AND name = \'' + name + '\';',
    values);
};

bonjour.prototype._deleteAllBeforeDate = function (oldestDate) {
  var updatedDate = oldestDate.toISOString().replace(/T/, ' ').replace(/\..+/, '');

  return instance.communication.emitAsync('database:monitor:retrieveAll', 'SELECT * FROM bonjour WHERE updated_date < Datetime(?);', [updatedDate])
    .then(function (rows) {

      return Promise.mapSeries(rows, function (row) {
          row.created_date = new Date(row.created_date.replace(' ', 'T'));
          row.updated_date = new Date(row.updated_date.replace(' ', 'T'));

          return instance.communication.emitAsync('database:monitor:delete', 'DELETE FROM bonjour WHERE id = ?;', [row.id])
        })
        .then(function () {
          return rows;
        });
    });
};

var instance = new bonjour();

module.exports = instance;
