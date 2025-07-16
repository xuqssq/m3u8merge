# M3U8Merge SDK 使用文档

一个高性能的 M3U8 视频流下载和合并工具，支持加密解密、并发下载和自动重试功能。

## 特性

- 🚀 高性能并发下载
- 🔐 支持 AES-128 加密视频解密
- 🛡️ 智能重试机制
- 📊 实时下载进度监控
- 🔄 自动选择最优下载方法
- 💾 支持本地文件和网络 URL

## 安装

### 作为依赖安装
```bash
yarn add m3u8merge
# 或
npm install m3u8merge
```

### 快捷使用（无需安装）
```bash
npx m3u8merge -f your_file.m3u8 -o output.mp4
```

## 前置要求

确保系统已安装 FFmpeg：

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
下载 FFmpeg 并添加到系统 PATH

**Linux:**
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# CentOS/RHEL
sudo yum install ffmpeg
```

## 命令行使用

### 基本语法
```bash
npx m3u8merge -f <输入文件> -o <输出文件>
```

### 使用本地 M3U8 文件
```bash
npx m3u8merge -f ./video.m3u8 -o merged_video.mp4
```

### 使用网络 URL
```bash
npx m3u8merge -f "https://example.com/video.m3u8" -o output.mp4
```

### 参数说明
- `-f, --file`: 输入的 M3U8 文件路径或 URL（必需）
- `-o, --output`: 输出视频文件路径（可选，默认使用输入文件名）

## SDK 编程接口

### 导入模块
```javascript
import M3U8Parser from 'm3u8merge';

// 创建解析器实例
const parser = new M3U8Parser();
```

### 核心接口

#### 1. 解析 M3U8 文件
```javascript
// 从本地文件解析
const links = parser.parseFromFile('./video.m3u8');

// 从字符串内容解析
const m3u8Content = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:10.0,
segment1.ts
#EXTINF:10.0,
segment2.ts`;
const links = parser.parseFromString(m3u8Content);
```

#### 2. 处理本地文件到视频
```javascript
const success = await parser.processFileToVideo(
  './video.m3u8',           // M3U8 文件路径
  './output.mp4',           // 输出视频路径
  './temp_segments',        // 临时目录（可选）
  {                         // 配置选项（可选）
    keepTempFiles: false,
    videoCodec: 'copy',
    audioCodec: 'copy',
    maxConcurrent: 20,
    retryCount: 3
  }
);
```

#### 3. 处理网络 URL 到视频
```javascript
const success = await parser.processUrlToVideo(
  'https://example.com/video.m3u8',  // M3U8 URL
  './output.mp4',                    // 输出视频路径
  './temp_segments',                 // 临时目录（可选）
  {                                  // 配置选项（可选）
    maxConcurrent: 15,
    retryCount: 5,
    downloadMethod: 'auto'
  }
);
```

### 配置选项

#### MergeOptions 接口
```typescript
interface MergeOptions {
  outputPath: string;         // 输出文件路径
  tempDir: string;           // 临时目录
  keepTempFiles: boolean;    // 是否保留临时文件
  videoCodec?: string;       // 视频编码器 ('copy', 'libx264', 等)
  audioCodec?: string;       // 音频编码器 ('copy', 'aac', 等)
  quality?: string;          // 视频质量 (CRF值，如 '23')
  maxConcurrent?: number;    // 最大并发数 (5-30)
  retryCount?: number;       // 重试次数 (1-10)
  downloadMethod?: 'undici' | 'curl' | 'auto'; // 下载方法
}
```

### 实用方法

#### 显示统计信息
```javascript
parser.showStatistics();
// 输出：
// 📊 解析统计信息
// ================
// 总片段数量: 100
// 总时长: 16:40
// 平均片段时长: 10.00 秒
```

#### 导出链接列表
```javascript
parser.exportLinks('./links.txt');
```

#### 打印所有链接
```javascript
// 简单列表
parser.printAllLinks();

// 详细信息
parser.printAllLinks(true);
```

## 高级用法

### 自定义下载配置
```javascript
const parser = new M3U8Parser();

// 高质量转码配置
const success = await parser.processFileToVideo(
  './video.m3u8',
  './output_hq.mp4',
  './temp',
  {
    keepTempFiles: false,
    videoCodec: 'libx264',      // 重新编码
    audioCodec: 'aac',          // 音频转码
    quality: '18',              // 高质量 (CRF)
    maxConcurrent: 10,          // 保守的并发数
    retryCount: 5
  }
);
```

### 处理加密视频
```javascript
// SDK 会自动检测和处理 AES-128 加密
const success = await parser.processUrlToVideo(
  'https://encrypted-stream.com/video.m3u8',
  './decrypted_video.mp4'
);
// 自动下载密钥并解密片段
```

### 并发下载调优
```javascript
// 高速网络配置
const highSpeedConfig = {
  maxConcurrent: 30,          // 高并发
  retryCount: 3,
  downloadMethod: 'undici'    // 高性能方法
};

// 稳定性优先配置
const stableConfig = {
  maxConcurrent: 8,           // 低并发
  retryCount: 10,
  downloadMethod: 'curl'      // 稳定方法
};
```

## 错误处理

```javascript
try {
  const success = await parser.processUrlToVideo(
    'https://example.com/video.m3u8',
    './output.mp4'
  );

  if (success) {
    console.log('✅ 视频处理成功');
  } else {
    console.log('❌ 视频处理失败');
  }
} catch (error) {
  console.error('处理过程中发生错误:', error.message);
}
```

## 性能优化建议

### 1. 并发数调优
- **高速网络**: `maxConcurrent: 20-30`
- **普通网络**: `maxConcurrent: 10-15`
- **不稳定网络**: `maxConcurrent: 5-10`

### 2. 下载方法选择
- **`auto`**: 自动选择最优方法（推荐）
- **`undici`**: Node.js 原生，高性能
- **`curl`**: 系统工具，稳定性好

### 3. 编码设置
- **快速合并**: `videoCodec: 'copy'`, `audioCodec: 'copy'`
- **质量优化**: `videoCodec: 'libx264'`, `quality: '18-23'`
- **文件大小优化**: `quality: '28-32'`

## 常见问题

### Q: 下载失败率很高怎么办？
A: 尝试降低并发数或更换下载方法：
```javascript
{
  maxConcurrent: 5,
  retryCount: 10,
  downloadMethod: 'curl'
}
```

### Q: 如何处理需要特殊请求头的 M3U8？
A: 目前 SDK 内置了常用的请求头，如需自定义，请提交 Issue。

### Q: 支持哪些视频格式？
A: 支持所有 FFmpeg 支持的格式，输出推荐使用 `.mp4`。

## 许可证

MIT License

---

**注意**: 请确保遵守相关版权法律，仅下载和使用您有权访问的内容。