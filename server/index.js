import express from "express";
import fs from "fs";
import path from "path";
import PDFParser from "pdf2json";
import { MongoClient } from "mongodb";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./config/cloudinary.js";

dotenv.config();
const app = express();
app.use(express.json(), cors({
  origin: "https://rag-system-ten.vercel.app",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));


// Cloudinary Storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "pdf_uploads",
    resource_type: "raw", // PDF = raw
    allowed_formats: ["pdf"],
  },
});
const upload = multer({ storage });

// __dirname fix for ESM
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// Clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const client = new MongoClient(process.env.MONGO_URI);

// 📂 Upload & Process PDFs
// app.post("/upload", async (_, res) => {
//   try {
//     const folderPath = path.join(__dirname, "papers");
//     if (!fs.existsSync(folderPath)) return res.status(400).json({ error: "❌ Papers folder missing" });

//     const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".pdf"));
//     if (!files.length) return res.status(400).json({ error: "❌ No PDFs found" });

//     const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
//     let processedCount = 0;

//     for (const file of files) {
//       try {
//         const pdfParser = new PDFParser();
//         const data = await new Promise((resolve, reject) => {
//           pdfParser.on("pdfParser_dataReady", pdfData => {
//             resolve(pdfData.Pages.map(p => p.Texts.map(t => decodeURIComponent(t.R[0].T)).join(" ")).join("\n"));
//           });
//           pdfParser.on("pdfParser_dataError", reject);
//           pdfParser.loadPDF(path.join(folderPath, file));
//         });

//         const chunks = data.match(/.{1,1000}/g) || [];
//         for (const chunk of chunks) {
//           try {
//             const { embedding } = await embeddingModel.embedContent(chunk);
//             await client.db("test").collection("docs").insertOne({ file, text: chunk, vector: embedding.values });
//           } catch (e) { console.error("❌ Embedding failed:", e); }
//         }
//         processedCount++;
//       } catch (e) { console.error("❌ PDF processing error:", e); }
//     }
//     res.json({ success: true, message: `${processedCount} PDFs processed.` });
//   } catch (e) { res.status(500).json({ error: e.message }); }
// });
// 📂 Upload PDF to Cloudinary and process it
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const fileUrl = req.file.path; // Cloudinary PDF URL
    console.log("☁️ Uploaded to Cloudinary:", fileUrl);

    // Download PDF temporarily for parsing
    const tempPath = "temp.pdf";
    const response = await fetch(fileUrl);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempPath, Buffer.from(buffer));

    // Parse PDF
    const pdfParser = new PDFParser();
    const data = await new Promise((resolve, reject) => {
      pdfParser.on("pdfParser_dataReady", (pdfData) => {
        resolve(
          pdfData.Pages.map((p) =>
            p.Texts.map((t) => decodeURIComponent(t.R[0].T)).join(" ")
          ).join("\n")
        );
      });
      pdfParser.on("pdfParser_dataError", reject);
      pdfParser.loadPDF(tempPath);
    });

    fs.unlinkSync(tempPath); // temp file delete

    // Embeddings
    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const chunks = data.match(/.{1,1000}/g) || [];

    for (const chunk of chunks) {
      const { embedding } = await embeddingModel.embedContent(chunk);
      await client.db("test").collection("docs").insertOne({
        file: req.file.originalname,
        url: fileUrl,
        text: chunk,
        vector: embedding.values,
      });
    }

    res.json({ success: true, message: `${req.file.originalname} uploaded & processed.` });
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ❓ Question Answering
app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: "❌ Question required" });

    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const qVector = (await embeddingModel.embedContent(question)).embedding.values;
    const allChunks = await client.db("test").collection("docs").find({}).toArray();

    const cosineSim = (a, b) => {
      const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
      const mag = arr => Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
      return dot / (mag(a) * mag(b));
    };

    const topChunks = allChunks
      .map(c => ({ ...c, score: cosineSim(qVector, c.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(c => c.text);

    let context = "";
    for (const chunk of topChunks) {
      if ((context + "\n\n" + chunk).length > 15000) break;
      context += "\n\n" + chunk;
    }

    if (context.length > 15000) {
      const summarizer = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      context = (await summarizer.generateContent(`Summarize:\n${context}`)).response.text();
    }

    const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Answer based on context:\n${context}\n\nQ: ${question}`;
    const answer = (await chatModel.generateContent(prompt)).response.text();

    res.json({ answer });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🚀 Start Server
(async () => {
  try {
    await client.connect();
    console.log("✅ MongoDB connected");
    app.listen(3000, () => console.log("🚀 Server running at http://localhost:3000"));
  } catch (e) {
    console.error("❌ Failed to start server:", e);
    process.exit(1);
  }
})();
