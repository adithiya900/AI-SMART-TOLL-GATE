import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";

async function listModels() {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  try {
    const models = await genAI.listModels();
    console.log("Available Models:");
    models.models.forEach((m) => {
      console.log(`${m.name} - ${m.supportedGenerationMethods}`);
    });
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

listModels();
