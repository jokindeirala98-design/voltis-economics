import fs from 'fs';

let key = '';
try {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  const match = envFile.match(/GEMINI_API_KEY="?([^"\n]+)"?/);
  if (match) {
    key = match[1];
  }
} catch (e) {
  console.error('Could not read .env.local');
  process.exit(1);
}

if (!key) {
  console.error('API key not found');
  process.exit(1);
}

fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
  .then(res => res.json())
  .then(data => {
    if (data.error) {
       console.error('API Error:', data.error);
       return;
    }
    const models = data.models.map(m => m.name);
    console.log('Available models:');
    console.log(models.join('\\n'));
  })
  .catch(console.error);
