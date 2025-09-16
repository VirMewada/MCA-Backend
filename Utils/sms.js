const axios = require("axios");

const sendSMS = async (to, message) => {
  console.log(to, message, process.env.FCM_SERVER_KEY);
  try {
    const response = await axios.post(
      "https://fcm.googleapis.com/fcm/send",
      {
        to: `/topics/${to}`,
        priority: "high",
        notification: {
          title: "HaXer",
          body: message,
        },
        data: {
          message: message,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: process.env.FCM_SERVER_KEY,
        },
      }
    );
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error(error);
    return error;
  }
};

module.exports = { sendSMS };
