#!/usr/bin/env node

import M3U8Parser from "../dist/index.mjs";
import process from "process";
import path from "path";
import fs from "fs-extra";

const parser = new M3U8Parser();

// 检查是否为HTTP/HTTPS URL
function isHttpUrl(str = "") {
  return str.includes('http://') || str.includes('https://');
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  let m3u8FilePath = null;
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === "-f" || arg === "--file") {
      // 检查下一个参数是否存在
      if (i + 1 < args.length) {
        m3u8FilePath = args[i + 1];
        i++; // 跳过下一个参数
      } else {
        throw new Error("缺少文件路径参数");
      }
    } else if (arg === "-o" || arg === "--output") {
      // 检查下一个参数是否存在
      if (i + 1 < args.length) {
        outputPath = args[i + 1];
        i++; // 跳过下一个参数
      } else {
        throw new Error("缺少输出路径参数");
      }
    } else if (!m3u8FilePath && !arg.startsWith('-')) {
      // 如果没有指定 -f 参数，第一个非选项参数作为输入
      m3u8FilePath = arg;
    }
  }

  return { m3u8FilePath, outputPath };
}

// 根据输入文件路径计算其他路径
// 根据输入文件路径计算其他路径
async function calculatePaths(m3u8FilePath, userOutputPath) {
  if (!m3u8FilePath) {
    throw new Error(
      "请提供 .m3u8或.txt 后缀的文件路径，或m3u8网络地址，使用 -f /path/to/file.m3u8 或 --file /path/to/file.m3u8"
    );
  }

  const isUrl = isHttpUrl(m3u8FilePath);
  // 只对本地文件检查是否存在
  if (!isUrl && !fs.existsSync(m3u8FilePath)) {
    throw new Error(`文件不存在: ${m3u8FilePath}`);
  }

  let outputPath;
  let tempDir;
  
  // 获取当前工作目录
  const currentDir = process.cwd();

  if (userOutputPath) {
    // 用户指定了输出路径
    outputPath = path.isAbsolute(userOutputPath) 
      ? userOutputPath 
      : path.join(currentDir, userOutputPath);
    
    const outputDir = path.dirname(outputPath);
    // 确保输出目录存在
    await fs.ensureDir(outputDir);
    tempDir = path.join(outputDir, "temp_segments");
  } else {
    // 没有指定输出路径，使用当前工作目录
    let fileName;
    
    if (isUrl) {
      // 从 URL 提取文件名
      try {
        const url = new URL(m3u8FilePath);
        const pathName = url.pathname;
        const baseName = path.basename(pathName, path.extname(pathName));
        fileName = baseName || 'video';
      } catch {
        fileName = 'video';
      }
    } else {
      // 从本地文件路径提取文件名
      fileName = path.basename(m3u8FilePath, path.extname(m3u8FilePath));
    }
    
    // 使用当前工作目录作为输出目录
    outputPath = path.join(currentDir, `${fileName}_merged.mp4`);
    tempDir = path.join(currentDir, "temp_segments");
  }

  // 确保临时目录存在
  await fs.ensureDir(tempDir);

  return {
    m3u8FilePath,
    outputPath,
    tempDir,
    isUrl,
  };
}


async function main() {
  try {
    // 解析命令行参数
    const { m3u8FilePath: inputPath, outputPath: userOutputPath } = parseArgs();

    // 计算路径
    const { m3u8FilePath, outputPath, tempDir, isUrl } = await calculatePaths(
      inputPath,
      userOutputPath
    );

    console.log("📁 处理参数:");
    console.log(`   输入文件: ${m3u8FilePath}`);
    console.log(`   输出文件: ${outputPath}`);
    console.log(`   临时目录: ${tempDir}`);
    console.log(`   输入类型: ${isUrl ? '网络URL' : '本地文件'}`);

    // 开始处理
    console.log("🚀 开始处理 M3U8 文件...");
    
    if (isUrl) {
      // 处理网络URL
      await parser.processUrlToVideo(m3u8FilePath, outputPath, tempDir, {
        keepTempFiles: false,
        videoCodec: "copy",
        audioCodec: "copy",
        maxConcurrent: 20,
        retryCount: 5,
        // quality: "23",
        // downloadMethod: "undici",
      });
    } else {
      // 处理本地文件
      await parser.processFileToVideo(m3u8FilePath, outputPath, tempDir, {
        keepTempFiles: false,
        videoCodec: "copy",
        audioCodec: "copy",
        maxConcurrent: 20,
        retryCount: 5,
        // quality: "23",
        // downloadMethod: "undici",
      });
    }

    console.log("✅ 处理完成!");
  } catch (error) {
    console.error("❌ 错误:", error.message);
    process.exit(1);
  }
}

main();
