
import { GoogleGenAI, Type } from "@google/genai";
import { Category, CategoryInfo } from "../types.ts";

/**
 * 使用 Gemini 从日记原文中摘录最具代表性的原句，并对日记进行分类。
 */
export async function extractFragments(text: string, currentCategories: CategoryInfo[]): Promise<{ fragments: string[]; categoryId: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const categoryOptions = currentCategories.map(c => `${c.id} (${c.name})`).join(", ");

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{
          text: `请分析这段日记并完成以下两个任务：
1. 从日记正文中挑选出 2-4 句最具代表性、最能体现当下情感的“原句”作为具象碎片。
   - 必须是原文中的字句，严禁进行任何形式的总结、重写、修饰或字词修改。
   - 每个碎片不宜过长，如果句子过长，请截取原文中连续且完整的片段。
2. 将该条目分类到以下现有的类别 ID 中：[${currentCategories.map(c => c.id).join(", ")}]。
类别参考上下文：${categoryOptions}。

日记内容： "${text}"`
        }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fragments: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "直接从原文中摘录的 2-4 个原句片段。"
            },
            categoryId: {
              type: Type.STRING,
              description: "从提供列表中选择的分类 ID。"
            }
          },
          required: ["fragments", "categoryId"]
        }
      }
    });

    const jsonStr = response.text?.trim() || '{}';
    const result = JSON.parse(jsonStr);
    
    // 验证返回的 categoryId 是否存在
    const validId = currentCategories.find(c => c.id === result.categoryId) ? result.categoryId : currentCategories[0].id;
    
    return {
      fragments: Array.isArray(result.fragments) ? result.fragments : [],
      categoryId: validId
    };
  } catch (error) {
    console.error("Gemini fragment extraction failed:", error);
    // 兜底方案：如果失败，直接切分原文前 30 个字作为一个片段
    return { 
      fragments: [text.length > 30 ? text.slice(0, 30) + '...' : text], 
      categoryId: currentCategories[0].id 
    };
  }
}

/**
 * 使用 Gemini 的多模态能力将 Base64 格式的音频转录为文本。
 */
export async function transcribeAudio(base64Audio: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
