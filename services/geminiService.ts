
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export const suggestTeamNames = async (): Promise<string[]> => {
  try {
    const prompt = "Generate 5 creative, witty, and pickleball-themed team names. Provide them as a single comma-separated string, for example: Dink responsibly,Kitchen Masters,Smash Brothers,The Volley Llamas,Net Assets";
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    const text = response.text;
    if (!text) {
        return [];
    }
    
    return text.split(',').map(name => name.trim()).filter(name => name.length > 0);
  } catch (error) {
    console.error("Error suggesting team names:", error);
    return [];
  }
};
