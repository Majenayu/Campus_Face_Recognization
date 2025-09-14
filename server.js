const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB Atlas connection
const MONGO_URI = "mongodb+srv://Forge:Forge@forge.n8nrpmj.mongodb.net/?retryWrites=true&w=majority&appName=Forge";

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Atlas Connected"))
.catch(err => console.error("❌ MongoDB Error:", err));

// User Schema
const UserSchema = new mongoose.Schema({
    name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model("User", UserSchema);

// Serve frontend
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Register route
app.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existing = await User.findOne({ email });
        if (existing) return res.json({ success: false, error: "Email already exists" });

        const hashed = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashed });
        await newUser.save();

        res.json({ success: true, message: "Registration successful" });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: "Error registering user" });
    }
});

// Login route
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.json({ success: false, error: "Invalid credentials" });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.json({ success: false, error: "Invalid credentials" });

        res.json({ success: true, message: "Login successful" });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: "Error logging in" });
    }
});

// Dashboard route
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "dashboard.html"));
});


// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
