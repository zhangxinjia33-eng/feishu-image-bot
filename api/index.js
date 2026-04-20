/**
 * 飞书图片机器人 - 主入口
 * 接收飞书消息事件 → 下载图片 → Gemini 分析 → 回复结构化提示词
 */
const axios = require('axios');
const { generatePromptFromImage } = require('../gemini');

// 飞书 API 配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;

// 获取飞书 tenant_access_token
async function getTenantAccessToken() {
  const response = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    }
  );
  return response.data.tenant_access_token;
}

// 下载飞书图片
async function downloadFeishuImage(imageKey, token) {
  const response = await axios.get(
    `https://open.feishu.cn/open-apis/im/v1/images/${imageKey}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      },
      responseType: 'arraybuffer'
    }
  );
  return Buffer.from(response.data).toString('base64');
}

// 下载飞书消息中的文件（图片/视频等）
async function downloadFeishuFile(fileKey, token) {
  const response = await axios.get(
    `https://open.feishu.cn/open-apis/im/v1/files/${fileKey}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      },
      responseType: 'arraybuffer'
    }
  );
  return Buffer.from(response.data);
}

// 发送文本消息
async function sendText(chatId, text, token) {
  await axios.post(
    `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`,
    {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text })
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

// 处理图片消息
async function handleImageMessage(message, token) {
  const chatId = message.chat_id;

  // 解析 image_key
  let imageKeyStr;
  try {
    const contentObj = JSON.parse(message.content);
    imageKeyStr = contentObj.image_key;
  } catch (e) {
    imageKeyStr = message.content;
  }

  if (!imageKeyStr) {
    await sendText(chatId, '❌ 未找到图片信息', token);
    return;
  }

  try {
    // 1. 下载图片
    const imageBase64 = await downloadFeishuImage(imageKeyStr, token);

    // 2. 发送"正在分析"提示
    await sendText(chatId, '🔍 正在分析图片，请稍候...', token);

    // 3. 调用 Gemini 分析
    const prompt = await generatePromptFromImage(imageBase64, 'image/jpeg');

    // 4. 发送结果
    await sendText(chatId, prompt, token);

  } catch (error) {
    console.error('处理图片失败:', error);
    await sendText(chatId, `❌ 分析失败: ${error.message}`, token);
  }
}

// 处理文件消息（也作为图片处理）
async function handleFileMessage(message, token) {
  const chatId = message.chat_id;

  try {
    const contentObj = JSON.parse(message.content);
    const fileKey = contentObj.file_key;
    const fileName = contentObj.file_name || 'unknown';

    // 检查文件类型
    const ext = fileName.split('.').pop().toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

    if (!imageExts.includes(ext)) {
      await sendText(chatId, `📎 收到文件: ${fileName}\n\n目前仅支持图片格式分析（JPG/PNG/GIF/WebP）`, token);
      return;
    }

    // 1. 下载文件
    const fileBuffer = await downloadFeishuFile(fileKey, token);
    const imageBase64 = fileBuffer.toString('base64');

    // MIME 类型映射
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp'
    };
    const mimeType = mimeTypes[ext] || 'image/jpeg';

    // 2. 发送"正在分析"提示
    await sendText(chatId, '🔍 正在分析图片，请稍候...', token);

    // 3. 调用 Gemini 分析
    const prompt = await generatePromptFromImage(imageBase64, mimeType);

    // 4. 发送结果
    await sendText(chatId, prompt, token);

  } catch (error) {
    console.error('处理文件失败:', error);
    await sendText(chatId, `❌ 分析失败: ${error.message}`, token);
  }
}

// 主 Handler
module.exports = async (req, res) => {
  console.log('收到请求:', JSON.stringify(req.body, null, 2));

  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Feishu-Signature');
    res.status(200).end();
    return;
  }

  // 只处理 POST 请求
  if (req.method !== 'POST') {
    res.status(200).json({ message: 'ok' });
    return;
  }

  try {
    const body = req.body;

    // 获取 access_token
    const token = await getTenantAccessToken();
    if (!token) {
      res.status(500).json({ error: '获取 token 失败' });
      return;
    }

    // 处理 event 类型的事件
    if (body.event && body.event.message) {
      const message = body.event.message;
      const messageType = message.message_type;

      console.log('收到消息类型:', messageType);

      // 图片消息
      if (messageType === 'image') {
        await handleImageMessage(message, token);
      }
      // 文件消息（可能是图片）
      else if (messageType === 'file') {
        await handleFileMessage(message, token);
      }
      // 文本消息 - 回复帮助
      else if (messageType === 'text') {
        const chatId = message.chat_id;
        await sendText(chatId,
          `👋 您好！我是图片提示词生成助手

📎 **使用方法：**
直接发送图片给我，我会分析并生成**专业结构化的 AI 提示词**

🔍 **支持格式：**
JPG、PNG、GIF、WebP

💡 **输出内容：**
• 主体描述
• 环境背景
• 视觉风格
• 构图与视角
• 色彩与氛围
• 英文参考提示词
• 创作建议

快发送一张图片试试吧！`, token);
      }
    }

    res.status(200).json({ message: 'ok' });

  } catch (error) {
    console.error('处理失败:', error);
    res.status(500).json({ error: error.message });
  }
};
