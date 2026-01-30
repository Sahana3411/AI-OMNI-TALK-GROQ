# AI Omni Talk

**AI Omni Talk** is an accessible communication platform designed to bridge communication gaps for people with **speech, hearing, and vision impairments**.  
The application enables inclusive interaction using **Gesture Recognition, Text Recognition, and Speech Recognition**, powered by **Groq LLMs** for fast and efficient AI inference.

The system converts gestures, text, and speech into meaningful outputs such as **real-time text, speech, and 3D avatar animations**, making communication more natural and inclusive.

---

## 🚀 Features

- **Gesture Recognition** – Converts human gestures into readable text  
- **Text Recognition** – Converts text input into animated sign language  
- **Speech Recognition** – Converts spoken language into text  
- **Groq AI Integration** – Ultra-fast inference using Groq LLMs  
- **3D Avatar Animation** – Real-time animation using a rigged `.glb` model  
- **Web-based Platform** – Accessible via modern browsers  

---

## 🛠️ Tech Stack

- **Frontend**: React + Vite + TypeScript  
- **AI Engine**: Groq (LLMs)  
- **3D Rendering**: Three.js / React Three Fiber  
- **Styling**: CSS  
- **Deployment**: Vercel  

---

## 💻 How to Run Locally (VS Code)

### Prerequisites
1. Install **Node.js (LTS)**  
   https://nodejs.org  
2. Install **Visual Studio Code**  
   https://code.visualstudio.com  

---

### Installation Steps

1. Clone or download this repository  
2. Open the project folder in **VS Code**  
3. Open the terminal (`Ctrl + ~`) and install dependencies:
   ```bash
   npm install
   ```

---

### 🔐 Configuration

1. Create a `.env` file in the **root directory**.

2. Add your **Groq API Key**:

   ```env
   VITE_GROQ_API_KEY=your_actual_groq_api_key_here
   ```

   > Ensure you have a valid API key from **Groq Cloud**.

3. Place your **rigged 3D avatar file** named:

   ```
   model.glb
   ```

   inside the:

   ```
   public/
   ```

   folder.

---

### ▶️ Running the Application

Start the development server:

```bash
npm run dev
```

Open your browser and navigate to:

```
http://localhost:5173
```

(or the local URL shown in the terminal)

---

## 🌍 Deployment

This project is deployed using **Vercel**.

To create a production build:

```bash
npm run build
```

---

## 📌 Important Notes

* Do **not** commit the `.env` file.
* Ensure the 3D avatar is properly **rigged for animation**.
* Recommended browsers: **Chrome / Edge**.

---

## 🤝 Contribution

Contributions and improvements are welcome.
Feel free to fork the repository and submit a pull request.

---

## 📄 License

This project is developed for **educational purpose**.

---
