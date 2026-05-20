import express from 'express';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();

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
  
  // Indian formats usually follow AA NN AA NNNN or AA NN NNNN
  // We'll do some basic character correction for common OCR errors
  const correctionMap: { [key: string]: string } = { 'O': '0', 'I': '1', 'Z': '2', 'S': '5', 'B': '8', 'G': '6', 'T': '7' };
  
  // If the plate looks like an Indian plate, apply corrections to numeric/alpha positions
  if (cleaned.length >= 7 && cleaned.length <= 11) {
    let chars = cleaned.split('');
    // Positions 0,1 are usually letters
    if (/[0-9]/.test(chars[0])) { /* could try to fix but let's keep it simple */ }
    // Last 4 are usually numbers
    for (let i = chars.length - 4; i < chars.length; i++) {
      if (correctionMap[chars[i]]) chars[i] = correctionMap[chars[i]];
    }
    cleaned = chars.join('');
  }
  return cleaned;
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

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'GEMINI_API_KEY is not configured' });
  }

  try {
    const base64Data = image.split(',')[1];
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `
      You are a highly accurate Automatic Number Plate Recognition (ANPR) system.
      Analyze the provided image and extract the license plate details.
      
      Focus on:
      1. **plateNumber**: The alphanumeric text on the license plate (e.g., "TN43AB1234").
      2. **vehicleType**: One of: "car", "motorcycle", "truck", "bus".
      3. **confidence**: Your confidence score from 0.0 to 1.0.
      4. **boundingBox**: The normalized coordinates (0-1000) of the plate: {"ymin", "xmin", "ymax", "xmax"}.

      IMPORTANT: Return ONLY a valid JSON object. No markdown, no extra text.
    `;

    // AI Call with 30s timeout
    const aiPromise = model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
    ]);

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("AI Engine Timeout (30s)")), 30000)
    );

    const result: any = await Promise.race([aiPromise, timeoutPromise]);
    const response = await result.response;
    const responseText = await response.text();
    
    // Extract JSON even if wrapped in markdown
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI failed to return structured data");
    }
    
    const aiResult = JSON.parse(jsonMatch[0]);

    // Cropping Logic using Sharp
    let croppedImageBase64 = null;
    try {
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const metadata = await sharp(imageBuffer).metadata();
      
      if (aiResult.boundingBox && metadata.width && metadata.height) {
        const { ymin, xmin, ymax, xmax } = aiResult.boundingBox;
        
        // Add 10% padding to crop
        const padY = (ymax - ymin) * 0.1;
        const padX = (xmax - xmin) * 0.1;
        
        const left = Math.max(0, Math.floor(((xmin - padX) / 1000) * metadata.width));
        const top = Math.max(0, Math.floor(((ymin - padY) / 1000) * metadata.height));
        const w = Math.min(metadata.width - left, Math.floor(((xmax - xmin + 2 * padX) / 1000) * metadata.width));
        const h = Math.min(metadata.height - top, Math.floor(((ymax - ymin + 2 * padY) / 1000) * metadata.height));

        if (w > 0 && h > 0) {
          const crop = await sharp(imageBuffer).extract({ left, top, width: w, height: h }).toBuffer();
          croppedImageBase64 = `data:image/jpeg;base64,${crop.toString('base64')}`;
        }
      }
    } catch (err) {
      console.warn("[ANPR] Crop failed:", err instanceof Error ? err.message : String(err));
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

export default app;
