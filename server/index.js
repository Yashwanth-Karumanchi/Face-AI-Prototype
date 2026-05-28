import cors from "cors";
import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeReport, initHuman } from "./analyzer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 3,
  },
});

const PORT = Number(process.env.API_PORT ?? 3001);
const modelBasePath = `http://127.0.0.1:${PORT}/human-models/`;
const humanReady = initHuman(modelBasePath);

app.use(cors({ origin: ["http://127.0.0.1:5173", "http://localhost:5173"] }));
app.use("/human-models", express.static(path.join(root, "node_modules", "@vladmandic", "human", "models")));

app.get("/api/health", async (_req, res) => {
  await humanReady;
  res.json({ ok: true, engine: "node-human-cpu" });
});

app.post(
  "/api/analyze",
  upload.fields([
    { name: "faceImage", maxCount: 1 },
    { name: "leftEarImage", maxCount: 1 },
    { name: "rightEarImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files ?? {};
      const faceImage = files.faceImage?.[0];
      if (!faceImage) {
        res.status(400).json({ error: "faceImage is required." });
        return;
      }
      const human = await humanReady;
      const report = await analyzeReport({
        human,
        faceBuffer: faceImage.buffer,
        leftEarBuffer: files.leftEarImage?.[0]?.buffer ?? null,
        rightEarBuffer: files.rightEarImage?.[0]?.buffer ?? null,
        actualAge: req.body.actualAge ? Number(req.body.actualAge) : undefined,
      });
      res.json(report);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Local analysis API running at http://127.0.0.1:${PORT}`);
});
