const express = require("express");
const paymentController = require("../Controllers/paymentController");
const authController = require("../Controllers/authControllers");

const router = express.Router();

router.post(
  "/pay-sheet",
  // authController.protect,
  // authController.restrictTo("user"),
  paymentController.paymentsheet
);

router.post(
  "/pay",
  authController.protect,
  authController.restrictTo("user"),
  paymentController.payment
);

module.exports = router;
