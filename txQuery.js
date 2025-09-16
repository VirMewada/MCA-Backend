const pluralize = require("pluralize");
const mongoose = require("mongoose");
const { Collection, Header, Item } = require("postman-collection");
const matchers = {};
const schemas = {};
let uninferredSchemas = schemas;
const postprocessors = {};
const models = {};
const resolvers = {};
let inferred = false;

module.exports.model = (name, model, schema) => {
  if (schema[name]) throw `The schema ${name} has already been registered`;
  schemas[name] = { _id: String, ...schema };
  models[name] = model;
};

module.exports.matcher = (name, { matcher, transformer }) => {
  if (matchers[name]) throw `The matcher ${name} has already been registered`;
  matchers[name] = { matcher, transformer };
};

module.exports.postprocessor = (name, f) => {
  if (postprocessors[name])
    throw `The postprocessor ${name} has already been registered`;
  postprocessors[name] = f;
};

class Resolver {
  static Model(model, data) {
    return {
      __resolver: "model",
      model,
      data,
    };
  }

  static Raw(data) {
    return {
      __resolver: "raw",
      data,
    };
  }

  static register(model, field, f) {
    if (resolvers[model]?.[field])
      throw `The resolver ${field} for ${model} has already been registered`;
    if (!resolvers[model]) resolvers[model] = {};
    resolvers[model][field] = f;
  }
}

Resolver.register("User", "otherUsers", async (user, context) => {
  const otherUsers = await context.fetcher.find(
    "User",
    { _id: { __matcher: "neq", data: user._id } },
    ["_id", "name"]
  );
  return Resolver.Model("User", [...otherUsers]);
});

module.exports.Resolver = Resolver;

const isRef = (obj) => {
  if (typeof obj !== "object") return false;
  if (!obj?.ref) return false;
  return true;
};

const isRefArray = (arr) => {
  if (!(arr instanceof Array)) return false;
  if (!arr[0]) return false;
  if (typeof arr[0] !== "object") return false;
  if (!arr[0].ref) return false;
  return true;
};

const JSSelect = (fields, objs) => {
  const resArr = [];
  for (const i in objs) {
    const obj = objs[i];
    const newObj = {};
    for (const j in obj) {
      if (fields.includes(j)) newObj[j] = obj[j];
    }
    resArr.push(newObj);
  }
  return resArr;
};

const separateQueries = (modelName, query) => {
  const schema = schemas[modelName];
  const selects = [];
  const immediateQuery = {};
  const furtherQuery = {};
  const resolverQuery = {};
  const aggregatorQuery = {};

  for (const k in query) {
    let currentQuery = query[k];
    if (currentQuery !== true && currentQuery.__postprocessors) {
      aggregatorQuery[k] = currentQuery.__postprocessors;
      currentQuery = currentQuery.query;
    }
    let isResolver = false;
    if (!schema[k]) {
      if (!resolvers[modelName]?.[k])
        throw `The model ${modelName} does not contain ${k} nor is such a resolver defined`;
      isResolver = true;
    }
    selects.push(k);
    if (currentQuery === true && !isResolver) continue;
    if (isRef(schema[k])) {
      furtherQuery[k] = currentQuery;
    } else if (isResolver) {
      resolverQuery[k] = currentQuery;
    } else if (isRefArray(schema[k])) {
      furtherQuery[k] = currentQuery;
    } else immediateQuery[k] = currentQuery;
  }

  return {
    selects,
    immediateQuery,
    resolverQuery,
    furtherQuery,
    aggregatorQuery,
  };
};

const transformMongo = (query) => {
  const newQuery = {};
  for (const k in query) {
    const currentQuery = query[k];
    const matcher = matchers[currentQuery.__matcher];
    if (!matcher) throw `No matcher named ${currentQuery.__matcher} exists`;
    const { transformer } = matcher;
    if (!transformer) continue;
    newQuery[k] = transformer(query[k]);
  }
  return newQuery;
};

const isValid = (query, obj) => {
  for (const k in obj) {
    const val = obj[k];
    const q = query[k];
    if (q === true) continue;
    if (q instanceof Array) {
      return true;
    } else if (typeof q == "object" && q.__matcher) {
      const wholeMatcher = matchers[q.__matcher];
      if (!wholeMatcher) throw `No matcher named ${q.__matcher} exists`;
      const { matcher } = wholeMatcher;
      if (!wholeMatcher)
        throw `No JS matcher has been associated with ${q.__matcher} exists`;
      if (!matcher(q.data, val)) return false;
    } else if (typeof q == "object") {
      if (!isValid(q, val)) return false;
    }
  }
  return true;
};

const JSFilter = (queryObj, objs, justOne = false) => {
  return objs.filter((obj) => isValid(queryObj, obj));
};

class Fetcher {
  constructor() {
    this.modelMap = {};
    this.refModelMap = {};
  }

  async find(model, query, selects) {
    if (!this.modelMap[model]) {
      const res = JSON.parse(JSON.stringify(await models[model].find({})));
      // this.refModelMap[model] = {}
      // for(const r of res) this.refModelMap[model][r._id] = r
      this.modelMap[model] = res;
    }

    // Special Cases
    // if(Object.keys(query).length === 0) return this.modelMap[model]
    // if(query._id?.__matcher === "eq")
    //     return JSSelect(selects, JSFilter(query, this.modelMap[model], true))

    // General Case
    const res = JSSelect(selects, JSFilter(query, this.modelMap[model]));
    return res;
  }
}

const resolveAggregators = async (res, k, aggregators, context) => {
  for (const { aggregator, arguments, as } of aggregators) {
    const aggregatorFunc = postprocessors[aggregator];
    if (!aggregatorFunc) throw `No aggregator named ${aggregator} exists`;
    for (const r of res)
      r[as ? as : k] = await aggregatorFunc(r[k], arguments, context);
  }
};

const resolveModel = async (modelName, _query, context) => {
  const query = { ..._query };
  if (query.query) query.query._id = _query._id ? _query._id : true;
  else query._id = _query._id ? _query._id : true;

  const schema = schemas[modelName];
  const {
    selects,
    immediateQuery,
    furtherQuery,
    resolverQuery,
    aggregatorQuery,
  } = separateQueries(modelName, query);

  let res = null;
  if (context.results)
    res = JSSelect(selects, JSFilter(query, context.results));
  else res = await context.fetcher.find(modelName, immediateQuery, selects);

  for (const r of res) {
    for (const k in resolverQuery) {
      const currentQuery = resolverQuery[k];
      const resolver = resolvers[modelName][k];
      const finalVal = await resolver(r, context, currentQuery);
      if (finalVal.__resolver === "model")
        r[k] = await resolveModel(
          finalVal.model,
          currentQuery === true ? {} : currentQuery,
          { ...context, results: finalVal.data, first: false }
        );
      else
        r[k] =
          typeof finalVal.data instanceof Array
            ? JSSelect(
                selects,
                JSFilter(
                  currentQuery === true ? {} : currentQuery,
                  finalVal.data
                )
              )
            : typeof finalVal.data == "object"
            ? JSSelect(
                selects,
                JSFilter(currentQuery === true ? {} : currentQuery, [
                  finalVal.data,
                ])
              )[0]
            : finalVal.data;
    }
  }

  for (const k in furtherQuery) {
    const nowQuery = { ...furtherQuery[k] };
    if (isRefArray(schema[k])) {
      const nowSchema = schema[k][0];
      const ref = nowSchema.ref;
      const promises = [];
      for (const r of res) {
        const kQuery = {
          _id: { __matcher: "eq", data: r._id },
          ...(nowQuery[nowSchema.field] ? nowQuery[nowSchema.field] : {}),
        };
        promises.push(
          resolveModel(
            ref,
            { ...nowQuery, [nowSchema.field]: kQuery },
            { ...context, first: false }
          ).then((finalArr) => {
            r[k] = JSFilter(
              { ...nowQuery, [nowSchema.field]: kQuery },
              finalArr
            );
          })
        );
      }
      await Promise.all(promises);
    } else {
      const ref = schema[k].ref;
      const promises = [];
      for (const r of res) {
        promises.push(
          resolveModel(
            ref,
            { ...nowQuery, _id: { __matcher: "eq", data: r[k] } },
            { ...context, first: false }
          ).then((xs) => (r[k] = xs[0]))
        );
      }
      await Promise.all(promises);
    }
  }

  if (context.first)
    res = JSFilter(
      { ...immediateQuery, ...furtherQuery, ...resolverQuery },
      res
    );

  for (const k in aggregatorQuery) {
    const aggregators = aggregatorQuery[k];
    await resolveAggregators(res, k, aggregators, context);
  }
  return res;
};

const inferModels = async () => {
  if (inferred) return;
  for (const schemaName in schemas) {
    const schema = schemas[schemaName];
    for (const k in schema) {
      const val = schema[k];
      if (isRef(val)) {
        const ref = val.ref;
        const refSchema = schemas[ref];
        if (!refSchema) throw `Invalid reference ${ref} in ${schemaName}`;
        refSchema[
          pluralize(
            schemaName.charAt(0).toLowerCase() + schemaName.substring(1)
          )
        ] = [
          {
            type: mongoose.Schema.Types.ObjectId,
            field: k,
            ref: schemaName,
            inferred: true,
          },
        ];
      }
    }
  }
  inferred = true;
};

module.exports.query = async (query, user) => {
  await inferModels();

  const obj = {};
  const fetcher = new Fetcher();
  const context = {
    schemas,
    models,
    user,
    fetcher,
    first: true,
  };
  for (const k in query) {
    const realQuery = query[k].__postprocessors ? query[k].query : query[k];
    const isPreprocessable = !!query[k].__postprocessors;
    obj[k] = await resolveModel(k, realQuery, context);
    console.log(obj[k]);
    if (isPreprocessable) {
      for (const { aggregator, arguments, as } of query[k].__postprocessors) {
        const aggregatorFunc = postprocessors[aggregator];
        if (!aggregatorFunc) throw `No aggregator named ${aggregator} exists`;
        obj[as ? as : k] = await aggregatorFunc(obj[k], arguments, context);
      }
    }
  }
  return obj;
};

module.exports.getQueryDoc = async () => {
  uninferredSchemas = JSON.parse(JSON.stringify(schemas));
  await inferModels();
  const schemaDocList = {};
  for (const schemaName in schemas) {
    const arr = [];
    const schema = schemas[schemaName];
    for (const k in schema) {
      const val = schema[k];
      if (isRefArray(val))
        arr.push([
          k,
          `[${val[0]?.ref}] read-only, write POST /${
            val[0]?.ref?.charAt(0)?.toLowerCase() + val[0]?.ref?.slice(1)
          }`,
        ]);
      else if (val instanceof Array && val.length == 1)
        arr.push([k, `[${val[0]}]`]);
      else if (isRef(val)) {
        const ref = val.ref;
        arr.push([k, ref]);
      } else arr.push([k, val]);
    }
    schemaDocList[schemaName] = arr;
  }
  return Object.entries(schemaDocList)
    .map(([name, fields]) =>
      `
        <div>
            <h2>${name}</h2>
            <ul>
                ${fields
                  .map(
                    ([k, v]) =>
                      `<li>${k}: ${`${v?.type ? v.type : v?.ref ? v.ref : v}`
                        .replace("{ [native code] }", "")
                        .replace("function", "")
                        .replace("()", "")}</li>`
                  )
                  .join("")}
            </ul>
        </div>
    `
        .replace("\n", "")
        .replace("\t", "")
        .replace(" ", "")
        .replace('"', "")
        .replace(",", "")
    )
    .join("");
};

function getValues(val) {
  if (typeof val == "function") {
    const res = val();
    if (res instanceof Date) return res.toISOString();
    return res;
  }
  if (typeof val == "boolean") return val;
  if (typeof val == "string") return val;
  if (typeof val == "number") return val;
  if (isRefArray(val)) return undefined;
  if (val instanceof Array) return val.map((v) => getValues(v));
  if (val instanceof Date) return new Date(0).toISOString();
  if (isRef(val)) return `id of ${val?.ref}`;
  if (typeof val == "object" && val != null) {
    if (val.default) return val.default;
    if (val.enum) return val.enum[0];
    if (val?.type?.default) return val.type.default;
    if (val?.type?.eunm?.[0]) return val.type.enum[0];
    if (val.type && typeof val.type == "function") return val.type();
    return Object.fromEntries(
      Object.entries(val).map(([k, v]) => [k, getValues(v)])
    );
  }
  return val;
}

module.exports.getPostman = async (baseURL, name, token) => {
  uninferredSchemas = JSON.parse(JSON.stringify(schemas));
  await inferModels();
  const postmanCollection = new Collection({
    info: { name },
    item: [],
  });
  const rawHeaderString = `Authorization:${token}\nContent-Type:application/json\ncache-control:no-cache\n`;
  for (const [schemaName, structure] of Object.entries(schemas).filter(
    ([k]) => !["_id", "user"].includes(k)
  )) {
    const rawHeaders = Header.parse(rawHeaderString);
    const requestHeader = rawHeaders.map((h) => new Header(h));
    const apiEndpoint = `${baseURL}/api/v1/${
      schemaName.charAt(0).toLowerCase() + schemaName.slice(1)
    }`;
    console.log(apiEndpoint);

    const requestName = schemaName;
    const requestPayload = Object.fromEntries(
      Object.entries(structure)
        .filter(([k]) => !["_id", "user"].includes(k))
        .map(([k, v]) => {
          return [k, getValues(v)];
        })
    );

    const postmanRequestGET = new Item({
      name: `GET ${requestName}`,
      request: {
        header: requestHeader,
        url: apiEndpoint,
        method: "GET",
        auth: null,
      },
      event: [],
    });

    const postmanRequestFIND = new Item({
      name: `FIND ${requestName}`,
      request: {
        header: requestHeader,
        url: `${apiEndpoint}/:id`,
        method: "GET",
        auth: null,
      },
      event: [],
    });

    const postmanRequestPOST = new Item({
      name: `CREATE ${requestName}`,
      request: {
        header: requestHeader,
        url: apiEndpoint,
        method: "POST",
        body: {
          mode: "raw",
          raw: JSON.stringify(requestPayload, null, "\t"),
        },
        auth: null,
      },
      event: [],
    });

    const postmanRequestPATCH = new Item({
      name: `UPDATE ${requestName}`,
      request: {
        header: requestHeader,
        url: `${apiEndpoint}/:id`,
        method: "PATCH",
        body: {
          mode: "raw",
          raw: JSON.stringify(requestPayload, null, "\t"),
        },
        auth: null,
      },
      event: [],
    });

    const postmanRequestDELETE = new Item({
      name: `DELETE ${requestName}`,
      request: {
        header: requestHeader,
        url: `${apiEndpoint}/:id`,
        method: "DELETE",
        body: {},
        auth: null,
      },
      event: [],
    });

    postmanCollection.items.add(postmanRequestGET);
    postmanCollection.items.add(postmanRequestFIND);
    postmanCollection.items.add(postmanRequestPOST);
    postmanCollection.items.add(postmanRequestPATCH);
    postmanCollection.items.add(postmanRequestDELETE);
  }
  return postmanCollection.toJSON();
};

module.exports.internals = {
  matchers,
  schemas,
  uninferredSchemas,
  postprocessors,
  models,
  resolvers,
  inferModels,
};
