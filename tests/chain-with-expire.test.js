const test = require('tape')
const testDb = require('./testDb.js')
const lcp = require('@live-change/pattern')
const { relationsStore } = require('../lib/relations-store.js')

let model

test("compile fail2ban chain with expire", (t) => {

  t.plan(2)

  let { model: compiled, last } = lcp.chain([
    "failed-login",
    { eq: "ip", expire: "2m" },
    "failed-login"
  ])

  compiled.elements[last].actions = [ 'ban' ]

  console.log(JSON.stringify(compiled, null, '  '))

  model = compiled

  t.deepEqual(model, {
    "elements": {
      "failed-login": {
        "type": "failed-login",
        "id": "failed-login",
        "prev": [],
        "next": [
          "failed-login/ip@[ip|wait:2m]/failed-login",
          "failed-login/wait:2m@[ip|wait:2m]"
        ]
      },
      "failed-login/ip|wait:2m/failed-login": {
        "type": "failed-login",
        "id": "failed-login/ip|wait:2m/failed-login",
        "prev": [
          "failed-login/ip@[ip|wait:2m]/failed-login",
          "failed-login/wait:2m@[ip|wait:2m]"
        ],
        "next": [],
        "actions": ['ban']
      }
    },
    "relations": {
      "failed-login/ip@[ip|wait:2m]/failed-login": {
        "eq": [
          {
            "prev": "ip",
            "next": "ip"
          }
        ],
        "id": "failed-login/ip@[ip|wait:2m]/failed-login",
        "cancel": [
          "failed-login/wait:2m@[ip|wait:2m]"
        ],
        "prev": [
          "failed-login"
        ],
        "next": [
          "failed-login/ip|wait:2m/failed-login"
        ]
      },
      "failed-login/wait:2m@[ip|wait:2m]": {
        "id": "failed-login/wait:2m@[ip|wait:2m]",
        "wait": "2m",
        "cancel": [
          "failed-login/ip@[ip|wait:2m]/failed-login",
          "failed-login/wait:2m@[ip|wait:2m]"
        ],
        "prev": [
          "failed-login"
        ],
        "next": []
      }
    }
  })

  t.test('live processor', async (t) => {
    t.plan(4)

    const db = await testDb()
    const store = relationsStore(db, 'test', 'relations')
    await store.createTable()

    lcp.prepareModelForLive(model)
    const processor = new lcp.LiveProcessor(model, store)
    const ip = (Math.random()*1000).toFixed()
    let time = 0

    t.test('push first event', async (t) => {
      t.plan(1)
      const actions = await processor.processEvent({ id: 1, type: 'failed-login', keys: { ip }, time }, 0)
      console.log("ACTIONS", actions)
      const relations = await store.getRelations('failed-login', { ip })
      //console.log("RELATIONS", JSON.stringify(relations, null, "  "))
      if(relations.length > 0) {
        t.pass('processed')
      } else {
        t.fail('no reaction')
      }
    })

    t.test('wait 2.5m for expire', async (t) => {
      t.plan(1)
      time += 2.5 * 60 * 1000
      const actions = await processor.processTime(time)
      console.log("ACTIONS", actions)
      const relations = await store.getRelations('failed-login', { ip })
      if(relations.length == 0) {
        t.pass('expired')
      } else {
        t.fail('still exists')
      }
    })

    t.test('push second event', async (t) => {
      t.plan(1)
      time += 1000
      const actions = await processor.processEvent({ id: 2, type: 'failed-login', keys: { ip }, time }, 0)
      console.log("ACTIONS", actions)
      const relations = await store.getRelations('failed-login', { ip })
      if(relations.length > 0) {
        t.pass('processed')
      } else {
        t.fail('no reaction')
      }
    })

    t.test('push third event', async (t) => {
      t.plan(1)
      time += 1000
      const actions = await processor.processEvent({ id:3, type: 'failed-login', keys: { ip }, time }, 0)
      console.log("ACTIONS", actions)
      t.deepEqual(actions, ['ban'], 'actions match')
    })

  })

})


