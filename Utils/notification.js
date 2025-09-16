const admin = require("firebase-admin");
const Notification = require("../Models/NotificationModel");
const RefreshToken = require("../Models/refreshTokenModel");
let serviceAccount = require("../Utils/studio32-985ac-firebase-adminsdk-q4565-fb1ff04d1b.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = {
  sendNotification: ({ token, title, body, data }) =>
    new Promise(async (resolve, reject) => {
      try {
        console.log("dataaaa", data);
        console.log("FCM TOKEN: ", token);
        admin
          .messaging()
          .send({
            token: token,
            notification: {
              title,
              body,
            },
            data: { notification: JSON.stringify(data) },
          })
          .then((response) => {
            console.log("Message was sent successfully", response);
            resolve(response);
          })
          .catch((err) => {
            console.log("Error in sending message internally: ", err);
            resolve();
          });
      } catch (error) {
        console.log("ERROR", error);
        resolve();
      }
    }),
};

module.exports.sendNotificationMultiCast = ({ tokens, title, body, data }) =>
  new Promise(async (resolve, reject) => {
    try {
      console.log("dataaaa", data);
      console.log("FCM TOKENS: ", tokens);

      const message = {
        notification: {
          title,
          body,
        },
        data: { notification: JSON.stringify(data) },
        tokens: tokens,
      };

      admin
        .messaging()
        .sendMulticast(message)
        .then((response) => {
          console.log("Messages were sent successfully", response);
          resolve(response);
        })
        .catch((err) => {
          console.log("Error in sending messages: ", err);
          reject({
            message:
              err.message || "Something went wrong in sending notifications!",
          });
        });
    } catch (error) {
      console.log("ERROR", error);
      reject(error);
    }
  });

module.exports.sendNotifcationToUser = async ({
  notifyType,
  userId,
  title,
  body,
  data,
}) => {
  const tokens = JSON.parse(
    JSON.stringify(await RefreshToken.find({ user: userId }))
  ).map((d) => d.deviceToken);
  await Notification.create({
    notifyType,
    receiver: userId,
    time: Date.now() + new Date().getTimezoneOffset() * 60_000,
    title,
    desc: body,
    data,
  });
  await module.exports.sendNotificationMultiCast({
    tokens,
    title: "My Surprise",
    body: title,
    data,
  });
};
