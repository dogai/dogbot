/*
 * Copyright (C) 2015 dog.ai, Hugo Freire <hugo@dog.ai>. All rights reserved.
 */

var sql = require('../sql.js'),
    util = require("util");

function auth() {
    sql.call(this);

    this.communication = {};
}

util.inherits(auth, sql);

auth.prototype.name = "auth";

auth.prototype.start = function (communication) {
    this.communication = communication;

    this._open(this.name);

    this.communication.on('database:' + this.name + ':setup', this._run.bind(this));
    this.communication.on('database:' + this.name + ':create', this._run.bind(this));
    this.communication.on('database:' + this.name + ':retrieveOne', this._get.bind(this));
    this.communication.on('database:' + this.name + ':retrieveAll', this._all.bind(this));
    this.communication.on('database:' + this.name + ':retrieveOneByOne', this._each.bind(this));
    this.communication.on('database:' + this.name + ':update', this._run.bind(this));
    this.communication.on('database:' + this.name + ':delete', this._run.bind(this));
};

auth.prototype.stop = function () {
    this.communication.removeListener('database:' + this.name + ':setup', this._run.bind(this));
    this.communication.removeListener('database:' + this.name + ':create', this._run.bind(this));
    this.communication.removeListener('database:' + this.name + ':retrieveOne', this._get.bind(this));
    this.communication.removeListener('database:' + this.name + ':retrieveAll', this._all.bind(this));
    this.communication.removeListener('database:' + this.name + ':retrieveOneByOne', this._each.bind(this));
    this.communication.removeListener('database:' + this.name + ':update', this._run.bind(this));
    this.communication.removeListener('database:' + this.name + ':delete', this._run.bind(this));

    this._close();
};

var instance = new auth();

module.exports = instance;
