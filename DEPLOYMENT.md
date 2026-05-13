# 🚀 Deployment Guide: Smart Toll AI Gate

This project is designed to be deployed using **Render.com** for the application (Frontend + Backend) and **Firebase** for the database.

---

## 1. Firebase Setup (Database)
You need a Firebase project to store vehicle and transaction data.

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Create a new project (e.g., `smart-toll-ai`).
3. In the left sidebar, click **Firestore Database** and then **Create database**.
4. Choose a location (e.g., `asia-south1`) and start in **Production mode**.
5. Go to the **Rules** tab and paste the content of your `firestore.rules` file:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true; // Change this to 'if request.auth != null' later for security
       }
     }
   }
   ```
6. Click **Publish**.
7. Go to **Project Settings** (gear icon) > **General**.
8. Under **Your apps**, click the `</>` icon to add a Web App.
9. Register the app and copy the `firebaseConfig` values. You will need these for Render.

---

## 2. Render.com Deployment (App)
Your project includes a `render.yaml` file, which makes deployment extremely easy.

1. Push your latest code to your GitHub repository.
2. Log in to [Render.com](https://render.com/).
3. Click **New +** and select **Blueprint**.
4. Connect your GitHub repository.
5. Render will detect the `render.yaml` file and show the configuration.
6. **IMPORTANT:** You must add the following **Environment Variables** in the Render dashboard:

| Key | Value |
|-----|-------|
| `GEMINI_API_KEY` | Your Google Gemini API Key |
| `VITE_FIREBASE_API_KEY` | From Firebase Config |
| `VITE_FIREBASE_AUTH_DOMAIN` | From Firebase Config |
| `VITE_FIREBASE_PROJECT_ID` | From Firebase Config |
| `VITE_FIREBASE_STORAGE_BUCKET` | From Firebase Config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | From Firebase Config |
| `VITE_FIREBASE_APP_ID` | From Firebase Config |

7. Click **Apply**. Render will now build and deploy your app.

---

## 3. Local Verification Before Deploy
To ensure everything works as expected, you can run the production build locally:

```bash
# 1. Install dependencies
npm install

# 2. Build both frontend and backend
npm run build:full

# 4. Start the production server
npm run start
```
The app will be available at `http://localhost:3000`.

---

## 4. Post-Deployment Checklist
- [ ] Visit your Render URL (e.g., `https://smart-toll-ai-gate.onrender.com`).
- [ ] Open the **Developer Console (F12)** to check for any errors.
- [ ] Click the **"Health Check"** or look at the logs to see if the ANPR Engine is online.
- [ ] Try uploading an image to test the AI recognition.
- [ ] Verify that transactions are appearing in your Firebase Console.

---

### 🛠️ Troubleshooting
- **Build Fails:** Ensure your `node` version is 18 or higher (Render uses 18+ by default).
- **AI Error:** Check if `GEMINI_API_KEY` is correctly set and not expired.
- **Firestore Error:** Ensure you published the rules in the Firebase Console.
