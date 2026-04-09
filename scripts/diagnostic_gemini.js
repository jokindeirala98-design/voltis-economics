
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function checkModels() {
  const apiKey = "AIzaSyC6NmssfSkWkKAmwkrSnLGmwTtX-rtaKtw";
  const genAI = new GoogleGenerativeAI(apiKey);
  
  console.log("Checking available models for the provided API key...");
  
  try {
    // There is no direct listModels in the base class, we need to use the REST fallback or check common aliases
    const models = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash-001",
      "gemini-1.5-flash-8b",
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash",
      "gemini-2.0-flash-001",
      "gemini-1.5-pro",
      "gemini-pro"
    ];

    console.log("\nTesting reachability via generateContent on V1 and V1BETA:");
    
    for (const modelName of models) {
      process.stdout.write(`Testing ${modelName}... `);
      try {
        const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' });
        await model.generateContent("Hello");
        console.log(" [V1 SUCCESS]");
      } catch (err1) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1beta' });
          await model.generateContent("Hello");
          console.log(" [V1BETA SUCCESS]");
        } catch (err2) {
          console.log(` [FAILED] - ${err1.message.substring(0, 50)}...`);
        }
      }
    }

  } catch (error) {
    console.error("Error listing models:", error);
  }
}

checkModels();
