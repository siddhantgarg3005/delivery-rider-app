const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const upload = multer({ dest: "uploads/" });
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json());

const BRAND_SHIRTS = {
  zomato: path.join(__dirname, "../frontend/public/shirts/zomato.png"),
  swiggy: path.join(__dirname, "../frontend/public/shirts/swiggy.png"),
  blinkit: path.join(__dirname, "../frontend/public/shirts/blinkit.png"),
  zepto: path.join(__dirname, "../frontend/public/shirts/zepto.png"),
};

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    hf_token: process.env.HF_TOKEN ? "LOADED ✅" : "MISSING ❌",
    shirts: Object.fromEntries(
      Object.entries(BRAND_SHIRTS).map(([b, p]) => [
        b,
        fs.existsSync(p) ? "✅" : "❌",
      ]),
    ),
  });
});

app.post("/api/generate", upload.single("photo"), async (req, res) => {
  console.log("\n========== NEW REQUEST ==========");
  console.log("Brand:", req.body.brand);

  if (!req.file) return res.status(400).json({ error: "No photo uploaded" });

  const { brand } = req.body;
  const photoPath = req.file.path;

  try {
    const { Client } = await import("@gradio/client");

    const shirtPath = BRAND_SHIRTS[brand];
    if (!shirtPath || !fs.existsSync(shirtPath)) {
      return res.status(400).json({ error: `Shirt not found: ${brand}` });
    }

    const userBuffer = fs.readFileSync(photoPath);
    const shirtBuffer = fs.readFileSync(shirtPath);

    const userBlob = new Blob([userBuffer], { type: "image/jpeg" });
    const shirtBlob = new Blob([shirtBuffer], { type: "image/png" });

    console.log("Connecting to HuggingFace...");

    process.env.GRADIO_AUTH_TOKEN = process.env.HF_TOKEN;

    const client = await Client.connect("yisol/IDM-VTON", {
      hf_token: process.env.HF_TOKEN,
    });

    console.log("Connected! Running try-on...");

    const result = await client.predict("/tryon", {
      dict: { background: userBlob, layers: [], composite: null },
      garm_img: shirtBlob,
      garment_des: `${brand} delivery rider polo shirt uniform`,
      is_checked: true,
      is_checked_crop: false,
      denoise_steps: 30,
      seed: 42,
    });

    console.log("✅ SUCCESS!");

    if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);

    const output = result.data[0];
    const imageUrl = output?.url || output?.path || output;
    console.log("Image URL:", imageUrl);

    res.json({ imageUrl });
  } catch (error) {
    console.error("❌ ERROR:", error.message);
    if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
    res.status(500).json({ error: "Failed", details: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n✅ Backend running on port ${PORT}`);
  console.log(
    "🔑 HF Token:",
    process.env.HF_TOKEN ? "LOADED ✅" : "MISSING ❌",
  );
  console.log("\n📁 Shirts:");
  Object.entries(BRAND_SHIRTS).forEach(([b, p]) => {
    console.log(`  ${b}: ${fs.existsSync(p) ? "✅" : "❌ MISSING"}`);
  });
});
