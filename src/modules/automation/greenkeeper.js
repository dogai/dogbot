/*
 * Copyright (C) 2017, Hugo Freire <hugo@dog.ai>. All rights reserved.
 */

const AutomationModule = require('./automation-module')

const Server = require('../../server')

const Logger = require('modern-logger')

const GitHubWrapper = require('@dog-ai/github-wrapper')

const mergeGreenkeeperPullRequests = function (params, callback) {
  const owner = this.options.greenkeeper.merge_owner

  return this.wrapper.mergeGreenkeeperPullRequests(owner)
    .catch((error) => Logger.error(error))
    .finally(callback)
}

class Greenkeeper extends AutomationModule {
  constructor () {
    super('greenkeeper')
  }

  load (options = {}) {
    this.options = options

    if (!this.options.api_token) {
      throw new Error('api token not available')
    }

    if (!this.options.greenkeeper || !this.options.greenkeeper.merge_owner) {
      throw new Error('greenkeeper is not configured')
    }

    const token = this.options.api_token
    this.wrapper = new GitHubWrapper({ github: { type: 'token', token } })

    super.load(options)
  }

  unload () {
    if (this.wrapper) {
      delete this.wrapper
    }

    super.unload()
  }

  start () {
    super.start({
      'automation:greenkeeper:merge': mergeGreenkeeperPullRequests.bind(this)
    })

    Server.enqueueJob('automation:greenkeeper:merge', null, { schedule: '30 minutes' })
  }

  stop () {
    Server.dequeueJob('automation:greenkeeper:merge')

    super.stop()
  }
}

module.exports = new Greenkeeper()
