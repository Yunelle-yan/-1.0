
import { GoogleGenAI, Type } from "@google/genai";
import { Category, CategoryInfo } from "../types.ts";

/**
 * 使用 Gemini 分析日记内容，并将其归类到最合适的现有类别中。
 */
export async function categorizeEntry(text: string, currentCategories: CategoryInfo[]): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 动态生成类别描述，利用现有的类别名称
  const categoryListStr = currentCategories.map(c => `- ${c.id} (${c.name})`).join("\n");

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{
          text: `你是一个专业的语义分类助手。请分析这段日记内容，并从以下现有的类别列表中选择一个最匹配的。
          
现有类别列表：
${categoryListStr}

规则：
1. 仔细阅读日记内容。
2. 根据类别名称的语义，选择最能代表这段文字意图或主题的类别 ID。
3. 只需返回选中的类别 ID 字符串，不要有任何额外解释。

日记内容： "${text}"`
        }]
      },
      config: {
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
    const validId = currentCategories.find(c => c.id === result.categoryId) ? result.categoryId : currentCategories[0].id;
    return validId;
  } catch (error) {
    console.error("Gemini categorization failed:", error);
    return currentCategories[0].id;
  }
}

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
