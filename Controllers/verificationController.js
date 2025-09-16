const Review = require("../Models/reviewModel.js");
const TxDeleter = require("../txDeleter");
const catchAsync = require("../Utils/catchAsync");
const multer = require("multer");
const AppError = require("./../Utils/appError");

// NEW IMPORTS FOR VERIFICATION LOGIC
const User = require("../Models/userModel.js"); // Assuming your User model path
const Verification = require("../Models/verificationModel.js"); // Assuming your Verification model path
const cloudinary = require("cloudinary").v2;
const { PassThrough } = require("stream");
const { replaceProfilePhoto } = require("../Utils/wasabiHelper.js");
const { v4: uuidv4 } = require("uuid"); // To generate unique file names
const path = require("path");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer storage and filter (already present, adding filter logic)
const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new AppError("Not an image! Please upload only images.", 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB file size limit per file
});
// const upload = multer({ multerStorage });

// Multer middleware for handling multiple verification image fields
const uploadVerificationImagesFields = upload.fields([
  { name: "galleryImage", maxCount: 1 }, // Expecting one field named 'galleryImage'
  { name: "cameraImage", maxCount: 1 }, // Expecting one field named 'selfieImage'
]);

exports.find = catchAsync(async (req, res, next) => {
  const review = await Review.find({});

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { review },
  });
});

exports.index = catchAsync(async (req, res, next) => {
  const { userId } = req.query;
  console.log("Verification - Received userId:", userId);

  if (!userId) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "Missing userId in query parameters.",
      data: {},
    });
  }

  const verification = await Verification.findOne({ userId: userId });

  console.log("Verification - Fetched verification data:", verification);

  res.status(200).json({
    status: 200,
    success: true,
    message: "Verification data fetched successfully.",
    data: { verification },
  });
});

// exports.store = [
//   uploadVerificationImagesFields, // Apply the multer middleware first
//   // Removed catchAsync for direct logging
//   (req, res, next) => {
//     console.log("--- Multer Middleware Success! ---"); // This should print!
//     console.log("Request Files:", req.files);
//     console.log("Request Body:", req.body);

//     if (!req.files || !req.files.galleryImage || !req.files.selfieImage) {
//       console.log("Files are missing after Multer processing.");
//       return res.status(400).json({
//         status: 400,
//         success: false,
//         message: "Files not received or incomplete by Multer.",
//         receivedFiles: req.files ? Object.keys(req.files) : "none",
//         receivedBodyKeys: Object.keys(req.body),
//       });
//     }

//     // If you reach here, Multer has successfully processed the files.
//     // Now you can proceed with your Cloudinary and MongoDB logic.
//     res.status(200).json({
//       status: 200,
//       success: true,
//       message: "Files received and processed by Multer!",
//       data: {
//         galleryImage: req.files.galleryImage[0].originalname,
//         selfieImage: req.files.selfieImage[0].originalname,
//         userId: req.body.userId,
//       },
//     });
//   },
// ];

exports.store = [
  uploadVerificationImagesFields, // Apply the multer middleware first
  catchAsync(async (req, res, next) => {
    console.log("Verification - Received files:");

    const { userId } = req.body; // Get userId from the form data
    console.log(
      "Verification - Received userId:",
      req.body,
      "\n--"
      // req.body._parts[0][1].uri
    );
    console.log("Verification - Received files:", req.files);

    // 1. Basic Validation
    if (!userId) {
      return next(new AppError("User ID is required.", 400));
    }
    if (!req.files || !req.files.galleryImage || !req.files.cameraImage) {
      return next(
        new AppError("Both gallery image and selfie image are required.", 400)
      );
    }

    const galleryFile = req.files.galleryImage[0]; // Multer stores files in arrays for upload.fields
    const selfieFile = req.files.cameraImage[0];

    // 2. Find the user to ensure they exist and userId is valid
    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError("User not found.", 404));
    }

    // 3. Upload images to Cloudinary in parallel
    const uploadedUrls = {};

    // const uploadToCloudinary = (fileBuffer, folderName, fileName) => {
    //   return new Promise((resolve, reject) => {
    //     const bufferStream = new PassThrough();
    //     bufferStream.end(fileBuffer);

    //     const stream = cloudinary.uploader.upload_stream(
    //       {
    //         folder: folderName, // "verification" folder
    //         resource_type: "auto",
    //         public_id: `verification/${user._id}_${fileName}_${Date.now()}`, // Unique public ID
    //       },
    //       (error, result) => {
    //         if (error) {
    //           console.error(`Cloudinary Upload Error for ${fileName}:`, error);
    //           reject(new AppError(`Failed to upload ${fileName}.`, 500));
    //         } else {
    //           resolve(result.secure_url);
    //         }
    //       }
    //     );
    //     bufferStream.pipe(stream);
    //   });
    // };

    // try {
    //   await Promise.all([
    //     uploadToCloudinary(galleryFile.buffer, "verification", "gallery").then(
    //       (url) => (uploadedUrls.galleryImage = url)
    //     ),
    //     uploadToCloudinary(selfieFile.buffer, "verification", "camera").then(
    //       (url) => (uploadedUrls.cameraImage = url)
    //     ),
    //   ]);
    // } catch (uploadError) {
    //   // AppError from uploadToCloudinary will be caught here
    //   return next(uploadError); // Pass it to your global error handler
    // }

    //----------
    const uploadToWasabi = async (buffer, fileName) => {
      const folder = "verification";
      // const newKey = `${folder}/${
      //   user._id
      // }_${fileName}_${uuidv4()}${path.extname(fileName)}`;
      const newKey = `${folder}/${uuidv4()}${path.extname(fileName)}`;
      await replaceProfilePhoto(buffer, newKey, null, "image/jpeg"); // Use correct mimetype if available
      return newKey;
    };

    try {
      uploadedUrls.galleryImage = await uploadToWasabi(
        galleryFile.buffer,
        galleryFile.originalname
      );
      uploadedUrls.cameraImage = await uploadToWasabi(
        selfieFile.buffer,
        selfieFile.originalname
      );
    } catch (err) {
      console.error("Wasabi Upload Error:", err);
      return next(new AppError("Failed to upload one or more images.", 500));
    }

    console.log("Verification - Uploaded URLs:", uploadedUrls);

    //----------

    // 4. Save URLs to the Verification model
    // This approach finds an existing 'unverified' entry for the user and updates it,
    // or creates a new one if none exists. This ensures only one pending verification request per user.
    let verificationEntry = await Verification.findOneAndUpdate(
      { userId: user._id }, // Query to find existing unverified entry
      {
        galleryImage: uploadedUrls.galleryImage,
        cameraImage: uploadedUrls.cameraImage,
        verificationStatus: "pending", // Explicitly set status to unverified
        // createdAt will default if upsert creates a new one
      },
      {
        new: true, // Return the updated/new document
        upsert: true, // Create a new document if no matching one is found
        setDefaultsOnInsert: true, // Apply schema defaults when a new doc is inserted
      }
    );

    // 5. Update User.verified to "pending"
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { verified: "pending" },
      { new: true } // <-- ensures you get the updated doc
    );

    // 6. Send Success Response
    res.status(200).json({
      status: 200,
      success: true,
      message:
        "Verification images uploaded and request submitted successfully.",
      data: {
        verification: verificationEntry,
        user: updatedUser.toObject(), // Optionally return the user data as well
      },
    });
  }),
];

exports.update = catchAsync(async (req, res, next) => {
  // 1. Log the incoming request body for debugging
  console.log("Verification Update Request Body:", req.body);

  // Extract userId and the new verification status from the request body
  const { userId, verificationStatus } = req.body;

  // Basic validation: Ensure userId and verificationStatus are provided
  if (!userId || !verificationStatus) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "Missing userId or verificationStatus in request body.",
    });
  }

  // 2. Update the Verification document
  const updatedVerification = await Verification.findOneAndUpdate(
    { userId: userId },
    { $set: { verificationStatus: verificationStatus } },
    { new: true, runValidators: true, upsert: false }
  );

  // If verification document not found, respond with 404
  if (!updatedVerification) {
    return res.status(404).json({
      status: 404,
      success: false,
      message: "Verification document not found for this user.",
    });
  }

  console.log("Verification Document Updated:", updatedVerification);

  // 3. Update the User document's verification status
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { verified: verificationStatus },
    { new: true, runValidators: true }
  );

  // If user not found, respond with an error (though less likely if verification doc exists)
  if (!updatedUser) {
    // This is a warning because the verification doc was found, but user wasn't.
    // Consider if this state should be handled differently based on your data integrity.
    console.warn(
      `User with ID ${userId} not found after updating verification document.`
    );
    return res.status(404).json({
      status: 404,
      success: false,
      message: "User not found, but verification status was updated.",
      data: { verification: updatedVerification },
    });
  }

  console.log(
    `User ${updatedUser.email}'s verified status updated to: ${updatedUser.verified}`
  );

  // 4. Send successful response
  res.status(200).json({
    status: 200,
    success: true,
    message: `User verification status updated to '${verificationStatus}' successfully!`,
    data: {
      verification: updatedVerification,
      user: updatedUser, // Optionally send the updated user data back
    },
  });
});

exports.delete = catchAsync(async (req, res, next) => {
  let review = await Review.findOne(
    req.params.id
      ? { _id: req.params.id }
      : JSON.parse(decodeURIComponent(req.query))
  );
  review = await TxDeleter.deleteOne("Review", req.params.id);

  res.status(200).json({
    status: 200,
    success: true,
    message: "Review Deleted",
    data: { review },
  });
});
