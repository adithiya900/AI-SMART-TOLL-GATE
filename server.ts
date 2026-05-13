import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Middleware
  app.use(express.json({ limit: '50mb' }));

  // Helper to get API Key with fallback
  const getApiKey = () => {
    return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
  };

  const genAI = new GoogleGenerativeAI(getApiKey());

  // Smart Plate Cleaning Logic
  const cleanAndValidatePlate = (plate: string) => {
    if (!plate) return "";
    let cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    let chars = cleaned.split('');
    
    const toNum: { [key: string]: string } = { 'O': '0', 'I': '1', 'Z': '2', 'S': '5', 'B': '8', 'G': '6', 'T': '7' };
    const toAlpha: { [key: string]: string } = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G', '7': 'T' };

    // Standard Indian Format: AA NN AA NNNN (10 chars)
    if (chars.length >= 9 && chars.length <= 11) {
      chars = chars.map((char, i) => {
        if (i === 0 || i === 1) return toAlpha[char] || char;
        if (i === 2 || i === 3) return toNum[char] || char;
        if (i >= chars.length - 4) return toNum[char] || char;
        return char;
      });
    }
    return chars.join('');
  };

  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      message: 'ANPR Engine Online',
      config: {
        hasKey: !!getApiKey(),
        mode: process.env.NODE_ENV || 'development'
      }
    });
  });

  app.post('/api/recognize', async (req, res) => {
    const startTime = Date.now();
    const { image } = req.body;
    
    console.log(`[ANPR] Processing request. Time: ${new Date().toLocaleTimeString()}`);
    
    if (!image) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }

    if (!getApiKey()) {
      return res.status(500).json({ success: false, error: 'GEMINI_API_KEY is not configured' });
    }

    try {
      const base64Data = image.split(',')[1];
      const imageBuffer = Buffer.from(base64Data, 'base64');

      const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
      
      const prompt = `Return ONLY JSON: {"plateNumber":"TEXT","vehicleType":"car|motorcycle|truck|bus","confidence":0.95,"boundingBox":{"ymin":100,"xmin":100,"ymax":200,"xmax":300}}.`;

      // AI Call with 60s timeout
      const aiPromise = model.generateContent([
        prompt,
        { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
      ]);

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("AI Timeout (60s)")), 60000)
      );

      const result: any = await Promise.race([aiPromise, timeoutPromise]);
      const response = await result.response;
      const responseText = await response.text();
      const text = responseText.replace(/```json\n?|\n?```/g, '').trim();
      
      let aiResult;
      try {
        aiResult = JSON.parse(text);
      } catch (e) {
        throw new Error("Invalid AI format");
      }

      // Cropping Logic
      let croppedImageBase64 = null;
      try {
        const metadata = await sharp(imageBuffer).metadata();
        if (aiResult.boundingBox && metadata.width && metadata.height) {
          const { ymin, xmin, ymax, xmax } = aiResult.boundingBox;
          const left = Math.max(0, Math.floor((xmin / 1000) * metadata.width));
          const top = Math.max(0, Math.floor((ymin / 1000) * metadata.height));
          const w = Math.min(metadata.width - left, Math.floor(((xmax - xmin) / 1000) * metadata.width));
          const h = Math.min(metadata.height - top, Math.floor(((ymax - ymin) / 1000) * metadata.height));

          if (w > 0 && h > 0) {
            const crop = await sharp(imageBuffer).extract({ left, top, width: w, height: h }).toBuffer();
            croppedImageBase64 = `data:image/jpeg;base64,${crop.toString('base64')}`;
          }
        }
      } catch (err) {
        console.warn("[ANPR] Crop skipped");
      }

      const finalPlate = cleanAndValidatePlate(aiResult.plateNumber);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2) + "s";

      res.json({
        success: true,
        detectedNumber: finalPlate,
        vehicleType: aiResult.vehicleType || "car",
        confidence: aiResult.confidence || 0.9,
        processingTime: duration,
        croppedImage: croppedImageBase64,
        boundingBox: aiResult.boundingBox
      });

    } catch (error: any) {
      console.error("[ANPR] Error:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Serve static files / Vite
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(process.cwd(), 'dist', 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on http://localhost:${PORT}`));
}

startServer();
