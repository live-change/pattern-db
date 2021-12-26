const DbServer = require('@live-change/db-server')
const Dao = require("@live-change/dao")

async function createLoopbackDao(credentials, daoFactory) {
  const server = new Dao.ReactiveServer(daoFactory)
  const loopback = new Dao.LoopbackConnection(credentials, server, {})
  const dao = new Dao(credentials, {
    remoteUrl: 'dao',
    protocols: { local: null },
    defaultRoute: {
      type: "remote",
      generator: Dao.ObservableList
    },
    connectionSettings: {
      disconnectDebug: true,
      logLevel: 10,
    },
  })
  dao.connections.set('local:dao', loopback)
  await loopback.initialize()
  if(!loopback.connected) {
    console.error("LOOPBACK NOT CONNECTED?!")
    process.exit(1)
  }
  return dao
}

async function testDb() {
  const dbServer = new DbServer({
    dbRoot: 'mem',
    backend: 'mem',
    slowStart: true,
    temporary: true
  })

  process.on('unhandledRejection', (reason, promise) => {
    if(reason.stack && reason.stack.match(/\s(userCode:([a-z0-9_.\/-]+):([0-9]+):([0-9]+))\n/i)) {
      dbServer.handleUnhandledRejectionInQuery(reason, promise)
    }
  })

  await dbServer.initialize()
  console.info(`database initialized!`)

  const loopbackDao = await createLoopbackDao('local', () => dbServer.createDao('local'))

  const oldDispose = loopbackDao.dispose
  loopbackDao.dbServer = dbServer
  loopbackDao.dispose = () => {
    dbServer.close()
    oldDispose.apply(loopbackDao)
  }

  loopbackDao.databaseName = 'test'
  await loopbackDao.request(['database', 'createDatabase'], loopbackDao.databaseName, { }).catch(err => 'exists')

  return loopbackDao
}

module.exports = testDb
