import spawn from "cross-spawn";
import fs, { createWriteStream } from "fs-extra";
import path from "path";
import pLimit from "p-limit";
import { request } from "undici";
import { pipeline } from "stream/promises";

export interface M3U8Link {
  index: number;
  url: string;
  duration: number;
}

export interface MergeOptions {
  outputPath: string;
  tempDir: string;
  keepTempFiles: boolean;
  videoCodec?: string;
  audioCodec?: string;
  quality?: string;
  maxConcurrent?: number;
  retryCount?: number;
  downloadMethod?: 'undici' | 'curl' | 'auto';
}

export interface DownloadResult {
  index: number;
  success: boolean;
  fileName: string;
  error?: string;
  bytesDownloaded?: number;
  duration?: number;
}

export default class M3U8Parser {
  links: M3U8Link[];
  totalDuration: number;
  private downloadMethod: 'undici' | 'curl' = 'undici';

  constructor() {
    this.links = [];
    this.totalDuration = 0;
  }

  // 解析 M3U8 内容并提取链接
  parseM3U8Content(content: string): M3U8Link[] {
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line);
    let currentDuration = 0;

    console.log("🎬 开始解析 M3U8 文件...\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith("#EXTINF:")) {
        const durationMatch = line.match(/#EXTINF:([\d.]+)/);
        if (durationMatch) {
          currentDuration = parseFloat(durationMatch[1]);
        }
      } else if (!line.startsWith("#") && line.includes("http")) {
        this.links.push({
          index: this.links.length + 1,
          url: line,
          duration: currentDuration,
        });
        this.totalDuration += currentDuration;
        currentDuration = 0;
      }
    }

    return this.links;
  }

  parseFromFile(filePath: string): M3U8Link[] {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      return this.parseM3U8Content(content);
    } catch (error: any) {
      console.error(`❌ 读取文件失败: ${error.message}`);
      return [];
    }
  }

  parseFromString(m3u8Content: string): M3U8Link[] {
    return this.parseM3U8Content(m3u8Content);
  }

  showStatistics(): void {
    console.log("📊 解析统计信息");
    console.log("================");
    console.log(`总片段数量: ${this.links.length}`);
    console.log(`总时长: ${this.formatDuration(this.totalDuration)}`);
    console.log(
      `平均片段时长: ${(this.totalDuration / this.links.length).toFixed(2)} 秒`
    );
    console.log("");
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, "0")}`;
    }
  }

  exportLinks(outputPath: string): void {
    try {
      let content = "";
      content = this.links.map((link) => link.url).join("\n");
      fs.writeFileSync(outputPath, content, "utf8");
      console.log(`✅ 链接已导出到: ${outputPath}`);
    } catch (error: any) {
      console.error(`❌ 导出失败: ${error.message}`);
    }
  }

  printAllLinks(showDetails: boolean = false): void {
    console.log("🔗 提取到的视频片段链接");
    console.log("==========================");

    this.links.forEach((link, index) => {
      if (showDetails) {
        console.log(`[${link.index}] 时长: ${link.duration}s`);
        console.log(`URL: ${link.url}`);
        console.log("---");
      } else {
        console.log(link.url);
      }
    });
  }

  private checkFFmpeg(): boolean {
    try {
      const result = spawn.sync("ffmpeg", ["-version"], { encoding: "utf8" });
      if (result.status === 0) {
        console.log("✅ FFmpeg 可用");
        return true;
      } else {
        console.error("❌ FFmpeg 不可用，请安装 FFmpeg");
        return false;
      }
    } catch (error) {
      console.error("❌ FFmpeg 不可用，请安装 FFmpeg");
      return false;
    }
  }

  private createFileList(
    tempDir: string,
    downloadResults: DownloadResult[]
  ): string {
    const fileListPath = path.join(tempDir, "filelist.txt");
    let fileListContent = "";

    const sortedResults = downloadResults
      .filter((result) => result.success)
      .sort((a, b) => a.index - b.index);

    sortedResults.forEach((result) => {
      fileListContent += `file '${result.fileName}'\n`;
    });

    fs.writeFileSync(fileListPath, fileListContent, "utf8");
    console.log(
      `📝 文件列表已创建: ${fileListPath} (${sortedResults.length} 个文件)`
    );
    return fileListPath;
  }

  // 使用 undici 的高性能下载
  private async downloadWithUndici(
    link: M3U8Link,
    index: number,
    tempDir: string,
    retryCount: number = 3
  ): Promise<DownloadResult> {
    const fileName = `segment_${index.toString().padStart(6, "0")}.ts`;
    const outputPath = path.join(tempDir, fileName);
    const startTime = Date.now();

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const { statusCode, body } = await request(link.url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          headersTimeout: 30000,
          bodyTimeout: 120000,
        });

        if (statusCode === 200) {
          const writeStream = createWriteStream(outputPath);
          await pipeline(body, writeStream);
          
          const stats = fs.statSync(outputPath);
          if (stats.size > 0) {
            const duration = Date.now() - startTime;
            return {
              index,
              success: true,
              fileName,
              bytesDownloaded: stats.size,
              duration
            };
          }
        }

        throw new Error(`HTTP ${statusCode}`);
        
      } catch (error: any) {
        // 清理失败文件
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        } catch {}

        if (attempt === retryCount) {
          const duration = Date.now() - startTime;
          return {
            index,
            success: false,
            fileName,
            error: `undici下载失败: ${error.message}`,
            duration
          };
        }

        // 指数退避重试
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return { 
      index, 
      success: false, 
      fileName, 
      error: '未知错误',
      duration: Date.now() - startTime 
    };
  }

  // 使用 curl 的稳定下载
  private downloadWithCurl(
    link: M3U8Link,
    index: number,
    tempDir: string,
    retryCount: number = 3
  ): Promise<DownloadResult> {
    return new Promise((resolve) => {
      const fileName = `segment_${index.toString().padStart(6, "0")}.ts`;
      const outputPath = path.join(tempDir, fileName);
      const startTime = Date.now();

      const tryDownload = (attempt: number) => {
        // 优化的 curl 参数
        const curlArgs = [
          "-L", // 跟随重定向
          "-o", outputPath,
          "--connect-timeout", "10",    // 减少连接超时
          "--max-time", "120",          // 减少最大超时
          "--retry", "0",               // 禁用curl内建重试，由我们控制
          "--speed-time", "30",         // 30秒内速度检查
          "--speed-limit", "512",       // 最小速度 512B/s
          "--compressed",               // 支持压缩
          "--tcp-nodelay",              // 减少延迟
          "--keepalive-time", "60",     // 保持连接
          "--location",                 // 跟随重定向
          "--fail",                     // HTTP错误时失败
          "--silent",
          "--show-error",
          "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "--header", "Accept: */*",
          "--header", "Accept-Language: en-US,en;q=0.9",
          "--header", "Accept-Encoding: gzip, deflate, br",
          "--header", "Connection: keep-alive",
          "--header", "Cache-Control: no-cache",
          link.url
        ];

        let downloadAborted = false;
        const timeout = setTimeout(() => {
          downloadAborted = true;
          downloadProcess.kill('SIGTERM');
        }, 120000); // 2分钟超时

        const downloadProcess = spawn("curl", curlArgs, { 
          encoding: "utf8",
          stdio: ['ignore', 'pipe', 'pipe']
        });

        downloadProcess.on("close", (code) => {
          clearTimeout(timeout);
          const duration = Date.now() - startTime;

          if (!downloadAborted && code === 0 && fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            if (stats.size > 0) {
              resolve({
                index,
                success: true,
                fileName,
                bytesDownloaded: stats.size,
                duration
              });
              return;
            }
          }

          // 清理失败的文件
          try {
            if (fs.existsSync(outputPath)) {
              fs.unlinkSync(outputPath);
            }
          } catch {}

          if (attempt < retryCount) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            setTimeout(() => tryDownload(attempt + 1), delay);
          } else {
            resolve({
              index,
              success: false,
              fileName,
              error: `curl下载失败 (code: ${code}, 耗时: ${duration}ms)`,
              duration
            });
          }
        });

        downloadProcess.on("error", (error) => {
          clearTimeout(timeout);
          const duration = Date.now() - startTime;
          
          if (attempt < retryCount) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            setTimeout(() => tryDownload(attempt + 1), delay);
          } else {
            resolve({
              index,
              success: false,
              fileName,
              error: `curl进程错误: ${error.message}`,
              duration
            });
          }
        });
      };

      tryDownload(1);
    });
  }

  // 自适应选择最优下载方法
  private async selectOptimalDownloadMethod(tempDir: string): Promise<'undici' | 'curl'> {
    if (this.links.length === 0) return 'undici';

    const testCount = Math.min(3, this.links.length);
    const testLinks = this.links.slice(0, testCount);
    
    console.log('🧪 正在测试最优下载方法...');
    
    // 测试 undici
    const undiciStart = Date.now();
    let undiciSuccess = 0;
    
    try {
      const undiciPromises = testLinks.map((link, i) => 
        this.downloadWithUndici(link, i, tempDir, 1)
      );
      const undiciResults = await Promise.allSettled(undiciPromises);
      undiciSuccess = undiciResults.filter(r => 
        r.status === 'fulfilled' && r.value.success
      ).length;
    } catch {}
    
    const undiciTime = Date.now() - undiciStart;
    
    // 清理测试文件
    try {
      for (let i = 0; i < testCount; i++) {
        const testFile = path.join(tempDir, `segment_${i.toString().padStart(6, "0")}.ts`);
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
      }
    } catch {}

    // 基于测试结果选择方法
    const undiciSuccessRate = undiciSuccess / testCount;
    
    if (undiciSuccessRate >= 0.8 && undiciTime < 15000) {
      console.log('✅ 选择 undici 方法 (高性能)');
      return 'undici';
    } else {
      console.log('✅ 选择 curl 方法 (稳定性优先)');
      return 'curl';
    }
  }

  // 智能选择下载方法
  private downloadSingleSegment(
    link: M3U8Link,
    index: number,
    tempDir: string,
    retryCount: number = 3
  ): Promise<DownloadResult> {
    if (this.downloadMethod === 'undici') {
      return this.downloadWithUndici(link, index, tempDir, retryCount);
    } else {
      return this.downloadWithCurl(link, index, tempDir, retryCount);
    }
  }

  // 动态调整并发数
  private adjustConcurrency(
    successRate: number, 
    avgSpeed: number, 
    currentConcurrency: number
  ): number {
    if (successRate > 0.95 && avgSpeed > 2) {
      return Math.min(currentConcurrency + 3, 30);
    } else if (successRate < 0.8 || avgSpeed < 0.5) {
      return Math.max(currentConcurrency - 2, 5);
    }
    return currentConcurrency;
  }

  // 优化的并行下载 
  async downloadSegmentsConcurrent(
    tempDir: string,
    maxConcurrent: number = 20,
    retryCount: number = 3,
    downloadMethod: 'undici' | 'curl' | 'auto' = 'auto'
  ): Promise<DownloadResult[]> {
    fs.ensureDirSync(tempDir);

    // 自动选择下载方法
    if (downloadMethod === 'auto') {
      this.downloadMethod = await this.selectOptimalDownloadMethod(tempDir);
    } else {
      this.downloadMethod = downloadMethod;
    }

    console.log(`📥 开始高速并行下载 (方法: ${this.downloadMethod}, 并发数: ${maxConcurrent})...`);

    const limit = pLimit(maxConcurrent);
    const results: DownloadResult[] = [];
    let completed = 0;
    let successCount = 0;
    let failCount = 0;
    let totalBytes = 0;
    let currentConcurrency = maxConcurrent;

    const startTime = Date.now();
    
    // 实时进度和性能监控
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const percent = ((completed / this.links.length) * 100).toFixed(1);
      const speed = completed / elapsed || 0;
      const eta = speed > 0 ? Math.floor((this.links.length - completed) / speed) : 0;
      const successRate = completed > 0 ? successCount / completed : 0;
      const mbDownloaded = (totalBytes / 1024 / 1024).toFixed(1);
      
      console.log(
        `📊 进度: ${completed}/${this.links.length} (${percent}%) | 成功率: ${(successRate * 100).toFixed(1)}% | 速度: ${speed.toFixed(1)}/s | 已下载: ${mbDownloaded}MB | ETA: ${eta}s`
      );

      // 动态调整并发数
      const newConcurrency = this.adjustConcurrency(successRate, speed, currentConcurrency);
      if (newConcurrency !== currentConcurrency) {
        currentConcurrency = newConcurrency;
        console.log(`🔄 调整并发数为: ${currentConcurrency}`);
        limit.concurrency = currentConcurrency;
      }
    }, 3000);

    try {
      // 使用 Promise.allSettled 避免单个失败影响全部
      const downloadPromises = this.links.map((link, index) =>
        limit(() => this.downloadSingleSegment(link, index, tempDir, retryCount))
          .then(result => {
            completed++;
            if (result.success) {
              successCount++;
              if (result.bytesDownloaded) {
                totalBytes += result.bytesDownloaded;
              }
            } else {
              failCount++;
              // 失败时降低并发数 
              if (failCount % 5 === 0 && currentConcurrency > 5) {
                currentConcurrency = Math.max(currentConcurrency - 2, 5);
                limit.concurrency = currentConcurrency;
                console.log(`⚠️ 检测到连续失败，降低并发数为: ${currentConcurrency}`);
              }
            }
            return result;
          })
          .catch(error => ({
            index,
            success: false,
            fileName: `segment_${index.toString().padStart(6, "0")}.ts`,
            error: error.message,
            duration: 0
          }))
      );

      const allResults = await Promise.allSettled(downloadPromises);
      
      allResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            index,
            success: false,
            fileName: `segment_${index.toString().padStart(6, "0")}.ts`,
            error: result.reason?.message || '未知错误'
          });
        }
      });

    } finally {
      clearInterval(progressInterval);
    }

    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    const finalSuccessRate = (successCount / this.links.length * 100).toFixed(1);
    const avgSpeed = (successCount / totalTime).toFixed(1);
    const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
    
    console.log(`\n📊 下载完成! 成功: ${successCount}, 失败: ${failCount}, 总耗时: ${totalTime}s`);
    console.log(`📈 成功率: ${finalSuccessRate}%, 平均速度: ${avgSpeed}/s, 总下载: ${totalMB}MB`);
    
    // 如果失败率过高，提供建议
    if (parseFloat(finalSuccessRate) < 90) {
      console.log(`💡 建议: 失败率较高，可尝试降低并发数或更换下载方法`);
    }
    
    return results;
  }

  async mergeVideos(options: MergeOptions): Promise<boolean> {
    if (!this.checkFFmpeg()) {
      return false;
    }

    if (this.links.length === 0) {
      console.error("❌ 没有可合并的视频片段");
      return false;
    }

    try {
      console.log("🔄 开始合并视频片段...");
      fs.ensureDirSync(options.tempDir);

      console.log("步骤 1: 并行下载视频片段");
      const downloadResults = await this.downloadSegmentsConcurrent(
        options.tempDir,
        options.maxConcurrent || 20,
        options.retryCount || 3,
        options.downloadMethod || 'auto'
      );

      const successfulDownloads = downloadResults.filter((r) => r.success);
      if (successfulDownloads.length === 0) {
        console.error("❌ 没有成功下载的片段");
        return false;
      }

      if (successfulDownloads.length < downloadResults.length) {
        console.warn(
          `⚠️ 警告: ${
            downloadResults.length - successfulDownloads.length
          } 个片段下载失败，将跳过这些片段`
        );
      }

      console.log("步骤 2: 创建文件列表");
      const fileListPath = this.createFileList(options.tempDir, downloadResults);

      console.log("步骤 3: 合并视频文件");
      const ffmpegArgs = ["-f", "concat", "-safe", "0", "-i", fileListPath];

      if (options.videoCodec === "copy" && options.audioCodec === "copy") {
        ffmpegArgs.push("-c", "copy");
      } else {
        if (options.videoCodec) {
          ffmpegArgs.push("-c:v", options.videoCodec);
        }
        if (options.audioCodec) {
          ffmpegArgs.push("-c:a", options.audioCodec);
        }
        if (options.quality) {
          ffmpegArgs.push("-crf", options.quality);
        }
      }

      ffmpegArgs.push("-y");
      ffmpegArgs.push(options.outputPath);

      console.log("🚀 执行 FFmpeg 命令:", `ffmpeg ${ffmpegArgs.join(" ")}`);

      const ffmpegResult = spawn.sync("ffmpeg", ffmpegArgs, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        cwd: options.tempDir,
      });

      if (ffmpegResult.status === 0) {
        console.log("✅ 视频合并成功!");
        console.log(`📹 输出文件: ${options.outputPath}`);

        if (fs.existsSync(options.outputPath)) {
          const stats = fs.statSync(options.outputPath);
          console.log(
            `📊 文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
          );
        }

        if (!options.keepTempFiles) {
          console.log("🧹 清理临时文件...");
          fs.removeSync(options.tempDir);
        }

        return true;
      } else {
        console.error("❌ FFmpeg 执行失败");
        console.error("错误输出:", ffmpegResult.stderr);
        return false;
      }
    } catch (error: any) {
      console.error(`❌ 合并过程发生错误: ${error.message}`);
      return false;
    }
  }

  async processM3U8ToVideo(
    outputPath: string,
    tempDir: string = "./temp_segments",
    options: Partial<MergeOptions> = {}
  ): Promise<boolean> {
    const mergeOptions: MergeOptions = {
      outputPath,
      tempDir,
      keepTempFiles: false,
      videoCodec: "copy",
      audioCodec: "copy",
      maxConcurrent: 20,  // 提高默认并发数
      retryCount: 3,
      downloadMethod: 'auto',  // 自动选择最优方法
      ...options,
    };

    return this.mergeVideos(mergeOptions);
  }

  async processFileToVideo(
    m3u8FilePath: string,
    outputPath: string,
    tempDir: string = "./temp_segments",
    options: Partial<MergeOptions> = {}
  ): Promise<boolean> {
    let m3u8Content: string;
    try {
      m3u8Content = fs.readFileSync(m3u8FilePath, "utf8");
    } catch (e: any) {
      console.error(`❌ 读取 m3u8 文件失败: ${e.message}`);
      return false;
    }

    const links = this.parseFromString(m3u8Content);
    if (links.length === 0) {
      console.error("❌ 没有找到任何链接");
      return false;
    }

    this.showStatistics();
    fs.ensureDirSync(path.dirname(outputPath));

    const success = await this.processM3U8ToVideo(outputPath, tempDir, options);

    if (success) {
      console.log("\n🎉 视频处理完成！");
    } else {
      console.log("\n😞 视频处理失败");
    }
    return success;
  }
}
