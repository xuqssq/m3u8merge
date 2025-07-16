interface M3U8Link {
    index: number;
    url: string;
    duration: number;
}
interface MergeOptions {
    outputPath: string;
    tempDir: string;
    keepTempFiles: boolean;
    videoCodec?: string;
    audioCodec?: string;
    quality?: string;
    maxConcurrent?: number;
    retryCount?: number;
}
interface DownloadResult {
    index: number;
    success: boolean;
    fileName: string;
    error?: string;
}
declare class M3U8Parser {
    links: M3U8Link[];
    totalDuration: number;
    constructor();
    parseM3U8Content(content: string): M3U8Link[];
    parseFromFile(filePath: string): M3U8Link[];
    parseFromString(m3u8Content: string): M3U8Link[];
    showStatistics(): void;
    formatDuration(seconds: number): string;
    exportLinks(outputPath: string): void;
    printAllLinks(showDetails?: boolean): void;
    private checkFFmpeg;
    private createFileList;
    private downloadSingleSegment;
    downloadSegmentsConcurrent(tempDir: string, maxConcurrent?: number, retryCount?: number): Promise<DownloadResult[]>;
    mergeVideos(options: MergeOptions): Promise<boolean>;
    processM3U8ToVideo(outputPath: string, tempDir?: string, options?: Partial<MergeOptions>): Promise<boolean>;
    /**
     * 从 m3u8 文件路径直接处理为视频
     */
    processFileToVideo(m3u8FilePath: string, outputPath: string, tempDir?: string, options?: Partial<MergeOptions>): Promise<boolean>;
}

export { M3U8Parser as default };
export type { DownloadResult, M3U8Link, MergeOptions };
