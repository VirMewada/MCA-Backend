const { promisify } = require("util");
const { randomUUID: uuid } = require("crypto");
const bcrypt = require("bcrypt");
const User = require("../Models/userModel");
const catchAsync = require("../Utils/catchAsync");
const AppError = require("../Utils/appError");
var { stripe } = require("../Utils/stripe");
const { loginChecks } = require("../Utils/login-checks");
const jwt = require("jsonwebtoken");
const Email = require("../Utils/email");
// const { findOneAndUpdate, findOne, startSession } = require("../userModel");
const RefreshToken = require("../Models/refreshTokenModel");
const { otpNumber } = require("../Utils/otpGenerator");
const cron = require("node-cron");
const RefreshRecord = require("../Models/refreshRecordModel");
const DeviceSession = require("../Models/sessionModel");
const PushToken = require("../Models/pushTokenModel");

const signToken = (id, noExpiry) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET,
    JSON.parse(
      JSON.stringify({
        expiresIn: noExpiry ? undefined : process.env.JWT_EXPIRES_IN,
      })
    )
  );
};
// ======== function to creat and send token===========
// const creatSendToken = async (
//   user,
//   statusCode,
//   message,
//   res,
//   device,
//   noExpiry = false
// ) => {
//   const token = signToken(user._id, noExpiry);

//   const sessions = await DeviceSession.find({ user: user._id });
//   const refreshToken = uuid();
//   await RefreshRecord.create({
//     user: user._id,
//     device: device.id,
//     // createdAt: device.currentTime,
//   });
//   await RefreshToken.create({
//     user: user._id,
//     token: refreshToken,
//     device: device.id,
//     deviceToken: device.deviceToken,
//   });
//   const newUser = await User.findOne({ _id: user._id });
//   return res.status(statusCode).json({
//     success: true,
//     status: statusCode,
//     // act: res.act,
//     message,
//     data: {
//       token,
//       user: newUser,
//       refreshToken,
//       sessions,
//     },
//   });
// };
// ========= disabled because wanted to implement new refresh token code =========
const creatSendToken = async (
  user,
  statusCode,
  message,
  res,
  device, // Expects { id: Device.osBuildId, deviceToken: 'some_value_if_needed' }
  noExpiry = false
) => {
  const accessToken = signToken(user._id, noExpiry);
  console.log("accessToken", accessToken);

  // Clean up any existing refresh tokens for this user on this specific device.
  // This ensures only one active refresh token per user per device at any given login/authentication.
  await RefreshToken.deleteMany({ user: user._id, device: device.id });
  console.log(
    `Cleaned up old refresh tokens for user ${user._id} on device ${device.id}.`
  );

  const newRefreshTokenString = uuid();
  const now = Date.now(); // Capture current time once

  // Create a new RefreshToken record with session tracking fields
  await RefreshToken.create({
    user: user._id,
    token: newRefreshTokenString, // This will be hashed by the pre-save hook
    device: device.id,
    deviceToken: device.deviceToken,
    sessionStartAt: now, // Set session start time
    lastActivityAt: now, // Set last activity time
  });
  console.log(
    `Created new refresh token record for user ${user._id} on device ${device.id}, marking new session start.`
  );

  // --- No RefreshRecord created here ---

  const newUser = user; // Assuming the passed 'user' object is sufficient
  const sessions = await DeviceSession.find({ user: user._id }); // Still retrieve sessions if needed

  return res.status(statusCode).json({
    success: true,
    status: statusCode,
    message,
    data: {
      token: accessToken,
      user: newUser,
      refreshToken: newRefreshTokenString, // Send the NEW plain-text refresh token to the client
      sessions, // Include if needed by the client
    },
  });
};

exports.socialLogin = catchAsync(async (req, res) => {
  let user = await User.findOne({ email: req.body.email });
  if (!user) {
    try {
      let obj = await stripe.customers.create({
        name: req.body.name,
        email: req.body.email,
      });
      id = obj.id;
    } catch (error) {
      console.log(error);
    }
    console.log("C_id", id);
    user = await User.create({
      ...JSON.parse(JSON.stringify(req.body)),
      verified: false,
      email: req.body.email,
      customerId: id,
      isSocial: true,
      role: req.body.role,
      password: "default768976777",
    });
  }
  // res.act = loginChecks(user);
  return creatSendToken(
    user,
    200,
    "Logged in successfully",
    res,
    req.body.device
  );
});
// =========SIGNUP USER=====================
exports.signup = catchAsync(async (req, res, next) => {
  let id;
  try {
    let obj = await stripe.customers.create({
      name: req.body.name,
      email: req.body.email,
    });
    id = obj.id;
  } catch (error) {
    console.log(error);
  }
  console.log(
    "C_id",
    id,
    " firstname lastname ",
    req.body.name,
    " infoall: ",
    req.body
  );
  const user = await User.findOne({ email: req.body.email });
  if (user?.deleted)
    return res.status(400).send({
      status: 400,
      success: false,
      message: "This user has been deleted",
      data: {},
    });

  if (user) {
    return res.status(400).json({
      success: false,

      status: 400,
      message: "User with given email already exist",
      errorType: "email-already-exist",
      data: {},
    });
  }
  console.log("Creating new user with customerId:");

  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    number: req.body.number,
    customerId: id,
    verified: "unverified",
    accountType: req.body.accountType,
    password: req.body.password,
    otp: null,
    // number: req?.body?.number,
    passwordChangedAt: Date.now(),
    // ...req.body,
    ...JSON.parse(JSON.stringify(req.body)),
  });
  const otp = otpNumber(4);

  console.log("Creating new user with customerId2:");

  ////// Sending Email..
  try {
    await new Email(newUser, otp).sendWelcome(otp);
  } catch (error) {
    console.log(error);
  }
  ////// Expires Time
  // const otpExpires = Date.now() + 1 * 60 * 1000 + 10 * 1000;
  /////////////////

  const userotp = await User.findOne({ email: newUser.email });
  if (!userotp) {
    return res.status(400).json({
      status: 400,
      success: false,
      errorType: "wrong-email",
      data: {},
    });
  }
  const newUserotp = await User.findOneAndUpdate(
    { email: userotp.email },
    { otp },
    { new: true, runValidators: false }
  );

  if (user?.deleted)
    return res.status(400).send({
      status: 400,
      success: false,
      message: "This user has been deleted",
      data: {},
    });

  console.log(otp);
  creatSendToken(newUser, 200, "OTP Sent to Email", res, req.body.device);
  // res.status(200).json({
  //   status: 200,
  //   success: true,
  //   message: "Signed up successfully",
  //   data: { user: newUser },
  // });
});

// ========= Send  OTP  ====================='''''''''''''''''''''''''
exports.sendOTP = catchAsync(async (req, res, next) => {
  const otp = otpNumber(4);
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return res.status(400).json({
      status: 400,
      success: false,
      errorType: "wrong-email",
      data: {},
    });
  }
  if (req.body.signingUp) {
    if (await User.findOne({ email: req.body.email }))
      return res.status(400).send({
        status: 400,
        success: false,
        message: "Email already exists",
        data: {},
      });
  }
  const newUser = await User.findOneAndUpdate(
    { email: req.body.email },
    { otp },
    { new: true, runValidators: false }
  );
  console.log(otp);

  try {
    await new Email(newUser, otp).sendWelcome(otp);
  } catch (error) {
    console.log(error);
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: `OTP Sent to your email.`,
    data: {},
  });
});

// ===================Refresh Password=================================
// exports.refresh = catchAsync(async (req, res, next) => {
//   const tokenHashed = req.params.token;
//   const tokens = await RefreshToken.find({ device: req.body.device.id });

//   let done = false;
//   let cycle = 0;
//   for (const token of tokens)
//     bcrypt.compare(tokenHashed, token.token, async (err, result) => {
//       if (done) return;
//       console.log(err, result);
//       if (!(result == false || err)) {
//         const user = await User.findOne({ _id: token.user });
//         const accessToken = signToken(user._id, false);
//         done = true;
//         return res.json({
//           status: 200,
//           success: true,
//           message: "",
//           data: { accessToken },
//         });
//       }
//       cycle += 1;
//     });
//   if (cycle == tokens.length)
//     return res.status(400).send({
//       status: 400,
//       success: false,
//       message: `Invalid refresh token for device ${req.body.device.id}`,
//       data: {},
//     });
// });
// ==================Disabled old code ==============================
exports.refresh = catchAsync(async (req, res, next) => {
  const clientRefreshToken = req.body.refreshToken;
  const deviceId = req.body.device?.id;

  if (!clientRefreshToken || !deviceId) {
    return res.status(400).send({
      status: 400,
      success: false,
      message: "Refresh token and device ID are required for token refresh.",
      data: {},
    });
  }

  let refreshTokenDoc = null;
  const tokensForDevice = await RefreshToken.find({ device: deviceId });

  // Find the matching refresh token by comparing the plain-text token with stored hashes
  for (const doc of tokensForDevice) {
    // Assuming RefreshToken model has a .correctToken method
    if (await doc.correctToken(clientRefreshToken, doc.token)) {
      refreshTokenDoc = doc;
      break;
    }
  }

  // If no valid refresh token record is found or token mismatch
  if (!refreshTokenDoc) {
    // If any tokens were found for the device, but none matched or it's a compromised token.
    // Invalidate ALL other refresh tokens for that user for security.
    if (tokensForDevice.length > 0) {
      const userIdFromAnyToken = tokensForDevice[0].user;
      console.warn(
        `Potential token compromise for user ${userIdFromAnyToken} on device ${deviceId}. Invaliding all tokens.`
      );
      await RefreshToken.deleteMany({ user: userIdFromAnyToken });
      await PushToken.deleteMany({ userId: userIdFromAnyToken }); // Also delete push tokens
    }

    return res.status(401).send({
      status: 401,
      success: false,
      message: "Invalid or expired refresh token. Please log in again.",
      data: {},
    });
  }

  // --- Refresh Token Rotation ---
  const oldSessionStartAt = refreshTokenDoc.sessionStartAt; // Preserve the session start time
  const now = Date.now(); // Capture current time

  // 1. Invalidate the OLD refresh token
  await RefreshToken.findByIdAndRemove(refreshTokenDoc._id);
  console.log(
    `Old refresh token invalidated (${refreshTokenDoc._id}) for user ${refreshTokenDoc.user} on device ${deviceId}.`
  );

  // 2. Generate a NEW Access Token
  const newAccessToken = signToken(refreshTokenDoc.user, false);

  // 3. Generate a NEW plain-text refresh token string
  const newRefreshTokenString = uuid();

  // 4. Create a NEW RefreshToken record, inheriting sessionStartAt
  await RefreshToken.create({
    user: refreshTokenDoc.user,
    token: newRefreshTokenString, // This will be hashed
    device: deviceId,
    deviceToken: refreshTokenDoc.deviceToken,
    sessionStartAt: oldSessionStartAt, // CRITICAL: Inherit sessionStartAt from the old token
    lastActivityAt: now, // Update last activity time
  });
  console.log(
    `New refresh token issued for user ${refreshTokenDoc.user} on device ${deviceId}, session continues.`
  );

  // --- No RefreshRecord created here ---

  return res.json({
    status: 200,
    success: true,
    message: "Tokens refreshed successfully.",
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenString, // Send the NEW plain-text refresh token
    },
  });
});
// ===================Verify EMAIL BY OTP===============================
exports.verifyEmail = catchAsync(async (req, res, next) => {
  const euser = await User.findOne({ email: req.body.email });
  if (!euser) {
    return res.status(400).send({
      success: false,
      status: 400,
      message: "Invalid Email",
      errorType: "wrong-email",
      data: {},
    });
  }

  const user = await User.findOne({
    email: req.body.email,
  });
  // if the token has not expired and there is a user set the new password

  if (!user) {
    return res.status(400).send({
      message: "User not found",
      success: false,
      errorType: "user-not-found",
      status: 400,
      data: {},
    });
  }

  if (!req.body.otp) {
    return res.status(400).send({
      success: true,
      status: 400,
      message: "Please add otp",

      data: {},
    });
  }
  if (req.body.otp != user.otp) {
    return res.status(400).send({
      success: true,
      status: 400,
      message: "The given OTP is invalid",
      errorType: "wrong-otp",
      data: {},
    });
  }
  const newUser = await User.findOneAndUpdate(
    { email: req.body.email },
    { verified: true, otp: null },
    { new: true }
  );
  // res.status(200).send({
  //   success: true,
  //   status: 200,

  //   data: { user: newUser },
  // });

  // res.act = loginChecks(newUser);
  creatSendToken(
    newUser,
    200,
    "The email has been verified",
    res,
    req.body.device
  );
});
//     ====================LOGIN User=========================================
exports.login = catchAsync(async (req, res, next) => {
  const { id, email, password } = req.body;

  // check if user exist and password is correct
  const user = await User.findOne(id ? { _id: id } : { email }).select(
    "+password"
  );
  req.user = user;

  if (password) {
    if (!user || !(await user.correctPassword(password, user.password))) {
      return res.status(400).send({
        message: "Incorrect email or password",
        errorType: "wrong-password",
        status: 400,
        success: false,
        data: {},
      });
    }
  }
  const logedIn = await RefreshToken.findOne({
    device: req.body.device.id,
    user: user._id,
  });
  if (logedIn) {
    await RefreshToken.findByIdAndRemove(logedIn._id);
  }
  console.log("user logged in");

  if (user?.deleted)
    return res.status(400).send({
      status: 400,
      success: false,
      message: "This user has been deleted",
      data: {},
    });

  await User.updateOne(
    { _id: user._id },
    {
      deviceToken: req.body.device.id,
    }
  );
  user.deviceToken = req.body.device.id;
  // user.otp = otp

  // creat token from existing function .
  if (user?.verified || user?.parent)
    creatSendToken(user, 200, "Logged in Successfully", res, req.body.device);
  else {
    const otp = otpNumber(4);
    await User.updateOne({ _id: req.user._id }, { $set: { otp } });
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(400).json({
        status: 400,
        success: false,
        errorType: "wrong-email",
        data: {},
      });
    }
    const newUser = await User.findOneAndUpdate(
      { email: req.body.email },
      { otp },
      { new: true, runValidators: false }
    );
    console.log(otp);

    try {
      await new Email(newUser, otp).sendWelcome(otp);
    } catch (error) {
      console.log(error);
    }

    console.log("end");
    res.status(200).json({
      status: 200,
      success: true,
      message: `OTP Sent to your email.`,
      data: {},
    });
  }
});

exports.adminLogin = catchAsync(async (req, res, next) => {
  const { email, password } = req.body; // For admin login, typically only email/password is used

  // 1. Basic validation: Check if email and password are provided
  if (!email || !password) {
    return next(new AppError("Please provide email and password!", 400));
  }

  // 2. Find user by email and select password and isAdmin field
  const user = await User.findOne({ email }).select("+password +isAdmin"); // IMPORTANT: Select isAdmin

  // 3. Check if user exists and password is correct
  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError("Incorrect email or password!", 401)); // Use 401 Unauthorized for incorrect credentials
  }

  // 4. ***Crucial: Check if the user is an admin***
  if (!user.isAdmin) {
    return next(
      new AppError("You are not authorized to access the admin panel.", 403)
    ); // 403 Forbidden
  }

  // 5. Handle deleted users
  if (user?.deleted) {
    return next(new AppError("This user account has been deactivated.", 403)); // Use 403 for deactivated admin accounts
  }

  // 6. Handle refresh token (similar to your existing logic)
  const loggedInRefreshToken = await RefreshToken.findOne({
    device: req.body.device?.id, // Use optional chaining in case device is not provided
    user: user._id,
  });

  if (loggedInRefreshToken) {
    await RefreshToken.findByIdAndRemove(loggedInRefreshToken._id);
  }

  // 7. Update deviceToken (similar to your existing logic)
  if (req.body.device?.id) {
    // Only update if device ID is provided
    await User.updateOne(
      { _id: user._id },
      { deviceToken: req.body.device.id }
    );
    user.deviceToken = req.body.device.id; // Update the in-memory user object
  }

  // 8. Create and send JWT token
  // For admin login, we assume verification is already done or not required
  // Your `creatSendToken` function should ideally handle adding the 'isAdmin' or 'role' claim to the JWT.
  // Make sure `creatSendToken` can accept a role or if it's already fetching user data to include it.
  creatSendToken(
    user,
    200,
    "Admin Logged in Successfully",
    res,
    req.body.device
  );
});

exports.testLogin = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  // check if email and password exist
  if (!email || !password) {
    return res.status(400).send({
      message: "please provide email and password",
      status: 400,
      success: false,
      data: {},
    });
  }
  // check if user exist and password is correct
  const user = await User.findOne({ email }).select("+password");

  if (!user || !(await user.correctPassword(password, user.password))) {
    return res.status(400).send({
      message: "Incorrect email or password",
      status: 400,
      success: false,
      data: {},
    });
  }
  if (user.verified == false) {
    return res.status(400).send({
      message: "Email verification is pending",
      status: 400,
      success: false,
      data: {},
    });
  }

  // creat token from existing function .
  creatSendToken(
    user,
    200,
    "Logged In Successfully",
    res,
    req.body.device,
    true
  );
});

// ===========================VERIFY TOKEN BEFORE GETTING DATA=====================
exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check if its there
  let token;
  token = req.headers.authorization;

  // if (
  //   req.headers.authorization &&
  //   req.headers.authorization.startsWith("Bearer ")
  // ) {
  //   token = req.headers.authorization.split(" ")[1]; // <-- ✅ get only the token
  // }

  if (!token) {
    return res.status(400).send({
      message: "You are not logged in, please login to get access",
      status: 400,
      success: true,
      data: {},
    });
  }

  // Verification of  token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  // console.log("token verified step 2.");
  //3) check if the user still exist
  // console.log(decoded);
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return res.status(400).send({
      message: "User not exist now",
      status: 400,
      success: false,
      data: {},
    });
  }
  // console.log("User exist step 3.");f

  //check if the user changed the password after the token is issued
  // if (currentUser.changedPasswordAfter(decoded.iat)) {
  //   return res.status(400).send({
  //     message: "User recently changed password please login again!",
  //     status: 400,
  //     success: false,
  //     data: {},
  //   });
  // }
  //grant access to the protected rout
  req.user = currentUser;
  console.log("verification completed");
  next();
});

//================= Authorization=============
//Restrict who can delete tour

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    console.log(req.user.name, roles);
    // if (!roles.includes(req.user.role)) {
    //   return res.status(403).send({
    //     status: 403,
    //     success: false,
    //     message: "You do not have permission to perform this action",
    //     data: {},
    //   });
    // }
    next();
  };
};

// =================================================================================

// ======== FORGOT PASSWORD AND PASSWORD RESET ================

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) get user on posted email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return res.status(400).send({
      message: "There is no user with given email address",
      errorType: "wrong-email",
      status: 400,
      success: false,
      data: {},
    });
  }

  // 2) generate the random reset token

  const passwordResetToken = otpNumber(4);
  user.passwordResetToken = passwordResetToken;

  user.passwordResetExpires = Date.now() + 1 * 60 * 1000;

  await user.save({ validateBeforeSave: false });

  try {
    await new Email(user, passwordResetToken).sendPasswordReset(
      passwordResetToken
    );
    return res.status(200).json({
      status: 200,
      success: true,
      message: "OTP sent to email",
    });
  } catch (err) {
    console.log(err);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return res.status(400).send({
      success: false,
      status: 400,
      errorType: "wrong-email",
      message: "There was an error while sending email. please try again later",
      data: {},
    });
  }
});

// ===================RESET PASSWORD===============================
exports.resetPassword = catchAsync(async (req, res, next) => {
  const user = await User.findOne({
    email: req.body.email,
    // passwordResetExpires: { $gt: Date.now() },
  });
  // if the token has not expired and there is a user set the new password

  if (!user) {
    return res.status(400).send({
      message: "user not found",
      success: false,
      errorType: "",
      status: 400,
      data: {},
    });
  }
  // if (user.passwordResetToken != req.body.otp) {
  //   return res.status(400).send({
  //     message: "Invalid OTP",
  //     success: false,
  //     errorType: "wrong-otp",
  //     status: 400,
  //     data: {},
  //   });
  // }
  user.password = req.body.password;
  // user.confirmPassword = req.body.confirmPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save({ validateBeforeSave: false });

  // res.act = loginChecks(user);
  creatSendToken(
    user,
    200,
    "The password has been updated successfully",
    res,
    req.body.device
  );

  // const token = signToken(user._id);
  // res.status(200).json({
  //   status: 200,
  //   success: true,
  //   act: loginChecks(user),
  //   token,
  // });
});

// ===================Verify OTP for RESET PASSWORD===============================
exports.verifyOtpForResetPassword = catchAsync(async (req, res, next) => {
  const user = await User.findOne({
    email: req.body.email,
    passwordResetExpires: { $gt: Date.now() },
  });
  // if the token has not expired and there is a user set the new password

  if (!user) {
    return res.status(400).send({
      message: "Token may expire",
      success: false,
      errorType: "otp-expired",
      status: 400,
      data: {},
    });
  }
  if (user.passwordResetToken != req.body.otp) {
    return res.status(400).send({
      message: "Invalid Token",
      success: false,
      errorType: "wrong-otp",
      status: 400,
      data: {},
    });
  }

  return res.status(200).json({
    status: 200,
    success: true,
    message: "OTP verified",
  });
});

// ===========UPDATE PASSWORD for already login user=================================
exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1)get user from collection.
  const user = await User.findById(req.user.id).select("+password");

  // check if posted current password is correct
  if (!(await user.correctPassword(req.body.currentPassword, user.password))) {
    return res.status(400).send({
      message: "Your current password is wrong",
      success: false,
      errorType: "incorrect-old-password",
      status: 400,
      data: {},
    });
  }
  // if so update password
  user.password = req.body.password;
  // user.confirmPassword = req.body.confirmPassword;
  await user.save();
  // Log user in  , send jwt
  // res.act = loginChecks(user);
  creatSendToken(
    user,
    200,
    "The password has been updated successfully",
    res,
    req.body.device
  );
});

// exports.logout = catchAsync(async (req, res, next) => {
//   const device = req.body.device;
//   console.log("device", req.body);

//   await RefreshToken.deleteOne({ device: device.id, user: req.user._id });

//   // const cutoffDate = new Date("2025-04-11T00:00:00Z");
//   // const result = await RefreshRecord.deleteMany({
//   //   createdAt: { $lt: cutoffDate },
//   // });

//   // console.log(`Deleted ${result.deletedCount} old refresh records.`);
//   const deletePushTokenResult = await PushToken.deleteMany({
//     userId: req.user._id,
//     deviceId: device.id,
//   });
//   console.log(
//     `Push Token(s) deleted: ${deletePushTokenResult.deletedCount} records for user ${req.user._id} on device ${device.id}.`
//   );

//   return res.json({
//     success: true,
//     status: 200,
//     message: "User logged out successfully",
//     data: {},
//   });
// });

exports.logout = catchAsync(async (req, res, next) => {
  const device = req.body.device;
  console.log("device", req.body);

  // Find the refresh token associated with this user and device
  const activeRefreshToken = await RefreshToken.findOne({
    device: device.id,
    user: req.user._id,
  });

  if (activeRefreshToken) {
    // Create a DeviceSession record before deleting the token
    const now = Date.now();
    const duration = now - activeRefreshToken.sessionStartAt;

    if (duration > 0) {
      // Only create if the session had a positive duration
      await DeviceSession.create({
        device: device.id,
        user: req.user._id,
        startTime: activeRefreshToken.sessionStartAt,
        endTime: now,
        duration: duration,
      });
      console.log(
        `DeviceSession created (explicit logout) for user ${
          req.user._id
        } on device ${device.id}. Duration: ${duration / 1000} seconds.`
      );
    }

    // Delete the refresh token
    await RefreshToken.deleteOne({ _id: activeRefreshToken._id });
    console.log(
      `Refresh token deleted for user ${req.user._id} on device ${device.id}.`
    );
  } else {
    console.log(
      `No active refresh token found for user ${req.user._id} on device ${device.id} to log out.`
    );
  }

  // Also delete push tokens
  const deletePushTokenResult = await PushToken.deleteMany({
    userId: req.user._id,
    deviceId: device.id,
  });
  console.log(
    `Push Token(s) deleted: ${deletePushTokenResult.deletedCount} records for user ${req.user._id} on device ${device.id}.`
  );

  // --- No RefreshRecord created here ---

  return res.json({
    success: true,
    status: 200,
    message: "User logged out successfully",
    data: {},
  });
});

cron.schedule("0 */5 * * * *", async () => {
  // Runs every 5 seconds
  try {
    const INACTIVITY_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes for inactivity

    // Find RefreshTokens that haven't been active for a while
    const now = Date.now();
    const inactiveRefreshTokens = await RefreshToken.find({
      lastActivityAt: { $lt: new Date(now - INACTIVITY_THRESHOLD_MS) },
    });

    if (inactiveRefreshTokens.length === 0) {
      console.log("No inactive RefreshTokens found to process.");
      return;
    }

    for (const token of inactiveRefreshTokens) {
      console.log(
        `Detected inactive RefreshToken for user ${token.user} on device ${token.device}.`
      );

      // Create a DeviceSession record for this inactivity-ended session
      const duration = now - token.sessionStartAt;

      if (duration > 0) {
        // Only create if the session had a positive duration
        await DeviceSession.create({
          device: token.device,
          user: token.user,
          startTime: token.sessionStartAt,
          endTime: now,
          duration: duration,
        });
        console.log(
          `DeviceSession created (inactivity end) for user ${
            token.user
          } on device ${token.device}. Duration: ${duration / 1000} seconds.`
        );
      } else {
        // This case might happen if sessionStartAt is very close to lastActivityAt
        console.log(
          `Skipping DeviceSession creation for user ${token.user} due to non-positive duration (${duration}).`
        );
      }

      // Delete the inactive refresh token
      await RefreshToken.findByIdAndRemove(token._id);
      console.log(
        `Inactive RefreshToken deleted (${token._id}) for user ${token.user} on device ${token.device}.`
      );
    }

    console.log(
      `Finished processing ${inactiveRefreshTokens.length} inactive RefreshTokens.`
    );
  } catch (e) {
    console.error("Error in cron job for session processing:", e);
  }
});
