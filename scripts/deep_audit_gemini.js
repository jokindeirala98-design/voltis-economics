
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function deepAudit() {
  const apiKey = "AIzaSyC6NmssfSkWkKAmwkrSnLGmwTtX-rtaKtw";
  const genAI = new GoogleGenerativeAI(apiKey);
  
  const models = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-001",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite-001",
    "gemini-flash-latest"
  ];
  
  const versions = ['v1', 'v1beta'];

  console.log("Deep Audit of Gemini Model Availability for this API KEY...\n");

  for (const modelName of models) {
    for (const apiVersion of versions) {
      process.stdout.write(`Testing [${apiVersion}] ${modelName}... `);
      try {
        const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion });
        const result = await model.generateContent("Hello");
        console.log(" [SUCCESS]");
      } catch (err) {
        console.log(` [FAILED] - ${err.message.substring(0, 100)}`);
      }
    }
  }
}

deepAudit();
