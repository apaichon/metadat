// MetaDat Cross-Platform Benchmark Runner
// Measures performance across Go, Node.js, C#, Rust, and Python implementations

import { spawn } from 'child_process';
import { readFile, writeFile, access } from 'fs/promises';
import { join, resolve } from 'path';
import { generateTestData } from './data-generator.ts';

interface BenchmarkConfig {
  languages?: string[];
  testSizes?: number[];
  dataTypes?: string[];
  iterations?: number;
  outputDir?: string;
}

interface SystemInfo {
  platform: string;
  arch: string;
  osVersion: string;
  nodeVersion: string;
  bunVersion: string;
  totalMemoryGB: number;
  cpuModel: string;
  cpuCores: number;
  timestamp: string;
}

interface LanguageVersionInfo {
  name: string;
  version: string;
  implementation: string;
  buildInfo?: string;
}

interface BenchmarkResult {
  language: string;
  implementation: string;
  operation: string;
  dataType: string;
  recordCount: number;
  iteration: number;
  executionTimeMs: number;
  fileSizeBytes?: number;
  memoryUsageMB?: number;
  success: boolean;
  error?: string;
  command?: string;
  languageVersion?: string;
  buildInfo?: string;
}

interface LanguageConfig {
  name: string;
  implementation: string;
  directory: string;
  commands: {
    build?: string;
    jsonToMetadat: string;
    metadatToJson: string;
    parse: string;
    validate?: string;
  };
  checkAvailable: string;
}

// Language implementation configurations
const LANGUAGE_CONFIGS: LanguageConfig[] = [
  {
    name: 'Go',
    implementation: 'metadat-go',
    directory: '../metadat-go',
    commands: {
      build: 'go build -o bin/metadat cmd/metadat/main.go',
      jsonToMetadat: './bin/metadat -mode json-to-metadat -input {input} -output {output}',
      metadatToJson: './bin/metadat -mode metadat-to-json -input {input} -output {output}',
      parse: './bin/metadat -mode parse -input {input}',
      validate: './bin/metadat -mode validate -input {input}'
    },
    checkAvailable: 'go version'
  },
  {
    name: 'Node.js',
    implementation: 'metadat-nodejs',
    directory: '../metadat-nodejs',
    commands: {
      jsonToMetadat: 'node bin/metadat.js --mode json-to-metadat --input {input} --output {output}',
      metadatToJson: 'node bin/metadat.js --mode metadat-to-json --input {input} --output {output}',
      parse: 'node bin/metadat.js --mode parse --input {input}',
      validate: 'node bin/metadat.js --mode validate --input {input}'
    },
    checkAvailable: 'node --version'
  },
  {
    name: 'C#',
    implementation: 'metadat-csharp',
    directory: '../metadat-csharp',
    commands: {
      build: 'dotnet build CLI/CLI.csproj -c Release',
      jsonToMetadat: 'dotnet run --project CLI/CLI.csproj -c Release -- --mode json-to-metadat --input {input} --output {output}',
      metadatToJson: 'dotnet run --project CLI/CLI.csproj -c Release -- --mode metadat-to-json --input {input} --output {output}',
      parse: 'dotnet run --project CLI/CLI.csproj -c Release -- --mode parse --input {input}',
      validate: 'dotnet run --project CLI/CLI.csproj -c Release -- --mode validate --input {input}'
    },
    checkAvailable: 'dotnet --version'
  },
  {
    name: 'Rust',
    implementation: 'metadat-rs',
    directory: '../metadat-rs',
    commands: {
      build: 'cargo build --release',
      jsonToMetadat: './target/release/metadat --mode json-to-metadat --input {input} --output {output}',
      metadatToJson: './target/release/metadat --mode metadat-to-json --input {input} --output {output}',
      parse: './target/release/metadat --mode parse --input {input}',
      validate: './target/release/metadat --mode validate --input {input}'
    },
    checkAvailable: 'cargo --version'
  },
  {
    name: 'Python',
    implementation: 'metadat-py',
    directory: '../metadat-py',
    commands: {
      jsonToMetadat: 'PYTHONPATH=. python3 -c "from metadat.cli import main; import sys; sys.argv=[\'metadat\', \'--mode\', \'json-to-metadat\', \'--input\', \'{input}\', \'--output\', \'{output}\']; main()"',
      metadatToJson: 'PYTHONPATH=. python3 -c "from metadat.cli import main; import sys; sys.argv=[\'metadat\', \'--mode\', \'metadat-to-json\', \'--input\', \'{input}\', \'--output\', \'{output}\']; main()"',
      parse: 'PYTHONPATH=. python3 -c "from metadat.cli import main; import sys; sys.argv=[\'metadat\', \'--mode\', \'parse\', \'--input\', \'{input}\']; main()"',
      validate: 'PYTHONPATH=. python3 -c "from metadat.cli import main; import sys; sys.argv=[\'metadat\', \'--mode\', \'validate\', \'--input\', \'{input}\']; main()"'
    },
    checkAvailable: 'python3 --version'
  }
];

class BenchmarkRunner {
  private config: BenchmarkConfig;
  private results: BenchmarkResult[] = [];
  private systemInfo: SystemInfo | null = null;
  private languageVersions: Map<string, LanguageVersionInfo> = new Map();
  
  constructor(config: BenchmarkConfig = {}) {
    this.config = {
      languages: config.languages || ['Go', 'Node.js', 'C#', 'Rust', 'Python'],
      testSizes: config.testSizes || [100, 1000, 5000],
      dataTypes: config.dataTypes || ['users', 'products'],
      iterations: config.iterations || 3,
      outputDir: config.outputDir || './benchmark-results',
      ...config
    };
  }
  
  private async getSystemInfo(): Promise<SystemInfo> {
    if (this.systemInfo) return this.systemInfo;
    
    // Get basic system info
    const platform = process.platform;
    const arch = process.arch;
    const nodeVersion = process.version;
    
    // Get OS version
    const osVersionResult = await this.executeCommand('uname -a', './', 5000);
    const osVersion = osVersionResult.success ? osVersionResult.stdout.trim() : 'Unknown';
    
    // Get Bun version
    const bunVersionResult = await this.executeCommand('bun --version', './', 5000);
    const bunVersion = bunVersionResult.success ? bunVersionResult.stdout.trim() : 'Unknown';
    
    // Get CPU info
    let cpuModel = 'Unknown';
    let cpuCores = 0;
    
    if (platform === 'darwin') {
      const cpuResult = await this.executeCommand('sysctl -n machdep.cpu.brand_string', './', 5000);
      const coreResult = await this.executeCommand('sysctl -n hw.ncpu', './', 5000);
      
      cpuModel = cpuResult.success ? cpuResult.stdout.trim() : 'Unknown';
      cpuCores = coreResult.success ? parseInt(coreResult.stdout.trim()) : 0;
    } else if (platform === 'linux') {
      const cpuResult = await this.executeCommand('cat /proc/cpuinfo | grep "model name" | head -1 | cut -d: -f2', './', 5000);
      const coreResult = await this.executeCommand('nproc', './', 5000);
      
      cpuModel = cpuResult.success ? cpuResult.stdout.trim() : 'Unknown';
      cpuCores = coreResult.success ? parseInt(coreResult.stdout.trim()) : 0;
    }
    
    // Get memory info (in GB)
    let totalMemoryGB = 0;
    if (platform === 'darwin') {
      const memResult = await this.executeCommand('sysctl -n hw.memsize', './', 5000);
      if (memResult.success) {
        const memBytes = parseInt(memResult.stdout.trim());
        totalMemoryGB = Math.round((memBytes / (1024 * 1024 * 1024)) * 100) / 100;
      }
    } else if (platform === 'linux') {
      const memResult = await this.executeCommand('cat /proc/meminfo | grep MemTotal | awk \'{print $2}\'', './', 5000);
      if (memResult.success) {
        const memKB = parseInt(memResult.stdout.trim());
        totalMemoryGB = Math.round((memKB / (1024 * 1024)) * 100) / 100;
      }
    }
    
    this.systemInfo = {
      platform,
      arch,
      osVersion,
      nodeVersion,
      bunVersion,
      totalMemoryGB,
      cpuModel,
      cpuCores,
      timestamp: new Date().toISOString()
    };
    
    return this.systemInfo;
  }
  
  private async getLanguageVersion(lang: LanguageConfig): Promise<LanguageVersionInfo> {
    const cached = this.languageVersions.get(lang.name);
    if (cached) return cached;
    
    const result = await this.executeCommand(lang.checkAvailable, './', 5000);
    let version = 'Unknown';
    let buildInfo = '';
    
    if (result.success) {
      const output = result.stdout.trim();
      
      // Parse version from different language outputs
      switch (lang.name) {
        case 'Go':
          // "go version go1.24.1 darwin/arm64"
          const goMatch = output.match(/go(\d+\.\d+(?:\.\d+)?)/);
          version = goMatch ? goMatch[1] : output;
          buildInfo = output;
          break;
          
        case 'Node.js':
          // "v22.17.0"
          version = output.replace('v', '');
          break;
          
        case 'C#':
          // "8.0.101"
          version = output.trim();
          buildInfo = output;
          break;
          
        case 'Rust':
          // "cargo 1.88.0 (873a06493 2025-05-10)"
          const rustMatch = output.match(/cargo (\d+\.\d+\.\d+)/);
          version = rustMatch ? rustMatch[1] : output;
          buildInfo = output;
          break;
          
        case 'Python':
          // "Python 3.13.5"
          const pythonMatch = output.match(/Python (\d+\.\d+\.\d+)/);
          version = pythonMatch ? pythonMatch[1] : output;
          break;
          
        default:
          version = output;
      }
    }
    
    const versionInfo: LanguageVersionInfo = {
      name: lang.name,
      version,
      implementation: lang.implementation,
      buildInfo
    };
    
    this.languageVersions.set(lang.name, versionInfo);
    return versionInfo;
  }
  
  private async executeCommand(command: string, cwd: string, timeoutMs = 30000): Promise<{ stdout: string, stderr: string, executionTime: number, success: boolean }> {
    return new Promise((promiseResolve) => {
      const startTime = performance.now();
      
      const process = spawn(command, [], {
        cwd: resolve(cwd),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });
      
      let stdout = '';
      let stderr = '';
      let finished = false;
      
      const timeout = setTimeout(() => {
        if (!finished) {
          process.kill('SIGTERM');
          promiseResolve({
            stdout: '',
            stderr: 'Command timed out',
            executionTime: timeoutMs,
            success: false
          });
        }
      }, timeoutMs);
      
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeout);
          const executionTime = performance.now() - startTime;
          promiseResolve({
            stdout,
            stderr,
            executionTime,
            success: code === 0
          });
        }
      });
      
      process.on('error', (error) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeout);
          promiseResolve({
            stdout: '',
            stderr: error.message,
            executionTime: performance.now() - startTime,
            success: false
          });
        }
      });
    });
  }
  
  private async checkLanguageAvailability(): Promise<LanguageConfig[]> {
    const available: LanguageConfig[] = [];
    
    for (const lang of LANGUAGE_CONFIGS) {
      if (!this.config.languages?.includes(lang.name)) continue;
      
      console.log(`🔍 Checking ${lang.name} availability...`);
      
      try {
        // Check if language/runtime is available
        const result = await this.executeCommand(lang.checkAvailable, './', 5000);
        if (!result.success) {
          console.log(`❌ ${lang.name}: Runtime not available - ${result.stderr}`);
          continue;
        }
        
        // Check if implementation directory exists
        try {
          await access(resolve(lang.directory));
        } catch {
          console.log(`❌ ${lang.name}: Implementation directory not found at ${lang.directory}`);
          continue;
        }
        
        // Build if necessary
        if (lang.commands.build) {
          console.log(`🔨 Building ${lang.name} implementation...`);
          const buildResult = await this.executeCommand(lang.commands.build, lang.directory, 60000);
          if (!buildResult.success) {
            console.log(`❌ ${lang.name}: Build failed - ${buildResult.stderr}`);
            continue;
          }
        }
        
        // Get language version information
        const versionInfo = await this.getLanguageVersion(lang);
        console.log(`✅ ${lang.name}: Ready (v${versionInfo.version})`);
        available.push(lang);
      } catch (error) {
        console.log(`❌ ${lang.name}: Error - ${error}`);
      }
    }
    
    return available;
  }
  
  private async benchmarkLanguage(
    lang: LanguageConfig, 
    operation: string, 
    inputFile: string, 
    outputFile: string, 
    recordCount: number, 
    dataType: string, 
    iteration: number
  ): Promise<BenchmarkResult> {
    const command = lang.commands[operation as keyof typeof lang.commands]
      ?.replace('{input}', resolve(inputFile))
      .replace('{output}', resolve(outputFile));
    
    const versionInfo = this.languageVersions.get(lang.name);
    
    if (!command) {
      return {
        language: lang.name,
        implementation: lang.implementation,
        operation,
        dataType,
        recordCount,
        iteration,
        executionTimeMs: 0,
        success: false,
        error: `Operation ${operation} not supported`,
        command,
        languageVersion: versionInfo?.version,
        buildInfo: versionInfo?.buildInfo
      };
    }
    
    const result = await this.executeCommand(command, lang.directory);
    
    let fileSizeBytes: number | undefined;
    try {
      const fileContent = await readFile(outputFile);
      fileSizeBytes = fileContent.length;
    } catch {
      // Output file might not be created for parse/validate operations
    }
    
    return {
      language: lang.name,
      implementation: lang.implementation,
      operation,
      dataType,
      recordCount,
      iteration,
      executionTimeMs: result.executionTime,
      fileSizeBytes,
      success: result.success,
      error: result.success ? undefined : result.stderr || 'Unknown error',
      command,
      languageVersion: versionInfo?.version,
      buildInfo: versionInfo?.buildInfo
    };
  }
  
  public async runBenchmarks(): Promise<void> {
    console.log('🚀 Starting MetaDat Cross-Platform Benchmark Suite\n');
    
    // Collect system information
    const systemInfo = await this.getSystemInfo();
    console.log('💻 System Information:');
    console.log(`   OS: ${systemInfo.platform} ${systemInfo.arch} (${systemInfo.osVersion.split(' ')[0]})`);
    console.log(`   CPU: ${systemInfo.cpuModel} (${systemInfo.cpuCores} cores)`);
    console.log(`   Memory: ${systemInfo.totalMemoryGB}GB`);
    console.log(`   Node.js: ${systemInfo.nodeVersion}`);
    console.log(`   Bun: ${systemInfo.bunVersion}\n`);
    
    // Check language availability
    const availableLanguages = await this.checkLanguageAvailability();
    
    if (availableLanguages.length === 0) {
      console.log('❌ No languages available for benchmarking');
      return;
    }
    
    console.log(`\n📋 Will benchmark ${availableLanguages.length} languages: ${availableLanguages.map(l => l.name).join(', ')}`);
    console.log(`📊 Test sizes: ${this.config.testSizes?.join(', ')} records`);
    console.log(`📁 Data types: ${this.config.dataTypes?.join(', ')}`);
    console.log(`🔄 Iterations per test: ${this.config.iterations}\n`);
    
    // Generate test data
    for (const recordCount of this.config.testSizes!) {
      for (const dataType of this.config.dataTypes!) {
        console.log(`📊 Generating test data: ${recordCount} ${dataType} records...`);
        
        try {
          await generateTestData({
            recordCount,
            dataType: dataType as 'users' | 'products',
            outputDir: './test-data'
          });
        } catch (error) {
          console.error(`Failed to generate ${recordCount} ${dataType} records:`, error);
          continue;
        }
        
        // Run benchmarks for each language
        for (const lang of availableLanguages) {
          console.log(`\n🔧 Benchmarking ${lang.name} with ${recordCount} ${dataType} records...`);
          
          for (let iteration = 1; iteration <= this.config.iterations!; iteration++) {
            // JSON to MetaDat conversion
            const jsonToMetadatResult = await this.benchmarkLanguage(
              lang,
              'jsonToMetadat',
              `./test-data/${dataType}-${recordCount}.json`,
              `./test-data/${lang.name.toLowerCase()}-${dataType}-${recordCount}-${iteration}.metadat`,
              recordCount,
              dataType,
              iteration
            );
            this.results.push(jsonToMetadatResult);
            
            // MetaDat to JSON conversion (if previous step succeeded)
            if (jsonToMetadatResult.success) {
              const metadatToJsonResult = await this.benchmarkLanguage(
                lang,
                'metadatToJson',
                `./test-data/${lang.name.toLowerCase()}-${dataType}-${recordCount}-${iteration}.metadat`,
                `./test-data/${lang.name.toLowerCase()}-${dataType}-${recordCount}-${iteration}-roundtrip.json`,
                recordCount,
                dataType,
                iteration
              );
              this.results.push(metadatToJsonResult);
            }
            
            // Parse operation
            const parseResult = await this.benchmarkLanguage(
              lang,
              'parse',
              `./test-data/${dataType}-${recordCount}.metadat`,
              '', // No output file for parse
              recordCount,
              dataType,
              iteration
            );
            this.results.push(parseResult);
            
            // Progress indicator
            process.stdout.write('.');
          }
          
          const langResults = this.results.filter(r => 
            r.language === lang.name && 
            r.recordCount === recordCount && 
            r.dataType === dataType
          );
          
          const avgJsonToMetadat = this.calculateAverage(langResults, 'jsonToMetadat');
          const avgMetadatToJson = this.calculateAverage(langResults, 'metadatToJson');
          const avgParse = this.calculateAverage(langResults, 'parse');
          
          console.log(`\n  ⚡ Average times: JSON→MetaDat: ${avgJsonToMetadat.toFixed(2)}ms | MetaDat→JSON: ${avgMetadatToJson.toFixed(2)}ms | Parse: ${avgParse.toFixed(2)}ms`);
        }
      }
    }
    
    // Generate comprehensive report
    await this.generateReport();
  }
  
  private calculateAverage(results: BenchmarkResult[], operation: string): number {
    const operationResults = results.filter(r => r.operation === operation && r.success);
    if (operationResults.length === 0) return 0;
    
    const total = operationResults.reduce((sum, r) => sum + r.executionTimeMs, 0);
    return total / operationResults.length;
  }
  
  private async generateReport(): Promise<void> {
    console.log('\n📊 Generating comprehensive benchmark report...');
    
    // Create results directory
    try {
      await access('./benchmark-results');
    } catch {
      await Bun.spawn(['mkdir', '-p', './benchmark-results']).exited;
    }
    
    // Raw results
    await writeFile(
      './benchmark-results/raw-results.json',
      JSON.stringify(this.results, null, 2)
    );
    
    // Summary report
    const summary = this.generateSummary();
    await writeFile(
      './benchmark-results/summary-report.json',
      JSON.stringify(summary, null, 2)
    );
    
    // Markdown report
    const markdownReport = this.generateMarkdownReport(summary);
    await writeFile(
      './benchmark-results/BENCHMARK_REPORT.md',
      markdownReport
    );
    
    console.log('✅ Benchmark complete!');
    console.log('📁 Results saved to ./benchmark-results/');
    console.log('📄 Markdown report: ./benchmark-results/BENCHMARK_REPORT.md');
  }
  
  private generateSummary(): any {
    const summary: any = {
      metadata: {
        timestamp: new Date().toISOString(),
        totalResults: this.results.length,
        languages: [...new Set(this.results.map(r => r.language))],
        operations: [...new Set(this.results.map(r => r.operation))],
        testSizes: this.config.testSizes,
        dataTypes: this.config.dataTypes,
        iterations: this.config.iterations
      },
      systemInfo: this.systemInfo,
      languageVersions: Object.fromEntries(this.languageVersions),
      averages: {},
      fastest: {},
      slowest: {}
    };
    
    for (const lang of summary.metadata.languages) {
      summary.averages[lang] = {};
      
      for (const operation of summary.metadata.operations) {
        const results = this.results.filter(r => 
          r.language === lang && 
          r.operation === operation && 
          r.success
        );
        
        if (results.length > 0) {
          summary.averages[lang][operation] = {
            avgTimeMs: this.calculateAverage(results, operation),
            successRate: (results.length / this.results.filter(r => r.language === lang && r.operation === operation).length) * 100,
            totalTests: results.length
          };
        }
      }
    }
    
    // Find fastest and slowest for each operation
    for (const operation of summary.metadata.operations) {
      const operationResults = this.results.filter(r => r.operation === operation && r.success);
      
      if (operationResults.length > 0) {
        const fastest = operationResults.reduce((min, r) => 
          r.executionTimeMs < min.executionTimeMs ? r : min
        );
        const slowest = operationResults.reduce((max, r) => 
          r.executionTimeMs > max.executionTimeMs ? r : max
        );
        
        summary.fastest[operation] = {
          language: fastest.language,
          timeMs: fastest.executionTimeMs,
          recordCount: fastest.recordCount,
          dataType: fastest.dataType
        };
        
        summary.slowest[operation] = {
          language: slowest.language,
          timeMs: slowest.executionTimeMs,
          recordCount: slowest.recordCount,
          dataType: slowest.dataType
        };
      }
    }
    
    return summary;
  }
  
  private generateMarkdownReport(summary: any): string {
    let report = `# MetaDat Cross-Platform Benchmark Report

**Generated:** ${summary.metadata.timestamp}  

## System Information

**Operating System:** ${summary.systemInfo.platform} ${summary.systemInfo.arch}  
**OS Version:** ${summary.systemInfo.osVersion}  
**CPU:** ${summary.systemInfo.cpuModel}  
**CPU Cores:** ${summary.systemInfo.cpuCores}  
**Memory:** ${summary.systemInfo.totalMemoryGB}GB  
**Node.js Version:** ${summary.systemInfo.nodeVersion}  
**Bun Version:** ${summary.systemInfo.bunVersion}  

## Language Versions

| Language | Version | Implementation | Build Info |
|----------|---------|----------------|------------|
`;

    for (const [langName, langInfo] of Object.entries(summary.languageVersions)) {
      const info = langInfo as any;
      report += `| ${langName} | ${info.version} | ${info.implementation} | ${info.buildInfo || 'N/A'} |\n`;
    }

    report += `

## Test Configuration

**Languages Tested:** ${summary.metadata.languages.join(', ')}  
**Test Sizes:** ${summary.metadata.testSizes?.join(', ')} records  
**Data Types:** ${summary.metadata.dataTypes?.join(', ')}  
**Iterations per test:** ${summary.metadata.iterations}  

## Performance Summary

### Average Execution Times (milliseconds)

| Language | JSON→MetaDat | MetaDat→JSON | Parse |
|----------|-------------|-------------|-------|
`;

    for (const lang of summary.metadata.languages) {
      const jsonToMetadat = summary.averages[lang]?.jsonToMetadat?.avgTimeMs?.toFixed(2) || 'N/A';
      const metadatToJson = summary.averages[lang]?.metadatToJson?.avgTimeMs?.toFixed(2) || 'N/A';
      const parse = summary.averages[lang]?.parse?.avgTimeMs?.toFixed(2) || 'N/A';
      
      report += `| ${lang} | ${jsonToMetadat} | ${metadatToJson} | ${parse} |\n`;
    }

    report += `

### Fastest Performance by Operation

`;

    for (const operation of Object.keys(summary.fastest)) {
      const fastest = summary.fastest[operation];
      report += `**${operation}:** ${fastest.language} (${fastest.timeMs.toFixed(2)}ms)\n`;
    }

    report += `

### Success Rates

| Language | JSON→MetaDat | MetaDat→JSON | Parse |
|----------|-------------|-------------|-------|
`;

    for (const lang of summary.metadata.languages) {
      const jsonToMetadat = summary.averages[lang]?.jsonToMetadat?.successRate?.toFixed(1) || 'N/A';
      const metadatToJson = summary.averages[lang]?.metadatToJson?.successRate?.toFixed(1) || 'N/A';
      const parse = summary.averages[lang]?.parse?.successRate?.toFixed(1) || 'N/A';
      
      report += `| ${lang} | ${jsonToMetadat}% | ${metadatToJson}% | ${parse}% |\n`;
    }

    report += `

## Raw Results

See \`raw-results.json\` for detailed timing data for each test execution.

## Test Configuration

- **Test Data:** Generated realistic user and product records
- **Measurement:** Wall-clock execution time of CLI commands
- **Environment:** ${process.platform} ${process.arch}
- **Node.js:** ${process.version}

`;

    return report;
  }
}

// CLI support
if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🎯 MetaDat Cross-Platform Benchmark Runner

Usage:
  bun src/benchmark.ts [options]

Options:
  --languages <lang1,lang2>  Languages to test (default: all available)
                            Available: Go, Node.js, C#, Rust, Python
  --sizes <size1,size2>     Test record counts (default: 100,1000,5000)
  --types <type1,type2>     Data types (default: users,products)
  --iterations <number>     Iterations per test (default: 3)
  --all-languages          Test all available languages
  --help, -h               Show this help

Examples:
  bun src/benchmark.ts --languages Go,Rust --sizes 1000,5000
  bun src/benchmark.ts --all-languages --iterations 5
  bun src/benchmark.ts --types users --sizes 10000
`);
    process.exit(0);
  }
  
  const config: BenchmarkConfig = {};
  
  if (args.includes('--languages')) {
    const langArg = args[args.indexOf('--languages') + 1];
    config.languages = langArg?.split(',').map(l => l.trim());
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
  
  const runner = new BenchmarkRunner(config);
  runner.runBenchmarks().catch(console.error);
}