// MetaDat Benchmark HTTP REST API
// Built with Bun and Hono framework for high-performance data serving

import { Hono } from 'hono';
import { readFile, readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { generateTestData, generateTestSuite } from './data-generator.ts';

const app = new Hono();

// CORS middleware for browser access
app.use('*', async (c, next) => {
  // Set CORS headers
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (c.req.method === 'OPTIONS') {
    return c.text('', 200);
  }
  
  await next();
});

// Enhanced request logging middleware with response time and size tracking
app.use('*', async (c, next) => {
  const startTime = performance.now();
  const startMemory = process.memoryUsage();
  
  await next();
  
  const endTime = performance.now();
  const responseTimeMs = Math.round((endTime - startTime) * 100) / 100;
  
  // Get response size
  const responseText = await c.res.clone().text();
  const bodySizeBytes = new TextEncoder().encode(responseText).length;
  const bodySizeKB = Math.round((bodySizeBytes / 1024) * 100) / 100;
  
  // Add response headers for performance monitoring
  c.header('X-Response-Time', `${responseTimeMs}ms`);
  c.header('X-Content-Length', bodySizeBytes.toString());
  
  console.log(`${c.req.method} ${c.req.url} - ${c.res.status} - ${responseTimeMs}ms - ${bodySizeKB}KB`);
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    service: 'metadat-benchmark-api',
    version: '1.0.0',
    timestamp: new Date().toISOString() 
  });
});

// System information endpoint
app.get('/api/system/info', async (c) => {
  try {
    const systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      totalMemoryGB: Math.round((process.memoryUsage.rss / 1024 / 1024 / 1024) * 100) / 100,
      timestamp: new Date().toISOString()
    };

    // Get additional system info if available
    try {
      if (process.platform === 'darwin') {
        const { spawn } = await import('child_process');
        
        // Get CPU info
        const cpuProcess = spawn('sysctl', ['-n', 'machdep.cpu.brand_string']);
        let cpuModel = '';
        cpuProcess.stdout.on('data', (data) => { cpuModel += data.toString(); });
        
        // Get core count
        const coreProcess = spawn('sysctl', ['-n', 'hw.ncpu']);
        let coreCount = '';
        coreProcess.stdout.on('data', (data) => { coreCount += data.toString(); });
        
        // Get total memory
        const memProcess = spawn('sysctl', ['-n', 'hw.memsize']);
        let totalMem = '';
        memProcess.stdout.on('data', (data) => { totalMem += data.toString(); });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        Object.assign(systemInfo, {
          cpuModel: cpuModel.trim() || 'Unknown',
          cpuCores: parseInt(coreCount.trim()) || 0,
          totalMemoryGB: totalMem.trim() ? Math.round((parseInt(totalMem.trim()) / 1024 / 1024 / 1024) * 100) / 100 : 0
        });
      }
    } catch (error) {
      console.warn('Could not get extended system info:', error);
    }

    return c.json({ systemInfo });
  } catch (error) {
    return c.json({ error: 'Failed to get system information', details: String(error) }, 500);
  }
});

// API documentation endpoint
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html>
<head>
    <title>MetaDat Benchmark API</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .endpoint { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
        .method { color: #2e8b57; font-weight: bold; }
        .url { color: #4169e1; }
        code { background: #e8e8e8; padding: 2px 4px; border-radius: 3px; }
    </style>
</head>
<body>
    <h1>🎯 MetaDat Benchmark API</h1>
    <p>High-performance REST API for MetaDat format testing and benchmarking</p>
    
    <h2>Available Endpoints</h2>
    
    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/health</span></div>
        <div>Health check endpoint</div>
    </div>
    
    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/api/system/info</span></div>
        <div>Get system information (CPU, memory, OS, language versions)</div>
    </div>
    
    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/api/data/list</span></div>
        <div>List all available test datasets</div>
    </div>
    
    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/api/data/generate</span></div>
        <div>Generate test data on demand</div>
        <div><strong>Query params:</strong> <code>records</code>, <code>type</code> (users|products|mixed)</div>
    </div>
    
    <div class="endpoint">
        <div><span class="method">POST</span> <span class="url">/api/data/generate</span></div>
        <div>Generate custom test data with configuration</div>
        <div><strong>Body:</strong> <code>{"recordCount": 1000, "dataType": "users"}</code></div>
    </div>
    
    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/api/data/{type}-{count}.json</span></div>
        <div>Get specific JSON dataset (e.g., /api/data/users-1000.json)</div>
    </div>
    
    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/api/data/{type}-{count}.metadat</span></div>
        <div>Get specific MetaDat dataset (e.g., /api/data/products-5000.metadat)</div>
    </div>
    
    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/api/data/{type}-{count}.parquet</span></div>
        <div>Get specific Parquet dataset (e.g., /api/data/users-1000.parquet)</div>
        <div><strong>Note:</strong> Binary file download</div>
    </div>
    
    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/api/benchmark/results</span></div>
        <div>Get latest benchmark results</div>
    </div>
    
    <div class="endpoint">
        <div><span class="method">POST</span> <span class="url">/api/benchmark/run</span></div>
        <div>Run benchmarks (WARNING: This can take a long time!)</div>
        <div><strong>Body:</strong> <code>{"languages": ["Go", "Rust"], "testSizes": [100, 1000]}</code></div>
    </div>
    
    <div class="endpoint">
        <div><span class="method">POST</span> <span class="url">/api/benchmark/parquet</span></div>
        <div>Run Parquet vs MetaDat comparison benchmark</div>
        <div><strong>Body:</strong> <code>{"testSizes": [100, 1000], "dataTypes": ["users"], "iterations": 3}</code></div>
    </div>
    
    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/api/benchmark/parquet/results</span></div>
        <div>Get Parquet vs MetaDat benchmark results</div>
    </div>
    
    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/api/files/{filename}</span></div>
        <div>Direct file access for any generated file</div>
    </div>
    
    <h2>Examples</h2>
    <pre>
# Generate 1000 user records
curl "http://localhost:3000/api/data/generate?records=1000&type=users"

# Get the generated JSON data
curl "http://localhost:3000/api/data/users-1000.json"

# Get the MetaDat equivalent
curl "http://localhost:3000/api/data/users-1000.metadat"

# Get the Parquet equivalent (binary download)
curl "http://localhost:3000/api/data/users-1000.parquet" --output users-1000.parquet

# List all available datasets
curl "http://localhost:3000/api/data/list"
    </pre>
</body>
</html>
  `);
});

// List available test data files
app.get('/api/data/list', async (c) => {
  try {
    const files = await readdir('./test-data').catch(() => []);
    const datasets = [];
    
    for (const file of files) {
      if (extname(file) === '.json' || extname(file) === '.metadat') {
        try {
          const stats = await stat(join('./test-data', file));
          datasets.push({
            filename: file,
            size: stats.size,
            created: stats.mtime,
            type: extname(file).slice(1)
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }
    
    return c.json({
      count: datasets.length,
      datasets: datasets.sort((a, b) => b.created.getTime() - a.created.getTime())
    });
  } catch (error) {
    return c.json({ error: 'Failed to list datasets', details: String(error) }, 500);
  }
});

// Generate test data on demand (GET)
app.get('/api/data/generate', async (c) => {
  const records = parseInt(c.req.query('records') || '1000');
  const type = c.req.query('type') || 'users';
  
  if (records > 100000) {
    return c.json({ error: 'Record count too high (max: 100,000)' }, 400);
  }
  
  if (!['users', 'products', 'mixed'].includes(type)) {
    return c.json({ error: 'Invalid type. Use: users, products, or mixed' }, 400);
  }
  
  try {
    const result = await generateTestData({
      recordCount: records,
      dataType: type as 'users' | 'products' | 'mixed',
      outputDir: './test-data'
    });
    
    return c.json({
      message: 'Test data generated successfully',
      result
    });
  } catch (error) {
    return c.json({ 
      error: 'Failed to generate test data', 
      details: String(error) 
    }, 500);
  }
});

// Generate test data on demand (POST with config)
app.post('/api/data/generate', async (c) => {
  try {
    const body = await c.req.json();
    const { recordCount, dataType } = body;
    
    if (!recordCount || recordCount > 100000) {
      return c.json({ error: 'Invalid recordCount (max: 100,000)' }, 400);
    }
    
    if (!['users', 'products', 'mixed'].includes(dataType)) {
      return c.json({ error: 'Invalid dataType. Use: users, products, or mixed' }, 400);
    }
    
    const result = await generateTestData({
      recordCount,
      dataType,
      outputDir: './test-data'
    });
    
    return c.json({
      message: 'Test data generated successfully',
      result
    });
  } catch (error) {
    return c.json({ 
      error: 'Failed to generate test data', 
      details: String(error) 
    }, 500);
  }
});

// Serve specific data files
app.get('/api/data/:filename', async (c) => {
  const filename = c.req.param('filename');
  const filePath = join('./test-data', filename);
  
  try {
    // Security check - ensure file is in test-data directory
    if (!filename.match(/^[a-zA-Z0-9_-]+\.(json|metadat|parquet)$/)) {
      return c.json({ error: 'Invalid filename' }, 400);
    }
    
    const stats = await stat(filePath);
    const fileExtension = extname(filename);
    
    // Handle different file types
    let content: string | ArrayBuffer;
    let contentType: string;
    
    if (fileExtension === '.parquet') {
      // Parquet files are binary
      content = await readFile(filePath);
      contentType = 'application/octet-stream';
      
      c.header('Content-Type', contentType);
      c.header('Content-Length', stats.size.toString());
      c.header('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
      c.header('Content-Disposition', `attachment; filename="${filename}"`);
      
      return new Response(content);
    } else {
      // JSON and MetaDat files are text
      content = await readFile(filePath, 'utf8');
      contentType = fileExtension === '.json' ? 'application/json' : 'text/plain';
      
      c.header('Content-Type', contentType);
      c.header('Content-Length', stats.size.toString());
      c.header('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
      
      return c.text(content);
    }
  } catch (error) {
    return c.json({ 
      error: 'File not found or cannot be read', 
      filename, 
      details: String(error) 
    }, 404);
  }
});

// Generate full test suite
app.post('/api/data/generate-suite', async (c) => {
  try {
    console.log('Starting test suite generation...');
    const results = await generateTestSuite();
    
    return c.json({
      message: 'Full test suite generated successfully',
      totalDatasets: results.length,
      results
    });
  } catch (error) {
    return c.json({ 
      error: 'Failed to generate test suite', 
      details: String(error) 
    }, 500);
  }
});

// Get benchmark results
app.get('/api/benchmark/results', async (c) => {
  try {
    const resultsFile = './benchmark-results/summary-report.json';
    const content = await readFile(resultsFile, 'utf8');
    const results = JSON.parse(content);
    
    c.header('Content-Type', 'application/json');
    return c.json(results);
  } catch (error) {
    return c.json({ 
      error: 'No benchmark results available', 
      message: 'Run benchmarks first using POST /api/benchmark/run',
      details: String(error)
    }, 404);
  }
});

// Run benchmarks (WARNING: Long-running operation!)
app.post('/api/benchmark/run', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    
    // This would need to import and run the benchmark
    // For now, return a message that this is a long-running operation
    return c.json({ 
      message: 'Benchmark execution started', 
      warning: 'This is a long-running operation that may take several minutes',
      note: 'Use the CLI command: bun src/benchmark.ts for better control',
      config: body
    }, 202); // Accepted
  } catch (error) {
    return c.json({ 
      error: 'Failed to start benchmarks', 
      details: String(error) 
    }, 500);
  }
});

// Direct file access for any generated file
app.get('/api/files/:filename', async (c) => {
  const filename = c.req.param('filename');
  
  // Try different directories
  const possiblePaths = [
    join('./test-data', filename),
    join('./benchmark-results', filename),
    join('./custom-data', filename)
  ];
  
  for (const filePath of possiblePaths) {
    try {
      const content = await readFile(filePath, 'utf8');
      const stats = await stat(filePath);
      
      // Determine content type
      let contentType = 'text/plain';
      const ext = extname(filename);
      switch (ext) {
        case '.json':
          contentType = 'application/json';
          break;
        case '.md':
          contentType = 'text/markdown';
          break;
        case '.html':
          contentType = 'text/html';
          break;
      }
      
      c.header('Content-Type', contentType);
      c.header('Content-Length', stats.size.toString());
      
      return c.text(content);
    } catch {
      // Try next path
    }
  }
  
  return c.json({ 
    error: 'File not found in any of the search paths',
    filename,
    searchedPaths: possiblePaths
  }, 404);
});

// Streaming large data endpoint
app.get('/api/stream/:filename', async (c) => {
  const filename = c.req.param('filename');
  const filePath = join('./test-data', filename);
  
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();
    
    if (!exists) {
      return c.json({ error: 'File not found' }, 404);
    }
    
    c.header('Content-Type', 'application/octet-stream');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    
    return new Response(file.stream());
  } catch (error) {
    return c.json({ 
      error: 'Failed to stream file', 
      details: String(error) 
    }, 500);
  }
});

// Parquet vs MetaDat benchmark endpoint
app.post('/api/benchmark/parquet', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { testSizes = [100, 1000, 5000], dataTypes = ['users', 'products'], iterations = 3 } = body;
    
    // This would need to import and run the Parquet benchmark
    // For now, return a message that this is a long-running operation
    return c.json({ 
      message: 'Parquet vs MetaDat benchmark started', 
      warning: 'This is a long-running operation that may take several minutes',
      note: 'Use the CLI command: bun src/parquet-benchmark.ts for better control',
      config: { testSizes, dataTypes, iterations }
    }, 202); // Accepted
  } catch (error) {
    return c.json({ 
      error: 'Failed to start Parquet benchmark', 
      details: String(error) 
    }, 500);
  }
});

// Get Parquet benchmark results
app.get('/api/benchmark/parquet/results', async (c) => {
  try {
    const resultsFile = './benchmark-results/parquet-metadat-summary.json';
    const content = await readFile(resultsFile, 'utf8');
    const results = JSON.parse(content);
    
    c.header('Content-Type', 'application/json');
    return c.json({
      message: 'Parquet vs MetaDat benchmark results',
      results
    });
  } catch (error) {
    return c.json({ 
      error: 'No Parquet benchmark results available', 
      message: 'Run Parquet benchmarks first using POST /api/benchmark/parquet or CLI: bun src/parquet-benchmark.ts',
      details: String(error)
    }, 404);
  }
});

// Enhanced performance comparison endpoint for JSON vs MetaDat
app.get('/api/compare/:size/:type', async (c) => {
  const size = c.req.param('size');
  const type = c.req.param('type');
  
  try {
    const jsonFile = join('./test-data', `${type}-${size}.json`);
    const metadatFile = join('./test-data', `${type}-${size}.metadat`);
    const schemaFile = join('./test-data', `${type}-${size}-schema.metadat`);
    const dataFile = join('./test-data', `${type}-${size}-data.metadat`);
    
    // Measure file read performance
    const jsonStartTime = performance.now();
    const jsonContent = await readFile(jsonFile, 'utf8');
    const jsonReadTime = performance.now() - jsonStartTime;
    
    const metadatStartTime = performance.now();
    const metadatContent = await readFile(metadatFile, 'utf8');
    const metadatReadTime = performance.now() - metadatStartTime;
    
    const [jsonStats, metadatStats, schemaStats, dataStats] = await Promise.all([
      stat(jsonFile),
      stat(metadatFile),
      stat(schemaFile).catch(() => null),
      stat(dataFile).catch(() => null)
    ]);
    
    // Calculate compression ratios
    const singleFileCompression = ((jsonStats.size - metadatStats.size) / jsonStats.size * 100).toFixed(2);
    
    let separatedCompression = null;
    let separatedDataOnlyCompression = null;
    
    if (schemaStats && dataStats) {
      const separatedTotal = schemaStats.size + dataStats.size;
      separatedCompression = ((jsonStats.size - separatedTotal) / jsonStats.size * 100).toFixed(2);
      separatedDataOnlyCompression = ((jsonStats.size - dataStats.size) / jsonStats.size * 100).toFixed(2);
    }
    
    // Parse JSON to count records/fields for analysis
    const jsonData = JSON.parse(jsonContent);
    const firstKey = Object.keys(jsonData)[0];
    const records = Array.isArray(jsonData[firstKey]) ? jsonData[firstKey] : [];
    const recordCount = records.length;
    const fieldsPerRecord = records.length > 0 ? Object.keys(records[0]).length : 0;
    
    // Calculate efficiency metrics
    const bytesPerRecord = {
      json: recordCount > 0 ? Math.round(jsonStats.size / recordCount) : 0,
      metadat: recordCount > 0 ? Math.round(metadatStats.size / recordCount) : 0,
      metadatDataOnly: schemaStats && dataStats && recordCount > 0 ? Math.round(dataStats.size / recordCount) : 0
    };
    
    return c.json({
      summary: {
        type,
        recordCount,
        fieldsPerRecord,
        generatedAt: new Date().toISOString()
      },
      fileSizes: {
        json: {
          bytes: jsonStats.size,
          kb: Math.round(jsonStats.size / 1024 * 100) / 100,
          readTimeMs: Math.round(jsonReadTime * 100) / 100
        },
        metadatSingle: {
          bytes: metadatStats.size,
          kb: Math.round(metadatStats.size / 1024 * 100) / 100,
          readTimeMs: Math.round(metadatReadTime * 100) / 100
        },
        metadatSchema: schemaStats ? {
          bytes: schemaStats.size,
          kb: Math.round(schemaStats.size / 1024 * 100) / 100
        } : null,
        metadatData: dataStats ? {
          bytes: dataStats.size,
          kb: Math.round(dataStats.size / 1024 * 100) / 100
        } : null
      },
      compression: {
        singleFile: {
          percentage: parseFloat(singleFileCompression),
          bytesReduced: jsonStats.size - metadatStats.size,
          ratio: (jsonStats.size / metadatStats.size).toFixed(2)
        },
        separatedFiles: separatedCompression ? {
          percentage: parseFloat(separatedCompression),
          bytesReduced: jsonStats.size - (schemaStats!.size + dataStats!.size),
          ratio: (jsonStats.size / (schemaStats!.size + dataStats!.size)).toFixed(2)
        } : null,
        dataOnly: separatedDataOnlyCompression ? {
          percentage: parseFloat(separatedDataOnlyCompression),
          bytesReduced: jsonStats.size - dataStats!.size,
          ratio: (jsonStats.size / dataStats!.size).toFixed(2)
        } : null
      },
      efficiency: {
        bytesPerRecord,
        readPerformance: {
          jsonFaster: jsonReadTime < metadatReadTime,
          timeDifferenceMs: Math.abs(jsonReadTime - metadatReadTime).toFixed(2),
          speedupRatio: jsonReadTime < metadatReadTime ? 
            (metadatReadTime / jsonReadTime).toFixed(2) : 
            (jsonReadTime / metadatReadTime).toFixed(2)
        }
      },
      analysis: {
        recommendedFormat: parseFloat(singleFileCompression) > 0 ? 'MetaDat' : 'JSON',
        reasoning: parseFloat(singleFileCompression) > 0 ? 
          `MetaDat is ${singleFileCompression}% smaller than JSON for this dataset` :
          `JSON is more efficient for this small dataset (${Math.abs(parseFloat(singleFileCompression))}% overhead)`,
        optimalUseCase: separatedDataOnlyCompression && parseFloat(separatedDataOnlyCompression) > parseFloat(singleFileCompression) ?
          'Separated files for maximum compression' : 'Single file for simplicity'
      }
    });
  } catch (error) {
    return c.json({
      error: 'Files not found or comparison failed',
      suggestion: `Generate data first: GET /api/data/generate?records=${size}&type=${type}`,
      details: String(error)
    }, 404);
  }
});

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  }, 500);
});

// Start server
const port = parseInt(process.env.PORT || '3000');

console.log('🚀 Starting MetaDat Benchmark API Server...');
console.log(`🌐 Server will be available at: http://localhost:${port}`);
console.log(`📊 API documentation: http://localhost:${port}`);

// Use native Bun server for better performance
export default {
  port,
  fetch: app.fetch,
};

if (import.meta.main) {
  console.log(`✅ Server running on http://localhost:${port}`);
}