#!/usr/bin/env node

import M3U8Parser from "../dist/index.mjs";
import process from "process";
import path from "path";
import fs from "fs-extra";

const parser = new M3U8Parser();

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  let m3u8FilePath = null;

  for (const arg of args) {
    if (arg.startsWith("-f=") || arg.startsWith("--file=")) {
      m3u8FilePath = arg.split("=")[1];
      break;
    }
  }

  return { m3u8FilePath };
}

// 根据输入文件路径计算其他路径
async function calculatePaths(m3u8FilePath) {
  if (!m3u8FilePath) {
    throw new Error(
      "请提供 .m3u8或.txt 后缀的文件路径，使用 -f=/path/to/file.m3u8 或 --file=/path/to/file.m3u8"
    );
  }

  if (!fs.existsSync(m3u8FilePath)) {
    throw new Error(`文件不存在: ${m3u8FilePath}`);
  }

  // 获取文件所在目录作为 outputPath
  const outputPath = path.dirname(m3u8FilePath);

  // 在同一目录下创建 temp_segments 文件夹作为 tempDir
  const tempDir = path.join(outputPath, "temp_segments");

  // 输出视频文件路径（在同一目录下，使用原文件名但改为 .mp4 扩展名）
  const fileName = path.basename(m3u8FilePath, path.extname(m3u8FilePath));
  const mergedVideoPath = path.join(outputPath, `${fileName}_merged.mp4`);

  return {
    m3u8FilePath,
    outputPath: mergedVideoPath,
    tempDir,
  };
}

async function main() {
  try {
    // 解析命令行参数
    const { m3u8FilePath: inputPath } = parseArgs();

    // 计算路径
    const { m3u8FilePath, outputPath, tempDir } = await calculatePaths(
      inputPath
    );

    console.log("📁 处理参数:");
    console.log(`   输入文件: ${m3u8FilePath}`);
    console.log(`   输出文件: ${outputPath}`);
    console.log(`   临时目录: ${tempDir}`);
    console.log("");

    // 开始处理
    console.log("🚀 开始处理 M3U8 文件...");
    await parser.processFileToVideo(m3u8FilePath, outputPath, tempDir, {
      keepTempFiles: false,
      videoCodec: "copy",
      audioCodec: "copy",
      maxConcurrent: 20,
      retryCount: 5,
      // quality: "23",
      // downloadMethod: "undici",
    });

    console.log("✅ 处理完成!");
  } catch (error) {
    console.error("❌ 错误:", error.message);
    process.exit(1);
  }
}

main();
