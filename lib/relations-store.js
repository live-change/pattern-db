const lcp = require("@live-change/pattern")

function relationsStore(dao, database, table) {

  async function createTable() {
    dao.request(['database', 'createTable'], database, table).catch(e => 'ok')
    await this.connection.request(['database', 'createIndex'], database, table+'_eventTypeAndKeys', `(${
        async function(input, output) {
          const mapper = (obj) => ({ id: obj.eventType+'_'+obj.keys+'_'+obj.id, to: obj.id })
          await input.table('users').onChange((obj, oldObj) =>
              output.change(obj && mapper(obj), oldObj && mapper(oldObj)) )
        }
    })`, { tableName: this.tableName }).catch(e => 'ok')
    await this.connection.request(['database', 'createIndex'], database, table+'_sourceRelation', `(${
        async function(input, output) {
          const mapper = (obj) => ({ id: obj.source+'_'+obj.relation+'_'+obj.id, to: obj.id })
          await input.table('users').onChange((obj, oldObj) =>
              output.change(obj && mapper(obj), oldObj && mapper(oldObj)) )
        }
    })`, { tableName: this.tableName }).catch(e => 'ok')
  }

  async function getRelations(type, keys) {
    let keysList = Object.keys(keys).map(k => [k, keys[k]]).filter(([a,b]) => !!b)
    keysList.sort((a,b) => a[0] == b[0] ? 0 : (a[0] > b[0] ? 1 : -1))
    let keySets = lcp.allCombinations(keysList)
    let promises = new Array(keySets.length)
    for(let i = 0; i < keySets.length; i++) {
      const ks = keySets[i]
      /*let qObj = {}
      for(let [k,v] of ks) qObj[k] = v*/
      promises[i] = dao.get(['database', 'indexRange', database, table+'_eventTypeAndKeys', {
        gte: type+'_'+ks+'_',
        lte: type+'_'+ks+"_\xFF\xFF\xFF\xFF"
      }])
    }
    const results = (await Promise.all(promises)).reduce((a,b) => a.concat(b), [])
    return results
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
          const cursor = await dao.get(['database', 'indexRange', database, table+'_eventTypeAndKeys', {
            gte: type+'_'+keysList+'_',
            lte: type+'_'+keysList+"_\xFF\xFF\xFF\xFF"
          }])
          const relations = await cursor.toArray()
          let currentRelation = relations.find(rel => rel.relation == relationId)
          while (op.changes.length > 0) {
            for (const change of op.changes) currentRelation = change(currentRelation)
            op.changes = []
            if (currentRelation) {
              await dao.request(['database', 'put', database, table, currentRelation])
            } else {
              await dao.request(['database', 'delete', database, table, currentRelation.id])
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
    return dao.get(['database', 'query', database, `(${
        async (input, output, { relation, table }) =>
            await input.index(table+"_sourceRelation").range({
              gte: relation.source+'_'+relation.relation+'_',
              lte: relation.source+'_'+relation.relation+"_\xFF\xFF\xFF\xFF"
            }).onChange((obj, oldObj) => {
              output.table("emailPassword_EmailPassword").delete(obj.id)
            })
    })`, { table, relation }])
  }

  return {
    createTable,
    getRelations,
    saveRelation,
    removeRelation
  }

}

module.exports = { relationsStore }