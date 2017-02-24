/*
 * Copyright (C) 2017, Hugo Freire <hugo@dog.ai>. All rights reserved.
 */

const Bot = require('../../../bot')

const { Logger } = require('../../../utils'),
  _ = require('lodash'),
  moment = require('moment');

function employee() {
}

employee.prototype.type = "PERSON";

employee.prototype.name = "employee";

employee.prototype.info = function () {
  return "*" + this.name + "* - " +
    "_" + this.name.charAt(0).toUpperCase() + this.name.slice(1) + " " +
    this.type.toLowerCase() + " module_";
};

employee.prototype.load = function () {
  instance.start();
};

employee.prototype.unload = function () {
  this.stop();
};

employee.prototype.start = function () {
  Bot.on('person:device:online', this._handleDeviceOnline);
  Bot.on('person:device:onlineAgain', this._handleDeviceOnlineAgain);
  Bot.on('person:device:offline', this._handleDeviceOffline);
  Bot.on('person:device:addedToEmployee', this._onDeviceAddedToEmployee);
  Bot.on('person:device:removedFromEmployee', this._onDeviceRemovedFromEmployee);
  Bot.on('person:slack:active', this._handleSlackActive);
  Bot.on('person:slack:away', this._handleSlackAway);
  Bot.on('sync:incoming:person:employee:create', this._onCreateOrUpdateEmployeeIncomingSynchronization);
  Bot.on('sync:incoming:person:employee:update', this._onCreateOrUpdateEmployeeIncomingSynchronization);
  Bot.on('sync:incoming:person:employee:delete', this._onDeleteEmployeeIncomingSynchronization);
  Bot.on('sync:outgoing:person:employee', this._onEmployeeOutgoingSynchronization);
  Bot.on('person:employee:is_present', this._isPresent);

  Bot.emitAsync('sync:incoming:register:setup', {
    companyResource: 'employees',
    onCompanyResourceAddedCallback: function (employee) {
      Bot.emit('sync:incoming:person:employee:create', employee);
    },
    onCompanyResourceChangedCallback: function (employee) {
      Bot.emit('sync:incoming:person:employee:update', employee);
    },
    onCompanyResourceRemovedCallback: function (employee) {
      Bot.emit('sync:incoming:person:employee:delete', employee);
    }
  });

  Bot.emitAsync('sync:outgoing:periodic:register', {
    companyResource: 'employees',
    event: 'sync:outgoing:person:employee'
  });

  Bot.emit('sync:outgoing:quickshot:register', {
    companyResource: 'employees',
    registerEvents: ['person:employee:update'],
    outgoingEvent: 'sync:outgoing:person:employee'
  });
};

employee.prototype.stop = function () {
  Bot.removeListener('person:device:online', this._handleDeviceOnline);
  Bot.removeListener('person:device:onlineAgain', this._handleDeviceOnlineAgain);
  Bot.removeListener('person:device:offline', this._handleDeviceOffline);
  Bot.removeListener('person:device:addedToEmployee', this._onDeviceAddedToEmployee);
  Bot.removeListener('person:device:removedFromEmployee', this._onDeviceRemovedFromEmployee);
  Bot.removeListener('person:slack:active', this._handleSlackActive);
  Bot.removeListener('person:slack:away', this._handleSlackAway);
  Bot.removeListener('sync:incoming:person:employee:create', this._onCreateOrUpdateEmployeeIncomingSynchronization);
  Bot.removeListener('sync:incoming:person:employee:update', this._onCreateOrUpdateEmployeeIncomingSynchronization);
  Bot.removeListener('sync:incoming:person:employee:delete', this._onDeleteEmployeeIncomingSynchronization);
  Bot.removeListener('sync:outgoing:person:employee', this._onEmployeeOutgoingSynchronization);
  Bot.removeListener('person:employee:is_present', this._isPresent);

  Bot.removeAllListeners('monitor:arp:discover:finish');
};

employee.prototype._handleSlackAway = function (slack) {
  // Note: pay attention that name is not a SQL unique column key
  return instance._findByName(slack.name)
    .then(function (employee) {
      Bot.emit('person:employee:offline', employee);
    });
};

employee.prototype._handleSlackActive = function (slack) {
  // Note: pay attention that name is not a SQL unique column key
  return instance._findByName(slack.name)
    .then(function (employee) {
      if (employee === undefined || employee === null) {
        return instance._addPresence(slack.name, slack.slack_id)
          .then(function (employee) {
            Bot.emit('person:employee:online', employee);
          });
      } else {
        Bot.emit('person:employee:online', employee);
      }
    });
};

employee.prototype._handleDeviceOnline = function (device) {
  if (device.employee_id !== undefined && device.employee_id !== null) {

    return instance._findById(device.employee_id)
      .then(function (employee) {
        if (employee !== undefined && !employee.is_present) {
          employee.updated_date = new Date();
          employee.is_present = true;
          employee.last_presence_date = device.last_presence_date;
          employee.is_synced = false;

          return instance._updateById(employee.id, employee)
            .then(function () {
              Bot.emit('person:employee:nearby', employee);
              Bot.emit('person:employee:update', employee);
            });
        }
      })
      .catch(function (error) {
        Logger.error(error);
      });
  }
};

employee.prototype._handleDeviceOnlineAgain = function (device) {
  if (device.employee_id !== undefined && device.employee_id !== null) {

    return instance._findById(device.employee_id)
      .then(function (employee) {
        if (employee !== undefined) {
          employee.updated_date = new Date();
          employee.last_presence_date = device.last_presence_date;
          employee.is_synced = false;
          return instance._updateById(employee.id, employee);
        }
      })
      .catch(function (error) {
        Logger.error(error);
      });
  }
};

employee.prototype._handleDeviceOffline = function (device) {

  if (device.employee_id !== undefined && device.employee_id !== null) {

    return instance._findById(device.employee_id)
      .then(function (employee) {

        if (employee !== undefined) {
          // only emit farway if the employee does not have any other device online
          return instance._findAllOnlineDevicesByEmployeeId(employee.id)
            .then(function (devices) {

              if (devices.length == 0 && employee.is_present) {

                employee.is_present = false;
                employee.last_presence_date = device.last_presence_date;
                employee.is_synced = false;

                return instance._updateById(employee.id, employee)
                  .then(function () {
                    Bot.emit('person:employee:faraway', employee);
                    Bot.emit('person:employee:update', employee);
                  });
              }
            });
        }
      })
      .catch(function (error) {
        Logger.error(error);
      });
  }
};

employee.prototype._isPresent = function (employee, callback) {
  function handleArpDiscover() {
    Bot.removeListener('monitor:arp:discover:finish', handleArpDiscover);

    instance._findDevicesByEmployeeId(employee.id)
      .then(function (devices) {
        if (devices !== undefined) {
          var device = _.find(devices, {'is_present': true});
          callback(device !== undefined);
        }
      })
      .catch(function (error) {
        callback(error);
      });
  }

  Bot.on('monitor:arp:discover:finish', handleArpDiscover);
};

employee.prototype._onDeviceAddedToEmployee = function (device, employee) {
  return instance._findById(employee.id)
    .then(function (employee) {
      if (device.is_present && employee !== undefined && !employee.is_present) {
        employee.is_present = true;
        employee.last_presence_date = device.last_presence_date;

        return instance._updateById(employee.id, employee).then(function () {
          Bot.emit('person:employee:nearby', employee);
          Bot.emit('person:employee:update', employee);
        });
      }
    })
    .catch(function (error) {
      Logger.error(error);
    });
};

employee.prototype._onDeviceRemovedFromEmployee = function (device, employee) {
  return instance._findById(employee.id)
    .then(function (employee) {

      if (employee !== undefined) {
        // only emit farway if the employee does not have any other device online
        return instance._findAllOnlineDevicesByEmployeeId(employee.id)
          .then(function (devices) {

            if (devices && devices.length == 0 && employee.is_present) {

              employee.is_present = false;
              employee.last_presence_date = device.last_presence_date;

              return instance._updateById(employee.id, employee).then(function () {
                Bot.emit('person:employee:faraway', employee);
                Bot.emit('person:employee:update', employee);
              });
            }
          })
      }
    })
    .catch(function (error) {
      Logger.error(error);
    });
};

employee.prototype._onCreateOrUpdateEmployeeIncomingSynchronization = function (employee) {
  return Bot.emitAsync('database:person:retrieveAll', 'PRAGMA table_info(employee)', [])
    .then(function (rows) {
      employee = _.pick(employee, _.pluck(rows, 'name'));

      return instance._findById(employee.id).then(function (row) {
        if (row !== undefined) {
          if (moment(employee.updated_date).isAfter(row.updated_date)) {
            employee = _.omit(employee, 'is_present', 'last_presence_date');

            return instance._updateById(employee.id, employee);
          }
        } else {
          return instance._add(employee);
        }
      });
    })
    .catch(function (error) {
      Logger.error(error);
    });
};

employee.prototype._onDeleteEmployeeIncomingSynchronization = function (employee) {
  return instance._findById(employee.id)
    .then(function (employee) {
      if (employee !== undefined) {
        return instance._deleteById(employee.id)
          .then(function () {
            if (employee.is_present) {
              Bot.emit('person:employee:faraway', employee);
            }
          });
      }
    })
    .catch(function (error) {
      Logger.error(error);
    });
};

employee.prototype._onEmployeeOutgoingSynchronization = function (params, callback) {
  return instance._findAllNotSynced(params ? params.id : undefined)
    .mapSeries(function (employee) {
      return instance._findDevicesByEmployeeId(employee.id)
        .then(function (devices) {
          employee.devices = {};

          _.forEach(devices, function (device) {
            employee.devices[device.id] = true;
          });

          callback(null, employee, function (error) {
            if (error) {
              Logger.error(error)
            } else {
              delete employee.devices;

              employee.is_synced = true;

              instance._updateById(employee.id, employee)
                .catch(function (error) {
                  Logger.error(error);
                });
            }
          });
        });
    })
    .catch(callback);
};

employee.prototype._findAllNotSynced = function (id) {
  return Bot.emitAsync('database:person:retrieveAll', 'SELECT * FROM employee WHERE is_synced = 0' + (id ? (' AND id = \'' + id + '\'') : ''), [])
    .mapSeries(function (row) {
      if (row) {
        row.created_date = new Date(row.created_date.replace(' ', 'T'));
        row.updated_date = new Date(row.updated_date.replace(' ', 'T'));
        if (row.last_presence_date !== undefined && row.last_presence_date !== null) {
          row.last_presence_date = new Date(row.last_presence_date.replace(' ', 'T'));
        }
        if (row.linkedin_last_import_date !== undefined && row.linkedin_last_import_date !== null) {
          row.linkedin_last_import_date = new Date(row.linkedin_last_import_date.replace(' ', 'T'));
        }
        row.is_present = row.is_present == 1;
      }

      return row;
    });
};

employee.prototype._findDevicesByEmployeeId = function (id) {
  return Bot.emitAsync('database:person:retrieveAll', "SELECT * FROM device WHERE employee_id = ?;", [ id ])
    .then(function (rows) {
      if (rows !== undefined) {
        rows.forEach(function (row) {
          row.created_date = new Date(row.created_date.replace(' ', 'T'));
          row.updated_date = new Date(row.updated_date.replace(' ', 'T'));
          if (row.last_presence_date !== undefined && row.last_presence_date !== null) {
            row.last_presence_date = new Date(row.last_presence_date.replace(' ', 'T'));
          }
          if (row.linkedin_last_import_date !== undefined && row.linkedin_last_import_date !== null) {
            row.linkedin_last_import_date = new Date(row.linkedin_last_import_date.replace(' ', 'T'));
          }
        });
      }

      return rows;
    });
};

employee.prototype._addPresence = function (name, slackId) {
  return Bot.emitAsync('database:person:create',
    "INSERT INTO employee (name, slack_id) VALUES (?, ?);", [
      name,
      slackId
    ]);
};

employee.prototype._findById = function (id) {
  return Bot.emitAsync('database:person:retrieveOne', "SELECT * FROM employee WHERE id = ?;", [ id ])
    .then(function (row) {
      if (row !== undefined) {
        row.created_date = new Date(row.created_date.replace(' ', 'T'));
        row.updated_date = new Date(row.updated_date.replace(' ', 'T'));
        if (row.last_presence_date !== undefined && row.last_presence_date !== null) {
          row.last_presence_date = new Date(row.last_presence_date.replace(' ', 'T'));
        }
        if (row.linkedin_last_import_date !== undefined && row.linkedin_last_import_date !== null) {
          row.linkedin_last_import_date = new Date(row.linkedin_last_import_date.replace(' ', 'T'));
        }
      }

      return row;
    });
};

employee.prototype._findByName = function (name) {
  return Bot.emitAsync('database:person:retrieveOne', "SELECT * FROM employee WHERE name LIKE ?;", [ name ])
    .then(function (row) {
      if (row !== undefined) {
        row.created_date = new Date(row.created_date.replace(' ', 'T'));
        row.updated_date = new Date(row.updated_date.replace(' ', 'T'));
        if (row.last_presence_date !== undefined && row.last_presence_date !== null) {
          row.last_presence_date = new Date(row.last_presence_date.replace(' ', 'T'));
        }
        if (row.linkedin_last_import_date !== undefined && row.linkedin_last_import_date !== null) {
          row.linkedin_last_import_date = new Date(row.linkedin_last_import_date.replace(' ', 'T'));
        }
      }

      return row;
    });
};

employee.prototype._findAllOnlineDevicesByEmployeeId = function (id) {
  return Bot.emitAsync('database:person:retrieveAll', 'SELECT * FROM device WHERE employee_id = ? AND is_present = 1;', [ id ])
    .then(function (rows) {
      if (rows !== undefined) {
        rows.forEach(function (row) {
          row.created_date = new Date(row.created_date.replace(' ', 'T'));
          row.updated_date = new Date(row.updated_date.replace(' ', 'T'));
          if (row.last_presence_date !== undefined && row.last_presence_date !== null) {
            row.last_presence_date = new Date(row.last_presence_date.replace(' ', 'T'));
          }
          if (row.linkedin_last_import_date !== undefined && row.linkedin_last_import_date !== null) {
            row.linkedin_last_import_date = new Date(row.linkedin_last_import_date.replace(' ', 'T'));
          }
        });
      }

      return rows;
    });
};

employee.prototype._add = function (employee) {
  var _employee = _.clone(employee);

  if (_employee.created_date !== undefined && _employee.created_date !== null && _employee.created_date instanceof Date) {
    _employee.created_date = _employee.created_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  if (_employee.updated_date !== undefined && _employee.updated_date !== null && _employee.updated_date instanceof Date) {
    _employee.updated_date = _employee.updated_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  if (_employee.last_presence_date !== undefined && _employee.last_presence_date !== null && _employee.last_presence_date instanceof Date) {
    _employee.last_presence_date = _employee.last_presence_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  if (_employee.linkedin_last_import_date !== undefined && _employee.linkedin_last_import_date !== null && _employee.linkedin_last_import_date instanceof Date) {
    _employee.linkedin_last_import_date = _employee.linkedin_last_import_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  var keys = _.keys(_employee);
  var values = _.values(_employee);

  return Bot.emitAsync('database:person:create',
    'INSERT INTO employee (' + keys + ') VALUES (' + values.map(function () {
      return '?';
    }) + ');',
    values);
};

employee.prototype._updateById = function (id, employee) {
  var _employee = _.clone(employee);

  if (_employee.created_date !== undefined && _employee.created_date !== null && _employee.created_date instanceof Date) {
    _employee.created_date = _employee.created_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  if (_employee.updated_date !== undefined && _employee.updated_date !== null && _employee.updated_date instanceof Date) {
    _employee.updated_date = _employee.updated_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  if (_employee.last_presence_date !== undefined && _employee.last_presence_date !== null && _employee.last_presence_date instanceof Date) {
    _employee.last_presence_date = _employee.last_presence_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  if (_employee.linkedin_last_import_date !== undefined && _employee.linkedin_last_import_date !== null && _employee.linkedin_last_import_date instanceof Date) {
    _employee.linkedin_last_import_date = _employee.linkedin_last_import_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  var keys = _.keys(_employee);
  var values = _.values(_employee);

  return Bot.emitAsync('database:person:update',
    'UPDATE employee SET ' + keys.map(function (key) {
      return key + ' = ?';
    }) + ' WHERE id = \'' + id + '\';',
    values);
};

employee.prototype._deleteById = function (id) {
  return Bot.emitAsync('database:person:delete', 'DELETE FROM employee WHERE id = ?;', [ id ]);
};

var instance = new employee();

module.exports = instance;
