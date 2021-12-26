const test = require('tape')
const testDb = require('./testDb.js')
const lcp = require('@live-change/pattern')
const { relationsStore } = require('../lib/relations-store.js')
const svg = require('./svg.js')

let model

test("simple chain", async (t) => {
  t.plan(4)

  const db = await testDb()
  const store = relationsStore(db, 'test', 'relations')
  await store.createTable()

  t.test('compile', (t) => {
    t.plan(1)

    let { model: compiled } = lcp.chain([
      "enter-website",
      "sessionId",
      "start-register",
      "userId",
      "finish-register"
    ])

    console.log(JSON.stringify(compiled, null, '  '))

    model = compiled

    t.deepEqual(model,{
        "elements": {
          "enter-website": {
            "type": "enter-website",
            "id": "enter-website",
            "prev": [],
            "next": [
              "enter-website/sessionId/start-register"
            ]
          },
          "enter-website/sessionId/start-register": {
            "type": "start-register",
            "id": "enter-website/sessionId/start-register",
            "prev": [
              "enter-website/sessionId/start-register"
            ],
            "next": [
              "enter-website/sessionId/start-register/userId/finish-register"
            ]
          },
          "enter-website/sessionId/start-register/userId/finish-register": {
            "type": "finish-register",
            "id": "enter-website/sessionId/start-register/userId/finish-register",
            "prev": [
              "enter-website/sessionId/start-register/userId/finish-register"
            ],
            "next": []
          }
        },
        "relations": {
          "enter-website/sessionId/start-register": {
            "eq": [
              {
                "prev": "sessionId",
                "next": "sessionId"
              }
            ],
            "id": "enter-website/sessionId/start-register",
            "prev": [
              "enter-website"
            ],
            "next": [
              "enter-website/sessionId/start-register"
            ]
          },
          "enter-website/sessionId/start-register/userId/finish-register": {
            "eq": [
              {
                "prev": "userId",
                "next": "userId"
              }
            ],
            "id": "enter-website/sessionId/start-register/userId/finish-register",
            "prev": [
              "enter-website/sessionId/start-register"
            ],
            "next": [
              "enter-website/sessionId/start-register/userId/finish-register"
            ]
          }
        }
      }, 'model compiled')

  })

  t.test('live processor', async (t) => {
    t.plan(2)

    lcp.prepareModelForLive(model)
    const processor = new lcp.LiveProcessor(model, store)
    const sessionId = (Math.random()*1000).toFixed()
    const userId = (Math.random()*1000).toFixed()

    t.test('push first event', async (t) => {
      t.plan(1)
      await processor.processEvent({ type: 'enter-website', keys: { sessionId }, time: 0 })
      if((await store.getRelations('start-register', { sessionId })).length > 0) {
        t.pass('processed')
      } else {
        t.fail('no reaction')
      }
    })

    t.test('push second event', async (t) => {
      t.plan(1)
      await processor.processEvent({ type: 'start-register', keys: { sessionId, userId }, time: 100 })
      if((await store.getRelations('finish-register', { userId })).length > 0) {
        t.pass('processed')
      } else {
        t.fail('no reaction')
      }
    })

  })

  t.test("test relations search", async (t) => {
    t.plan(4)

    const sessionId = (Math.random()*1000).toFixed()
    const userId = (Math.random()*1000).toFixed()

    const events = [
      { id: 0, type: 'enter-website', keys: { sessionId } },
      { id: 1, type: 'start-register', keys: { sessionId, userId } },
      { id: 2, type: 'finish-register', keys: { userId  } }
    ]

    async function getEventsByRelation( types, keys, from, to ) { /// TODO: use events store
      console.log("GETEVENTS", types, keys, from, to)
      return events.filter(ev => {
        if(types.indexOf(ev.type) == -1) return
        for(let key in keys) if(ev.keys[key] != keys[key]) return
        return true
      })
    }

    t.test("related previous events", async (t) => {
      t.plan(1)
      const related = await lcp.findRelatedEvents([events[2]], true, model,
          -Infinity, Infinity, getEventsByRelation)
      console.log("RELATED", Array.from(related.values()))
      t.deepEqual(Array.from(related.values()), [{
        ...events[1], elements: ['enter-website/sessionId/start-register']
      }], "found related events")
    })

    t.test("all related previous events", async (t) => {
      t.plan(1)
      const related = await lcp.findAllRelatedEvents([events[2]], true, model,
          -Infinity, Infinity, getEventsByRelation)
      console.log("RELATED", Array.from(related.values()))
      t.deepEqual(Array.from(related.values()), [
        { ...events[1], elements: [ 'enter-website/sessionId/start-register' ] },
        { ...events[0], elements: [ 'enter-website' ] }
      ], "found related events")
    })

    t.test("related next events", async (t) => {
      t.plan(1)
      const related = await lcp.findRelatedEvents([events[0]], false, model,
          -Infinity, Infinity, getEventsByRelation)
      console.log("RELATED", Array.from(related.values()))
      t.deepEqual(Array.from(related.values()), [{
        ...events[1], elements: ['enter-website/sessionId/start-register']
      }], "found related events")
    })

    t.test("all related previous events", async (t) => {
      t.plan(1)
      const related = await lcp.findAllRelatedEvents([events[0]], false, model,
          -Infinity, Infinity, getEventsByRelation)
      console.log("RELATED", Array.from(related.values()))
      t.deepEqual(Array.from(related.values()), [
        { ...events[1], elements: [ 'enter-website/sessionId/start-register' ] },
        { ...events[2], elements: [ 'enter-website/sessionId/start-register/userId/finish-register' ] }
      ], "found related events")
    })
  })

  t.test("test graphs", async (t) => {
    t.plan(3)

    const sessionId = (Math.random() * 1000).toFixed()
    const userId = (Math.random() * 1000).toFixed()
    const userId2 = userId + 1

    const events = [
      {id: 0, type: 'enter-website', keys: {sessionId}, time: 0},
      {id: 1, type: 'enter-website', keys: {sessionId}, time: 1000},
      {id: 2, type: 'start-register', keys: {sessionId, userId}, time: 2000},
      {id: 3, type: 'start-register', keys: {sessionId, userId: userId2}, time: 3000},
      {id: 4, type: 'finish-register', keys: {userId}, time: 4000}
    ]

    t.test("build full graph", async (t) => {
      t.plan(1)
      const processor = new lcp.FullGraphProcessor(model, lcp.relationsStore())
      for(const ev of events) await processor.processEvent(ev)
      const graph = processor.graph
      console.log("GRAPH\n  "+Array.from(graph.values()).map(n => JSON.stringify(n)).join('\n  '))
      t.deepEqual(Array.from(graph.values()), [
        {"id":0,"type":"enter-website","keys":{"sessionId":""+sessionId},"time":0,"prev":[],"next":[
            {"relation":"enter-website/sessionId/start-register","to":2},
            {"relation":"enter-website/sessionId/start-register","to":3}],
          "start":true},
        {"id":1,"type":"enter-website","keys":{"sessionId":""+sessionId},"time":1000,"prev":[],"next":[
            {"relation":"enter-website/sessionId/start-register","to":2},
            {"relation":"enter-website/sessionId/start-register","to":3}],
          "start":true},
        {"id":2,"type":"start-register","keys":{"sessionId":""+sessionId,"userId":""+userId},"time":2000,
          "prev":[
            {"relation":"enter-website/sessionId/start-register","to":0},
            {"relation":"enter-website/sessionId/start-register","to":1}],
          "next":[
            {"relation":"enter-website/sessionId/start-register/userId/finish-register","to":4}],
          "start":false},
        {"id":3,"type":"start-register","keys":{"sessionId":""+sessionId,"userId":""+userId2},"time":3000,"prev":[
            {"relation":"enter-website/sessionId/start-register","to":0},
            {"relation":"enter-website/sessionId/start-register","to":1}],
          "next":[],"start":false},
        {"id":4,"type":"finish-register","keys":{"userId":""+userId},"time":4000,"prev":[
            {"relation":"enter-website/sessionId/start-register/userId/finish-register","to":2}],
          "next":[],"start":false}
      ], 'proper graph generated')


      await svg.generateGraphSvg("simple-chain-full-graph.svg", graph,
          n => ({ ...n, label: n.type, title: `${n.id} at ${n.time}`, sort: n.time }),
          (rel, source, target) => ({ ...rel, value: 1, label: rel.relation, title: rel.relation })
      )
    })

    t.test("build summary graph with count", async (t) => {
      t.plan(1)
      const processor = new lcp.SummaryGraphProcessor(model, lcp.relationsStore())
      for(const ev of events) await processor.processEvent(ev)
      const graph = processor.graph
      console.log("GRAPH\n  "+Array.from(graph.values()).map(n => JSON.stringify(n)).join('\n  '))
      t.deepEqual(Array.from(graph.values()), [
        {"id":"enter-website:0","prev":[],
          "next":[{"to":"enter-website/sessionId/start-register:1","counter":4}],
          "start":true,"counter":2},
        {"id":"enter-website/sessionId/start-register:1",
          "prev":[{"to":"enter-website:0","counter":4}],
          "next":[{"to":"enter-website/sessionId/start-register/userId/finish-register:2","counter":1}],
          "start":false,"counter":2},
        {"id":"enter-website/sessionId/start-register/userId/finish-register:2",
          "prev":[{"to":"enter-website/sessionId/start-register:1","counter":1}],
          "next":[],"start":false,"counter":1}
      ], 'proper graph generated')

      lcp.computeGraphDepth(graph,['enter-website:0'])

      await svg.generateGraphSvg("simple-chain-summary-count.svg", graph,
          n => ({ ...n, label: n.id.split(':')[0], title: `${n.id} at ${n.time}`, sort: n.depth }),
          (rel, source, target) => ({ ...rel, value: rel.counter, label: rel.relation, title: rel.relation })
      )
    })

    t.test("build summary graph with events", async (t) => {
      t.plan(1)
      const processor = new lcp.SummaryGraphProcessor(model, lcp.relationsStore(), {
        ...lcp.graphAggregation.nodeElementDepth,
        ...lcp.graphAggregation.relationSimple,
        ...lcp.graphAggregation.summaryEvents
      })
      for (const ev of events) await processor.processEvent(ev)
      const graph = processor.graph
      console.log("GRAPH\n  " + Array.from(graph.values()).map(n => JSON.stringify(n)).join('\n  '))
      t.deepEqual(Array.from(graph.values()), [
        {"id":"enter-website:0","prev":[],
          "next":[{"to":"enter-website/sessionId/start-register:1","events":[2,3]}],
          "start":true,"events":[0,1]},
        {"id":"enter-website/sessionId/start-register:1",
          "prev":[{"to":"enter-website:0","events":[2,3]}],
          "next":[{"to":"enter-website/sessionId/start-register/userId/finish-register:2","events":[4]}],
          "start":false,"events":[2,3]},
        {"id":"enter-website/sessionId/start-register/userId/finish-register:2",
          "prev":[{"to":"enter-website/sessionId/start-register:1","events":[4]}],
          "next":[],
          "start":false,"events":[4]}

      ], 'proper graph generated')

      lcp.computeGraphDepth(graph,['enter-website:0'])

      await svg.generateGraphSvg("simple-chain-summary-events-count.svg", graph,
          n => ({ ...n, label: n.id.split(':')[0], title: `${n.id}`, sort: n.depth }),
          (rel, source, target) => ({ ...rel, value: rel.events.length, label: rel.relation, title: rel.relation })
      )
    })
  })

})


