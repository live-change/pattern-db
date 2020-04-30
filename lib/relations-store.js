const lcp = require("@live-change/pattern")
const crypto = require("crypto")

function relationsStore(dao, database, table) {

  async function createTable() {
    console.log("CREATE TABLE", table)
    try {
      await dao.request(['database', 'createTable'], database, table)
    } catch(e) {
      // console.error(e)
    }
    console.log("CREATE INDEX", table+'_eventTypeAndKeys')
    try {
      await dao.request(['database', 'createIndex'], database, table+'_eventTypeAndKeys', `(${
          async function(input, output, { table }) {
            const mapper = (obj) => ({ id: obj.eventType+'_'+obj.keys+'_'+obj.id, to: obj.id })
            await input.table(table).onChange((obj, oldObj) =>
                output.change(obj && mapper(obj), oldObj && mapper(oldObj)) )
          }
      })`, { table })
    } catch(e) {
      // console.error(e)
    }
    console.log("CREATE INDEX", table+'_sourceRelation')
    try {
      await dao.request(['database', 'createIndex'], database, table+'_sourceRelation', `(${
          async function(input, output, { table }) {
            const mapper = (obj) => ({ id: obj.source+'_'+obj.relation+'_'+obj.id, to: obj.id })
            await input.table(table).onChange((obj, oldObj) =>
                output.change(obj && mapper(obj), oldObj && mapper(oldObj)) )
          }
      })`, { table })
    } catch(e) {
     // console.error(e)
    }
  }

  async function getRelations(type, keys) {
    let keysList = Object.keys(keys).map(k => [k, keys[k]]).filter(([a,b]) => !!b)
    keysList.sort((a,b) => a[0] == b[0] ? 0 : (a[0] > b[0] ? 1 : -1))
    let keySets = lcp.allCombinations(keysList)
    let promises = new Array(keySets.length)
    for(let i = 0; i < keySets.length; i++) {
      const ks = keySets[i]
      return dao.get(['database', 'query', database, `(${
          async (input, output, { table, type, ks }) => {
            const mapper = async (res) => input.table(table).object(res.to).get()
            await input.index(table + "_eventTypeAndKeys").range({
              gte: type + '_' + ks + '_',
              lte: type + '_' + ks + "_\xFF\xFF\xFF\xFF"
            }).onChange(async (obj, oldObj) => {
              output.change(obj && await mapper(obj), oldObj && await mapper(oldObj))
            })
          }
      })`, { table, type, ks}])

      promises[i] = dao.get(['database', 'indexRange', database, table+'_eventTypeAndKeys', {
        gte: type+'_'+ks+'_',
        lte: type+'_'+ks+"_\xFF\xFF\xFF\xFF"
      }])
    }
    const results = (await Promise.all(promises)).reduce((a,b) => a.concat(b), [])
    return results.map(obj => obj.to)
  }

  const relationOperations = new Map() // need to queue operations on keys

  function queueRelationChange(type, keysList, relationId, changeFun) {
    const rKey = JSON.stringify([type, keysList, relationId])
    let op = relationOperations.get(rKey)
    return new Promise(async (resolve, reject) => {
      if(op) {
        op.onDone.push(resolve)
        op.onError.push(reject)
      } else {
        op = {
          changes: [ changeFun ],
          onDone: [ resolve ],
          onError: [ reject ]
        }
        relationOperations.set(rKey, op)
        try {
          const relations = await dao.get(['database', 'query', database, `(${
              async (input, output, { table, type, ks }) => {
                const mapper = async (res) => input.table(table).object(res.to).get()
                await input.index(table + "_eventTypeAndKeys").range({
                  gte: type + '_' + ks + '_',
                  lte: type + '_' + ks + "_\xFF\xFF\xFF\xFF"
                }).onChange(async (obj, oldObj) => {
                  output.change(obj && await mapper(obj), oldObj && await mapper(oldObj))
                })
              }
          })`, { table, type, ks: keysList}])
          let foundRelation = relations.find(rel => rel.relation == relationId)
          console.log("FOUND RELATION", foundRelation)
          let currentRelation = foundRelation
          while (op.changes.length > 0) {
            for (const change of op.changes) currentRelation = change(currentRelation)
            op.changes = []
            console.log("CHANGED RELATION", currentRelation)
            if (currentRelation) {
              if(!currentRelation.id) currentRelation.id = crypto.randomBytes(16).toString("hex")
              await dao.request(['database', 'put', database, table, currentRelation])
            }
          }
          relationOperations.delete(rKey)
          for (const cb of op.onDone) cb('ok')
        } catch(err) {
          for(const cb of op.onError) cb(err)
        }
      }
    })
  }

  async function saveRelation(relation, mark = null) {
    let promises = []
    let keysList = Object.keys(relation.keys).map(k => [k, relation.keys[k]]).filter(([a,b]) => !!b)
    keysList.sort((a,b) => a[0] == b[0] ? 0 : (a[0] > b[0] ? 1 : -1))
    for(const type of relation.eventTypes) {
      promises.push(
          queueRelationChange(type, keysList, relation.relation, (currentRelation) => {
            if(currentRelation) {
              currentRelation.prev.push(...relation.prev)
              if(mark) mark(currentRelation)
              return currentRelation
            } else {
              const r = { ...relation, eventType: type, keys: keysList }
              if(mark) mark(r)
              return r
            }
          })
      )
    }
    await Promise.all(promises)
  }

  async function removeRelation(relation) {
    return dao.request(['database', 'query',], database, `(${
        async (input, output, { relation, table }) =>
            await input.index(table+"_sourceRelation").range({
              gte: relation.source+'_'+relation.relation+'_',
              lte: relation.source+'_'+relation.relation+"_\xFF\xFF\xFF\xFF"
            }).onChange((obj, oldObj) => {
              output.table(table).delete(obj.to)
            })
    })`, { table, relation })
  }

  return {
    createTable,
    getRelations,
    saveRelation,
    removeRelation
  }

}

module.exports = { relationsStore }