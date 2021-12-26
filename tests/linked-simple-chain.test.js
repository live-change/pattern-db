const test = require('tape')
const testDb = require('./testDb.js')
const lcp = require('@live-change/pattern')
const { relationsStore } = require('../lib/relations-store.js')

let model

test("compile simple chain", (t) => {

  t.plan(2)

  let { model: compiled } =
      lcp.first({ id: 'visitor', type: 'enter-website' })
          .link("sessionId", lcp.first({ id: 'started-registration', type: 'start-register' }))
          .link("userId", lcp.first({ id: 'registered', type: 'finish-register' }))

  console.log(JSON.stringify(compiled, null, '  '))

  model = compiled

  t.deepEqual(model, {
    "elements": {
      "visitor": {
        "id": "visitor",
        "type": "enter-website",
        "prev": [],
        "next": [
          "visitor/sessionId/started-registration"
        ]
      },
      "started-registration": {
        "id": "started-registration",
        "type": "start-register",
        "prev": [
          "visitor/sessionId/started-registration"
        ],
        "next": [
          "started-registration/userId/registered"
        ]
      },
      "registered": {
        "id": "registered",
        "type": "finish-register",
        "prev": [
          "started-registration/userId/registered"
        ],
        "next": []
      }
    },
    "relations": {
      "visitor/sessionId/started-registration": {
        "eq": [
          {
            "prev": "sessionId",
            "next": "sessionId"
          }
        ],
        "id": "visitor/sessionId/started-registration",
        "prev": [
          "visitor"
        ],
        "next": [
          "started-registration"
        ]
      },
      "started-registration/userId/registered": {
        "eq": [
          {
            "prev": "userId",
            "next": "userId"
          }
        ],
        "id": "started-registration/userId/registered",
        "prev": [
          "started-registration"
        ],
        "next": [
          "registered"
        ]
      }
    }
  }, 'model compiled')

  t.test('live processor', async (t) => {
    t.plan(2)

    const db = await testDb()
    const store = relationsStore(db, 'test', 'relations')
    await store.createTable()

    lcp.prepareModelForLive(model)
    const processor = new lcp.LiveProcessor(model, store)
    const sessionId = (Math.random()*1000).toFixed()
    const userId = (Math.random()*1000).toFixed()

    t.test('push first event', async (t) => {
      t.plan(1)
      await processor.processEvent({ type: 'enter-website', keys: { sessionId }, time: 0 })
      const relations = await store.getRelations('start-register', { sessionId })
      //console.log("RELATIONS", JSON.stringify(relations, null, "  "))
      if(relations.length > 0) {
        t.pass('processed')
      } else {
        t.fail('no reaction')
      }
    })

    t.test('push second event', async (t) => {
      t.plan(1)
      await processor.processEvent({ type: 'start-register', keys: { sessionId, userId }, time: 100 })
      const relations = await store.getRelations('finish-register', { userId })
      //console.log("RELATIONS", JSON.stringify(relations, null, "  "))
      if(relations.length > 0) {
        t.pass('processed')
      } else {
        t.fail('no reaction')
      }
    })

  })

})


