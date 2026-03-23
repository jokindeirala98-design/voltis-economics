const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '.env.local' });

async function listModels() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    // The SDK doesn't have a direct listModels in the main class usually, 
    // but we can try to fetch a known model's info or use the REST API via fetch.
    console.log('Testing connection with API Key:', process.env.GEMINI_API_KEY ? 'Present' : 'Missing');
    
    // Attempting to use a very basic model to check connectivity
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hi");
    console.log('Test response:', result.response.text());
  } catch (error) {
    console.error('Error detail:', error);
  }
}

listModels();
