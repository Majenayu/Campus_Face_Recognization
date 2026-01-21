require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const axios = require("axios");

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

/* ================= CLOUDINARY ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= MONGODB ================= */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB:", err.message));

/* ================= SCHEMA ================= */
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, required: true },
  password: String,
  photos: [String],
  matchedImages: [String],
});

const User = mongoose.model("User", UserSchema);

/* ================= MULTER ================= */
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

/* ================= ROUTES ================= */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));

/* ================= REGISTER ================= */
app.post("/register", upload.array("photos", 10), async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      return res.json({ success: false, error: "Missing fields" });
    }

    if (!req.files || req.files.length === 0) {
      return res.json({ success: false, error: "At least one photo required" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.json({ success: false, error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const uploadedUrls = [];

    // Upload photos to Cloudinary
    for (const file of req.files) {
      try {
        const uploadFromBuffer = () =>
          new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder: `dream_users/${email}`,
                transformation: [
                  { width: 500, height: 500, crop: 'limit' },
                  { quality: 'auto:good' }
                ]
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
              }
            );
            streamifier.createReadStream(file.buffer).pipe(stream);
          });

        const url = await uploadFromBuffer();
        uploadedUrls.push(url);
      } catch (uploadError) {
        console.error("Upload error:", uploadError);
      }
    }

    if (uploadedUrls.length === 0) {
      return res.json({ success: false, error: "Failed to upload photos" });
    }

    const user = new User({
      name,
      email,
      password: hashedPassword,
      photos: uploadedUrls,
    });

    await user.save();
    res.json({ success: true });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* ================= LOGIN ================= */
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: false });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ success: false });

    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

/* ================= DRIVE HELPER ================= */
function extractDriveFolderId(link) {
  const match = link.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/* ================= SCAN DRIVE - Returns file list for client-side processing ================= */
app.post("/scan-drive", async (req, res) => {
  try {
    const { driveLink } = req.body;
    const folderId = extractDriveFolderId(driveLink);

    if (!folderId) {
      return res.json({ success: false, error: "Invalid Drive link" });
    }

    // Fetch image files from Google Drive
    const filesRes = await axios.get(
      "https://www.googleapis.com/drive/v3/files",
      {
        params: {
          q: `'${folderId}' in parents and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/jpg')`,
          fields: "files(id,name,size)",
          key: process.env.GOOGLE_API_KEY,
          pageSize: 100
        },
        timeout: 15000
      }
    );

    if (!filesRes.data.files || filesRes.data.files.length === 0) {
      return res.json({ 
        success: false, 
        error: "No images found. Make sure the folder is public." 
      });
    }

    // Filter out very large files (>5MB) for faster processing
    const validFiles = filesRes.data.files.filter(f => !f.size || parseInt(f.size) < 5 * 1024 * 1024);

    res.json({ 
      success: true, 
      files: validFiles.slice(0, 50) // Limit to 50 images to prevent timeout
    });

  } catch (err) {
    console.error("DRIVE ERROR:", err.message);
    res.json({ 
      success: false, 
      error: "Could not access folder. Ensure it's public and the link is correct." 
    });
  }
});

/* ================= SAVE MATCH ================= */
app.post("/save-match", async (req, res) => {
  try {
    const { imageUrl, email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.json({ success: false });

    // Check if already saved
    if (user.matchedImages.includes(imageUrl)) {
      return res.json({ success: true, url: imageUrl });
    }

    // Upload to Cloudinary for permanent storage
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: `dream_users/${email}/matches`,
      transformation: [
        { width: 1000, height: 1000, crop: 'limit' },
        { quality: 'auto:good' }
      ]
    });

    user.matchedImages.push(result.secure_url);
    await user.save();

    res.json({ success: true, url: result.secure_url });
  } catch (err) {
    console.error("SAVE ERROR:", err.message);
    res.json({ success: false, error: err.message });
  }
});

/* ================= GET USER FACES ================= */
app.post("/user-faces", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.json({ success: false });

    res.json({
      success: true,
      faces: user.photos
    });
  } catch {
    res.json({ success: false });
  }
});

/* ================= GET MATCHES ================= */
app.post("/get-matches", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.json({ success: false });

    res.json({
      success: true,
      matches: user.matchedImages || []
    });
  } catch {
    res.json({ success: false });
  }
});

/* ================= PROXY IMAGE - CORS bypass ================= */
app.get("/proxy-image", async (req, res) => {
  const fileId = req.query.id;
  if (!fileId) return res.status(400).send("No ID");

  try {
    const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      timeout: 10000
    });

    res.setHeader("Content-Type", response.headers["content-type"] || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    response.data.pipe(res);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Error fetching image");
  }
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);