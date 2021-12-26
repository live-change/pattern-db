const test = require('tape')
const testDb = require('./testDb.js')
const lcp = require('@live-change/pattern')
const { relationsStore } = require('../lib/relations-store.js')
let model

test("compile fail2ban chain with expire", (t) => {

  t.plan(2)

  let { model: compiled } =
      lcp.first({ id: "first-failed-attempt", type: "failed-login" })
      .link({ eq: "ip", expire: "2m" },
          lcp.first({ id: "second-failed-attempt", type: "failed-login", actions: ['ban'] })
      )

  console.log(JSON.stringify(compiled, null, '  '))

  model = compiled

  t.deepEqual(model, {
        "elements": {
          "first-failed-attempt": {
            "id": "first-failed-attempt",
            "type": "failed-login",
            "prev": [],
            "next": [
              "first-failed-attempt/ip@[ip|wait:2m]/second-failed-attempt",
              "first-failed-attempt/wait:2m@[ip|wait:2m]"
            ]
          },
          "second-failed-attempt": {
            "id": "second-failed-attempt",
            "type": "failed-login",
            "actions": [
              "ban"
            ],
            "prev": [
              "first-failed-attempt/ip@[ip|wait:2m]/second-failed-attempt"
            ],
            "next": []
          }
        },
        "relations": {
          "first-failed-attempt/ip@[ip|wait:2m]/second-failed-attempt": {
            "eq": [
              {
                "prev": "ip",
                "next": "ip"
              }
            ],
            "id": "first-failed-attempt/ip@[ip|wait:2m]/second-failed-attempt",
            "cancel": [
              "first-failed-attempt/wait:2m@[ip|wait:2m]"
            ],
            "prev": [
              "first-failed-attempt"
            ],
            "next": [
              "second-failed-attempt"
            ]
          },
          "first-failed-attempt/wait:2m@[ip|wait:2m]": {
            "id": "first-failed-attempt/wait:2m@[ip|wait:2m]",
            "wait": "2m",
            "cancel": [
              "first-failed-attempt/ip@[ip|wait:2m]/second-failed-attempt",
              "first-failed-attempt/wait:2m@[ip|wait:2m]"
            ],
            "prev": [
              "first-failed-attempt"
            ],
            "next": []
          }
        }
      }, "compiled ok")

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
      const actions = await processor.processEvent({ type: 'failed-login', keys: { ip }, time }, 0)
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
      //console.log("RELATIONS", JSON.stringify(relations, null, "  "))
      if(relations.length == 0) {
        t.pass('expired')
      } else {
        t.fail('still exists')
      }
    })

    t.test('push second event', async (t) => {
      t.plan(1)
      time += 1000
      const actions = await processor.processEvent({ type: 'failed-login', keys: { ip }, time }, 0)
      console.log("ACTIONS", actions)
      const relations = await store.getRelations('failed-login', { ip })
      //console.log("RELATIONS", JSON.stringify(relations, null, "  "))
      if(relations.length > 0) {
        t.pass('processed')
      } else {
        t.fail('no reaction')
      }
    })

    t.test('push third event', async (t) => {
      t.plan(1)
      time += 1000
      const actions = await processor.processEvent({ type: 'failed-login', keys: { ip }, time }, 0)
      console.log("ACTIONS", actions)
      t.deepEqual(actions, ['ban'],'actions match')
    })

  })


})


