# Cloudflare AI 转 OpenAI DALL-E 3 转换器

## 项目简介

这个项目提供了一个 Cloudflare Worker，它将 Cloudflare AI 的图像生成功能转换为与 OpenAI 的 DALL-E 3 格式兼容的 API。除了API功能外，还包括一个简单而强大的Web界面，用于直接在浏览器中生成图像。此外，项目还提供了使用 Cloudflare 的 AI 模型的聊天完成端点。

## 功能特点

- 与 OpenAI 的 DALL-E 3 格式兼容的图像生成 API
- 用户友好的 Web 界面，支持图像生成
- 使用 Cloudflare 的 AI 模型的聊天完成 API
- 使用 AI 自动优化提示词
- 集成 R2 存储用于生成的图像
- 支持身份验证
- 存储管理，防止超出 R2 存储限制

## 前置条件

- 拥有 Workers 和 AI 访问权限的 Cloudflare 账户
- 在您的 Cloudflare 账户中设置好的 R2 存储桶
- (可选) Worker 的自定义域名

## 设置步骤

1. 将此仓库克隆到您的本地机器。

2. 如果您还没有安装 Cloudflare Workers CLI（Wrangler），请安装它：
   ```
   npm install -g wrangler
   ```

3. 使用您的 Cloudflare 账户进行身份验证：
   ```
   wrangler login
   ```

4. 在 `CF-AI-API.js` 中更新 `WORKER_URL` 常量，使用您的 Worker 的自定义域名或 workers.dev 域名。

5. （可选）设置环境变量：
   - `AUTH_KEY`：如果您想启用身份验证
   - 在 `wrangler.toml` 中配置您的 R2 存储桶

6. 部署 Worker：
   ```
   wrangler publish
   ```

## 图形化界面
<img width="1268" alt="屏幕截图 2024-08-24 124801" src="https://github.com/user-attachments/assets/7c2b9e50-13d4-450a-a3d8-edd30b51b549">

### 功能

1. **模型选择**：
   - DALL-E 3 (Stable Diffusion XL Base 1.0)
   - DALL-E 2 (Stable Diffusion XL Lightning)
   - DALL-E 1 (DreamShaper 8 LCM)
   - CF-FLUX (Flux-1-schnell)

2. **图像尺寸**：1024x1024, 512x512, 256x256

3. **图像质量**：标准或高清

4. **增强级别**：可调整的增强级别滑块

5. **提示词输入**：用户可输入描述想要生成的图像

6. **生成按钮**：开始图像生成过程

7. **结果显示**：显示生成的图像和优化后的提示词

### 使用方法

1. 访问您部署的Worker URL
2. 输入图像描述
3. 选择模型、尺寸、质量和增强级别
4. 点击"生成图像"按钮
5. 等待图像生成
6. 查看生成的图像和优化后的提示词

### 注意事项

- 响应式设计，适配各种设备
- 客户端操作，保护用户隐私
- 可通过修改 `index.html` 自定义界面

## API 端点

1. **图像生成**
   - 端点：`POST /v1/images/generations`
   - 头部：
     - `Content-Type: application/json`
     - `Authorization: Bearer YOUR_AUTH_KEY`（如果启用了身份验证）
   - 请求体：
     ```json
     {
       "prompt": "您的图像描述",
       "n": 1,
       "size": "1024x1024",
       "model": "dall-e-3",
       "quality": "standard",
       "enhance_level": 0
     }
     ```
   - 响应：包含图像 URL 和元数据的 JSON 对象

2. **聊天完成**
   - 端点：`POST /v1/chat/completions`
   - 头部：
     - `Content-Type: application/json`
     - `Authorization: Bearer YOUR_AUTH_KEY`（如果启用了身份验证）
   - 请求体：
     ```json
     {
       "messages": [
         {"role": "user", "content": "您的消息"}
       ]
     }
     ```
   - 响应：包含 AI 生成回复的 JSON 对象

3. **图像获取**
   - 端点：`GET /v1/img?key=IMAGE_KEY`
   - 头部：
     - `Authorization: Bearer YOUR_AUTH_KEY`（如果启用了身份验证）
   - 响应：图像文件

## 配置选项

- `AUTH_KEY`：设置此环境变量以启用 API 身份验证
- `MAX_STORAGE_BYTES`：在 `CF-AI-API.js` 中设置最大存储限制（默认为 8GB）

## 存储管理

该项目包括一个自动存储管理功能，以防止超过 R2 存储限制。当存储接近限制时，它会自动删除最旧的图像。

## 注意事项

- 此项目仅用于学习和研究目的。
- 请勿生成或使用有害内容。
- 确保遵守 Cloudflare 的服务条款和使用政策。

## 故障排除

如果遇到问题：
1. 检查 Cloudflare Dashboard 中的 Worker 日志
2. 确保所有必需的环境变量都已正确设置
3. 验证您的 R2 存储桶配置是否正确

## 贡献

欢迎贡献！请提交 pull 请求或创建 issue 来改进这个项目。

## 许可证

本项目采用 MIT 许可证。详情请参见 LICENSE 文件。

## 致谢

感谢 Cloudflare 提供强大的 Workers 和 AI 平台，使得这个项目成为可能。
