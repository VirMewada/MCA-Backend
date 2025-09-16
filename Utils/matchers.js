const TxQuery = require("../txQuery")

TxQuery.matcher("eq", {
    transformer: ({ data }) => data,
    matcher: (data, val) => val == data
})

TxQuery.matcher("neq", {
    transformer: ({ data }) => { return { $ne: data } },
    matcher: (data, val) => val != data
})

TxQuery.matcher("includes", {
    transformer: ({ data }) => data,
    matcher: (query, val) => !!val?.includes(query)
})