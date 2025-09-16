const fs = require("fs");
const pluralize = require("pluralize");
const args = process.argv.slice(2);

const getModelNameFromFile = (text) => {
  const modelName = text
    .split("TxQuery.model(")[1]
    .split(",")[0]
    .split('"')
    .join("")
    .trim();
  return modelName;
};

const filename = args[0];
const template = args[1];

const modelPath = `./Models/${filename}.js`;
const modelFile = fs.readFileSync(modelPath, "utf8");
const modelName = getModelNameFromFile(modelFile);
const smallModelName =
  modelName.charAt(0).toLowerCase() + modelName.substring(1);

const templateFile = fs.readFileSync(`./Templates/${template}.js`, "utf8");
let newFile = templateFile;

const customVariables = Object.fromEntries(
  args.filter((x) => x.includes(":")).map((x) => x.split(":"))
);
const fileVariables = Object.fromEntries(
  [...newFile.matchAll("<<(.*?)>>")]
    .map(([_, varName]) => varName)
    .map((v) => [v, "null"])
);

// Construct Query
const query = `new QueryModel("${modelName}")`;

// Construct Controller + Write to file
const data = {
  ...fileVariables,
  query,
  modelPath: `.${modelPath}`,
  modelName,
  Model: modelName,
  model: smallModelName,
  models: pluralize(modelName.charAt(0).toLowerCase() + modelName.substring(1)),
  ...customVariables,
};

Object.entries(data).forEach(
  ([k, v]) => (newFile = newFile.split(`<<${k}>>`).join(v))
);

const controllerName = `${filename.replace("Model", "")}Controller`;
fs.writeFileSync(`./Controllers/${controllerName}.js`, newFile);

// Add to routes
const routes = fs.readFileSync("./Routes/indexRoutes.js", "utf8");

let allRoutes = routes.split("module.exports = router")[0];

if (!allRoutes.includes(`require("../Controllers/${controllerName}.js")`))
  allRoutes =
    `const express = require("express");\nconst ${controllerName} = require("../Controllers/${controllerName}.js");\n` +
    allRoutes.replace('const express = require("express")', "");

if (
  !allRoutes.includes(
    `router.post('/${smallModelName}', ${controllerName}.store)`
  )
)
  allRoutes += `\n\n
router.get('/${smallModelName}', ${controllerName}.index)
router.get('/${smallModelName}/:id', ${controllerName}.find)
router.post('/${smallModelName}', ${controllerName}.store)
router.patch('/${smallModelName}/:id', ${controllerName}.update)
router.delete('/${smallModelName}/:id?', ${controllerName}.delete)


module.exports = router`;
else allRoutes += "module.exports = router";

// console.log(allRoutes)
fs.writeFileSync("./Routes/indexRoutes.js", allRoutes);
