import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

async function listModels() {
  try {
    const models = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log("Model 1.5 Flash is accessible");
  } catch (e) {
    console.error("Error accessing 1.5 Flash:", e);
  }
}

listModels();
