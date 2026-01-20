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

/* ================= BASIC MIDDLEWARE ================= */
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));



app.use("/models", express.static(path.join(__dirname, "models")));



/* ================= CLOUDINARY CONFIG ================= */
cloudinary.config({
  cloud_name: "dwxkruvlc",
  api_key: "678867756987183",
  api_secret: "-dmigFFyhWc_bE2GYjiR8VynLhI",
});

/* ================= MONGODB ================= */
mongoose
  .connect("mongodb+srv://ayu:ayu@forge.n8nrpmj.mongodb.net/dreamDB")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err.message));

/* ================= USER SCHEMA ================= */
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, required: true },
  password: String,
  photos: [String],          // User face images
  matchedImages: [String],   // ✅ Drive matches (Cloudinary)
});


const User = mongoose.model("User", UserSchema);

/* ================= MULTER ================= */
const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ================= SERVE FRONTEND ================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

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

    for (const file of req.files) {
      const uploadFromBuffer = () =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: `dream_users/${email}`,
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
    res.json({ success: false, error: "Registration failed" });
  }
});


app.post("/save-match", async (req, res) => {
  try {
    const { imageUrl, email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.json({ success: false });

    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: `dream_users/${email}/matches`,
    });

    user.matchedImages.push(result.secure_url);
    await user.save();

    res.json({ success: true, url: result.secure_url });
  } catch (err) {
    console.error("SAVE MATCH ERROR:", err.message);
    res.json({ success: false });
  }
});

app.post("/get-matches", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.json({ success: false });

  res.json({
    success: true,
    matches: user.matchedImages || []
  });
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

/* ================= DRIVE UTIL ================= */
function extractDriveFolderId(link) {
  const match = link.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}



/* ================= SCAN DRIVE ================= */
// Add dotenv at the very top of server.js
require('dotenv').config();

// Updated Scan Route
app.post("/scan-drive", async (req, res) => {
  try {
    const { driveLink } = req.body;
    const folderId = extractDriveFolderId(driveLink);

    if (!folderId) return res.json({ success: false, error: "Invalid Drive link" });

    // We just get the list of files and send it back to the dashboard
    // The dashboard (client-side) will do the AI matching to save server costs
    const filesRes = await axios.get(
      "https://www.googleapis.com/drive/v3/files",
      {
        params: {
          q: `'${folderId}' in parents and mimeType contains 'image/'`,
          fields: "files(id, name)",
          key: process.env.GOOGLE_API_KEY // Ensure this is in your .env file
        }
      }
    );

    res.json({ success: true, files: filesRes.data.files });

  } catch (err) {
    console.error("DRIVE ERROR:", err.message);
    res.json({ success: false, error: "Could not access Drive folder. Is it public?" });
  }
});





/* ================= GET USER FACE IMAGES ================= */
app.post("/user-faces", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ success: false });
    }

    res.json({
      success: true,
      faces: user.photos   // Cloudinary URLs
    });
  } catch {
    res.json({ success: false });
  }
});

// Add this route in server.js
app.get("/proxy-image", async (req, res) => {
  const fileId = req.query.id;
  if (!fileId) return res.status(400).send("No ID provided");

  try {
    const response = await axios({
      method: 'get',
      url: `https://drive.google.com/uc?export=download&id=${fileId}`,
      responseType: 'stream',
      // This bypasses the browser block
    });

    // Pass the headers and pipe the data back to the browser
    res.setHeader("Content-Type", response.headers["content-type"]);
    response.data.pipe(res);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Error fetching image");
  }
});




/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
