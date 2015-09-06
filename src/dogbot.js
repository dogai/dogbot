/*
 * Copyright (C) 2015, Hugo Freire <hfreire@exec.sh>. All rights reserved.
 */

var _ = require('lodash');

var stackTrace = require('stack-trace');

var communication = require('./utils/communication.js');
var revision = require('./utils/revision.js');
var synchronization = require('./utils/synchronization.js');

var databases = require('./databases.js')(communication);
var modules = require('./modules.js')(communication);

var dogbot = {
    token: undefined,

    start: function (callback) {

        databases.startAll(function () {
        });

        _.defer(function () {

            communication.emit('database:auth:setup',
                "CREATE TABLE IF NOT EXISTS google (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, " +
                "created_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "updated_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "user_id TEXT NOT NULL, " +
                "name TEXT NOT NULL, " +
                "email TEXT NOT NULL, " +
                "access_token TEXT NOT NULL, " +
                "expires_in INTEGER NOT NULL, " +
                "refresh_token TEXT NOT NULL" +
                ");",
                [],
                function (error) {
                    if (error) {
                        console.error(error);
                    }
                });

            communication.emit('database:monitor:setup',
                "CREATE TABLE IF NOT EXISTS arp (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, " +
                "created_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "updated_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "ip_address TEXT NOT NULL UNIQUE, " +
                "mac_address TEXT NOT NULL" +
                ");", [],
                function (error) {
                    if (error) {
                        console.error(error);
                    }
                });

            communication.emit('database:monitor:setup',
                "CREATE TABLE IF NOT EXISTS bonjour (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, " +
                "created_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "updated_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "type TEXT NOT NULL, " +
                "name TEXT NOT NULL, " +
                "hostname TEXT NOT NULL, " +
                "ip_address TEXT NOT NULL, " +
                "port INTEGER, " +
                "txt TEXT NOT NULL, " +
                "UNIQUE(type, name)" +
                ");", [], function (error) {
                    if (error) {
                        console.error(error);
                    }
                });

            communication.emit('database:monitor:setup',
                "CREATE TABLE IF NOT EXISTS ip (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, " +
                "created_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "updated_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "ip_address TEXT NOT NULL UNIQUE" +
                ");", [],
                function (error) {
                    if (error) {
                        console.error(error);
                    }
                });

            communication.emit('database:monitor:setup',
                "CREATE TABLE IF NOT EXISTS slack (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, " +
                "created_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "updated_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "slack_id TEXT NOT NULL UNIQUE, " +
                "username TEXT NOT NULL, " +
                "name TEXT NOT NULL" +
                ");", [],
                function (error) {
                    if (error) {
                        console.error(error);
                    }
                });

            communication.emit('database:person:setup',
                "CREATE TABLE IF NOT EXISTS mac_address (" +
                "id TEXT PRIMARY KEY NOT NULL, " +
                "created_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "updated_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "is_present INTEGER NOT NULL DEFAULT 0, " +
                "last_presence_date DATETIME DEFAULT NULL," +
                "is_synced INTEGER NOT NULL DEFAULT 0" +
                ");", [],
                function (error) {
                    if (error) {
                        console.error(error);
                    }
                });


            communication.emit('database:person:setup',
                "CREATE TABLE IF NOT EXISTS device (" +
                "id TEXT PRIMARY KEY NOT NULL, " +
                "created_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "updated_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "employee_id INTEGER REFERENCES employee(id), " +
                "mac_address TEXT NOT NULL, " +
                "is_present INTEGER NOT NULL DEFAULT 0, " +
                "UNIQUE(employee_id, mac_address)" +
                ");", [],
                function (error) {
                    if (error) {
                        console.error(error);
                    }
                });

            communication.emit('database:person:setup',
                "CREATE TABLE IF NOT EXISTS employee (" +
                "id TEXT PRIMARY KEY NOT NULL, " +
                "created_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "updated_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "full_name TEXT NOT NULL UNIQUE, " +
                "is_present INTEGER NOT NULL DEFAULT 0, " +
                "slack_id TEXT" +
                ");", [],
                function (error) {
                    if (error) {
                        console.error(error);
                    }
                });


            communication.emit('database:performance:setup',
                "CREATE TABLE IF NOT EXISTS presence (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, " +
                "created_date DATETIME DEFAULT CURRENT_TIMESTAMP, " +
                "employee_id TEXT NOT NULL, " +
                "is_present INTEGER NOT NULL, " +
                "is_synced INTEGER NOT NULL DEFAULT 0, " +
                "UNIQUE(created_date, employee_id)" +
                ");", [],
                function (error) {
                    if (error) {
                        console.error(error);
                    }
                });
        });


        synchronization.start(this.token, function (error) {
                if (error) {
                    console.error(error.message);

                    modules.loadAll();
                }

                callback();
            },
            function (type, moduleName, configuration) {
                modules.loadModule(type, moduleName, configuration, true);
            },
            function (device) {
                communication.emit('synchronization:person:device', device);
            },
            function (device) {

            },
            function (employee) {
                communication.emit('synchronization:person:employee', employee);
            },
            function (employee) {
            },
            function (callback) {
                communication.emit('database:person:retrieveOneByOne',
                    'SELECT * FROM mac_address WHERE is_synced = 0', [], function (error, row) {
                        if (error) {
                            console.error(error);
                        } else {
                            if (row !== undefined) {
                                row.created_date = new Date(row.created_date.replace(' ', 'T'));
                                row.updated_date = new Date(row.updated_date.replace(' ', 'T'));
                                row.last_presence_date = new Date(row.last_presence_date.replace(' ', 'T'));
                                row.is_present = row.is_present == 1 ? true : false;

                                callback(error, row, function (error) {
                                    if (error) {
                                        console.error(error)
                                    } else {
                                        communication.emit('database:person:update',
                                            'UPDATE mac_address SET is_synced = 1 WHERE id = ?', [row.id], function (error) {
                                                if (error) {
                                                    console.error(error);
                                                }
                                            });
                                    }
                                });
                            }
                        }
                    });
            },
            function (mac_address) {
                communication.emit('synchronization:person:mac_address', mac_address);
            },
            function (callback) {
                communication.emit('database:performance:retrieveOneByOne',
                    'SELECT * FROM presence WHERE is_synced = 0', [], function (error, row) {
                        if (error) {
                            console.error(error);
                        } else {
                            if (row !== undefined) {
                                row.created_date = new Date(row.created_date.replace(' ', 'T'));
                                row.is_present = row.is_present == 1 ? true : false;

                                callback(error, row.employee_id, 'presence', row, function (error) {
                                    if (error) {
                                        console.error(error)
                                    } else {
                                        communication.emit('database:performance:update',
                                            'UPDATE presence SET is_synced = 1 WHERE id = ?', [row.id], function (error) {
                                                if (error) {
                                                    console.error(error);
                                                }
                                            });
                                    }
                                });
                            }
                        }
                    });
            },
            function (performanceName, performance) {
                communication.emit('synchronization:performance:' + performanceName, performance);
            },
            function (callback) {
                communication.on('person:device:online', callback);
                communication.on('person:device:offline', callback);
            },
            function (callback) {
                communication.on('person:employee:nearby', callback);
                communication.on('person:employee:faraway', callback);
            }
        );
    },

    stop: function (callback) {
        modules.unloadAll();

        synchronization.stop();

        databases.stopAll();

        callback();
    },

    reload: function (callback) {
        var self = this;

        revision.hasRevisionChanged(function (error, changed, revision) {
            if (error) {
                console.error(error);
            } else {
                /*if (changed) {
                 console.log('Detected new code revision: ' + revision);

                 modules.findAllLoadedModulesByType('IO').forEach(function(module) {
                 module.send(null, 'Refreshing my brains with code revision ' + revision);
                 });
                 }*/
            }

            self.stop(callback);
        });
    },

    error: function (error) {
        var traces = stackTrace.parse(error);

        console.error(error.stack);

        if (traces !== undefined && traces !== null) {
            traces.forEach(function (trace) {
                var filename = trace.getFileName();
                var name = filename.substring(filename.lastIndexOf("/") + 1, filename.lastIndexOf("."));
                var module = modules.findLoadedModuleByName(name);
                if (module !== undefined && module !== null) {
                    modules.unloadModule(module);
                }
            });
        }
    }
};

module.exports = function (token) {
    dogbot.token = token;
    return dogbot;
};
