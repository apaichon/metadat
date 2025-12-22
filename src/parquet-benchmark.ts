// Parquet vs MetaDat Performance Benchmark
// Comprehensive comparison of Parquet and MetaDat formats

import { spawn } from 'child_process';
import { readFile, writeFile, stat, access } from 'fs/promises';
import { join, resolve } from 'path';
import { generateTestData } from './data-generator.ts';
import { jsonToParquet, benchmarkParquetRead, ParquetConversionResult, ParquetReadResult, parquetConverter } from './parquet-converter.ts';

interface ParquetBenchmarkConfig {
  testSizes: number[];
  dataTypes: string[];
  iterations: number;
  outputDir: string;
}

interface BenchmarkResult {
  format: string;
  operation: string;
  dataType: string;
  recordCount: number;
  iteration: number;
  executionTimeMs: number;
  fileSizeBytes: number;
  compressionRatio?: number;
  memoryUsageBytes?: number;
  success: boolean;
  error?: string;
}

interface ComparisonSummary {
  dataType: string;
  recordCount: number;
  formats: {
    json: {
      size: number;
      readTime: number;
    };
    parquet: {
      size: number;
      readTime: number;
      compressionVsJson: number;
      conversionFromJsonTime: number;
    };
    metadat: {
      size: number;
      readTime: number;
      compressionVsJson: number;
      conversionFromJsonTime: number;
    };
  };
  winner: {
    smallestFile: string;
    fastestRead: string;
    fastestConversion: string;
    bestCompression: string;
  };
}

class ParquetMetaDatBenchmark {
  private config: ParquetBenchmarkConfig;
  private results: BenchmarkResult[] = [];
  
  constructor(config: Partial<ParquetBenchmarkConfig> = {}) {
    this.config = {
      testSizes: config.testSizes || [100, 1000, 5000, 10000],
      dataTypes: config.dataTypes || ['users', 'products'],
      iterations: config.iterations || 3,
      outputDir: config.outputDir || './benchmark-results',
      ...config
    };
  }
  
  private async executeCommand(command: string, args: string[], cwd: string = './'): Promise<{
    stdout: string;
    stderr: string;
    executionTime: number;
    success: boolean;
  }> {
    return new Promise((promiseResolve) => {
      const startTime = performance.now();
      
      const process = spawn(command, args, {
        cwd: resolve(cwd),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        const executionTime = performance.now() - startTime;
        promiseResolve({
          stdout,
          stderr,
          executionTime,
          success: code === 0
        });
      });
    });
  }
  
  private async checkParquetJsDependencies(): Promise<boolean> {
    try {
      // Test if parquetjs can be imported
      const { ParquetWriter } = await import('parquetjs');
      return !!ParquetWriter;
    } catch {
      console.error('parquetjs library not found. Please install: yarn add parquetjs');
      return false;
    }
  }
  
  private async benchmarkParquetConversion(
    jsonFile: string,
    parquetFile: string,
    operation: string,
    dataType: string,
    recordCount: number,
    iteration: number
  ): Promise<BenchmarkResult> {
    try {
      let conversionResult: ParquetConversionResult;
      
      if (operation === 'json-to-parquet') {
        conversionResult = await jsonToParquet(jsonFile, parquetFile);
      } else {
        // For parquet-to-json, we'll create a temporary JSON file
        const tempJsonFile = `${jsonFile}.temp`;
        conversionResult = await parquetConverter.parquetToJson(parquetFile, tempJsonFile);
      }
      
      return {
        format: 'parquet',
        operation,
        dataType,
        recordCount,
        iteration,
        executionTimeMs: conversionResult.conversionTimeMs,
        fileSizeBytes: operation === 'json-to-parquet' ? conversionResult.parquetSizeBytes : conversionResult.jsonSizeBytes,
        compressionRatio: conversionResult.compressionRatio,
        success: true
      };
    } catch (error) {
      return {
        format: 'parquet',
        operation,
        dataType,
        recordCount,
        iteration,
        executionTimeMs: 0,
        fileSizeBytes: 0,
        compressionRatio: 0,
        success: false,
        error: String(error)
      };
    }
  }
  
  private async benchmarkMetaDatConversion(
    jsonFile: string,
    metadatFile: string,
    operation: string,
    dataType: string,
    recordCount: number,
    iteration: number
  ): Promise<BenchmarkResult> {
    // Use the Rust implementation for MetaDat conversion
    const rustDir = '../metadat-rs';
    let command: string;
    
    if (operation === 'json-to-metadat') {
      command = `./target/release/metadat --mode json-to-metadat --input ${resolve(jsonFile)} --output ${resolve(metadatFile)}`;
    } else {
      command = `./target/release/metadat --mode metadat-to-json --input ${resolve(metadatFile)} --output ${jsonFile}.converted`;
    }
    
    const result = await this.executeCommand('sh', ['-c', command], rustDir);
    
    let fileSizeBytes = 0;
    let compressionRatio = 0;
    
    if (result.success) {
      try {
        const targetFile = operation === 'json-to-metadat' ? metadatFile : `${jsonFile}.converted`;
        const stats = await stat(targetFile);
        fileSizeBytes = stats.size;
        
        // Calculate compression ratio if converting from JSON
        if (operation === 'json-to-metadat') {
          const jsonStats = await stat(jsonFile);
          compressionRatio = ((jsonStats.size - fileSizeBytes) / jsonStats.size) * 100;
        }
      } catch {
        // File might not exist
      }
    }
    
    return {
      format: 'metadat',
      operation,
      dataType,
      recordCount,
      iteration,
      executionTimeMs: result.executionTime,
      fileSizeBytes,
      compressionRatio,
      success: result.success,
      error: result.success ? undefined : result.stderr
    };
  }
  
  private async benchmarkReadPerformance(
    file: string,
    format: string,
    dataType: string,
    recordCount: number,
    iteration: number
  ): Promise<BenchmarkResult> {
    let executionTime: number;
    let success: boolean;
    let error: string | undefined;
    let memoryUsageBytes = 0;
    
    try {
      if (format === 'parquet') {
        const readResult = await benchmarkParquetRead(file);
        executionTime = readResult.readTimeMs;
        success = true;
        memoryUsageBytes = readResult.memoryUsageBytes || 0;
      } else if (format === 'metadat') {
        const rustDir = '../metadat-rs';
        const command = `./target/release/metadat --mode parse --input ${resolve(file)}`;
        const result = await this.executeCommand('sh', ['-c', command], rustDir);
        executionTime = result.executionTime;
        success = result.success;
        error = result.success ? undefined : result.stderr;
      } else { // JSON
        const startTime = performance.now();
        try {
          const content = await readFile(file, 'utf8');
          JSON.parse(content);
          executionTime = performance.now() - startTime;
          success = true;
        } catch (jsonError) {
          executionTime = performance.now() - startTime;
          success = false;
          error = String(jsonError);
        }
      }
    } catch (benchmarkError) {
      executionTime = 0;
      success = false;
      error = String(benchmarkError);
    }
    
    // Get file size
    let fileSizeBytes = 0;
    try {
      const stats = await stat(file);
      fileSizeBytes = stats.size;
    } catch {
      // File might not exist
    }
    
    return {
      format,
      operation: 'read',
      dataType,
      recordCount,
      iteration,
      executionTimeMs: executionTime,
      fileSizeBytes,
      memoryUsageBytes,
      success,
      error
    };
  }
  
  public async runComparison(): Promise<ComparisonSummary[]> {
    console.log('🚀 Starting Parquet vs MetaDat Benchmark Comparison\\n');
    
    // Check dependencies
    const hasParquetJs = await this.checkParquetJsDependencies();
    if (!hasParquetJs) {
      throw new Error('parquetjs library missing. Please install: yarn add parquetjs');
    }
    
    // Check if Rust CLI is built
    try {
      await access(resolve('../metadat-rs/target/release/metadat'));
    } catch {
      console.log('🔨 Building Rust MetaDat CLI...');
      await this.executeCommand('cargo', ['build', '--release'], '../metadat-rs');
    }
    
    const summaries: ComparisonSummary[] = [];
    
    for (const recordCount of this.config.testSizes) {
      for (const dataType of this.config.dataTypes) {
        console.log(`\\n📊 Testing ${recordCount} ${dataType} records...`);
        
        // Generate test data
        await generateTestData({
          recordCount,
          dataType: dataType as 'users' | 'products',
          outputDir: './test-data'
        });
        
        const jsonFile = `./test-data/${dataType}-${recordCount}.json`;
        const parquetFile = `./test-data/${dataType}-${recordCount}.parquet`;
        const metadatFile = `./test-data/${dataType}-${recordCount}.metadat`;
        
        // Track results for this test case
        const testResults: BenchmarkResult[] = [];
        
        // Run multiple iterations
        for (let iteration = 1; iteration <= this.config.iterations; iteration++) {
          console.log(`  🔄 Iteration ${iteration}/${this.config.iterations}...`);
          
          // JSON to Parquet conversion
          const parquetConversion = await this.benchmarkParquetConversion(
            jsonFile, parquetFile, 'json-to-parquet', dataType, recordCount, iteration
          );
          testResults.push(parquetConversion);
          this.results.push(parquetConversion);
          
          // JSON to MetaDat conversion
          const metadatConversion = await this.benchmarkMetaDatConversion(
            jsonFile, metadatFile, 'json-to-metadat', dataType, recordCount, iteration
          );
          testResults.push(metadatConversion);
          this.results.push(metadatConversion);
          
          // Read performance tests
          const jsonRead = await this.benchmarkReadPerformance(
            jsonFile, 'json', dataType, recordCount, iteration
          );
          testResults.push(jsonRead);
          this.results.push(jsonRead);
          
          if (parquetConversion.success) {
            const parquetRead = await this.benchmarkReadPerformance(
              parquetFile, 'parquet', dataType, recordCount, iteration
            );
            testResults.push(parquetRead);
            this.results.push(parquetRead);
          }
          
          if (metadatConversion.success) {
            const metadatRead = await this.benchmarkReadPerformance(
              metadatFile, 'metadat', dataType, recordCount, iteration
            );
            testResults.push(metadatRead);
            this.results.push(metadatRead);
          }
        }
        
        // Calculate averages and create summary
        const summary = this.createComparisonSummary(testResults, dataType, recordCount);
        summaries.push(summary);
        
        console.log(`  📈 Results: Parquet(${summary.formats.parquet.size}B, ${summary.formats.parquet.readTime}ms) vs MetaDat(${summary.formats.metadat.size}B, ${summary.formats.metadat.readTime}ms)`);
      }
    }
    
    // Generate comprehensive report
    await this.generateReport(summaries);
    
    return summaries;
  }
  
  private createComparisonSummary(results: BenchmarkResult[], dataType: string, recordCount: number): ComparisonSummary {
    const avgResults = (format: string, operation: string) => {
      const filtered = results.filter(r => r.format === format && r.operation === operation && r.success);
      if (filtered.length === 0) return { time: 0, size: 0, compression: 0 };
      
      const avgTime = filtered.reduce((sum, r) => sum + r.executionTimeMs, 0) / filtered.length;
      const avgSize = filtered.reduce((sum, r) => sum + r.fileSizeBytes, 0) / filtered.length;
      const avgCompression = filtered.reduce((sum, r) => sum + (r.compressionRatio || 0), 0) / filtered.length;
      
      return { time: avgTime, size: avgSize, compression: avgCompression };
    };
    
    const jsonRead = avgResults('json', 'read');
    const parquetRead = avgResults('parquet', 'read');
    const parquetConversion = avgResults('parquet', 'json-to-parquet');
    const metadatRead = avgResults('metadat', 'read');
    const metadatConversion = avgResults('metadat', 'json-to-metadat');
    
    const summary: ComparisonSummary = {
      dataType,
      recordCount,
      formats: {
        json: {
          size: jsonRead.size,
          readTime: jsonRead.time
        },
        parquet: {
          size: parquetRead.size || parquetConversion.size,
          readTime: parquetRead.time,
          compressionVsJson: parquetConversion.compression,
          conversionFromJsonTime: parquetConversion.time
        },
        metadat: {
          size: metadatRead.size || metadatConversion.size,
          readTime: metadatRead.time,
          compressionVsJson: metadatConversion.compression,
          conversionFromJsonTime: metadatConversion.time
        }
      },
      winner: {
        smallestFile: '',
        fastestRead: '',
        fastestConversion: '',
        bestCompression: ''
      }
    };
    
    // Determine winners
    const sizes = [
      { format: 'JSON', size: summary.formats.json.size },
      { format: 'Parquet', size: summary.formats.parquet.size },
      { format: 'MetaDat', size: summary.formats.metadat.size }
    ].filter(s => s.size > 0);
    
    const readTimes = [
      { format: 'JSON', time: summary.formats.json.readTime },
      { format: 'Parquet', time: summary.formats.parquet.readTime },
      { format: 'MetaDat', time: summary.formats.metadat.readTime }
    ].filter(s => s.time > 0);
    
    const conversionTimes = [
      { format: 'Parquet', time: summary.formats.parquet.conversionFromJsonTime },
      { format: 'MetaDat', time: summary.formats.metadat.conversionFromJsonTime }
    ].filter(s => s.time > 0);
    
    const compressionRatios = [
      { format: 'Parquet', ratio: summary.formats.parquet.compressionVsJson },
      { format: 'MetaDat', ratio: summary.formats.metadat.compressionVsJson }
    ].filter(s => s.ratio > 0);
    
    if (sizes.length > 0) {
      summary.winner.smallestFile = sizes.reduce((min, curr) => curr.size < min.size ? curr : min).format;
    }
    
    if (readTimes.length > 0) {
      summary.winner.fastestRead = readTimes.reduce((min, curr) => curr.time < min.time ? curr : min).format;
    }
    
    if (conversionTimes.length > 0) {
      summary.winner.fastestConversion = conversionTimes.reduce((min, curr) => curr.time < min.time ? curr : min).format;
    }
    
    if (compressionRatios.length > 0) {
      summary.winner.bestCompression = compressionRatios.reduce((max, curr) => curr.ratio > max.ratio ? curr : max).format;
    }
    
    return summary;
  }
  
  private async generateReport(summaries: ComparisonSummary[]): Promise<void> {
    console.log('\\n📊 Generating Parquet vs MetaDat comparison report...');
    
    // Raw results
    await writeFile(
      join(this.config.outputDir, 'parquet-metadat-raw.json'),
      JSON.stringify(this.results, null, 2)
    );
    
    // Summary results
    await writeFile(
      join(this.config.outputDir, 'parquet-metadat-summary.json'),
      JSON.stringify(summaries, null, 2)
    );
    
    // Markdown report
    const markdownReport = this.generateMarkdownReport(summaries);
    await writeFile(
      join(this.config.outputDir, 'PARQUET_VS_METADAT.md'),
      markdownReport
    );
    
    console.log('✅ Parquet vs MetaDat comparison complete!');
    console.log('📁 Results saved to ./benchmark-results/');
    console.log('📄 Report: ./benchmark-results/PARQUET_VS_METADAT.md');
  }
  
  private generateMarkdownReport(summaries: ComparisonSummary[]): string {
    let report = `# Parquet vs MetaDat Performance Comparison\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n\n`;
    
    report += `## Overview\n\n`;
    report += `This report compares the performance characteristics of Apache Parquet and MetaDat data formats against JSON baseline.\n\n`;
    
    report += `### Test Configuration\n\n`;
    report += `- **Test Sizes:** ${this.config.testSizes.join(', ')} records\n`;
    report += `- **Data Types:** ${this.config.dataTypes.join(', ')}\n`;
    report += `- **Iterations:** ${this.config.iterations} per test\n`;
    report += `- **Metrics:** File size, read performance, conversion time, compression ratio\n\n`;
    
    // Performance Summary Table
    report += `## Performance Summary\n\n`;
    report += `| Data Type | Records | Format | File Size (bytes) | Read Time (ms) | Compression vs JSON | Conversion Time (ms) |\n`;
    report += `|-----------|---------|--------|-------------------|----------------|--------------------|---------------------|\n`;
    
    for (const summary of summaries) {
      const formatSize = (bytes: number) => bytes > 0 ? bytes.toLocaleString() : 'N/A';
      const formatTime = (ms: number) => ms > 0 ? ms.toFixed(2) : 'N/A';
      const formatPercent = (pct: number) => pct > 0 ? `${pct.toFixed(1)}%` : 'N/A';
      
      report += `| ${summary.dataType} | ${summary.recordCount} | JSON | ${formatSize(summary.formats.json.size)} | ${formatTime(summary.formats.json.readTime)} | - | - |\n`;
      report += `| ${summary.dataType} | ${summary.recordCount} | Parquet | ${formatSize(summary.formats.parquet.size)} | ${formatTime(summary.formats.parquet.readTime)} | ${formatPercent(summary.formats.parquet.compressionVsJson)} | ${formatTime(summary.formats.parquet.conversionFromJsonTime)} |\n`;
      report += `| ${summary.dataType} | ${summary.recordCount} | MetaDat | ${formatSize(summary.formats.metadat.size)} | ${formatTime(summary.formats.metadat.readTime)} | ${formatPercent(summary.formats.metadat.compressionVsJson)} | ${formatTime(summary.formats.metadat.conversionFromJsonTime)} |\n`;
    }
    
    report += `\n## Winner Analysis\n\n`;
    
    // Analyze overall winners across all test cases
    const winnerCounts = {
      smallestFile: {} as Record<string, number>,
      fastestRead: {} as Record<string, number>,
      fastestConversion: {} as Record<string, number>,
      bestCompression: {} as Record<string, number>
    };
    
    for (const summary of summaries) {
      const winners = summary.winner;
      winnerCounts.smallestFile[winners.smallestFile] = (winnerCounts.smallestFile[winners.smallestFile] || 0) + 1;
      winnerCounts.fastestRead[winners.fastestRead] = (winnerCounts.fastestRead[winners.fastestRead] || 0) + 1;
      winnerCounts.fastestConversion[winners.fastestConversion] = (winnerCounts.fastestConversion[winners.fastestConversion] || 0) + 1;
      winnerCounts.bestCompression[winners.bestCompression] = (winnerCounts.bestCompression[winners.bestCompression] || 0) + 1;
    }
    
    const getWinner = (counts: Record<string, number>) => {
      return Object.entries(counts).reduce((max, [format, count]) => count > max.count ? { format, count } : max, { format: 'None', count: 0 });
    };
    
    report += `### Overall Winners\n\n`;
    report += `- **Smallest File Size:** ${getWinner(winnerCounts.smallestFile).format} (${getWinner(winnerCounts.smallestFile).count}/${summaries.length} tests)\n`;
    report += `- **Fastest Read Performance:** ${getWinner(winnerCounts.fastestRead).format} (${getWinner(winnerCounts.fastestRead).count}/${summaries.length} tests)\n`;
    report += `- **Fastest Conversion:** ${getWinner(winnerCounts.fastestConversion).format} (${getWinner(winnerCounts.fastestConversion).count}/${summaries.length} tests)\n`;
    report += `- **Best Compression:** ${getWinner(winnerCounts.bestCompression).format} (${getWinner(winnerCounts.bestCompression).count}/${summaries.length} tests)\n\n`;
    
    // Detailed Analysis
    report += `## Detailed Analysis\n\n`;
    
    for (const summary of summaries) {
      report += `### ${summary.dataType} (${summary.recordCount} records)\n\n`;
      
      const parquetAdvantage = summary.formats.json.size > 0 && summary.formats.parquet.size > 0 ? 
        ((summary.formats.json.size - summary.formats.parquet.size) / summary.formats.json.size * 100).toFixed(1) : 'N/A';
      const metadatAdvantage = summary.formats.json.size > 0 && summary.formats.metadat.size > 0 ? 
        ((summary.formats.json.size - summary.formats.metadat.size) / summary.formats.json.size * 100).toFixed(1) : 'N/A';
      
      report += `**File Size Comparison:**\n`;
      report += `- Parquet is ${parquetAdvantage}% smaller than JSON\n`;
      report += `- MetaDat is ${metadatAdvantage}% smaller than JSON\n\n`;
      
      const readSpeedup = (baseline: number, comparison: number) => {
        if (baseline > 0 && comparison > 0) {
          return (baseline / comparison).toFixed(2);
        }
        return 'N/A';
      };
      
      report += `**Read Performance:**\n`;
      report += `- Parquet is ${readSpeedup(summary.formats.json.readTime, summary.formats.parquet.readTime)}x vs JSON\n`;
      report += `- MetaDat is ${readSpeedup(summary.formats.json.readTime, summary.formats.metadat.readTime)}x vs JSON\n\n`;
      
      report += `**Winners:**\n`;
      report += `- Smallest file: **${summary.winner.smallestFile}**\n`;
      report += `- Fastest read: **${summary.winner.fastestRead}**\n`;
      report += `- Fastest conversion: **${summary.winner.fastestConversion}**\n`;
      report += `- Best compression: **${summary.winner.bestCompression}**\n\n`;
    }
    
    report += `## Recommendations\n\n`;
    report += `Based on the benchmark results:\n\n`;
    
    const overallWinners = {
      size: getWinner(winnerCounts.smallestFile).format,
      read: getWinner(winnerCounts.fastestRead).format,
      conversion: getWinner(winnerCounts.fastestConversion).format,
      compression: getWinner(winnerCounts.bestCompression).format
    };
    
    if (overallWinners.size === 'MetaDat' && overallWinners.compression === 'MetaDat') {
      report += `- **For storage efficiency:** MetaDat consistently provides better compression than Parquet\n`;
    }
    
    if (overallWinners.read === 'MetaDat') {
      report += `- **For read performance:** MetaDat offers superior parsing speed\n`;
    } else if (overallWinners.read === 'Parquet') {
      report += `- **For read performance:** Parquet provides better reading speed for analytical workloads\n`;
    }
    
    if (overallWinners.conversion === 'MetaDat') {
      report += `- **For real-time processing:** MetaDat's faster conversion makes it ideal for streaming scenarios\n`;
    }
    
    report += `\n---\n*Generated by MetaDat Benchmark Suite*\n`;
    
    return report;
  }
}

// CLI support
if (import.meta.main) {
  const config: Partial<ParquetBenchmarkConfig> = {};
  
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🎯 Parquet vs MetaDat Performance Benchmark

Usage:
  bun src/parquet-benchmark.ts [options]

Options:
  --sizes <size1,size2>     Test record counts (default: 100,1000,5000,10000)
  --types <type1,type2>     Data types (default: users,products)
  --iterations <number>     Iterations per test (default: 3)
  --help, -h               Show this help

Examples:
  bun src/parquet-benchmark.ts --sizes 1000,5000 --types users
  bun src/parquet-benchmark.ts --iterations 5
`);
    process.exit(0);
  }
  
  if (args.includes('--sizes')) {
    const sizeArg = args[args.indexOf('--sizes') + 1];
    config.testSizes = sizeArg?.split(',').map(s => parseInt(s.trim()));
  }
  
  if (args.includes('--types')) {
    const typeArg = args[args.indexOf('--types') + 1];
    config.dataTypes = typeArg?.split(',').map(t => t.trim());
  }
  
  if (args.includes('--iterations')) {
    const iterArg = args[args.indexOf('--iterations') + 1];
    config.iterations = parseInt(iterArg);
  }
  
  const benchmark = new ParquetMetaDatBenchmark(config);
  benchmark.runComparison().catch(console.error);
}