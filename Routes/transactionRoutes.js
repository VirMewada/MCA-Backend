const express = require("express");
const userController = require("../Controllers/userControllers");
const authController = require("../Controllers/authControllers");
const transactionController = require("../Controllers/transactionController");
const router = express.Router();

router.use(authController.protect);

router.get("/", transactionController.getallTransaction);
router
  .route("/:id")
  .get(transactionController.getOneTransaction)
  .patch(
    authController.protect,
    // authController.restrictTo("admin"),
    transactionController.updateTransaction
  )
  .delete(
    authController.protect,
    // authController.restrictTo("admin"),
    transactionController.deleteTransaction
  );

module.exports = router;
