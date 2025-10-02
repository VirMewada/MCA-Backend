// const { Worker } = require("bullmq");
// const Redis = require("ioredis");
// const fs = require("fs/promises");
// const path = require("path");
// const fetch = require("node-fetch");

// // const { getImageVector } = require("../utils/imageEmbedding"); // adjust path
// const { runFaiss } = require("../services/faissService");
// const userImageEmbedding = require("../Models/userImageEmbeddingModel.js");
// const User = require("../Models/userModel.js");
// const { getImageVector } = require("../services/imageVectorizer.js");

// const dotenv = require("dotenv");
// // dotenv.config({ path: "../config.env" });

// // const path = require("path");
// // const dotenv = require("dotenv");

// dotenv.config({ path: path.resolve(__dirname, "../config.env") });
// console.log("DATABASE URI:", process.env.DATABASE);

// const mongoose = require("mongoose");

// mongoose
//   .connect(process.env.DATABASE, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   })
//   .then(() => console.log("✅ Worker connected to MongoDB"))
//   .catch((err) =>
//     console.error("❌ Worker failed to connect to MongoDB:", err)
//   );

// // const connection = new Redis();
// const connection = new Redis({
//   maxRetriesPerRequest: null,
// });

// const worker = new Worker(
//   "embedding-queue",
//   async (job) => {
//     const { imageUrl, userId } = job.data;

//     console.log("Worker started job for user:", userId);

//     const tempImagePath = `/tmp/${Date.now()}.jpg`;
//     const response = await fetch(imageUrl);
//     const buffer = await response.buffer();
//     await fs.writeFile(tempImagePath, buffer);

//     const imageVector = await getImageVector(tempImagePath);
//     await fs.unlink(tempImagePath);

//     console.log("Vectorization done");

//     await userImageEmbedding.findOneAndUpdate(
//       { user: userId },
//       { embedding: imageVector },
//       { upsert: true, new: true }
//     );

//     await runFaiss("add", imageVector, userId);

//     return true;
//   },
//   { connection }
// );

// worker.on("completed", (job) => {
//   console.log(`✅ Job ${job.id} completed`);
// });

// worker.on("failed", (job, err) => {
//   console.error(`❌ Job ${job.id} failed:`, err.message);
// });
