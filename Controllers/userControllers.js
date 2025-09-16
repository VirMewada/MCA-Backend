const multer = require("multer");
const sharp = require("sharp");
const User = require("../Models/userModel");
const catchAsync = require("./../Utils/catchAsync");
const Email = require("./../Utils/email");
const AppError = require("./../Utils/appError");
const factory = require("./handlersFactory");
const Notification = require("../Models/NotificationModel");
const Review = require("../Models/reviewModel.js");
const paginationQueryExtracter = require("../Utils/paginationQueryExtractor");
const paginateArray = require("../Utils/paginationHelper");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const { getImageVector } = require("../services/imageVectorizer.js");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const { runFaiss } = require("../services/faissService");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid"); // To generate unique file names

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new AppError("Not an image! Please upload only images.", 400), false);
  }
};

// const upload = multer({
//   storage: multerStorage,
//   fileFilter: multerFilter,
// });
// Configure multer to store files in memory for easy upload to S3
const storage = multer.memoryStorage();
const upload = multer({ storage });
exports.uploadUserPhoto = upload.single("photo");

exports.resizeUserPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  req.file.filename = `user-${req.user.id}-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(500, 500)
    .toFormat("jpeg")
    .jpeg({ quality: 90 })
    .toFile(`public/img/users/${req.file.filename}`);

  next();
});

const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

exports.getMe = (req, res, next) => {
  req.params.id = req.user.id;
  next();
};

exports.reminders = catchAsync(async (req, res) => {
  const user = await User.findOne({ _id: req.query.userId });
  const time = req.query.time;
  const thisYear = new Date(time).getFullYear();
  const nextYear = new Date(time + 365 * 24 * 60 * 60 * 1000).getFullYear();

  const events = [
    {
      name: "Birthday",
      time:
        new Date(user.dateOfBirth).setFullYear(thisYear) <= req.user.time
          ? new Date(user.dateOfBirth).setFullYear(thisYear)
          : new Date(user.dateOfBirth).setFullYear(nextYear),
    },
    user.weddingDate
      ? {
          name: "Wedding",
          time:
            new Date(user.weddingDate).setFullYear(thisYear) <= req.user.time
              ? new Date(user.weddingDate).setFullYear(thisYear)
              : new Date(user.weddingDate).setFullYear(nextYear),
        }
      : null,
    { name: "New Year", time: new Date(nextYear, 0, 1).getTime() },
    { name: "Valentine Date", time: new Date(`02-14-${nextYear}`).getTime() },
  ].filter((x) => x?.time);

  const sorted = events.sort((a, b) => (a.time > b.time ? 1 : -1));

  return res.json({
    status: 200,
    success: true,
    data: { events: sorted },
  });
});

exports.all = catchAsync(async (req, res) => {
  const userId = req.query?.userI4 ? req.query?.userI4 : req.user._id;
  const users = JSON.parse(
    JSON.stringify(
      await User.find(
        req.query.query ? JSON.parse(decodeURIComponent(req.query.query)) : {}
      )
    )
  ).filter((u) => !u?.parent);

  for (const u of users) {
    u.isFriend =
      JSON.parse(
        JSON.stringify(
          await Friend.findOne({
            $or: [
              { friend_a: u._id, friend_b: userId },
              { friend_b: u._id, friend_a: userId },
            ],
          })
        )
      )?.status ?? null;
    u.friends = JSON.parse(
      JSON.stringify(
        await Friend.find({
          $or: [{ friend_b: userId }, { friend_a: userId }],
        })
          .populate("friend_a")
          .populate("friend_b")
      )
    ).map((x) => ({
      ...x,
      friend: x?.friend_a?._id == userId ? x?.friend_a : x?.friend_b,
    }));
    u.wishlist = await Wishlist.find({ user: userId }).sort({ _id: -1 });
  }

  return res.json({
    status: 200,
    success: true,
    message: "",
    data: {
      users,
    },
  });
});

// Configure S3 (AWS SDK automatically uses App Runner's IAM role)
// const s3 = new AWS.S3();
const s3 = new AWS.S3({
  accessKeyId: process.env.WASABI_ACCESS_KEY,
  secretAccessKey: process.env.WASABI_SECRET_KEY,
  region: process.env.WASABI_REGION, // e.g. "ap-southeast-1"
  endpoint: new AWS.Endpoint(process.env.WASABI_ENDPOINT), // e.g. "https://s3.ap-southeast-1.wasabisys.com"
  s3ForcePathStyle: true, // important for Wasabi
});

// Middleware for handling file uploads
const uploadSingle = upload.single("file");

const { PassThrough } = require("stream");
const userImageEmbedding = require("../Models/userImageEmbeddingModel.js");
const {
  replaceProfilePhoto,
  generateSignedUrl,
  deleteFile,
} = require("../Utils/wasabiHelper.js");
const embeddingQueue = require("../queues/embeddingQueue.js");

// Method to handle user updates
exports.updateMe = [
  uploadSingle, // Handle file upload first
  catchAsync(async (req, res, next) => {
    //=================vv Image update code vv=================
    console.log("req---", req.body);
    const updateData = {
      ...req.body,
    };

    // Only process `social` if it exists
    if (req.body.social) {
      updateData.social = req.body.social.map((s) => JSON.stringify(s));
    }

    // Now perform the update
    let queryFilter = {};

    // Prioritize req.body._id for admin actions
    if (req.body._id) {
      queryFilter = { _id: req.body._id };
      // If isAdmin is being sent, and req.body._id is present, assume it's an admin action
      // and allow isAdmin to be updated.
      if (typeof req.body.isAdmin === "boolean") {
        updateData.isAdmin = req.body.isAdmin;
      } else {
        // If isAdmin is not a boolean or not provided in admin context, ensure it's not accidentally set
        delete updateData.isAdmin;
      }
    } else if (req.user && req.user._id) {
      // Fallback: If no _id in body, use the authenticated user's ID
      queryFilter = { _id: req.user._id };
      // Ensure regular users cannot change their isAdmin status
      delete updateData.isAdmin;
    } else if (req.body.email) {
      // If no user ID but email is provided (less secure for direct updates, but aligns with your original logic)
      queryFilter = { email: req.body.email };
      // Ensure regular users cannot change their isAdmin status via email update
      delete updateData.isAdmin;
    } else {
      // If no identifying field is present, throw an error
      return next(new Error("User ID or Email not provided for update.", 400));
    }

    // Now perform the update using the determined queryFilter
    const updatedUser = await User.findOneAndUpdate(
      queryFilter,
      { $set: updateData },
      { new: true, runValidators: true } // `runValidators: true` is good practice
    );

    if (!updatedUser) {
      return next(
        new Error("No user found with the provided ID or email.", 404)
      );
    }

    // Send the response
    res.status(200).json({
      status: 200,
      success: true,
      message: "Profile Updated Successfully",
      data: {
        user: updatedUser,
        //profileImage: fileUrl, // Include the uploaded file URL in the response
      },
    });
  }),
];

exports.updateMy = [
  uploadSingle, // Handle file upload first
  catchAsync(async (req, res, next) => {
    console.log("entered file upload in users");
    if (!req.body.id) {
      return next(new AppError("User ID is required.", 400));
    }

    let user = await User.findById(req.body.id);
    if (!user) {
      return next(new AppError("User not found.", 404));
    }

    const isActor = user.role === "actor";
    let oldImageUrl = user.image; // Store the old image URL
    let fileUrl = oldImageUrl; // Default to existing profile image
    console.log("entered file upload in users 2");

    if (req.file) {
      try {
        console.log("entered file upload in users 3");
        // Convert buffer to a readable stream
        const bufferStream = new PassThrough();
        bufferStream.end(req.file.buffer);
        console.log("req.file.buffer - file exists");

        // Upload to Wasabi
        const folder = "user_profiles";
        const newKey = `${folder}/${uuidv4()}${path.extname(
          req.file.originalname
        )}`;
        let oldWasabiKey = null;

        console.log("oldImageUrl:", oldImageUrl);

        if (oldImageUrl && oldImageUrl.startsWith("user_profiles/")) {
          oldWasabiKey = oldImageUrl;
        }

        const absUrl = generateSignedUrl(newKey);
        console.log(
          "oldWasabiKey:",
          oldWasabiKey,
          "\nnewKey:",
          newKey,
          "\nabsUrl:",
          absUrl
        );

        //TODO: Temporarily Commented out
        const wasabiUploadResult = await replaceProfilePhoto(
          req.file.buffer,
          newKey,
          oldWasabiKey,
          req.file.mimetype
        );

        // const signedUrl = generateSignedUrl(newKey);

        // // const fileUrlNew = `${process.env.WASABI_ENDPOINT}/${process.env.WASABI_BUCKET}/${newKey}`;
        // const fileUrlNew = wasabiUploadResult.Location;
        // console.log(
        //   "Wasabi upload complete:",
        //   fileUrlNew,
        //   "\nwasabi----",
        //   wasabiUploadResult,
        //   "\nSigned URL:",
        //   signedUrl
        // );

        // ✅ Start Python processing in background (do NOT await)
        // if (isActor) {
        //   (async () => {
        //     try {
        //       console.log("Now using python script to get image vector...");

        //       const tempImagePath = `/tmp/${Date.now()}.jpg`;
        //       const response = await fetch(absUrl);
        //       const buffer = await response.buffer();
        //       await fs.promises.writeFile(tempImagePath, buffer);
        //       console.log("Done with downloading image to temp path");

        //       console.log("Invoking Python with imagePath:", tempImagePath);

        //       const imageVector = await getImageVector(tempImagePath);
        //       await fs.promises.unlink(tempImagePath);

        //       console.log("Background vectorization done:", imageVector);

        //       // 1. Save embedding to MongoDB (optional if you want backup)
        //       await userImageEmbedding.findOneAndUpdate(
        //         { user: req.body.id },
        //         { embedding: imageVector },
        //         { upsert: true, new: true }
        //       );

        //       // 2. Also store in FAISS index
        //       // const { runFaiss } = require("../services/faissService"); // Make sure it's imported

        //       try {
        //         const faissResponse = await runFaiss(
        //           "add",
        //           imageVector,
        //           req.body.id
        //         );
        //         console.log("Added to FAISS index:", faissResponse);
        //       } catch (faissErr) {
        //         console.error("FAISS add error:", faissErr);
        //       }
        //     } catch (err) {
        //       console.error("Background vectorization error:", err);
        //     }
        //   })();
        // } else {
        //   console.log("Casting role detected — skipping vectorization.");
        // }
        if (isActor) {
          console.log("Queuing embedding job...");

          await embeddingQueue.add(
            "generate-embedding",
            {
              imageUrl: absUrl, // public image URL
              userId: req.body.id,
            },
            {
              removeOnComplete: true,
              attempts: 3,
              backoff: { type: "exponential", delay: 3000 },
            }
          );

          console.log("Job queued!");
        }

        // Update user profile in the database
        user = await User.findByIdAndUpdate(
          req.body.id,
          { $set: { image: newKey, ...req.body } },
          { new: true }
        );

        res.status(200).json({
          status: 200,
          success: true,
          message: "Profile Updated Successfully",
          data: { user: user.toObject() },
        });
      } catch (error) {
        console.error("File Upload Error:", error);
        return next(new AppError("Error uploading file.", 500));
      }
    } else {
      user = await User.findByIdAndUpdate(
        req.body.id,
        { $set: req.body },
        { new: true }
      );

      res.status(200).json({
        status: 200,
        success: true,
        message: "Profile Updated Successfully",
        data: { user },
      });
    }
  }),
];

// exports.updateMy = [
//   uploadSingle, // Handle file upload first
//   catchAsync(async (req, res, next) => {
//     if (!req.body.id) {
//       return next(new AppError("User ID is required.", 400));
//     }

//     let user = await User.findById(req.body.id);
//     if (!user) {
//       return next(new AppError("User not found.", 404));
//     }

//     let oldImageUrl = user.image; // Store the old image URL
//     let fileUrl = oldImageUrl; // Default to existing profile image

//     if (req.file) {
//       try {
//         // Convert buffer to a readable stream
//         const bufferStream = new PassThrough();
//         bufferStream.end(req.file.buffer);

//         // Upload to Cloudinary
//         const uploadPromise = new Promise((resolve, reject) => {
//           const stream = cloudinary.uploader.upload_stream(
//             { folder: "user_profiles", resource_type: "auto" },
//             async (error, result) => {
//               if (error) {
//                 console.error("Cloudinary Upload Error:", error);
//                 reject(new AppError("Failed to upload image.", 500));
//               } else {
//                 resolve(result.secure_url);
//               }
//             }
//           );

//           bufferStream.pipe(stream); // Pipe buffer stream to Cloudinary
//         });

//         fileUrl = await uploadPromise; // Wait for the upload to complete

//         // Delete the old image from Cloudinary (if it exists)
//         if (oldImageUrl) {
//           const oldPublicId = oldImageUrl.split("/").pop().split(".")[0]; // Extract public ID
//           cloudinary.uploader.destroy(
//             `user_profiles/${oldPublicId}`,
//             (error, result) => {
//               if (error) {
//                 console.error("Cloudinary Delete Error:", error);
//               } else {
//                 console.log("Old image deleted:", result);
//               }
//             }
//           );
//         }

//         // Update user profile in the database
//         user = await User.findByIdAndUpdate(
//           req.body.id,
//           { $set: { image: fileUrl, ...req.body } },
//           { new: true }
//         );

//         res.status(200).json({
//           status: 200,
//           success: true,
//           message: "Profile Updated Successfully",
//           data: { user: user.toObject() },
//         });
//       } catch (error) {
//         console.error("File Upload Error:", error);
//         return next(new AppError("Error uploading file.", 500));
//       }
//     } else {
//       user = await User.findByIdAndUpdate(
//         req.body.id,
//         { $set: req.body },
//         { new: true }
//       );

//       res.status(200).json({
//         status: 200,
//         success: true,
//         message: "Profile Updated Successfully",
//         data: { user },
//       });
//     }
//   }),
// ];

exports.updateMedia = [
  uploadSingle, // Handle file upload first
  catchAsync(async (req, res, next) => {
    if (!req.body.id) {
      return next(new AppError("User ID is required.", 400));
    }

    let user = await User.findById(req.body.id);
    if (!user) {
      return next(new AppError("User not found.", 404));
    }

    if (!user.media.images.length >= 5) {
      return next(
        new AppError(
          "Upload limit of 5 reached. Please delete old images to add new.",
          400
        )
      );
    }
    let oldImageUrl = user.image; // Store the old image URL
    // let fileUrl = oldImageUrl; // Default to existing profile image

    if (req.file) {
      try {
        // Convert buffer to a readable stream
        const bufferStream = new PassThrough();
        bufferStream.end(req.file.buffer);

        // // Upload to Cloudinary
        // const uploadPromise = new Promise((resolve, reject) => {
        //   const stream = cloudinary.uploader.upload_stream(
        //     { folder: "user_images", resource_type: "auto" },
        //     async (error, result) => {
        //       if (error) {
        //         console.error("Cloudinary Upload Error:", error);
        //         reject(new AppError("Failed to upload image.", 500));
        //       } else {
        //         resolve(result.secure_url);
        //       }
        //     }
        //   );

        //   bufferStream.pipe(stream); // Pipe buffer stream to Cloudinary
        // });

        // fileUrl = await uploadPromise; // Wait for the upload to complete

        // Upload to Wasabi
        const folder = "user_media";
        const newKey = `${folder}/${uuidv4()}${path.extname(
          req.file.originalname
        )}`;
        let oldWasabiKey = null;

        console.log("oldImageUrl:", oldImageUrl);

        if (oldImageUrl && oldImageUrl.startsWith("user_media/")) {
          oldWasabiKey = oldImageUrl;
        }

        console.log("oldWasabiKey:", oldWasabiKey, "\nnewKey:", newKey);

        const wasabiUploadResult = await replaceProfilePhoto(
          req.file.buffer,
          newKey,
          oldWasabiKey,
          req.file.mimetype
        );

        const newUser = await User.findByIdAndUpdate(
          req.body.id,
          { $push: { "media.images": newKey } }, // Push new image to array
          { new: true }
        );

        res.status(200).json({
          status: 200,
          success: true,
          message: "Profile Updated Successfully",
          data: { user: newUser.toObject() },
        });
      } catch (error) {
        console.error("File Upload Error:", error);
        return next(new AppError("Error uploading file.", 500));
      }
    } else {
      user = await User.findByIdAndUpdate(
        req.body.id,
        { $set: req.body },
        { new: true }
      );

      res.status(200).json({
        status: 200,
        success: true,
        message: "Profile Updated Successfully",
        data: { user },
      });
    }
  }),
];

// exports.updateMedia = [
//   uploadSingle, // Handle file upload first
//   catchAsync(async (req, res, next) => {
//     if (!req.body.id) {
//       return next(new AppError("User ID is required.", 400));
//     }

//     let user = await User.findById(req.body.id);
//     if (!user) {
//       return next(new AppError("User not found.", 404));
//     }

//     if (!user.media.images.length >= 5) {
//       return next(
//         new AppError(
//           "Upload limit of 5 reached. Please delete old images to add new.",
//           400
//         )
//       );
//     }
//     // let oldImageUrl = user.image; // Store the old image URL
//     // let fileUrl = oldImageUrl; // Default to existing profile image

//     if (req.file) {
//       try {
//         // Convert buffer to a readable stream
//         const bufferStream = new PassThrough();
//         bufferStream.end(req.file.buffer);

//         // Upload to Cloudinary
//         const uploadPromise = new Promise((resolve, reject) => {
//           const stream = cloudinary.uploader.upload_stream(
//             { folder: "user_images", resource_type: "auto" },
//             async (error, result) => {
//               if (error) {
//                 console.error("Cloudinary Upload Error:", error);
//                 reject(new AppError("Failed to upload image.", 500));
//               } else {
//                 resolve(result.secure_url);
//               }
//             }
//           );

//           bufferStream.pipe(stream); // Pipe buffer stream to Cloudinary
//         });

//         fileUrl = await uploadPromise; // Wait for the upload to complete

//         const newUser = await User.findByIdAndUpdate(
//           req.body.id,
//           { $push: { "media.images": fileUrl } }, // Push new image to array
//           { new: true }
//         );

//         res.status(200).json({
//           status: 200,
//           success: true,
//           message: "Profile Updated Successfully",
//           data: { user: newUser.toObject() },
//         });
//       } catch (error) {
//         console.error("File Upload Error:", error);
//         return next(new AppError("Error uploading file.", 500));
//       }
//     } else {
//       user = await User.findByIdAndUpdate(
//         req.body.id,
//         { $set: req.body },
//         { new: true }
//       );

//       res.status(200).json({
//         status: 200,
//         success: true,
//         message: "Profile Updated Successfully",
//         data: { user },
//       });
//     }
//   }),
// ];

exports.updateVideos = catchAsync(async (req, res, next) => {
  if (!req.body.id) {
    return next(new AppError("User ID is required.", 400));
  }

  let user = await User.findById(req.body.id);
  if (!user) {
    return next(new AppError("User not found.", 404));
  }

  user = await User.findByIdAndUpdate(
    req.body.id,
    { $set: { "media.videos": req.body.links } },
    { new: true }
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "Profile Updated Successfully",
    data: { user },
  });
});

exports.updateFCMToken = catchAsync(async (req, res, next) => {
  if (!req.body.userId) {
    return next(new AppError("User ID is required.", 400));
  }

  let user = await User.findById(req.body.userId);
  if (!user) {
    return next(new AppError("User not found.", 404));
  }

  user = await User.findByIdAndUpdate(
    req.body.userId,
    { $set: { fcmToken: req.body.token } },
    { new: true }
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "Profile Updated Successfully",
    data: { user },
  });
});

exports.deleteMedia = catchAsync(async (req, res, next) => {
  const { id, media, deleteUri } = req.body;

  if (!id) {
    return next(new AppError("User ID is required.", 400));
  }

  let user = await User.findById(id);
  if (!user) {
    return next(new AppError("User not found.", 404));
  }

  if (!deleteUri) {
    return next(new AppError("Image URL to delete is required.", 400));
  }

  // // Extract public_id from Cloudinary URL
  // const getPublicIdFromUrl = (url) => {
  //   const parts = url.split("/");
  //   return parts[parts.length - 1].split(".")[0]; // Extract file name without extension
  // };

  // const publicId = getPublicIdFromUrl(deleteUri);

  try {
    // Delete from Wasabi
    await deleteFile(deleteUri);
    console.log(`Deleted from Wasabi: ${deleteUri} \nmedia: ${media.images}`);

    // Update media in DB
    user = await User.findByIdAndUpdate(
      id,
      { "media.images": media.images }, // Replace entire images array with the new one from frontend
      { new: true }
    );

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Image deleted successfully from Wasabi and database.",
      data: { user: user.toObject() },
    });
  } catch (error) {
    console.error("Wasabi Deletion Error:", error);
    return next(new AppError("Failed to delete image from Wasabi.", 500));
  }
});

// exports.deleteMedia = catchAsync(async (req, res, next) => {
//   const { id, media, deleteUri } = req.body;

//   if (!id) {
//     return next(new AppError("User ID is required.", 400));
//   }

//   let user = await User.findById(id);
//   if (!user) {
//     return next(new AppError("User not found.", 404));
//   }

//   if (!deleteUri) {
//     return next(new AppError("Image URL to delete is required.", 400));
//   }

//   // Extract public_id from Cloudinary URL
//   const getPublicIdFromUrl = (url) => {
//     const parts = url.split("/");
//     return parts[parts.length - 1].split(".")[0]; // Extract file name without extension
//   };

//   const publicId = getPublicIdFromUrl(deleteUri);

//   try {
//     // Delete image from Cloudinary
//     await cloudinary.uploader.destroy(`user_images/${publicId}`);

//     // Update user media array
//     user = await User.findByIdAndUpdate(
//       id,
//       { "media.images": media.images }, // Replace the images array with the new one
//       { new: true }
//     );

//     return res.status(200).json({
//       status: 200,
//       success: true,
//       message: "Image deleted successfully.",
//       data: { user: user.toObject() },
//     });
//   } catch (error) {
//     console.error("Cloudinary Deletion Error:", error);
//     return next(new AppError("Failed to delete image from Cloudinary.", 500));
//   }
// });

exports.getAllActors = catchAsync(async (req, res, next) => {
  const actors = factory.getAll(User);
  let modifiedActors = JSON.parse(JSON.stringify(actors));
  modifiedActors = modifiedActors.filter((actor) => actor.role === "actor");
  res.status(200).json({
    status: 200,
    success: true,
    message: "Data fetched successfully",
    data: { actors: modifiedActors },
  });
});

exports.getUsersByIdArray = catchAsync(async (req, res, next) => {
  const { userIds } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "userIds must be a non-empty array",
    });
  }

  const validIds = userIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const users = await User.find({ _id: { $in: validIds } });

  res.status(200).json({
    status: 200,
    success: true,
    message: "Users fetched successfully",
    data: { users },
  });
});

exports.getUsersFromCompany = catchAsync(async (req, res, next) => {
  const { data } = req.body; // array of companyIds
  console.log("req.body", data);

  if (!Array.isArray(data) || data.length === 0) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "data must be a non-empty array of company IDs",
    });
  }

  // Validate ObjectIds
  const validCompanyIds = data
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (validCompanyIds.length === 0) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "No valid company IDs provided",
    });
  }

  // Find users whose "companies" array contains any of these IDs
  const users = await User.find({ companies: { $in: validCompanyIds } });

  console.log("Found users:", users);

  res.status(200).json({
    status: 200,
    success: true,
    message: "Users fetched successfully",
    data: users,
  });
});

exports.deleteMe = catchAsync(async (req, res, next) => {
  const user = await User.findOne({
    _id: req.query?.id ? req.query?.id : req.user._id,
  }).select("+password");

  if (!user.otp) {
    if (user.otp != req.query.otp)
      return res.status(400).send({
        status: 400,
        success: false,
        message: "Invalid OTP",
        data: {},
      });
  }

  await User.findByIdAndUpdate(req.query?.id ? req.query?.id : req.user._id, {
    deleted: true,
  });

  res.status(200).json({
    status: 204,
    success: true,
    message: "User has been deleted",
    data: {},
  });
});

exports.getUser = catchAsync(async (req, res, next) => {
  console.log("hii");
  console.log("req.params.id", req.params.id);

  // let user = JSON.parse(JSON.stringify(await User.findById(req.params.id)));
  let user = await User.findById(req.params.id);
  // user.reviews = await Review.find({ reviewee: user._id });

  if (!user) {
    return next(new AppError("No User Found With Given Id ", 404));
  }

  return res.status(200).json({
    status: 200,
    success: true,
    user,
  });
});
exports.getAllUsers = factory.getAll(User);

//get users based on the array of ids provided
exports.getAttUsers = catchAsync(async (req, res, next) => {
  let { userIds } = req.query;

  if (!userIds) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "Invalid request. 'userIds' is required.",
    });
  }

  userIds = userIds.split(",");

  const validUserIds = userIds.filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );

  if (validUserIds.length === 0) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "No valid user IDs provided.",
    });
  }

  const users = await User.find({ _id: { $in: userIds } });

  return res.status(200).json({
    status: 200,
    success: true,
    message: "Users fetched successfully",
    data: { users },
  });
});

// Do NOT update passwords with this!
exports.updateUser = factory.updateOne(User);
exports.deleteUser = factory.deleteOne(User);

/////////// Notifications
exports.mynotifications = catchAsync(async (req, res, next) => {
  const notifictations = await Notification.find({ receiver: req.user._id });
  // await Notification.updateMany({ receiver: req.user._id });

  res.status(200).json({
    success: true,
    status: 200,
    message: "",
    data: { notifictations },
  });
});

exports.getCategories = catchAsync(async (req, res, next) => {
  const categories = await Category.find({});
  let countries = await Country.find({}).select("countryName");

  // let categoryList = []
  // let countryList = []
  // for (const category of categories) {
  //   categoryList.push(category.name)
  // }
  // for (const country of countries) {
  //   countryList.push(country.countryName)
  // }
  // console.log('countryList',countryList);

  res.status(200).json({
    status: 200,
    success: true,
    message: "Data fetched successfully",
    // data: { categoryList, countryList },
    data: { countries, categories },
  });
});

exports.getMyInfo = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .populate("savedActors")
    .populate("ArchivedActors");
  if (!user) {
    return res.status(400).send({
      status: 400,
      success: false,
      message: "User not found",
      data: {},
    });
  }
  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { user },
  });
});

exports.getAllSaved = catchAsync(async (req, res, next) => {
  let user = await User.findById(req.params.id).populate("savedGigs");
  if (!user) {
    return res.status(400).send({
      status: 400,
      success: false,
      message: "User not found",
      data: {},
    });
  }

  let savedItems = await JSON.parse(JSON.stringify(user)).savedGigs;
  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { savedItems },
  });
});
