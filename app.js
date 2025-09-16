const express = require("express");
const path = require("path");
const globalErrorHandler = require("./Controllers/errorControllers");
const { unhandledRoutes } = require("./Utils/unSpecifedRouteHandler");
const setupRoutesV1 = require("./Routes/routes");
const indexRoutes = require("./Routes/indexRoutes");

const app = express();

// CSP headers
// app.use((req, res, next) => {
//   res.setHeader(
//     "Content-Security-Policy",
//     "default-src 'self'; connect-src *; script-src 'self'; style-src 'self' 'unsafe-inline'; "
//   );
//   next();
// });

// app.use((req, res, next) => {
//   res.setHeader(
//     "Content-Security-Policy",
//     [
//       "default-src 'self'",
//       "connect-src *",
//       "script-src 'self'",
//       "style-src 'self' 'unsafe-inline'",
//       "img-src 'self' data: blob: https://app-media.s3.ap-southeast-1.wasabisys.com",
//     ].join("; ")
//   );
//   next();
// });

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "connect-src 'self' https://orkestio.com", // needed for API calls
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://app-media.s3.ap-southeast-1.wasabisys.com",
    ].join("; ")
  );
  next();
});

//Guards
app.use(require("./Utils/requestGuards"));

// Routes
app.use("/api/v1", setupRoutesV1());
app.use("/api/v1", indexRoutes);

// Serve static files
const reactBuildPath = path.join(__dirname, "Client", "build");
app.use(express.static(reactBuildPath));

// Serve index.html only for non-static, non-API routes
app.get("*", (req, res, next) => {
  if (
    req.method === "GET" &&
    !req.path.startsWith("/api") &&
    !req.path.startsWith("/static") &&
    !req.path.endsWith(".js") &&
    !req.path.endsWith(".css") &&
    !req.path.endsWith(".png") &&
    !req.path.endsWith(".json") &&
    !req.path.endsWith(".ico") &&
    !req.path.endsWith(".svg")
  ) {
    res.sendFile(path.resolve(reactBuildPath, "index.html"));
  } else {
    next(); // Let express.static handle static files
  }
});

// app.get("*", (req, res) => {
//   if (!req.path.startsWith("/api")) {
//     res.sendFile(path.resolve(reactBuildPath, "index.html"));
//   } else {
//     return unhandledRoutes()(req, res, req.next);
//   }
// });

// app.use("/", (_, res) => res.json({ success: true }));
// // Handling unhandled routes:
app.all("*", unhandledRoutes());
// Error handler middlware
app.use(globalErrorHandler);
module.exports = app;
