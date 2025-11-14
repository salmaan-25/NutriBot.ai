// Load environment variables from .env file
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = 3000; // Server will run on http://localhost:3000

// --- Configuration ---

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("FATAL: GEMINI_API_KEY is not set in the .env file!");
    process.exit(1);
}

const ai = new GoogleGenAI(API_KEY);
const MODEL_NAME = "gemini-2.5-flash-preview-09-2025";

const SYSTEM_PROMPT = `You are 'Nutrition Bot,' an expert, friendly, and encouraging meal and diet planner. Your primary goal is to provide healthy, balanced, and evidence-based nutrition advice, customized meal ideas, and general dietary information. 
When providing meal plans or complex lists:
1. Use Markdown formatting (e.g., **bold**, *italics*, lists) to make the response easy to read.
2. Ensure the advice is practical and includes macronutrient context or portion guidance where applicable.
3. Always maintain a professional, optimistic, and supportive tone.
Use the Google Search tool to ensure all facts, recommended foods, and dietary guidelines are current and accurate.`;


// --- Middleware ---

// Enable CORS for frontend running on a different port/origin (e.g., index.html opened directly)
app.use(cors()); 
// Parse JSON request bodies
app.use(express.json()); 
// Serve the frontend files (index.html, style.css, script.js)
app.use(express.static('public')); 


// --- API Routes ---

app.post('/api/chat', async (req, res) => {
    const { chatHistory } = req.body;

    if (!chatHistory || !Array.isArray(chatHistory)) {
        return res.status(400).json({ error: 'Invalid chat history provided.' });
    }

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: chatHistory,
            config: {
                // Enable Google Search grounding
                tools: [{ googleSearch: {} }],
                // Apply the persona instruction
                systemInstruction: SYSTEM_PROMPT
            }
        });

        const candidate = response.candidates?.[0];
        let botText = "Sorry, I couldn't generate a response. Please try again.";
        let sources = [];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            botText = candidate.content.parts[0].text;
            
            // Extract grounding sources (citations)
            const groundingMetadata = candidate.groundingMetadata;
            if (groundingMetadata && groundingMetadata.groundingAttributions) {
                sources = groundingMetadata.groundingAttributions
                    .map(attribution => ({
                        uri: attribution.web?.uri,
                        title: attribution.web?.title,
                    }))
                    .filter(source => source.uri && source.title);
            }
        }
        
        // Send the response back to the client
        res.json({ text: botText, sources: sources });

    } catch (error) {
        console.error('Gemini API Error:', error);
        res.status(500).json({ error: 'Failed to communicate with the AI service.' });
    }
});


// --- Server Start ---

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log(`Frontend accessible via the 'index.html' file (or http://localhost:${port}/index.html)`);
});