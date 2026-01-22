const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const fs = require('fs');
const path = require('path');

// Lazy initialization
let s3Client = null;

const getS3Client = () => {
  if (!s3Client && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'eu-central-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  }
  return s3Client;
};

const getBucketName = () => process.env.AWS_S3_BUCKET || 'nxworks-uploads';

// Check if S3 is configured
const isS3Configured = () => {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET);
};

// Upload file to S3
const uploadToS3 = async (filePath, key, contentType) => {
  const client = getS3Client();
  if (!client) {
    throw new Error('S3 not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET environment variables.');
  }

  const fileStream = fs.createReadStream(filePath);
  const fileStats = fs.statSync(filePath);

  const upload = new Upload({
    client,
    params: {
      Bucket: getBucketName(),
      Key: key,
      Body: fileStream,
      ContentType: contentType,
      ContentLength: fileStats.size
    }
  });

  const result = await upload.done();

  // Delete local file after successful upload
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    console.warn('Could not delete local file after S3 upload:', err.message);
  }

  return {
    key,
    location: result.Location || `https://${getBucketName()}.s3.${process.env.AWS_REGION || 'eu-central-1'}.amazonaws.com/${key}`,
    bucket: getBucketName()
  };
};

// Upload buffer directly to S3 (for multer memoryStorage)
const uploadBufferToS3 = async (buffer, key, contentType) => {
  const client = getS3Client();
  if (!client) {
    throw new Error('S3 not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET environment variables.');
  }

  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    Body: buffer,
    ContentType: contentType
  });

  await client.send(command);

  return {
    key,
    location: `https://${getBucketName()}.s3.${process.env.AWS_REGION || 'eu-central-1'}.amazonaws.com/${key}`,
    bucket: getBucketName()
  };
};

// Delete file from S3
const deleteFromS3 = async (key) => {
  const client = getS3Client();
  if (!client) {
    console.warn('S3 not configured, cannot delete file');
    return false;
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key
    });

    await client.send(command);
    return true;
  } catch (error) {
    console.error('Error deleting from S3:', error);
    return false;
  }
};

// Get S3 URL for a key
const getS3Url = (key) => {
  if (!key) return null;
  return `https://${getBucketName()}.s3.${process.env.AWS_REGION || 'eu-central-1'}.amazonaws.com/${key}`;
};

// Extract key from S3 URL or path
const extractKeyFromPath = (filePath) => {
  // If it's already an S3 key (doesn't start with http)
  if (!filePath.startsWith('http')) {
    // Handle old format: uploads/audio/filename or uploads/documents/filename
    if (filePath.startsWith('uploads/')) {
      return filePath;
    }
    return filePath;
  }

  // Extract key from full S3 URL
  const url = new URL(filePath);
  return url.pathname.slice(1); // Remove leading slash
};

// Get file from S3 as buffer
const getFileFromS3 = async (key) => {
  const client = getS3Client();
  if (!client) {
    throw new Error('S3 not configured');
  }

  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key
  });

  const response = await client.send(command);

  // Convert stream to buffer
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

module.exports = {
  isS3Configured,
  uploadToS3,
  uploadBufferToS3,
  deleteFromS3,
  getS3Url,
  extractKeyFromPath,
  getS3Client,
  getBucketName,
  getFileFromS3
};
