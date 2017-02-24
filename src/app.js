/*
 * Copyright (C) 2017, Hugo Freire <hugo@dog.ai>. All rights reserved.
 */

const SECRET = process.env.DOGBOT_SECRET
const WATCHDOG_USEC = process.env.WATCHDOG_USEC

const { Logger } = require('./utils')
const Bot = require('./bot')

// shutdown gracefully
const stopAndExit = () => {
  Bot.stop()
    .then(() => Logger.info('Stopped dogbot'))
    .finally(() => process.exit(0))
}

// log error and exit immediately
const logErrorAndExit = (error) => {
  Logger.error(error, () => process.exit(1))
}

process.on('uncaughtException', logErrorAndExit)
process.on('unhandledRejection', logErrorAndExit)
process.on('SIGINT', stopAndExit)
process.on('SIGTERM', stopAndExit)
process.on('SIGHUP', stopAndExit)
process.on('SIGABRT', () => process.exit(1)) // force immediate exit, i.e. systemd watchdog?

Logger.info('Starting dogbot')

Bot.start(SECRET)
  .then(() => {
    if (process.platform === 'linux') {
      require('./utils/systemd').sdNotify(0, 'READY=1', (error) => {
        if (error) {
          Logger.error(error.message, error)
        }
      })
    }

    if (WATCHDOG_USEC) {
      const heartbeat = (callback = () => {}) => {
        if (process.platform === 'linux') {
          require('./utils/systemd').sdNotify(0, 'WATCHDOG=1', callback)
        } else {
          callback()
        }
      }

      Bot.heartbeat(WATCHDOG_USEC, heartbeat)
        .then((interval) => {
          Logger.info(`Sending a heartbeat every ${interval} seconds`)
        })
    }
  })
  .catch((error) => logErrorAndExit(error))
