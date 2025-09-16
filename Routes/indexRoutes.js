const express = require("express");
const reviewController = require("../Controllers/reviewController.js");
const authController = require("../Controllers/authControllers");
const applicationController = require("../Controllers/applicationController.js");
const gigController = require("../Controllers/gigController.js");
const roleController = require("../Controllers/roleController.js");
const { query, getQueryDoc, getPostman } = require("../txQuery");
const CollaborationRequestController = require("../Controllers/collaboratinController.js");
const messageController = require("../Controllers/messageController");
const teamController = require("../Controllers/teamController.js");
const NotificationController = require("../Controllers/notificationController.js");
const savedDatabaseController = require("../Controllers/savedDatabaseController.js");
const pushTokenController = require("../Controllers/pushTokenController.js");
// const _3 = require("../Utils/matchers");
// const _4 = require("../Utils/postprocessors");
const verificationController = require("../Controllers/verificationController.js");
const userImageEmbeddingController = require("../Controllers/userImageEmbeddingController.js");
const companyController = require("../Controllers/companyController.js");
const { generateSignedUrl } = require("../Utils/wasabiHelper.js");

const router = express.Router();

router.get("/postman/:name", async (req, res) => {
  try {
    const baseURL = req.protocol + "://" + req.get("host");
    console.log("BASE URL", baseURL);
    const fileData = await getPostman(
      baseURL,
      req.params.name,
      req.query.token
    );
    return res.send(fileData);
  } catch (e) {
    console.log(e);
    return res.status(500).send({
      status: 500,
      success: false,
      message: e,
      data: {},
    });
  }
});

router.get("/", (req, res) => res.json({}));

router.get("/doc", async (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(await getQueryDoc());
});

router.get("/media/:key(*)", async (req, res, next) => {
  try {
    const key = decodeURIComponent(req.params.key); // decode once
    const signedUrl = generateSignedUrl(key); // ✅ use decoded key here

    const response = await fetch(signedUrl);
    if (!response.ok) {
      return res
        .status(response.status)
        .send("Error fetching file from storage");
    }

    res.set(
      "Content-Type",
      response.headers.get("content-type") || "application/octet-stream"
    );
    if (response.headers.get("content-length")) {
      res.set("Content-Length", response.headers.get("content-length"));
    }

    response.body.pipe(res);
  } catch (err) {
    next(err);
  }
});

// Protect all routes after this middleware
router.use(authController.protect);

// router.get("/application", applicationController.index);
// router.get("/application/:id/:status", applicationController.find);
// router.get("/applicationExists/:id", applicationController.exists);
// router.post("/application", applicationController.store);
// router.post("/applicationUpdateStatus", applicationController.updateStatus);
// router.patch("/application/:id", applicationController.update);
// router.delete("/application/:id?", applicationController.delete);

router.get("/company/:companyName", companyController.find);
router.get("/company/all/:companyName", companyController.findAll);
router.get("/company/allDrugs/:drug", companyController.findAllDrugs);
router.get("/getCompanies/:userId", companyController.getCompanies);
router.post("/company", companyController.store);

// router.get("/review", reviewController.index);
// router.get("/review/:id", reviewController.find);
// router.post("/review", reviewController.store);
// router.patch("/review/:id", reviewController.update);
// router.delete("/review/:id?", reviewController.delete);

router.patch("/verification", verificationController.store);
router.get("/verification", verificationController.index);
router.patch("/verificationStatus", verificationController.update);

// router.post(
//   "/userImageEmbedding",
//   userImageEmbeddingController.getSimilarUsersFromReferenceImage
// );

// router.get("/gig", gigController.index);
// router.get("/gigActive", gigController.gigActive);
// router.get("/gig/:id", gigController.find);
// router.post("/gig", gigController.store);
// router.patch("/gig/:id", gigController.update);
// router.delete("/gig/:id?", gigController.delete);

// router.get("/savedDatabase", savedDatabaseController.index); //
// router.get("/gigActive", savedDatabaseController.gigActive);
// router.get("/savedDatabase/:id", savedDatabaseController.find);
// router.post("/savedDatabase", savedDatabaseController.store); //
// router.patch("/savedDatabase/:id", savedDatabaseController.update); //
// router.delete("/savedDatabase/:id?", savedDatabaseController.delete);

// router.get("/role", roleController.index);
// router.get("/role/:id", roleController.find);
// router.post("/role", roleController.store);
// router.patch("/role/:id", roleController.update);
// router.delete("/role/:id?", roleController.delete);

// router.get("/collaborationRequest", CollaborationRequestController.index);
// router.get("/collaborationRequest/:id", CollaborationRequestController.find);
// router.post("/collaborationRequest", CollaborationRequestController.store);
// router.patch(
//   "/collaborationRequest/:id",
//   CollaborationRequestController.update
// );
// router.delete(
//   "/collaborationRequest/:id?",
//   CollaborationRequestController.delete
// );

router.get("/notification", NotificationController.index);
router.get("/notification/:id", NotificationController.find);
router.post("/notification", NotificationController.store);
router.post("/notification/markSeen", NotificationController.markSeen);
router.post("/sendNotifications", NotificationController.sendNotifications);
router.patch("/notification/:id", NotificationController.update);
router.delete("/notification/:id?", NotificationController.delete);

router.post("/pushToken", pushTokenController.store);
router.get("/pushToken", pushTokenController.index);

// router.post("/messages", messageController.sendMessage);
// router.post("/createChat", messageController.createChat);
// router.post("/createChatGeneral", messageController.createChatGeneral);
// router.get("/messages/:chatId", messageController.getChat);
// router.get("/messagesUsers/:userId", messageController.getUserChats);
// router.patch("/messagesUsers/:chatId", messageController.updateUserChats);
// router.get("/chatMessages/:chatId", messageController.getChatMessages);
// router.patch("/messages/:chatId", messageController.addParticipant);

// router.get("/teams/:userId", teamController.find);

module.exports = router;
