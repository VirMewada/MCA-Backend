const multer = require("multer");
const User = require("../Models/userModel");
const catchAsync = require("./../Utils/catchAsync");
const AppError = require("./../Utils/appError");
const cloudinary = require("cloudinary").v2;
const { getImageVector } = require("../services/imageVectorizer.js");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
// Middleware for handling file uploads

const { PassThrough } = require("stream");
const userImageEmbedding = require("../Models/userImageEmbeddingModel.js");
const { spawn } = require("child_process");

const storage = multer.memoryStorage();
const upload = multer({ storage });
exports.uploadUserPhoto = upload.single("photo");
const uploadSingle = upload.single("image");

const { runFaiss } = require("../services/faissService"); // import this at the top

const generateTempFilename = () =>
  `${Date.now()}_${Math.floor(Math.random() * 1e6)}_ref.jpg`;

// exports.getSimilarUsersFromReferenceImage = [
//   uploadSingle, // multer middleware to handle image upload (e.g., 'image')
//   catchAsync(async (req, res, next) => {
//     console.log("Received request to find similar users from reference image");

//     console.log(
//       "Received request to find similar users from reference image",
//       req.body.id
//     );

//     const userId = req.body.id;

//     if (!userId) return next(new AppError("User ID is required.", 400));
//     if (!req.file)
//       return next(new AppError("Reference image is required.", 400));

//     try {
//       // Step 1: Save uploaded file buffer to a temp location
//       const tempImagePath = path.join("/tmp", `${Date.now()}_ref.jpg`);
//       await fs.promises.writeFile(tempImagePath, req.file.buffer);

//       // Step 2. Use existing embedding logic
//       const referenceVector = await getImageVector(tempImagePath);
//       await fs.promises.unlink(tempImagePath); // delete temp image

//       console.log("Reference vector computed:", referenceVector);

//       // 3. Fetch all user embeddings from DB
//       const allEmbeddings = await userImageEmbedding.find(
//         {},
//         { user: 1, embedding: 1 }
//       );

//       if (!allEmbeddings || allEmbeddings.length === 0) {
//         return next(new AppError("No embeddings found in database.", 404));
//       }

//       console.log("Found embeddings for", allEmbeddings.length, "users");

//       // 4. Compute cosine similarity between referenceVector and each user embedding
//       const cosineSimilarity = (a, b) => {
//         const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
//         const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
//         const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
//         return dot / (normA * normB);
//       };

//       const scoredUsers = allEmbeddings.map((doc) => ({
//         userId: doc.user,
//         score: cosineSimilarity(referenceVector, doc.embedding),
//       }));

//       console.log("Computed cosine similarities for", scoredUsers);

//       // 5. Sort by highest similarity
//       const topUsers = scoredUsers
//         .sort((a, b) => b.score - a.score)
//         .slice(0, 20); // top 20 similar users

//       const similarUserIds = topUsers.map((u) => u.userId);

//       console.log("Top similar user IDs:", similarUserIds);

//       // 6. Fetch full user details
//       const users = await User.find({ _id: { $in: similarUserIds } });

//       return res.status(200).json({
//         status: 200,
//         success: true,
//         message: "Similar users retrieved successfully",
//         data: { users },
//       });
//     } catch (err) {
//       console.error("Processing error:", err);
//       return next(
//         new AppError("Something went wrong during image processing.", 500)
//       );
//     }
//   }),
// ];

exports.getSimilarUsersFromReferenceImage = [
  uploadSingle,
  catchAsync(async (req, res, next) => {
    console.log(
      "🔍 Received request to find similar users from reference image"
    );

    const userId = req.body.id;
    if (!userId) return next(new AppError("User ID is required.", 400));
    if (!req.file)
      return next(new AppError("Reference image is required.", 400));

    // Step 1: Save file to temp disk
    const tempImagePath = path.join("/tmp", generateTempFilename());
    await fs.promises.writeFile(tempImagePath, req.file.buffer);

    let referenceVector;
    try {
      // Step 2: Vectorize image
      referenceVector = await getImageVector(tempImagePath);
    } finally {
      fs.promises.unlink(tempImagePath).catch(() => {});
    }

    if (!referenceVector || referenceVector.length !== 1280) {
      return next(new AppError("Invalid or corrupt image vector.", 500));
    }

    // Step 3: Query FAISS for similar users
    const faissResultsRaw = await runFaiss("query", referenceVector);
    const faissResults = faissResultsRaw.filter(
      (res) => res.userId && typeof res.score === "number" && !isNaN(res.score)
    );

    if (faissResults.length === 0) {
      return res.status(200).json({
        status: 200,
        success: true,
        message: "No similar users found.",
        data: { users: [] },
      });
    }

    // Debug log
    if (process.env.NODE_ENV !== "production") {
      console.log("📊 FAISS similarity results (lower is better):");
      faissResults.forEach((entry, index) => {
        console.log(
          `#${index + 1} → User ID: ${
            entry.userId
          }, L2 Distance: ${entry.score.toFixed(4)}`
        );
      });
    }

    // Step 4: Fetch users from DB and preserve order
    const similarUserIds = faissResults.map((res) => res.userId);
    const similarityScores = Object.fromEntries(
      faissResults.map((res) => [res.userId, res.score])
    );

    const userMap = await User.find({ _id: { $in: similarUserIds } }).then(
      (users) => Object.fromEntries(users.map((u) => [u._id.toString(), u]))
    );

    const users = similarUserIds
      .map((id) => userMap[id])
      .filter(Boolean)
      .map((user) => ({
        ...user.toObject(),
        similarityScore: similarityScores[user._id.toString()],
      }));

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Similar users retrieved successfully",
      data: { users },
    });
  }),
];

// exports.getSimilarUsersFromReferenceImage = [
//   uploadSingle,
//   catchAsync(async (req, res, next) => {
//     console.log("Received request to find similar users from reference image");

//     const userId = req.body.id;
//     if (!userId) return next(new AppError("User ID is required.", 400));
//     if (!req.file)
//       return next(new AppError("Reference image is required.", 400));

//     try {
//       // Step 1: Save uploaded file buffer to temp file
//       const tempImagePath = path.join("/tmp", `${Date.now()}_ref.jpg`);
//       await fs.promises.writeFile(tempImagePath, req.file.buffer);

//       // Step 2: Vectorize the image
//       const referenceVector = await getImageVector(tempImagePath);
//       await fs.promises.unlink(tempImagePath);

//       // Step 3: Use FAISS to query top 20 nearest neighbors
//       const faissResults = await runFaiss("query", referenceVector);

//       if (!faissResults || faissResults.length === 0) {
//         return res.status(200).json({
//           status: 200,
//           success: true,
//           message: "No similar users found.",
//           data: { users: [] },
//         });
//       }

//       console.log("FAISS similarity results (lower is better):");
//       faissResults.forEach((entry, index) => {
//         console.log(
//           `#${index + 1} → User ID: ${
//             entry.userId
//           }, L2 Distance: ${entry.score.toFixed(4)}`
//         );
//       });

//       const similarUserIds = faissResults.map((res) => res.userId);
//       const similarityScores = Object.fromEntries(
//         faissResults.map((res) => [res.userId, res.score])
//       );

//       // Step 4: Fetch full user details from Mongo
//       let users = await User.find({ _id: { $in: similarUserIds } });

//       // Optional: sort by score
//       users = users
//         .map((u) => ({
//           ...u.toObject(),
//           score: similarityScores[u._id.toString()],
//         }))
//         .sort((a, b) => a.score - b.score); // FAISS uses L2 distance → lower is better

//       return res.status(200).json({
//         status: 200,
//         success: true,
//         message: "Similar users retrieved successfully",
//         data: { users },
//       });
//     } catch (err) {
//       console.error("Processing error:", err);
//       return next(
//         new AppError("Something went wrong during image processing.", 500)
//       );
//     }
//   }),
// ];
