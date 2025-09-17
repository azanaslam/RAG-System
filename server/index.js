// import express from "express";
// import fs from "fs";
// import path from "path";
// import PDFParser from "pdf2json";
// import { MongoClient } from "mongodb";
// import { GoogleGenerativeAI } from "@google/generative-ai";
// import { fileURLToPath } from "url";
// import dotenv from "dotenv";
// import cors from "cors"; 

// dotenv.config(); 

// console.log("🚀 Running my backend index.js file");
// const app = express();
// app.use(express.json());


// app.use(cors({
//   origin: "http://localhost:5173",  
//   methods: ["GET", "POST"],
//   allowedHeaders: ["Content-Type"],
// }));

// app.use(express.json());

// // __dirname fix for ESM
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // 🔑 Gemini AI client
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// // 🔑 MongoDB client
// const client = new MongoClient(process.env.MONGO_URI);

// // ===================== 📂 Upload & Process ALL PDFs =====================
// app.post("/upload", async (req, res) => {
//   try {
//     const folderPath = path.join(__dirname, "papers");
//     console.log("📂 Reading PDFs from:", folderPath);

//     if (!fs.existsSync(folderPath)) {
//       return res.status(400).json({ error: "❌ Papers folder does not exist." });
//     }

//     const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".pdf"));
//     if (files.length === 0) {
//       return res.status(400).json({ error: "❌ No PDFs found in papers folder." });
//     }

//     const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
//     let processedCount = 0;

//     for (const file of files) {
//       const filePath = path.join(folderPath, file);
//       console.log(`➡️ Processing file: ${filePath}`);

//       try {
//         const pdfParser = new PDFParser();
//         const data = await new Promise((resolve, reject) => {
//           pdfParser.on("pdfParser_dataReady", (pdfData) => {
//             // Extract only text, ignore images
//             const rawText = pdfData.Pages.map((p) =>
//               p.Texts.map((t) => decodeURIComponent(t.R[0].T)).join(" ")
//             ).join("\n");
//             resolve(rawText);
//           });
//           pdfParser.on("pdfParser_dataError", reject);
//           pdfParser.loadPDF(filePath);
//         });

//         console.log(`📄 Extracted ${data.length} chars from ${file}`);

//         const chunks = data.match(/.{1,1000}/g) || [];
//         for (const chunk of chunks) {
//           try {
//             const result = await embeddingModel.embedContent(chunk);
//             const vector = result.embedding.values;

//             await client.db("test").collection("docs").insertOne({
//               file,
//               text: chunk,
//               vector,
//             });
//           } catch (embedErr) {
//             console.error(`❌ Embedding failed for chunk in ${file}:`, embedErr);
//           }
//         }

//         processedCount++; // Only count if PDF processed successfully
//       } catch (pdfErr) {
//         console.error(`❌ Failed to process PDF ${file}, skipping:`, pdfErr);
//         continue; // Skip to next PDF
//       }
//     }

//     res.json({
//       success: true,
//       message: `${processedCount} PDFs processed and embeddings stored.`,
//     });
//   } catch (err) {
//     console.error("❌ Upload error:", err);
//     res.status(500).json({ error: err.message });
//   }
// });


// // ===================== ❓ Question Answering =====================
// app.post("/ask", async (req, res) => {
//   try {
//     const { question } = req.body;
//     if (!question) return res.status(400).json({ error: "❌ Question is required." });

//     // 1️⃣ Question embedding
//     const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
//     const qEmbRes = await embeddingModel.embedContent(question);
//     const qVector = qEmbRes.embedding.values;

//     // 2️⃣ Fetch all chunks from MongoDB
//     const allChunks = await client.db("test").collection("docs").find({}).toArray();

//     // Cosine similarity function
//     function cosineSim(a, b) {
//       const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
//       const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
//       const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
//       return dot / (magA * magB);
//     }

//     // Score all chunks
//     const scoredChunks = allChunks.map((chunk) => ({
//       ...chunk,
//       score: cosineSim(qVector, chunk.vector),
//     }));

//     // Top 10 chunks by similarity
//     let topChunks = scoredChunks
//       .sort((a, b) => b.score - a.score)
//       .slice(0, 10)
//       .map((c) => c.text);

//     // 3️⃣ Token-safe context (approximate)
//     // Gemini 1.5 max tokens ~ 16,000, we keep safe margin
//     const MAX_CHARS = 15000; 
//     let context = "";
//     for (const chunk of topChunks) {
//       if ((context + "\n\n" + chunk).length > MAX_CHARS) break;
//       context += "\n\n" + chunk;
//     }

//     // Optional: If context is still too big, summarize it using Gemini
//     if (context.length > MAX_CHARS) {
//       const summarizer = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
//       const summaryPrompt = `
// Summarize the following text to make it shorter but keep all important information:

// ${context}
// `;
//       const summaryRes = await summarizer.generateContent(summaryPrompt);
//       context = summaryRes.response.text();
//     }

//     // 4️⃣ Generate answer using context
//     const chatModel = genAI.getGenerativeModel({  model: "gemini-1.5-flash"  });
//     const prompt = `
// Answer the following question based only on the provided context from multiple research papers.

// Context:
// ${context}

// Question: ${question}
// `;

//     const completion = await chatModel.generateContent(prompt);

//     res.json({ answer: completion.response.text() });
//   } catch (err) {
//     console.error("❌ Ask error:", err);
//     res.status(500).json({ error: err.message });
//   }
// });


// // ===================== 🚀 Start Server =====================
// async function startServer() {
//   try {
//     await client.connect();
//     console.log("✅ MongoDB connected");

//     app.listen(3000, () => {
//       console.log("🚀 Server running on http://localhost:3000");
//     });
//   } catch (err) {
//     console.error("❌ Failed to start server:", err);
//     process.exit(1);
//   }
// }

// startServer();




import express from "express";
import fs from "fs";
import path from "path";
import PDFParser from "pdf2json";
import { MongoClient } from "mongodb";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json(), cors({
  origin: "https://rag-system-ten.vercel.app",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));

// __dirname fix for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const client = new MongoClient(process.env.MONGO_URI);

// 📂 Upload & Process PDFs
app.post("/upload", async (_, res) => {
  try {
    const folderPath = path.join(__dirname, "papers");
    if (!fs.existsSync(folderPath)) return res.status(400).json({ error: "❌ Papers folder missing" });

    const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".pdf"));
    if (!files.length) return res.status(400).json({ error: "❌ No PDFs found" });

    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    let processedCount = 0;

    for (const file of files) {
      try {
        const pdfParser = new PDFParser();
        const data = await new Promise((resolve, reject) => {
          pdfParser.on("pdfParser_dataReady", pdfData => {
            resolve(pdfData.Pages.map(p => p.Texts.map(t => decodeURIComponent(t.R[0].T)).join(" ")).join("\n"));
          });
          pdfParser.on("pdfParser_dataError", reject);
          pdfParser.loadPDF(path.join(folderPath, file));
        });

        const chunks = data.match(/.{1,1000}/g) || [];
        for (const chunk of chunks) {
          try {
            const { embedding } = await embeddingModel.embedContent(chunk);
            await client.db("test").collection("docs").insertOne({ file, text: chunk, vector: embedding.values });
          } catch (e) { console.error("❌ Embedding failed:", e); }
        }
        processedCount++;
      } catch (e) { console.error("❌ PDF processing error:", e); }
    }
    res.json({ success: true, message: `${processedCount} PDFs processed.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
