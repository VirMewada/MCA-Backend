const User = require("../Models/userModel")
const TxQuery = require("../txQuery")

TxQuery.postprocessor("ignore", () => undefined)
TxQuery.postprocessor("first", results => results[0] ? results[0] : null)
TxQuery.postprocessor("exists", results => !!results.length)
TxQuery.postprocessor("count", results => results.length)
TxQuery.postprocessor("few", (results, args) => results.slice(0, args.number))
TxQuery.postprocessor("avg", (results, args) => results.length == 0 ? 0 : results.reduce((a, b) => a[args.field]+b[args.field], 0)/results.length)
TxQuery.postprocessor("sort", (results, args) => results.sort((a, b) => a[args.field] > b[args.field] ? (args.asc ? 1 : -1) : (args.asc ? -1 : 1)))

TxQuery.postprocessor("dataByDay", async (results, args) => {
    const givenDate = args.date
    const userId = args.userId
    const nextResults = results.filter(
        res => {
            console.log("SubmIssioN", res)
            if(res.submissions.length == 0) return true
            else if(res.submissions[0]?.date) return res.submissions[0]?.date == givenDate
            else return true
        }
    )
    if(!userId) return nextResults
    const user = JSON.parse(JSON.stringify(await User.findOne({ _id: userId })))
    console.log("ABCDEF", args)
    if(user[args.weekNumber] == 0) return []
    else 
        return nextResults
})

const groupByMonth = results => {
    const monthGrouped = {}
    for(const res of results) {
        const [givenYear, givenMonth, _2] = res.date.split("-")
        const month = `${givenYear}-${givenMonth}`
        if(!monthGrouped[month]) monthGrouped[month] = [[res.date, (res.intensity + res.frequency)/2]]
        else monthGrouped[month].push([res.date, (res.intensity + res.frequency)/2])
    }
    for(const month in monthGrouped) monthGrouped[month] = monthGrouped[month].sort((a, b) => a[0] > b[0] ? -1 : 1)
    const [givenYear, givenMonth, _1] = new Date().toISOString().split("-")
    const currentMonth = `${givenYear}-${givenMonth}`
    const monthGraph = monthGrouped[currentMonth]
    const xAxis = monthGraph.map((_, i) => i+1)
    const yAxis = monthGraph.map(res => res[1])
    return {xAxis, yAxis}
}

const monthlyRecords = results => {
    const monthlyRecords = {}
    for(const res of results) {
        const [givenYear, givenMonth, _2] = res.date.split("-")
        const month = `${givenYear}-${givenMonth}`
        if(!monthlyRecords[month]) monthlyRecords[month] = [res]
        else monthlyRecords[month].push(res)
    }
    return Object.entries(monthlyRecords)
}

TxQuery.postprocessor("weekGraph", results => {
    const f = results => {
        const xAxis = results.sort((a, b) => a.date > b.date ? 1 : -1).map(res => new Date(res.date).toDateString()[0])
        const yAxis = results.sort((a, b) => a.date > b.date ? 1 : -1).map(res => (res.intensity + res.frequency)/2)
        return {xAxis, yAxis}
    }
    const symptomGrouped = {}
    for(const res of results)
        if(symptomGrouped[res.identifier]) symptomGrouped[res.identifier].push(res)
        else symptomGrouped[res.identifier] = [res]
    for(const [symtptom, result] of Object.entries(symptomGrouped)) 
        symptomGrouped[symtptom] = f(result)
    const finalRes = Object.entries(symptomGrouped).map(([symptom, {xAxis, yAxis}]) => [symptom, {xAxis: xAxis.slice(-7), yAxis: yAxis.slice(-7)}])
    console.log("FinalRes", finalRes)
    return finalRes
})

TxQuery.postprocessor("monthGraph", results => {
    const f = results => {
        const {xAxis, yAxis} = groupByMonth(results)
        return {xAxis, yAxis}
    }
    const symptomGrouped = {}
    for(const res of results)
        if(symptomGrouped[res.identifier]) symptomGrouped[res.identifier].push(res)
        else symptomGrouped[res.identifier] = [res]
    return Object.entries(symptomGrouped).map(([symptom, results]) => [symptom, f(results)])
})

TxQuery.postprocessor("yearGraph", (results, args) => {
    const currentMonthHalf = (x) => {
        const [year] = new Date().toISOString().split("-")
        return `${year}-${x > 9 ? x : `0${x}`}`
    }
    const f = results => {
        const yearGrouped = {}
        for(const res of results) {
            const [year, _1, _2] = res.date.split("-")
            if(!yearGrouped[year]) yearGrouped[year] = [res]
            else yearGrouped[year].push(res)
        }
        for(const year in yearGrouped) yearGrouped[year] = monthlyRecords(yearGrouped[year]).map(([month, objs]) => [month, groupByMonth(objs).yAxis.reduce((a, b) => a+b, 0)])
        const [currentYear, _1, _2] = new Date().toISOString().split("-")
        const currentYearGraph = yearGrouped[currentYear]
        const xAxis = new Array(12).fill(0).map((_, i) => i+1).filter(x => x <= new Date().getMonth()+1).slice(0, args.number)
        const yAxis = new Array(12).fill(0).map((_, i) => i+1).filter(x => x <= new Date().getMonth()+1).map(x => currentYearGraph.find(([month, _]) => month == currentMonthHalf(x))?.[1] ?? 0).slice(0, args.number)
        return {xAxis, yAxis}
    }
    const symptomGrouped = {}
    for(const res of results)
        if(symptomGrouped[res.identifier]) symptomGrouped[res.identifier].push(res)
        else symptomGrouped[res.identifier] = [res]
    return Object.entries(symptomGrouped).map(([symptom, results]) => [symptom, f(results)])
})