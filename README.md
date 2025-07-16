# get_video.mjs 使用说明

## 简介

`get_video.mjs` 是一个用于处理 `.m3u8` 视频流文件并合并为 `.mp4` 文件的 Node.js 脚本。它会自动下载分片、合并视频，并支持多线程下载和错误重试。

## 依赖

- Node.js (建议 v14+)
- `fs-extra`
- `process`
- `path`
- `M3U8Parser`（自定义模块，位于 `../dist/index.mjs`）

## 用法

```bash
node scripts/get_video.mjs -f=/path/to/your/file.m3u8
# 或
node scripts/get_video.mjs --file=/path/to/your/file.m3u8
```

## 参数说明

- `-f` 或 `--file`：指定需要处理的 `.m3u8` 或 `.txt` 文件路径。

## 工作流程

1. **解析命令行参数**  
   通过 `-f` 或 `--file` 获取输入的 m3u8 文件路径。

2. **路径计算**  
   - 输出文件：与输入文件同目录，文件名为 `<原文件名>_merged.mp4`。
   - 临时目录：同目录下的 `temp_segments` 文件夹，用于存放下载的分片。

3. **处理流程**  
   - 调用 `M3U8Parser.processFileToVideo` 方法，下载并合并视频分片。
   - 支持多线程下载（默认 20），失败自动重试（默认 5 次）。
   - 下载完成后自动清理临时分片文件。

## 主要配置项

在 `processFileToVideo` 调用中可配置：

- `keepTempFiles`：是否保留临时分片文件（默认 `false`）。
- `videoCodec`：视频编码方式（默认 `copy`，即不转码）。
- `audioCodec`：音频编码方式（默认 `copy`）。
- `maxConcurrent`：最大并发下载数（默认 `20`）。
- `retryCount`：下载失败重试次数（默认 `5`）。
- `quality`：可选，视频质量参数。

## 输出示例

```
<code_block_to_apply_changes_from>
```

## 错误处理

- 如果未指定文件路径或文件不存在，会输出错误信息并退出。

## 代码结构简述

- `parseArgs()`：解析命令行参数。
- `calculatePaths()`：根据输入文件路径计算输出路径和临时目录。
- `main()`：主流程，串联参数解析、路径计算和视频处理。

---

如需进一步自定义或集成到其他流程，可根据实际需求修改脚本参数或 `M3U8Parser` 的实现。
