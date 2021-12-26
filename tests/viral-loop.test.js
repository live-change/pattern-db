const test = require('tape')
const testDb = require('./testDb.js')
const lcp = require('@live-change/pattern')
const { relationsStore } = require('../lib/relations-store.js')
const svg = require('./svg.js')

let model

test("viral loop", async (t) => {
  t.plan(4)

  const db = await testDb()
  const store = relationsStore(db, 'test', 'relations')
  await store.createTable()

  t.test('compile', (t) => {
    t.plan(2)

    const generatedLink = lcp.first({ id: 'generated-link', type: 'generated-link' })

    const registelcpart = generatedLink
        .link("refId", lcp.first({ id: 'visitor', type: 'enter-website' }))
        .link("sessionId", lcp.first({ id: 'started-registration', type: 'start-register' }))
        .link("userId", lcp.first({ id: 'registered', type: 'finish-register' }))
        .link("userId", lcp.first({ id: 'shared', type: 'share' }))

    const { model: compiled } = registelcpart
        .link({ eq: [{ prev: "userId", next: "refId" }] },
            { model: registelcpart, first: 'visitor' } )

    console.log(JSON.stringify(compiled, null, '  '))

    model = compiled

    t.deepEqual(model, {
        "elements": {
          "generated-link": {
            "id": "generated-link",
            "type": "generated-link",
            "prev": [],
            "next": [
              "generated-link/refId/visitor"
            ]
          },
          "visitor": {
            "id": "visitor",
            "type": "enter-website",
            "prev": [
              "generated-link/refId/visitor",
              "shared/userId=refId/visitor"
            ],
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
            "next": [
              "registered/userId/shared"
            ]
          },
          "shared": {
            "id": "shared",
            "type": "share",
            "prev": [
              "registered/userId/shared"
            ],
            "next": [
              "shared/userId=refId/visitor"
            ]
          }
        },
        "relations": {
          "generated-link/refId/visitor": {
            "eq": [
              {
                "prev": "refId",
                "next": "refId"
              }
            ],
            "id": "generated-link/refId/visitor",
            "prev": [
              "generated-link"
            ],
            "next": [
              "visitor"
            ]
          },
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
          },
          "registered/userId/shared": {
            "eq": [
              {
                "prev": "userId",
                "next": "userId"
              }
            ],
            "id": "registered/userId/shared",
            "prev": [
              "registered"
            ],
            "next": [
              "shared"
            ]
          },
          "shared/userId=refId/visitor": {
            "eq": [
              {
                "prev": "userId",
                "next": "refId"
              }
            ],
            "id": "shared/userId=refId/visitor",
            "prev": [
              "shared"
            ],
            "next": [
              "visitor"
            ]
          }
        }
      }, 'model is ok')

    lcp.prepareModelForLive(model)

    t.pass('prepared model')
  })

  const events = []
  async function getEventsByRelation( types, keys, from, to ) {
    //console.log("GETEVENTS", types, keys, from, to)
    return events.filter(ev => {
      if(types.indexOf(ev.type) == -1) return
      for(let key in keys) if(ev.keys[key] != keys[key]) return
      return true
    })
  }

  let stats = {
    "link-1": {
      visitor: 0,
      "started-registration": 0,
      "registered": 0,
      "shared": 0,
      visitorFromShared: 0
    },
    "link-2": {
      visitor: 0,
      "started-registration": 0,
      "registered": 0,
      "shared": 0,
      visitorFromShared: 0
    },
    "link-3": {
      visitor: 0,
      "started-registration": 0,
      "registered": 0,
      "shared": 0,
      visitorFromShared: 0
    }
  }

  t.test('generate random events', async t => {
    t.plan(1)

    let uid = 0
    let id = 1
    let time = 0

    events.push({ id: id++, type: 'generated-link', keys: { refId: 'link-1' }, time })
    time += 1
    events.push({ id: id++, type: 'generated-link', keys: { refId: 'link-2' }, time })
    time += 1
    events.push({ id: id++, type: 'generated-link', keys: { refId: 'link-3' }, time })

    time += 1000

    function random() {
      return Math.random()
    }

    function randTime(f = 1) {
      return Math.floor(random()*10000*f)
    }

    let queued = []

    function simulateEntry(keys, time, prob) {
      events.push({ id: id++, type: 'enter-website', keys, time })
      if(Number.isInteger(keys.refId)) prob.stats.visitorFromShared++
      else prob.stats.visitor++
      if(random() < prob.startRegister) {
        queued.push(() =>
            simulateStartRegister({ sessionId: keys.sessionId, userId: ++uid }, time + randTime(), prob)
        )
      } /*else if(random() < prob.reentry) {
        queued.push(() =>
            simulateEntry({sessionId: keys.sessionId}, time + randTime(), prob)
        )
      }*/
    }

    function simulateStartRegister(keys, time, prob) {
      events.push({ id: id++, type: 'start-register', keys, time })
      prob.stats['started-registration']++
      if(random() < prob.finishRegister) {
        queued.push(() =>
            simulateFinishRegister({ userId: keys.userId }, time + randTime(), prob)
        )
      } /*else if(random() < prob.reentry) {
        queued.push(() =>
            simulateEntry({sessionId: keys.sessionId}, time + randTime(), prob)
        )
      }*/
    }

    function simulateFinishRegister(keys, time, prob) {
      events.push({ id: id++, type: 'finish-register', keys, time })
      prob.stats['registered']++
      if(random() < prob.share) {
        queued.push(() =>
            simulateShare(keys, time + randTime(), prob)
        )
      }
    }

    function simulateShare(keys, time, prob) {
      events.push({ id: id++, type: 'share', keys, time })
      prob.stats['shared']++
      for(let i = 0; i < prob.shareViews; i++) {
        if (random() < prob.shareEntry) {
          queued.push(() =>
              simulateEntry({ refId: keys.userId, sessionId: ++uid }, time + randTime(), prob)
          )
        }
      }
    }

    const link1P = {
      entry: 0.1,
      reentry: 0.2,
      startRegister: 0.3,
      finishRegister: 0.9,
      share: 0.4,
      shareViews: 50,
      shareEntry: 0.3,
      stats: stats["link-1"]
    }

    const link2P = {
      entry: 0.5,
      reentry: 0.2,
      startRegister: 0.3,
      finishRegister: 0.9,
      share: 0.2,
      shareViews: 30,
      shareEntry: 0.3,
      stats: stats["link-2"]
    }

    const link3P = {
      entry: 0.4,
      reentry: 0.2,
      startRegister: 0.5,
      finishRegister: 0.9,
      share: 0.5,
      shareViews: 20,
      shareEntry: 0.3,
      stats: stats["link-3"]
    }

    for(let i = 0; i < 15; i++) {
      time += randTime(3);
      let r = random()
      if(r < link1P.entry)
        simulateEntry({ refId: 'link-1', sessionId: ++uid }, time, link1P)
      else if(r - link1P.entry < link2P.entry)
        simulateEntry({ refId: 'link-2', sessionId: ++uid }, time, link2P)
      else if(r - link1P.entry - link2P.entry < link3P.entry)
        simulateEntry({ refId: 'link-3', sessionId: ++uid }, time, link3P)
    }

    let next, steps = 1
    do {
      next = queued
      queued = []
      for(const fun of next) fun()
      if(events.length > 200) break; //throw new Error("Too much!")
      steps += next.length && 1
    } while(next.length > 0)

    events.sort((a,b) => a.time == b.time ? 0 : (a.time > b.time ? 1 : -1))

    console.log("GENERATED EVENTS COUNT", events.length, "IN", steps, "STEPS")
    t.pass("events generated")

  })

  const nodeViz = n =>
      ({ ...n, label: `${n.id.split(':')[0]} ${n.events.length}`, title: `${n.id}`, sort: n.depth })
  const linkViz = (rel, source, target) =>
      ({ ...rel, value: rel.events.length, sourceLabel: rel.events.length, targetLabel: rel.relation , title: rel.relation })

  t.test("test graph of all events", async (t) => {
    t.plan(1)
    t.test("summary graph with events", async (t) => {
      t.plan(1)

      const processor = new lcp.SummaryGraphProcessor(model, store, {
        ...lcp.graphAggregation.nodeElement,
        ...lcp.graphAggregation.relationSimple,
        ...lcp.graphAggregation.summaryEvents,
        nodes: ({ element, relation }, keys) => element == 'generated-link' ? [ keys.refId ] : [ element ],
      })
      for (const ev of events) {
        await processor.processEvent(ev)
      }
      const graph = processor.graph
      console.log("GRAPH\n  " + Array.from(graph.values()).map(n => JSON.stringify(n)).join('\n  '))

      console.log("ALL VISITORS FROM SHARE", stats['link-1'].visitorFromShared
          + stats['link-2'].visitorFromShared + stats['link-3'].visitorFromShared)
      console.log("ALL VISITORS FROM LINK", stats['link-1'].visitor + stats['link-2'].visitor + stats['link-3'].visitor)
      console.log("ALL STARTED REGISTRATION", stats['link-1']['started-registration']
          + stats['link-2']['started-registration'] + stats['link-3']['started-registration'])
      console.log("ALL REGISTERED", stats['link-1']['registered']
          + stats['link-2']['registered'] + stats['link-3']['registered'])
      console.log("ALL SHARED", stats['link-1']['shared']
          + stats['link-2']['shared'] + stats['link-3']['shared'])

      t.pass('ok')

      lcp.computeGraphDepth(graph,['visitor'])

      await svg.generateGraphSvg("viral-loop-summary-events-count.svg", graph, nodeViz, linkViz)
    })
  })

  t.test("test graph of link events", async (t) => {
    t.plan(3)

    for(let link of ['link-1', 'link-2', 'link-3']) {

      const start = [events.find(ev => ev.type == 'generated-link' && ev.keys.refId == link)]
      const related = await lcp.findAllRelatedEvents(start, false, model,
          -Infinity, Infinity, getEventsByRelation)
      const filtered = start.concat(Array.from(related.values()))
      //console.log("FILTERED", filtered)
      filtered.sort((a, b) => a.time == b.time ? 0 : (a.time > b.time ? 1 : -1))

      t.test("summary graph of "+link+" with events", async (t) => {
        t.plan(1)
        const processor = new lcp.SummaryGraphProcessor(model, store, {
          ...lcp.graphAggregation.nodeElement,
          ...lcp.graphAggregation.relationSimple,
          ...lcp.graphAggregation.summaryEvents,
          nodes: ({element, relation}, keys) => element == 'generated-link' ? [keys.refId] : [element],
        })
        for (const ev of filtered) await processor.processEvent(ev)
        const graph = processor.graph
        console.log("GRAPH\n  " + Array.from(graph.values()).map(n => JSON.stringify(n)).join('\n  '))

        t.pass('ok')

        lcp.computeGraphDepth(graph, [link])

        await svg.generateGraphSvg("viral-loop-"+link+"-summary-events-count.svg", graph, nodeViz, linkViz)
      })
    }
  })
})