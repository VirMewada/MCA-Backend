const express = require("express");
const authController = require("../Controllers/authControllers");
const { query, getQueryDoc, getPostman } = require("../txQuery");
const NotificationController = require("../Controllers/notificationController.js");
const pushTokenController = require("../Controllers/pushTokenController.js");
const verificationController = require("../Controllers/verificationController.js");
const companyController = require("../Controllers/companyController.js");
const partController = require("../Controllers/partController.js");
const itemController = require("../Controllers/itemController.js");
const vendorController = require("../Controllers/vendorController.js");
const POController = require("../Controllers/POController.js");
const categoryController = require("../Controllers/categoryController.js");
const buildController = require("../Controllers/buildController.js");
const partyController = require("../Controllers/partyController.js");
const salesOrderController = require("../Controllers/salesOrderController.js");
const workerController = require("../Controllers/workerController.js");
const departmentController = require("../Controllers/departmentController.js");
const pipelineController = require("../Controllers/pipelineController.js");

const { generateSignedUrl } = require("../Utils/wasabiHelper.js");
const { runAnalyticsForAllItems } = require("../cron/analyticsService.js");

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

router.post("/run-analytics", async (req, res) => {
  try {
    console.log("🔘 Manual analytics trigger");

    await runAnalyticsForAllItems();

    res.status(200).json({ message: "Analytics executed successfully" });
  } catch (err) {
    console.error("❌ Manual analytics failed:", err);
    res.status(500).json({ message: "Failed to run analytics" });
  }
});

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

// 🔹 Manufacturing
//   GET  /items/:id/buildable  → how many can we make right now
//   POST /items/:id/build      → consume the BOM, produce the parent
router.get("/items/:id/buildable", buildController.buildable);
router.post("/items/:id/build", buildController.build);

router.get("/builds", buildController.index);
router.get("/builds/:id", buildController.show);
router.post("/builds/:id/reverse", buildController.reverseBuild);

// 🔹 Parties (customers we sell to)
router.get("/parties", partyController.index);
router.get("/parties/:id", partyController.find);
router.post("/parties", partyController.store);
router.patch("/parties/:id", partyController.update);
router.delete("/parties/:id", partyController.delete);

// 🔹 Sales orders
// The static /feasibility route must be declared before /:id, or Express
// matches "feasibility" as an order id.
router.post("/sales-orders/feasibility", salesOrderController.previewFeasibility);

router.get("/sales-orders", salesOrderController.index);
router.post("/sales-orders", salesOrderController.store);
router.get("/sales-orders/:id", salesOrderController.find);
router.patch("/sales-orders/:id", salesOrderController.update);
router.delete("/sales-orders/:id", salesOrderController.remove);
router.patch("/sales-orders/:id/status", salesOrderController.updateStatus);
router.post("/sales-orders/:id/dispatch", salesOrderController.dispatch);
router.get("/sales-orders/:id/feasibility", salesOrderController.feasibility);

// 🔹 Workers (shop floor) and the skill catalogue
// Static paths first — otherwise "skill-matrix" is matched as a worker id.
router.get("/worker-skills", workerController.catalogue);
router.get("/workers/skill-matrix", workerController.skillMatrix);

router.get("/workers", workerController.index);
router.post("/workers", workerController.store);
router.get("/workers/:id", workerController.find);
router.patch("/workers/:id", workerController.update);
router.delete("/workers/:id", workerController.delete);

// 🔹 Departments — the building blocks of a pipeline
router.get("/departments", departmentController.index);
router.post("/departments", departmentController.store);
router.get("/departments/:id", departmentController.find);
router.patch("/departments/:id", departmentController.update);
router.delete("/departments/:id", departmentController.delete);

// 🔹 Pipelines (routing templates)
// Static path before /:id, or "validate" is read as a pipeline id.
router.post("/pipelines/validate", pipelineController.validate);

router.get("/pipelines", pipelineController.index);
router.post("/pipelines", pipelineController.store);
router.get("/pipelines/:id", pipelineController.find);
router.patch("/pipelines/:id", pipelineController.update);
router.delete("/pipelines/:id", pipelineController.delete);
router.patch("/pipelines/:id/items", pipelineController.setItems);

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
router.post("/po/:id/send-to-job", POController.sendToJob);
router.patch("/po/:id/write-off", POController.writeOffItem);
router.post("/po/:id/reject-to-origin", POController.rejectToOrigin);

router.post("/po", POController.create);
router.get("/po", POController.index);
router.get("/po/:id", POController.show);
router.put("/po/:id", POController.update);
router.patch("/po/:id/status", POController.updateStatus);
router.delete("/po/:id", POController.remove);
router.patch("/po/:id/movement", POController.addMovement);

router.get("/categories", categoryController.index);
router.get("/categories/tree", categoryController.tree);
router.get("/categories/:id", categoryController.find);

router.post("/categories", categoryController.store);
router.patch("/categories/:id", categoryController.update);
router.delete("/categories/:id", categoryController.delete);

router.get("/notification", NotificationController.index);
router.get("/notification/:id", NotificationController.find);
router.post("/notification", NotificationController.store);
router.post("/notification/markSeen", NotificationController.markSeen);
router.post("/sendNotifications", NotificationController.sendNotifications);
router.patch("/notification/:id", NotificationController.update);
router.delete("/notification/:id?", NotificationController.delete);

router.post("/pushToken", pushTokenController.store);
router.get("/pushToken", pushTokenController.index);

module.exports = router;
