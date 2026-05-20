# AI-SMART-TOLL-GATE 🚗💨

A production-ready Automatic Number Plate Recognition (ANPR) system built with React, TypeScript, and Google Gemini AI.

## Features
- **Live ANPR**: Real-time license plate detection using webcam.
- **Image Upload**: Process static images (Cars, Bikes, Trucks).
- **AI-Powered**: Uses Gemini 1.5 Flash for detection, bounding box visualization, and high-accuracy OCR.
- **Dashboard Stats**: Real-time monitoring of revenue, traffic, and active vehicles.
- **Vehicle Registry**: Searchable database of registered vehicles with status management.
- **Auto-Registration**: Quick-register unrecognized vehicles directly from AI results.
- **Indian Plate Support**: Optimized for Indian vehicle number formats.
- **History Management**: Track and manage recent toll transactions with a clear history option.
- **Modern UI**: Sleek, glassmorphic design with premium animations.

## Tech Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Framer Motion.
- **Backend**: Node.js, Express (API Proxy).
- **AI Engine**: Google Gemini 1.5 Flash (`gemini-flash-latest`).

## Prerequisites
- Node.js (v18+)
- Google Gemini API Key

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd smart-toll-ai-gate
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Setup**:
   Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   *Note: For local development, the backend uses this key to process images. In production (e.g., Render), add this as an environment variable in your dashboard.*

4. **Operational Modes**:
   - **Cloud Mode**: Connects to Firebase for live vehicle registration and transaction tracking.
   - **Local Mode**: Automatically falls back to browser LocalStorage if Firebase is unavailable, ensuring the gate remains operational.

5. **Run the application**:
   ```bash
   npm run dev:full
   ```
   This will start both the frontend and the backend server.

## How it works
1. **Input**: Capture a photo via webcam or upload an image.
2. **Detection**: Gemini AI identifies the vehicle and detects the number plate region.
3. **Visualization**: A bounding box is drawn around the detected plate.
4. **Extraction**: High-precision OCR extracts the license plate text.
5. **Processing**: The system checks the vehicle registry, calculates toll based on vehicle type, and updates the balance.
