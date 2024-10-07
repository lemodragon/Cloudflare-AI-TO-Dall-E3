import indexHtml from './index.html';

const WORKER_URL = '改为你Worker的自定义域名或workers.dev域名';
const availableModels = {
  "dall-e-3": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "dall-e-2": "@cf/bytedance/stable-diffusion-xl-lightning",
  "dall-e-1": "@cf/lykon/dreamshaper-8-lcm",
  "cf-flux": "@cf/black-forest-labs/flux-1-schnell"
};

const DEBUG = true;
const MAX_STORAGE_BYTES = 8 * 1024 * 1024 * 1024; // 8GB 最大存储限制

// 提示词润色模板
const REFINEMENT_TEMPLATE = `
"作为Stable Diffusion提示词专家，请将以下中文提示词润色并扩展为详细的英文图像生成提示词。保持原意的同时，增加细节和描述性，使其更适合绘画：
原始提示词: "{original_prompt}"

请考虑以下几点来改进提示词：
1. 详细描述场景、物体、人物的外观和特征
2. 指定艺术风格、绘画技巧或特定艺术家的风格
3. 描述光线、颜色和氛围
4. 添加场景的背景或环境细节
5. 指定视角或构图

在创建提示词时，请遵循以下指南：
- 使用常见词汇，按重要性排列，并用逗号分隔
- 避免使用"-"或"."，但可以接受空格和自然语言
- 避免词汇重复
- 将重要关键词放在括号中以增加其权重，例如"(keyword)"或"(keyword:1.5)"
- 提示词结构应包含：前缀（质量标签+风格词+效果器）+ 主题（图像的主要焦点）+ 场景（背景、环境）
- 使用质量标签如"masterpiece"、"best quality"、"4k"等来提高图像细节
- 使用风格词和效果器来定义图像风格和影响光照、深度
- 对主题进行详细描述，包括面部、头发、身体、服装、姿势等特征（如适用）
- 描述环境以丰富场景

请用英文提供润色后的提示词：
`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
        status: 204
      });
    }
    
    // 处理根路径请求，返回 HTML 页面（无需鉴权）
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(indexHtml, {
        headers: { ...corsHeaders, 'Content-Type': 'text/html' },
      });
    }

    // 处理认证检查请求
    if (url.pathname === '/v1/auth-check' && request.method === 'GET') {
      return new Response(JSON.stringify({
        authRequired: !!env.AUTH_KEY
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // 对所有 /v1/ 开头的请求进行鉴权
    if (url.pathname.startsWith('/v1/')) {
      const authHeader = request.headers.get('Authorization');
      let authKey = authHeader && authHeader.split(' ')[1];
      
      // 如果Authorization头部没有提供auth key，则从URL参数中获取
      if (!authKey) {
        authKey = url.searchParams.get('auth');
      }
      
      if (env.AUTH_KEY && authKey !== env.AUTH_KEY) {
        console.error('Authentication failed. Provided key:', authKey);
        return new Response(JSON.stringify({
          error: 'Unauthorized',
          message: 'Invalid or missing authentication key'
        }), { 
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    
    if (url.pathname === '/v1/img' && request.method === 'GET') {
      const get_img_key = url.searchParams.get('key');
      if (!get_img_key) {
        console.error('Missing image key');
        return new Response('Missing image key', { status: 400 });
      }
      
      try {
        const object = await env.R2.get(get_img_key);
        if (object === null) {
          console.error('Image Not Found for key:', get_img_key);
          return new Response('Image Not Found', { status: 404 });
        }
        
        if (DEBUG) {
          console.log('Requested image key:', get_img_key);
          console.log('R2 object:', object);
        }
        
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('content-type', 'image/png');
        headers.set('Cache-Control', 'public, max-age=31536000');
        
        return new Response(object.body, {
          headers: { ...headers, ...corsHeaders },
        });
      } catch (error) {
        console.error('Error fetching image:', error);
        return new Response('Error fetching image', { status: 500 });
      }
    }
    
    if (url.pathname === '/v1/images/generations' && request.method === 'POST') {
      const bodyJson = await request.json();
      
      let model = bodyJson.model || "dall-e-3";
      let prompt = bodyJson.prompt;
      const n = bodyJson.n || 1;
      const size = bodyJson.size || "1024x1024";
      const quality = bodyJson.quality || "standard";
      const enhance_level = bodyJson.enhance_level || 0;

      if (!prompt || prompt.length < 1) {
        console.error('Invalid prompt');
        return new Response('Invalid prompt', { status: 400 });
      }

      if (n !== 1) {
        console.error('Only single image generation is supported');
        return new Response('Only single image generation is supported', { status: 400 });
      }

      try {
        // 润色提示词
        const refinementPrompt = REFINEMENT_TEMPLATE.replace("{original_prompt}", prompt);
        const refinedPrompt = await env.AI.run('@cf/qwen/qwen1.5-14b-chat-awq', {
          messages: [{ role: 'user', content: refinementPrompt }]
        });
        prompt = refinedPrompt.response;

        // 映射模型
        const cfModel = availableModels[model] || availableModels["dall-e-3"];

        let inputs;
        let imageData;

        if (model === "cf-flux") {
          // FLUX模型特殊处理
          const [width, height] = size.split('x').map(Number);
          inputs = {
            prompt: prompt,
            num_steps: 4,
            width: width,
            height: height
          };
        } else {
          // 其他模型处理
          inputs = {
            prompt: prompt,
            size: size,
            quality: quality,
            enhance_level: enhance_level
          };
        }

        const result = await env.AI.run(cfModel, inputs);
        
        // 确保imageData是正确的类型
        if (model === "cf-flux") {
          imageData = base64ToArrayBuffer(result.image);
        } else {
          imageData = result;
        }

        const timeNow = Math.floor(Date.now() / 1000);
        const imgKey = await getMD5(`${prompt}${timeNow}`);

        // 检查并管理存储空间
        try {
          await manageStorage(env.R2);
        } catch (storageError) {
          console.error('Error managing storage:', storageError);
        }

        await env.R2.put(imgKey, imageData, {
          customMetadata: {
            createdAt: timeNow.toString()
          }
        });
        
        console.log('Image generated and saved with key:', imgKey);

        const jsonResponse = {
          "created": timeNow,
          "data": [
            {
              "url": `${WORKER_URL}/v1/img?key=${imgKey}&auth=${env.AUTH_KEY}`,
              "model": model,
              "size": size,
              "quality": quality,
              "enhance_level": enhance_level,
              "refined_prompt": prompt
            }
          ]
        };

        return new Response(JSON.stringify(jsonResponse), {
          headers: {
            ...corsHeaders,
            "content-type": "application/json",
          },
        });
      } catch (error) {
        console.error('Error generating or saving image:', error);
        return new Response(JSON.stringify({ error: 'Error generating or saving image', details: error.message }), { 
          status: 500,
          headers: {
            ...corsHeaders,
            "content-type": "application/json",
          },
        });
      }
    }

    // 处理 OpenAI 聊天相关请求
    if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
      try {
        const bodyJson = await request.json();
        const messages = bodyJson.messages || [];

        // 使用 @cf/qwen/qwen1.5-14b-chat-awq 模型处理请求
        const response = await env.AI.run('@cf/qwen/qwen1.5-14b-chat-awq', {
          messages: messages
        });

        const jsonResponse = {
          id: 'chatcmpl-' + Math.random().toString(36).substr(2, 9),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: '@cf/qwen/qwen1.5-14b-chat-awq',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: response.response
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: -1,
            completion_tokens: -1,
            total_tokens: -1
          }
        };

        return new Response(JSON.stringify(jsonResponse), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        console.error('Error processing chat request:', error);
        return new Response(JSON.stringify({ error: 'Error processing chat request', details: error.message }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }

    console.error('Not Found:', url.pathname);
    return new Response('Not Found', { status: 404 });
  },
};

async function getMD5(string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(string);
  const hashBuffer = await crypto.subtle.digest('MD5', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function manageStorage(R2) {
  let currentStorageBytes = 0;
  let objectsToDelete = [];
  let listed;

  try {
    listed = await R2.list();
  } catch (listError) {
    console.error('Error listing R2 objects:', listError);
    return;
  }

  listed.objects.sort((a, b) => {
    const aCreatedAt = a.customMetadata && a.customMetadata.createdAt ? parseInt(a.customMetadata.createdAt) : 0;
    const bCreatedAt = b.customMetadata && b.customMetadata.createdAt ? parseInt(b.customMetadata.createdAt) : 0;
    return aCreatedAt - bCreatedAt;
  });

  for (let object of listed.objects) {
    currentStorageBytes += object.size;
    if (currentStorageBytes > MAX_STORAGE_BYTES) {
      objectsToDelete.push(object.key);
    }
  }

  for (let key of objectsToDelete) {
    try {
      await R2.delete(key);
      console.log(`Deleted old image: ${key}`);
    } catch (deleteError) {
      console.error(`Error deleting object ${key}:`, deleteError);
    }
  }

  console.log(`Current storage after management: ${(currentStorageBytes / (1024 * 1024)).toFixed(2)} MB`);
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}