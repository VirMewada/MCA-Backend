const TxQuery = require("./txQuery")
const { models, schemas } = TxQuery.internals


const dependencyGraph = (name, obj, visitng, visited) => {
    if(visitng.has(name)) return
    visitng.add(name)

    if(obj[name]) return obj[name]
    obj[name] = []

    const schema = schemas[name]
    for(const k in schema) {
        const val = schema[k]
        const newName = val.ref || val[0]?.ref
        if(newName) {
            obj[name].push(newName)
            dependencyGraph(newName, obj, visitng, visited)
        }
    }
}

const discoverDependencyGraph = () => {
  const graph = {}
  for(const schemaName in schemas) dependencyGraph(schemaName, graph, new Set(), new Set())
  return graph
}

const invertGraph = graph => {
    const result = {}
    for(const k in graph)
        for(const val of graph[k])
            result[val] = new Set()

    for(const k in graph) {
        const values = graph[k]
        for(const val of values) result[val].add(k)
    }

    for(const k in result) {
        result[k] = [...result[k]]
    }

    return result
}

const findReferingKeys = graph => {
    const result = {...graph}
    for(const k in graph) {
        const values = graph[k]
        const newValues = []
        for(const ref of values) {
            const schema = schemas[ref]
            const keys = Object.entries(schema).filter(([_, val]) => {
                return val.ref == k || val[0]?.ref == k
            }).map(([k, v]) => [k, v.ref])
            newValues.push([ref, keys])
        }
        result[k] = newValues
    }

    return result
}

const deleteKeyedGraph = async (name, id, graph, visiting) => {
    const subgraph = graph[name]
    if(subgraph) {
      for (const [modelName, fields] of subgraph) {
        for(const [k, _] of fields.filter(([_, v]) => v == name)) {
            const results = await models[modelName].find({ [k]: id })
            for(const res of results) await deleteOne(modelName, res._id, visiting)
        }
      }
    }

    await models[name].deleteOne({ _id: id })
    // console.log("Deleting", name, id)
}

async function deleteOne (name, id, visiting) {
  if(visiting.has(`${name}#${id}`)) return
  visiting.add(`${name}#${id}`)

  // Initialize the dependency graph
  const graph = discoverDependencyGraph()

  // Invert the graph, values become keys and vice versa
  const invertedGraph = invertGraph(graph)

  // Find all the keys that reference the specified models, so that we can delete them
  const keyedGraph = findReferingKeys(invertedGraph)

  // Iterate over the graph, deleting everything in accordance with the specified structure
  await deleteKeyedGraph(name, id, keyedGraph, visiting)

  return {keyedGraph, invertedGraph}
}

module.exports.deleteOne = async (name, id) => await deleteOne(name, id, new Set())