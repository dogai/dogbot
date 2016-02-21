/*
 * Copyright (C) 2015 dog.ai, Hugo Freire <hugo@dog.ai>. All rights reserved.
 */

var sql = require('./'),
    util = require('util');

function performance() {
    sql.call(this);

    this.communication = undefined;

    this._runFn = this._run.bind(this);
    this._getFn = this._get.bind(this);
    this._allFn = this._all.bind(this);
    this._eachFn = this._each.bind(this);
}
util.inherits(performance, sql);

performance.prototype.name = 'performance';

performance.prototype.start = function (communication) {
    var self = this;
    this.communication = communication;

    this.communication.on('database:' + this.name + ':setup', this._runFn);
    this.communication.on('database:' + this.name + ':create', this._runFn);
    this.communication.on('database:' + this.name + ':retrieveOne', this._getFn);
    this.communication.on('database:' + this.name + ':retrieveAll', this._allFn);
    this.communication.on('database:' + this.name + ':retrieveOneByOne', this._eachFn);
    this.communication.on('database:' + this.name + ':update', this._runFn);
    this.communication.on('database:' + this.name + ':delete', this._runFn);

    return this._open(this.name)
        .then(function () {
            return self.communication.emitAsync('database:performance:setup',
                'CREATE TABLE IF NOT EXISTS presence (' +
                'id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, ' +
                'created_date DATETIME DEFAULT CURRENT_TIMESTAMP, ' +
                'employee_id TEXT NOT NULL, ' +
                'is_present INTEGER NOT NULL, ' +
                'is_synced INTEGER NOT NULL DEFAULT 0, ' +
                'UNIQUE(created_date, employee_id)' +
                ');',
                []);
        })
        ;
};

performance.prototype.stop = function () {
    this.communication.removeListener('database:' + this.name + ':setup', this._runFn);
    this.communication.removeListener('database:' + this.name + ':create', this._runFn);
    this.communication.removeListener('database:' + this.name + ':retrieveOne', this._getFn);
    this.communication.removeListener('database:' + this.name + ':retrieveAll', this._allFn);
    this.communication.removeListener('database:' + this.name + ':retrieveOneByOne', this._eachFn);
    this.communication.removeListener('database:' + this.name + ':update', this._runFn);
    this.communication.removeListener('database:' + this.name + ':delete', this._runFn);

    return this._close();
};

module.exports = new performance();
