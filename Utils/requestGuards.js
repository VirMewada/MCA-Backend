const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const mongoSanitize = require("express-mongo-sanitize");
const xssClean = require("xss-clean");

const middleware = express();

// ===== Cors Enabling
middleware.use(cors());
middleware.options("*", cors());
// ===== Data sanitization against NoSQL query injection
middleware.use(mongoSanitize());
// ======== Data sanitization against XSS (protection from malicious html) use pkg name exactly "xss-clean"
middleware.use(xssClean());
//  Set Security HTTP Headers======
middleware.use(helmet());
middleware.use(bodyParser.json());
middleware.use(morgan("dev"));
middleware.use(express.json());

module.exports = middleware;
