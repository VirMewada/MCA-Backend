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
const partController = require("../Controllers/partController.js");
const itemController = require("../Controllers/itemController.js");
const vendorController = require("../Controllers/vendorController.js");
const POController = require("../Controllers/POController.js");

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

router.get("/parts", partController.index);
router.get("/parts/:id", partController.find);
router.post("/parts", partController.store);
router.patch("/parts/:id", partController.update);
router.delete("/parts/:id", partController.delete);

// 🔹 Search
router.get("/items/search", itemController.search);
router.get("/items/search/PO", itemController.searchPO);
router.patch("/items/bulk-update", itemController.bulkUpdate);
router.post("/items/transaction", itemController.transaction);
router.get("/items/people", itemController.getPeople);
router.get("/items/transactions", itemController.getTransactionsByItem);

// 🔹 Basic CRUD
router.get("/items", itemController.index);
router.get("/items/:id", itemController.find);
router.post("/items", itemController.store);
router.patch("/items/:id", itemController.update);
router.delete("/items/:id", itemController.delete);
// 🔹 BOM
router.patch("/items/:id/children", itemController.addChildren);
router.get("/items/:id/bom", itemController.getBOM);
// 🔹 Costing
router.post("/items/:id/recalculate-cost", itemController.recalculateCost);

// 🔹 Mapping (Vendor ↔ Item)
router.get("/vendors/search", vendorController.search);

router.post("/vendors/map-item", vendorController.mapVendorToItem);
router.patch("/vendors/update-item", vendorController.updateVendorItem);
router.post("/vendors/remove-item", vendorController.removeVendorFromItem);

// 🔹 Basic CRUD
router.get("/vendors", vendorController.index);
router.get("/vendors/:id", vendorController.find);
router.post("/vendors", vendorController.store);
router.patch("/vendors/:id", vendorController.update);
router.delete("/vendors/:id", vendorController.delete);

router.patch("/verification", verificationController.store);
router.get("/verification", verificationController.index);
router.patch("/verificationStatus", verificationController.update);

//PO
router.get("/po/search", POController.search);
router.get("/po/analytics", POController.vendorAnalytics);

router.post("/po", POController.create);
router.get("/po", POController.index);
router.get("/po/:id", POController.show);
router.put("/po/:id", POController.update);
router.patch("/po/:id/status", POController.updateStatus);
router.delete("/po/:id", POController.remove);
router.patch("/po/:id/movement", POController.addMovement);

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
