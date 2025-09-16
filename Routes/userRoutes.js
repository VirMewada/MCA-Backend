const express = require("express");
const userController = require("../Controllers/userControllers");
const authController = require("../Controllers/authControllers");

const router = express.Router();

router.route("/").get(userController.getAllUsers);

router.patch("/updateProfileNoAuth", userController.updateMe);
router.patch("/updateFCMToken", userController.updateFCMToken);

router.patch("/updateMy", userController.updateMy);
router.patch("/updateMedia", userController.updateMedia);
router.patch("/updateVideos", userController.updateVideos);
router.patch("/deleteMedia", userController.deleteMedia);

router.post("/signup", authController.signup);
router.post("/socialLogin", authController.socialLogin);

router.post("/verify", authController.verifyEmail);

router.post("/login", authController.login);
router.post("/adminLogin", authController.adminLogin);

router.post("/sendOTP", authController.sendOTP);

router.post("/refresh/:token", authController.refresh);
router.post("/testLogin", authController.testLogin);
router.get("/categories", userController.getCategories);

router.post("/forgotPassword", authController.forgotPassword);
router.patch("/resetPassword", authController.resetPassword);
router.post(
  "/verifyOTPResetPassword",
  authController.verifyOtpForResetPassword
);

// Protect all routes after this middleware
router.use(authController.protect);

router.get("/getAttUsers", userController.getAttUsers);

router.post("/getUsersFromCompany", userController.getUsersFromCompany);

router.post("/getUsersByArray", userController.getUsersByIdArray);

router.get("/all", userController.all);
router.get("/mynotifications", userController.mynotifications);
router.get("/actors", userController.getAllActors);

router.post("/logout", authController.logout);
router.patch("/updateMyPassword", authController.updatePassword);
router.get("/me", userController.getMe, userController.getUser);
router.patch(
  "/updateProfile",
  userController.uploadUserPhoto,
  userController.resizeUserPhoto,
  userController.updateMe
);
router.delete("/deleteMe", userController.deleteMe);

// router.use(authController.restrictTo("admin"));

router
  .route("/:id")
  .get(userController.getUser)
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

router.get("/get-all-actors", userController.getAllActors);

router.get("/get-my-info/:id", userController.getMyInfo);
router.get("/get-saved-gigs/:id", userController.getAllSaved);

module.exports = router;
