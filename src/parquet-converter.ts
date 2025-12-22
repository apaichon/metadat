// ParquetJS-based converter for MetaDat benchmarking
// Native TypeScript implementation using parquetjs library

import * as parquet from 'parquetjs';
import { readFile, writeFile, stat } from 'fs/promises';

export interface ParquetConversionResult {
  conversionTimeMs: number;
  jsonSizeBytes: number;
  parquetSizeBytes: number;
  compressionRatio: number;
  recordCount: number;
}

export interface ParquetReadResult {
  readTimeMs: number;
  recordCount: number;
  columnCount: number;
  memoryUsageBytes?: number;
}

export class ParquetConverter {
  
  /**
   * Convert JSON to Parquet format
   */
  public async jsonToParquet(jsonFilePath: string, parquetFilePath: string): Promise<ParquetConversionResult> {
    const startTime = performance.now();
    
    // Read and parse JSON data
    const jsonContent = await readFile(jsonFilePath, 'utf8');
    const jsonData = JSON.parse(jsonContent);
    
    // Extract records array from JSON structure
    let records: any[] = [];
    if (Array.isArray(jsonData)) {
      records = jsonData;
    } else if (typeof jsonData === 'object') {
      // Look for the first array property
      for (const [key, value] of Object.entries(jsonData)) {
        if (Array.isArray(value)) {
          records = value;
          break;
        }
      }
      if (records.length === 0) {
        // If no array found, treat the object as a single record
        records = [jsonData];
      }
    } else {
      throw new Error('Unsupported JSON structure');
    }
    
    if (records.length === 0) {
      throw new Error('No records found in JSON data');
    }
    
    // Infer schema from the first record
    const schema = this.inferSchema(records[0]);
    
    // Create Parquet writer
    const writer = await parquet.ParquetWriter.openFile(schema, parquetFilePath);
    
    // Write all records
    for (const record of records) {
      await writer.appendRow(this.normalizeRecord(record, schema));
    }
    
    // Close the writer
    await writer.close();
    
    const conversionTime = performance.now() - startTime;
    
    // Get file sizes
    const jsonStats = await stat(jsonFilePath);
    const parquetStats = await stat(parquetFilePath);
    
    const compressionRatio = ((jsonStats.size - parquetStats.size) / jsonStats.size) * 100;
    
    return {
      conversionTimeMs: Math.round(conversionTime * 100) / 100,
      jsonSizeBytes: jsonStats.size,
      parquetSizeBytes: parquetStats.size,
      compressionRatio: Math.round(compressionRatio * 100) / 100,
      recordCount: records.length
    };
  }
  
  /**
   * Convert Parquet to JSON format
   */
  public async parquetToJson(parquetFilePath: string, jsonFilePath: string): Promise<ParquetConversionResult> {
    const startTime = performance.now();
    
    // Read Parquet file
    const reader = await parquet.ParquetReader.openFile(parquetFilePath);
    
    // Create cursor to read all records
    const cursor = reader.getCursor();
    
    const records: any[] = [];
    let record = null;
    while (record = await cursor.next()) {
      records.push(record);
    }
    
    // Close the reader
    await reader.close();
    
    // Write to JSON file
    const jsonData = { data: records };
    await writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2));
    
    const conversionTime = performance.now() - startTime;
    
    // Get file sizes
    const parquetStats = await stat(parquetFilePath);
    const jsonStats = await stat(jsonFilePath);
    
    return {
      conversionTimeMs: Math.round(conversionTime * 100) / 100,
      jsonSizeBytes: jsonStats.size,
      parquetSizeBytes: parquetStats.size,
      compressionRatio: 0, // Not applicable for this direction
      recordCount: records.length
    };
  }
  
  /**
   * Benchmark Parquet file reading performance
   */
  public async benchmarkRead(parquetFilePath: string): Promise<ParquetReadResult> {
    const startTime = performance.now();
    
    // Read Parquet file
    const reader = await parquet.ParquetReader.openFile(parquetFilePath);
    
    // Get schema info
    const schema = reader.getSchema();
    const columnCount = schema.fieldList?.length || 0;
    
    // Create cursor to read all records
    const cursor = reader.getCursor();
    
    let recordCount = 0;
    let record = null;
    while (record = await cursor.next()) {
      recordCount++;
    }
    
    // Close the reader
    await reader.close();
    
    const readTime = performance.now() - startTime;
    
    return {
      readTimeMs: Math.round(readTime * 100) / 100,
      recordCount,
      columnCount
    };
  }
  
  /**
   * Infer Parquet schema from a JavaScript object
   */
  private inferSchema(record: any): parquet.ParquetSchema {
    const fields: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(record)) {
      fields[key] = this.inferFieldType(value);
    }
    
    return new parquet.ParquetSchema(fields);
  }
  
  /**
   * Infer field type from a value
   */
  private inferFieldType(value: any): any {
    if (value === null || value === undefined) {
      return { type: 'UTF8', optional: true };
    }
    
    switch (typeof value) {
      case 'boolean':
        return { type: 'BOOLEAN' };
      case 'number':
        // Check if it's an integer or float
        if (Number.isInteger(value)) {
          // Check the range to determine appropriate integer type
          if (value >= -2147483648 && value <= 2147483647) {
            return { type: 'INT32' };
          } else {
            return { type: 'INT64' };
          }
        } else {
          return { type: 'DOUBLE' };
        }
      case 'string':
        return { type: 'UTF8' };
      case 'object':
        if (Array.isArray(value)) {
          // For arrays, we'll just store as string for simplicity
          return { type: 'UTF8' };
        } else {
          // For objects, we'll serialize to JSON string
          return { type: 'UTF8' };
        }
      default:
        return { type: 'UTF8' };
    }
  }
  
  /**
   * Normalize record to match schema expectations
   */
  private normalizeRecord(record: any, schema: parquet.ParquetSchema): any {
    const normalized: any = {};
    
    for (const field of schema.fieldList || []) {
      const fieldName = field.name;
      let value = record[fieldName];
      
      // Handle null/undefined values
      if (value === null || value === undefined) {
        normalized[fieldName] = null;
        continue;
      }
      
      // Convert complex objects/arrays to JSON strings
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      
      // Ensure numeric types are properly formatted
      if (field.primitiveType === 'INT32' || field.primitiveType === 'INT64') {
        value = parseInt(value);
        if (isNaN(value)) value = 0;
      } else if (field.primitiveType === 'DOUBLE' || field.primitiveType === 'FLOAT') {
        value = parseFloat(value);
        if (isNaN(value)) value = 0.0;
      }
      
      normalized[fieldName] = value;
    }
    
    return normalized;
  }
}

// Export convenience functions
export const parquetConverter = new ParquetConverter();

export async function jsonToParquet(jsonFile: string, parquetFile: string): Promise<ParquetConversionResult> {
  return parquetConverter.jsonToParquet(jsonFile, parquetFile);
}

export async function parquetToJson(parquetFile: string, jsonFile: string): Promise<ParquetConversionResult> {
  return parquetConverter.parquetToJson(parquetFile, jsonFile);
}

export async function benchmarkParquetRead(parquetFile: string): Promise<ParquetReadResult> {
  return parquetConverter.benchmarkRead(parquetFile);
}