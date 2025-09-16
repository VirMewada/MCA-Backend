const admin = require("firebase-admin");
const serviceAccount = require("./orkestio-c6739-firebase-adminsdk-fbsvc-d53679767a.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
