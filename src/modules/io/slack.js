/*
 * Copyright (C) 2015 dog.ai, Hugo Freire <hugo@dog.ai>. All rights reserved.
 */

var logger = require('../../utils/logger.js'),
    _ = require('lodash'),
    Promise = require('bluebird');

var RtmClient = require('slack-client').RtmClient,
    MemoryDataStore = require('slack-client').MemoryDataStore;

function slack() {
}

slack.prototype.type = "IO";

slack.prototype.name = "slack";

slack.prototype.info = function() {
    return "*" + this.name + "* - " +
        "_" + this.name.charAt(0).toUpperCase() + this.name.slice(1) + " I/O module_";
};

slack.prototype.load = function (communication, config) {
    this.communication = communication;

    this.apiToken = (config && config.api_token || undefined);
    if (!this.apiToken || this.apiToken.trim() === '') {
        throw new Error('invalid configuration: no API token available');
    }

    this.defaultChannel = (config && config.default_channel || undefined);

    this._dataStore = new MemoryDataStore({'logger': logger});

    this._client = new RtmClient(this.apiToken, {autoReconnect: true, dataStore: this._dataStore});

    return this.start();
};

slack.prototype.unload = function () {
    return this.stop();
};

slack.prototype.start = function () {
    return new Promise(function (resolve, reject) {
        instance._client.once('open', resolve);
        instance._client.once('unable_to_rtm_start', reject);

        instance._client.start();
    });
};

slack.prototype.stop = function () {
    return new Promise(function (resolve) {
        instance._client.once('disconnect', resolve);

        instance._client.disconnect();
    })
};

slack.prototype.send = function(recipient, message) {

    if (recipient === null) {
        return this.send(this.defaultChannel, message);
    } else if (recipient.charAt(0) === '#') {
        var channel = this.client.getChannelByName(recipient.substring(1));
        channel.send(message);
    } else if (recipient.charAt(0) === 'D') {
        var id = this.client.getChannelGroupOrDMByID(recipient);
        id.send(message);
    } else if (recipient.charAt(0) === 'U') {
        var self = this;

        this.client.openDM(recipient, function (dm) {
            if (dm !== undefined && dm !== null && dm.channel.id !== null) {
                self.send(dm.channel.id, message);
            }
        });
    }
};

/*
slack.prototype._discoverUsers = function () {
    var self = this;

    var channel = this.client.getChannelByName(this.defaultChannel.substring(1));
    var users = this._getUsersInChannel(channel);
    users.forEach(function (user) {
        if (user.presence === 'active') {
 self.communication.emit('io:slack:userIsAlreadyActive', user);
        } else {
 self.communication.emit('io:slack:userIsAlreadyAway', user);
        }
    });
};

slack.prototype._listenUserPresence = function (user, presence) {
 var channel = this._client.getChannelByName(this.defaultChannel.substring(1));
    if (this._isUserInChannel(user, channel)) {
        switch (presence) {
            case 'active':
 this.communication.emit('io:slack:userIsNowActive', user);
                break;
            case 'away':
 this.communication.emit('io:slack:userIsNowAway', user);
                break;
        }
    }
};

slack.prototype._isUserInChannel = function (user, channel) {
    if (!user || !channel) {
        return false;
    }

    return !_.findIndex((channel.members || []), function (id) {
        return user.id == id;
    });
};

slack.prototype._getUsersInChannel = function (channel) {
    if (!channel) {
        return [];
    }

    var self = this;
    return (channel.members || [])
        .map(function (id) {
            return self.client.users[id];
        })
        .filter(function (u) {
            return !!u && !u.is_bot;
        });
 };*/

var instance = new slack();

module.exports = instance;
