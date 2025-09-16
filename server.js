const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });
const cron = require("node-cron");
const app = require("./app");
const socketapi = require("./Utils/sockets");
require("./Utils/database");

const PORT = process.env.PORT || 4500;
const HOST = "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Server is running on http://${HOST}:${PORT}`);
});

// const server = app.listen(process.env.PORT || 4500, () => {
//   console.log(`App is running on port "${process.env.PORT}"`);
// });

// socketapi.io.attach(server, {
//   cors: {
//     origin: "*",
//     methods: ["GET", "POST"],
//     credentials: true,
//   },
// });

// const express = require("express");
// const dotenv = require("dotenv");
// const cron = require("node-cron");
// const socketapi = require("./Utils/sockets");
// require("./Utils/database");

// dotenv.config({ path: "./config.env" });

// const app = require("./app"); // Only imported once

// const server = app.listen(process.env.PORT || 4500, () => {
//   console.log(`🚀 Server is running on port "${process.env.PORT || 4500}"`);
// });

// Attach Socket.IO properly
socketapi.setup(server);
