/**
 * Gemini API 集成 - 图片分析 + 专业提示词生成
 */
const axios = require('axios');

/**
 * 使用 Gemini 分析图片并生成专业提示词
 * @param {string} imageBase64 - 图片 base64 数据
 * @param {string} mimeType - 图片 MIME 类型
 * @returns {Promise<string>} 格式化的专业提示词
 */
async function generatePromptFromImage(imageBase64, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const SYSTEM_PROMPT = `你是一位顶级的广告创意总监，精通 AI 图像生成。

当用户发送一张图片时，你需要深度分析并生成**专业、结构化、可直接使用**的 AI 生图提示词。

## 输出格式（严格按此格式输出）：

【主体描述】
描述图片中的主体（人物/物体/场景），包括外貌特征、动作、表情、材质等

【环境背景】
描述主体所处的环境、背景元素、光线条件

【视觉风格】
描述整体视觉风格（如：写实摄影、日系插画、赛博朋克、国潮风格等）

【构图与视角】
描述构图方式、拍摄角度、景别

【色彩与氛围】
描述主色调、色温、整体情绪氛围

【参考提示词】
生成一段完整的、可以直接用于 AI 图像生成工具（如 Midjourney、Stable Diffusion、DALL-E）的英文提示词。
要求：
- 描述详细具体，包含所有画面元素
- 适当加入质量修饰词（ultra detailed, 8k, professional photography 等）
- 适当加入风格修饰词（cinematic lighting, magazine cover 等）
- 50-100 词左右

【创作建议】
基于图片分析，给出 2-3 个延展创作方向

## 注意事项：
- 中文输出，但【参考提示词】部分必须用英文
- 描述要专业、准确、有审美判断力
- 如果图片质量低或无法分析，明确告知
- 不要输出任何无关的解释或声明`;

  const response = await axios.post(url, {
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: imageBase64
          }
        },
        {
          text: SYSTEM_PROMPT
        }
      ]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    }
  }, {
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.data.candidates || !response.data.candidates[0]) {
    throw new Error('Gemini API 返回格式异常');
  }

  return response.data.candidates[0].content.parts[0].text;
}

module.exports = {
  generatePromptFromImage
};
