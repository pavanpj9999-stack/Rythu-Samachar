import { GoogleGenAI } from "@google/generative-ai";
import { FarmerRecord } from '../types';

export const generateDataAnalysis = async (data: FarmerRecord[]) => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key not found");

    const ai = new GoogleGenAI({ apiKey });
    
    // Prepare a summary of the data for the model to analyze
    const dataSummary = data.slice(0, 50).map(f => 
      `Village: ${f.village}, Mandal: ${f.mandal}, Acres: ${f.extentAcres}, Status: ${f.status}`
    ).join('\n');

    const prompt = `
      Analyze the following agricultural land data samples for the "Rythu Samachar" portal.
      Provide a concise executive summary in HTML format (using <ul>, <li>, <strong> tags only, no markdown blocks).
      Focus on:
      1. Land distribution patterns.
      2. Verification status insights.
      3. Suggestions for field teams based on the data.
      
      Data Sample:
      ${dataSummary}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Analysis Failed", error);
    return "<ul><li>Analysis currently unavailable. Please check API configuration.</li></ul>";
  }
};