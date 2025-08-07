import express from "express";
import cors from "cors";
import multer from "multer";
import M3U8Parser from "../dist/index.mjs";
import path from "path";
import fs from "fs-extra";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 配置文件上传
const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/x-mpegURL" ||
      file.originalname.endsWith(".m3u8") ||
      file.originalname.endsWith(".txt")
    ) {
      cb(null, true);
    } else {
      cb(new Error("只支持 .m3u8 或 .txt 文件"), false);
    }
  },
});

// 存储任务状态
const tasks = new Map();

// 工具函数
function isHttpUrl(str = "") {
  return str.includes("http://") || str.includes("https://");
}

function generateTaskId() {
  return uuidv4();
}

function updateTaskStatus(
  taskId,
  status,
  progress = 0,
  message = "",
  error = null
) {
  const task = tasks.get(taskId);
  if (task) {
    task.status = status;
    task.progress = progress;
    task.message = message;
    task.updatedAt = new Date();
    if (error) {
      task.error = error;
    }
  }
}

// API 路由

// 1. 健康检查
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// 2. 从 URL 处理 M3U8
app.post("/api/process-url", async (req, res) => {
  try {
    const { m3u8Url, outputFileName, options = {} } = req.body;

    if (!m3u8Url) {
      return res.status(400).json({
        error: "缺少必需参数 m3u8Url",
      });
    }

    if (!isHttpUrl(m3u8Url)) {
      return res.status(400).json({
        error: "URL 格式无效，必须是 HTTP 或 HTTPS 地址",
      });
    }

    const taskId = generateTaskId();
    const fileName = outputFileName || `video_${taskId}`;
    const outputPath = path.join(process.cwd(), "output", `${fileName}.mp4`);
    const tempDir = path.join(process.cwd(), "temp", taskId);

    // 创建任务记录
    tasks.set(taskId, {
      id: taskId,
      type: "url",
      input: m3u8Url,
      output: outputPath,
      status: "pending",
      progress: 0,
      message: "任务已创建",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 异步处理
    processUrlAsync(taskId, m3u8Url, outputPath, tempDir, options);

    res.json({
      success: true,
      taskId,
      message: "任务已创建，开始处理中...",
      statusUrl: `/api/task/${taskId}`,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// 3. 从文件处理 M3U8
app.post("/api/process-file", upload.single("m3u8File"), async (req, res) => {
  try {
    const { outputFileName, options: optionsStr = "{}" } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: "缺少 M3U8 文件",
      });
    }

    let options;
    try {
      options = JSON.parse(optionsStr);
    } catch {
      options = {};
    }

    const taskId = generateTaskId();
    const fileName = outputFileName || `video_${taskId}`;
    const outputPath = path.join(process.cwd(), "output", `${fileName}.mp4`);
    const tempDir = path.join(process.cwd(), "temp", taskId);

    // 创建任务记录
    tasks.set(taskId, {
      id: taskId,
      type: "file",
      input: file.originalname,
      output: outputPath,
      status: "pending",
      progress: 0,
      message: "任务已创建",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 异步处理
    processFileAsync(taskId, file.path, outputPath, tempDir, options);

    res.json({
      success: true,
      taskId,
      message: "任务已创建，开始处理中...",
      statusUrl: `/api/task/${taskId}`,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// 4. 查询任务状态
app.get("/api/task/:taskId", (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);

  if (!task) {
    return res.status(404).json({
      error: "任务不存在",
    });
  }

  res.json(task);
});

// 5. 获取所有任务列表
app.get("/api/tasks", (req, res) => {
  const { status, limit = 50 } = req.query;
  let allTasks = Array.from(tasks.values());

  if (status) {
    allTasks = allTasks.filter((task) => task.status === status);
  }

  allTasks = allTasks
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, parseInt(limit));

  res.json({
    tasks: allTasks,
    total: allTasks.length,
  });
});

// 6. 下载处理完成的视频
app.get("/api/download/:taskId", (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);

  if (!task) {
    return res.status(404).json({
      error: "任务不存在",
    });
  }

  if (task.status !== "completed") {
    return res.status(400).json({
      error: "任务尚未完成",
    });
  }

  if (!fs.existsSync(task.output)) {
    return res.status(404).json({
      error: "输出文件不存在",
    });
  }

  const fileName = path.basename(task.output);
  res.download(task.output, fileName);
});

// 7. 删除任务
app.delete("/api/task/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);

  if (!task) {
    return res.status(404).json({
      error: "任务不存在",
    });
  }

  try {
    // 清理文件
    if (fs.existsSync(task.output)) {
      await fs.remove(task.output);
    }

    const tempDir = path.join(process.cwd(), "temp", taskId);
    if (fs.existsSync(tempDir)) {
      await fs.remove(tempDir);
    }

    // 删除任务记录
    tasks.delete(taskId);

    res.json({
      success: true,
      message: "任务已删除",
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// 异步处理函数
async function processUrlAsync(taskId, m3u8Url, outputPath, tempDir, options) {
  const parser = new M3U8Parser();

  try {
    updateTaskStatus(taskId, "processing", 0, "开始处理 URL...");

    const defaultOptions = {
      keepTempFiles: false,
      videoCodec: "copy",
      audioCodec: "copy",
      maxConcurrent: 20,
      retryCount: 5,
      ...options,
      // 添加进度回调
      progressCallback: (progress) => {
        const progressPercent = Math.round(progress.percent);
        const message = `下载进度: ${progress.completed}/${progress.total} (${progressPercent}%) | 成功率: ${(progress.successRate * 100).toFixed(1)}% | 速度: ${progress.speed.toFixed(1)}/s`;
        updateTaskStatus(taskId, "processing", progressPercent, message);
      }
    };

    const success = await parser.processUrlToVideo(
      m3u8Url,
      outputPath,
      tempDir,
      defaultOptions
    );

    if (success) {
      updateTaskStatus(taskId, "completed", 100, "处理完成");
    } else {
      updateTaskStatus(taskId, "failed", 0, "处理失败", "未知错误");
    }
  } catch (error) {
    console.error(`Task ${taskId} failed:`, error);
    updateTaskStatus(taskId, "failed", 0, "处理失败", error.message);
  }
}

async function processFileAsync(
  taskId,
  filePath,
  outputPath,
  tempDir,
  options
) {
  const parser = new M3U8Parser();

  try {
    updateTaskStatus(taskId, "processing", 0, "开始处理文件...");

    const defaultOptions = {
      keepTempFiles: false,
      videoCodec: "copy",
      audioCodec: "copy",
      maxConcurrent: 20,
      retryCount: 5,
      ...options,
      // 添加进度回调
      progressCallback: (progress) => {
        const progressPercent = Math.round(progress.percent);
        const message = `下载进度: ${progress.completed}/${progress.total} (${progressPercent}%) | 成功率: ${(progress.successRate * 100).toFixed(1)}% | 速度: ${progress.speed.toFixed(1)}/s`;
        updateTaskStatus(taskId, "processing", progressPercent, message);
      }
    };

    const success = await parser.processFileToVideo(
      filePath,
      outputPath,
      tempDir,
      defaultOptions
    );

    if (success) {
      updateTaskStatus(taskId, "completed", 100, "处理完成");
    } else {
      updateTaskStatus(taskId, "failed", 0, "处理失败", "未知错误");
    }

    // 清理上传的临时文件
    if (fs.existsSync(filePath)) {
      await fs.remove(filePath);
    }
  } catch (error) {
    console.error(`Task ${taskId} failed:`, error);
    updateTaskStatus(taskId, "failed", 0, "处理失败", error.message);
  }
}

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error("API Error:", error);
  res.status(500).json({
    error: error.message || "服务器内部错误",
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    error: "接口不存在",
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 M3U8 合并 API 服务器已启动`);
  console.log(`📡 监听端口: ${PORT}`);
  console.log(`🌐 API 文档: http://localhost:${PORT}/health`);

  // 确保必要的目录存在
  fs.ensureDirSync("uploads");
  fs.ensureDirSync("output");
  fs.ensureDirSync("temp");
});

export default app;
