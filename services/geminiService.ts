
import { GoogleGenAI, Type } from "@google/genai";
import { Category, CategoryInfo } from "../types.ts";

/**
 * 使用 Gemini 分析日记内容，并将其归类到最合适的现有类别中。
 */
export async function categorizeEntry(text: string, currentCategories: CategoryInfo[]): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const categoryOptions = currentCategories.map(c => `${c.id} (${c.name})`).join(", ");

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{
          text: `请分析这段日记内容，并从以下现有的类别 ID 中选择一个最匹配的：[${currentCategories.map(c => c.id).join(", ")}]。
类别参考含义：${categoryOptions}。
只需返回选中的类别 ID 字符串，不要有任何额外解释。

日记内容： "${text}"`
        }]
      },
      config: {
        // 使用 JSON 模式确保返回格式稳定
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            categoryId: {
              type: Type.STRING,
              description: "匹配的分类 ID。"
            }
          },
          required: ["categoryId"]
        }
      }
    });

    const jsonStr = response.text?.trim() || '{}';
    const result = JSON.parse(jsonStr);
    
    // 验证返回的 categoryId 是否有效
    const validId = currentCategories.find(c => c.id === result.categoryId) ? result.categoryId : currentCategories[0].id;
    return validId;
  } catch (error) {
    console.error("Gemini categorization failed:", error);
    return currentCategories[0].id;
  }
}

/**
 * 使用 Gemini 的多模态能力将 Base64 格式的音频转录为文本。
 * Updated to use 'gemini-2.5-flash-native-audio-preview-09-2025' for specialized audio processing.
 */
export async function transcribeAudio(base64Audio: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      contents: {
        parts: [
          { inlineData: { data: base64Audio, mimeType: 'audio/webm' } },
          { text: "请转录这段音频，只需返回转录出的文本内容。" }
        ]
      }
    });
    return response.text?.trim() || "";
  } catch (error) {
    console.error("Gemini transcription failed:", error);
    return "";
  }
}
