const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  endpoint: "https://s3.ap-southeast-1.wasabisys.com",
  accessKeyId: process.env.WASABI_ACCESS_KEY,
  secretAccessKey: process.env.WASABI_SECRET_KEY,
  region: "ap-southeast-1",
  signatureVersion: "v4",
});

const BUCKET_NAME = process.env.WASABI_BUCKET;

// Generate a signed URL to access a file
function generateSignedUrl(key) {
  return s3.getSignedUrl("getObject", {
    Bucket: BUCKET_NAME,
    Key: key,
    Expires: 60 * 60 * 24 * 3, // 24 hours
  });
}

// Upload a file buffer to Wasabi
function uploadFile(buffer, key, contentType = "image/jpeg") {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: "private", // Keep files private, only accessible via signed URLs
  };

  return s3.upload(params).promise();
}

// Delete a file from Wasabi
function deleteFile(key) {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
  };

  return s3.deleteObject(params).promise();
}

function extractKeyFromSignedUrl(signedUrl) {
  try {
    const url = new URL(signedUrl);
    const pathname = url.pathname; // e.g. /your-bucket-name/folder/filename.jpg

    const bucketName = process.env.WASABI_BUCKET;
    const prefix = `/${bucketName}/`;
    if (!pathname.startsWith(prefix)) {
      throw new Error("Invalid signed URL: Bucket name mismatch.");
    }

    const key = pathname.slice(prefix.length); // Removes `/bucket-name/` prefix
    return key;
  } catch (err) {
    console.error("Failed to extract key from signed URL:", err);
    return null;
  }
}

// Replace profile photo: delete old, upload new
async function replaceProfilePhoto(
  newBuffer,
  newKey,
  oldKey,
  contentType = "image/jpeg"
) {
  try {
    if (oldKey) {
      await deleteFile(oldKey);
      console.log(`Deleted old photo: ${oldKey}`);
    }

    const result = await uploadFile(newBuffer, newKey, contentType);
    console.log(`Uploaded new photo: ${newKey}`);
    return result;
  } catch (err) {
    console.error("Error replacing profile photo:", err);
    throw err;
  }
}

module.exports = {
  generateSignedUrl,
  uploadFile,
  deleteFile,
  replaceProfilePhoto,
};
