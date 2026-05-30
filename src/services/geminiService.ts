/// <reference types="vite/client" />
import { GoogleGenerativeAI } from "@google/generative-ai";
import { RecognitionResult, VehicleType } from "../types";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyAZIi8vMs6AUCBRn6pKCeR8SBiVxyMLREw';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const LICENSE_PLATE_PROMPT = `
You are an expert in vehicle identification and Automatic Number Plate Recognition (ANPR).
Analyze the image and extract the following information.

### Requirements:
1. **Detect the number plate**: Find the location of the license plate.
2. **Bounding Box**: Provide the bounding box of the number plate in normalized coordinates (0-1000) as an object: {"ymin": top, "xmin": left, "ymax": bottom, "xmax": right}.
3. **Extract Text**: Read the alphanumeric characters from the plate. Focus on Indian formats (e.g., TN 43 AB 1234).
4. **Vehicle Type**: Identify if it is a 'car', 'truck', 'bus', or 'motorcycle'.

### Output Format:
Respond ONLY with a valid JSON object:
{
  "plateNumber": "TN43AB1234",
  "vehicleType": "car",
  "confidence": 0.98,
  "boundingBox": {
    "ymin": 450,
    "xmin": 300,
    "ymax": 520,
    "xmax": 600
  }
}
`;

function cleanPlateNumber(plate: string): string {
  // Remove spaces, symbols, and convert to uppercase
  let cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // More flexible Indian Plate Regex
  // Supports: TN43AB1234, DL10C1234, KL01A123, etc.
  const indianPlateRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/;
  
  if (cleaned && !indianPlateRegex.test(cleaned)) {
    console.warn("Detected plate format is unusual:", cleaned);
  }
  
  return cleaned;
}

export async function recognizeLicensePlate(base64Image: string): Promise<RecognitionResult> {
  try {
    const response = await fetch('/api/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    const jsonResult = await response.json();

    return {
      vehicleDetected: jsonResult.vehicleDetected,
      plateNumber: cleanPlateNumber(jsonResult.detectedNumber || jsonResult.plateNumber || ""),
      vehicleType: (jsonResult.vehicleType as VehicleType) || "car",
      confidence: (jsonResult.confidence || 0.95),
      boundingBox: jsonResult.boundingBox,
      croppedImage: jsonResult.croppedImage,
      processingTime: jsonResult.processingTime
    };
  } catch (error: any) {
    console.error("AI Recognition Error:", error);
    return {
      vehicleDetected: false,
      plateNumber: "",
      vehicleType: "car",
      confidence: 0,
      error: `API Issue: ${error.message}`
    };
  }
}

