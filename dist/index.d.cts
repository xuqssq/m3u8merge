interface M3U8Link {
    index: number;
    url: string;
    duration: number;
}
interface EncryptionInfo {
    method: string;
    keyUrl?: string;
    iv?: string;
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
    downloadMethod?: "undici" | "curl" | "auto";
}
interface DownloadResult {
    index: number;
    success: boolean;
    fileName: string;
    error?: string;
    bytesDownloaded?: number;
    duration?: number;
}
declare class M3U8Parser {
    links: M3U8Link[];
    totalDuration: number;
    private downloadMethod;
    private encryptionInfo?;
    constructor();
    parseM3U8Content(content: string): M3U8Link[];
    private parseEncryptionInfo;
    private downloadDecryptionKey;
    private decryptTSData;
    parseFromFile(filePath: string): M3U8Link[];
    parseFromString(m3u8Content: string): M3U8Link[];
    showStatistics(): void;
    formatDuration(seconds: number): string;
    exportLinks(outputPath: string): void;
    printAllLinks(showDetails?: boolean): void;
    private checkFFmpeg;
    private createFileList;
    private downloadWithUndici;
    private downloadWithCurl;
    private selectOptimalDownloadMethod;
    private downloadSingleSegment;
    private adjustConcurrency;
    downloadSegmentsConcurrent(tempDir: string, maxConcurrent?: number, retryCount?: number, downloadMethod?: "undici" | "curl" | "auto"): Promise<DownloadResult[]>;
    mergeVideos(options: MergeOptions): Promise<boolean>;
    processM3U8ToVideo(outputPath: string, tempDir?: string, options?: Partial<MergeOptions>): Promise<boolean>;
    processFileToVideo(m3u8FilePath: string, outputPath: string, tempDir?: string, options?: Partial<MergeOptions>): Promise<boolean>;
    processUrlToVideo(m3u8Url: string, outputPath: string, tempDir?: string, options?: Partial<MergeOptions>): Promise<boolean>;
}

export { M3U8Parser as default };
export type { DownloadResult, EncryptionInfo, M3U8Link, MergeOptions };
