// MetaDat Benchmark Data Generator
// Ported from ../performance/data-generator.js for Bun/TypeScript

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Data templates for realistic test data
const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack', 'Kate', 'Liam', 'Mia', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Ruby', 'Sam', 'Tara'];
const LAST_NAMES = ['Johnson', 'Smith', 'Davis', 'Wilson', 'Brown', 'Miller', 'Taylor', 'Anderson', 'Thompson', 'Martinez', 'Garcia', 'Rodriguez', 'Lewis', 'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright'];
const DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'company.com', 'tech.org', 'example.net'];
const CATEGORIES = ['Electronics', 'Furniture', 'Clothing', 'Books', 'Sports', 'Home', 'Garden', 'Auto', 'Health', 'Beauty'];
const PRODUCT_TYPES = ['Pro', 'Basic', 'Premium', 'Standard', 'Deluxe', 'Lite', 'Plus', 'Max', 'Ultra', 'Classic'];

interface User {
  id: number;
  name: string;
  age: number;
  email: string;
  active: boolean;
  salary: number;
  department: string;
  joinDate: string;
}

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
  rating: number;
  reviews: number;
  SKU: string;
}

interface GenerationConfig {
  recordCount: number;
  dataType?: 'users' | 'products' | 'mixed';
  outputDir?: string;
}

interface GenerationResult {
  recordCount: number;
  dataType: string;
  fileSizes: {
    json: number;
    metaDatSingle?: number;
    metaDatData?: number;
    metaDatSchema?: number;
    metaDatSeparated?: number;
  };
  compression?: {
    singleFileVsJson?: string;
    dataOnlyVsJson?: string;
  };
  files: {
    json: string;
    metaDatSingle?: string;
    schema?: string;
    data?: string;
  };
  generationTimeMs: number;
}

function generateRandomUser(id: number): User {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const domain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
  
  return {
    id: id,
    name: `${firstName} ${lastName}`,
    age: Math.floor(Math.random() * 50) + 18,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
    active: Math.random() > 0.3,
    salary: Math.floor(Math.random() * 80000) + 30000,
    department: CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
    joinDate: new Date(2020 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0]
  };
}

function generateRandomProduct(id: number): Product {
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const type = PRODUCT_TYPES[Math.floor(Math.random() * PRODUCT_TYPES.length)];
  
  return {
    id: id,
    name: `${category} ${type}`,
    price: Math.round((Math.random() * 1000 + 10) * 100) / 100,
    category: category,
    inStock: Math.random() > 0.2,
    rating: Math.round((Math.random() * 4 + 1) * 10) / 10,
    reviews: Math.floor(Math.random() * 500),
    SKU: `${category.substring(0,3).toUpperCase()}${String(id).padStart(6, '0')}`
  };
}

// Simple MetaDat converter for benchmarking (no external dependencies)
function convertToMetaDat(data: any): { single: string, schema: string, dataOnly: string } {
  if (data.users) {
    const schema = `meta\n    users: {id:int|name:string|age:int|email:string|active:bool|salary:int|department:string|joinDate:string}[]`;
    
    let dataSection = `data\n    users[${data.users.length}]:`;
    const userLines = data.users.map((user: User) => 
      `${user.id}|${user.name}|${user.age}|${user.email}|${user.active}|${user.salary}|${user.department}|${user.joinDate}`
    );
    
    const dataContent = dataSection + '\n        ' + userLines.join('|\n        ');
    const single = schema + '\n' + dataContent;
    const dataOnly = `data\n    users[${data.users.length}]:\n        ` + userLines.join('|\n        ');
    
    return { single, schema, dataOnly };
  }
  
  if (data.products) {
    const schema = `meta\n    products: {id:int|name:string|price:float64|category:string|inStock:bool|rating:float64|reviews:int|SKU:string}[]`;
    
    let dataSection = `data\n    products[${data.products.length}]:`;
    const productLines = data.products.map((product: Product) => 
      `${product.id}|${product.name}|${product.price}|${product.category}|${product.inStock}|${product.rating}|${product.reviews}|${product.SKU}`
    );
    
    const dataContent = dataSection + '\n        ' + productLines.join('|\n        ');
    const single = schema + '\n' + dataContent;
    const dataOnly = `data\n    products[${data.products.length}]:\n        ` + productLines.join('|\n        ');
    
    return { single, schema, dataOnly };
  }
  
  throw new Error('Unsupported data type');
}

export async function generateTestData(config: GenerationConfig): Promise<GenerationResult> {
  const { recordCount, dataType = 'users', outputDir = './test-data' } = config;
  const startTime = performance.now();
  
  console.log(`Generating ${recordCount} ${dataType} records...`);
  
  // Create output directory
  await mkdir(outputDir, { recursive: true });
  
  let data: any;
  
  if (dataType === 'users') {
    const users: User[] = [];
    for (let i = 1; i <= recordCount; i++) {
      users.push(generateRandomUser(i));
    }
    data = { users };
  } else if (dataType === 'products') {
    const products: Product[] = [];
    for (let i = 1; i <= recordCount; i++) {
      products.push(generateRandomProduct(i));
    }
    data = { products };
  } else if (dataType === 'mixed') {
    const users: User[] = [];
    const products: Product[] = [];
    const halfCount = Math.floor(recordCount / 2);
    
    for (let i = 1; i <= halfCount; i++) {
      users.push(generateRandomUser(i));
      products.push(generateRandomProduct(i));
    }
    data = { users, products };
  } else {
    throw new Error(`Unknown data type: ${dataType}`);
  }
  
  // Generate JSON file
  const jsonContent = JSON.stringify(data, null, 2);
  const jsonFile = join(outputDir, `${dataType}-${recordCount}.json`);
  await writeFile(jsonFile, jsonContent);
  
  const jsonSize = Buffer.byteLength(jsonContent, 'utf8');
  
  const result: GenerationResult = {
    recordCount,
    dataType,
    fileSizes: {
      json: jsonSize
    },
    files: {
      json: jsonFile
    },
    generationTimeMs: performance.now() - startTime
  };
  
  // Generate MetaDat files if not mixed data (for benchmarking consistency)
  if (dataType !== 'mixed') {
    try {
      const metaDat = convertToMetaDat(data);
      
      // Single file format
      const metaDatSingleFile = join(outputDir, `${dataType}-${recordCount}.metadat`);
      await writeFile(metaDatSingleFile, metaDat.single);
      
      // Separated files
      const schemaFile = join(outputDir, `${dataType}-${recordCount}-schema.metadat`);
      const dataFile = join(outputDir, `${dataType}-${recordCount}-data.metadat`);
      await writeFile(schemaFile, metaDat.schema);
      await writeFile(dataFile, metaDat.dataOnly);
      
      // Calculate sizes
      const metaDatSingleSize = Buffer.byteLength(metaDat.single, 'utf8');
      const metaDatDataSize = Buffer.byteLength(metaDat.dataOnly, 'utf8');
      const metaDatSchemaSize = Buffer.byteLength(metaDat.schema, 'utf8');
      
      result.fileSizes.metaDatSingle = metaDatSingleSize;
      result.fileSizes.metaDatData = metaDatDataSize;
      result.fileSizes.metaDatSchema = metaDatSchemaSize;
      result.fileSizes.metaDatSeparated = metaDatDataSize + metaDatSchemaSize;
      
      result.compression = {
        singleFileVsJson: ((jsonSize - metaDatSingleSize) / jsonSize * 100).toFixed(2),
        dataOnlyVsJson: ((jsonSize - metaDatDataSize) / jsonSize * 100).toFixed(2)
      };
      
      result.files.metaDatSingle = metaDatSingleFile;
      result.files.schema = schemaFile;
      result.files.data = dataFile;
      
      console.log(`Results for ${recordCount} ${dataType} records:`);
      console.log(`  JSON: ${jsonSize.toLocaleString()} bytes`);
      console.log(`  MetaDat Single: ${metaDatSingleSize.toLocaleString()} bytes (${result.compression.singleFileVsJson}% vs JSON)`);
      console.log(`  MetaDat Data Only: ${metaDatDataSize.toLocaleString()} bytes (${result.compression.dataOnlyVsJson}% vs JSON)`);
      console.log(`  MetaDat Schema: ${metaDatSchemaSize.toLocaleString()} bytes`);
    } catch (error) {
      console.warn(`Could not generate MetaDat files: ${error}`);
    }
  }
  
  result.generationTimeMs = performance.now() - startTime;
  console.log(`  Generation time: ${result.generationTimeMs.toFixed(2)}ms`);
  
  return result;
}

export async function generateTestSuite(): Promise<GenerationResult[]> {
  const configs: GenerationConfig[] = [
    { recordCount: 10, dataType: 'users' },
    { recordCount: 100, dataType: 'users' },
    { recordCount: 1000, dataType: 'users' },
    { recordCount: 5000, dataType: 'users' },
    { recordCount: 10000, dataType: 'users' },
    { recordCount: 10, dataType: 'products' },
    { recordCount: 100, dataType: 'products' },
    { recordCount: 1000, dataType: 'products' },
    { recordCount: 5000, dataType: 'products' },
    { recordCount: 10000, dataType: 'products' },
    { recordCount: 1000, dataType: 'mixed' },
    { recordCount: 50000, dataType: 'users' },  // Large dataset for API testing
    { recordCount: 100000, dataType: 'products' } // Very large dataset
  ];
  
  const results: GenerationResult[] = [];
  
  console.log('🚀 Starting MetaDat benchmark data generation suite...\n');
  
  for (const config of configs) {
    try {
      const result = await generateTestData(config);
      results.push(result);
    } catch (error) {
      console.error(`Failed to generate ${config.recordCount} ${config.dataType} records:`, error);
    }
  }
  
  // Generate summary report
  const reportFile = './test-data/generation-report.json';
  await writeFile(reportFile, JSON.stringify(results, null, 2));
  
  console.log('\n✅ Test data generation complete!');
  console.log(`📊 Summary report saved to: ${reportFile}`);
  console.log(`📁 Generated ${results.length} test datasets`);
  
  const totalJsonSize = results.reduce((sum, r) => sum + r.fileSizes.json, 0);
  console.log(`📏 Total JSON size: ${(totalJsonSize / 1024 / 1024).toFixed(2)}MB`);
  
  return results;
}

// CLI support for direct execution
if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🎯 MetaDat Benchmark Data Generator

Usage:
  bun src/data-generator.ts [options]

Options:
  --records <number>        Number of records to generate (default: 1000)
  --type <users|products|mixed>  Type of data to generate (default: users)
  --output <dir>           Output directory (default: ./test-data)
  --suite                  Generate full test suite with multiple sizes
  --help, -h               Show this help

Examples:
  bun src/data-generator.ts --records 5000 --type users
  bun src/data-generator.ts --suite
  bun src/data-generator.ts --records 100 --type products --output ./custom-data
`);
    process.exit(0);
  }
  
  if (args.includes('--suite')) {
    generateTestSuite().catch(console.error);
  } else {
    const recordCount = parseInt(args[args.indexOf('--records') + 1] || '1000');
    const dataType = (args[args.indexOf('--type') + 1] || 'users') as 'users' | 'products' | 'mixed';
    const outputDir = args[args.indexOf('--output') + 1] || './test-data';
    
    generateTestData({ recordCount, dataType, outputDir }).catch(console.error);
  }
}