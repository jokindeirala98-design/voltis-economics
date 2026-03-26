import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

const envLocal = fs.readFileSync('.env.local', 'utf8');
const keyMatch = envLocal.match(/GEMINI_API_KEY=(.*)/);
const apiKey = keyMatch ? keyMatch[1].trim() : '';

console.log('Testing Gemini API Key...');
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

async function test() {
  try {
    const result = await model.generateContent('Dime "OK" si puedes leer esto.');
    const response = await result.response;
    const text = response.text();
    console.log('Gemini Response:', text);
    if (text.includes('OK')) {
      console.log('VERIFICATION SUCCESSFUL: Gemini is working with the new key!');
    } else {
      console.log('Gemini responded but not as expected. Full response:', text);
    }
  } catch (error) {
    console.error('Verification FAILED:', error.message);
    process.exit(1);
  }
}

test();
