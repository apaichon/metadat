# MetaDat Technical Specification v1.0

**Author:** Apaichon Punopas  
**Email:** apaichon@gmail.com  
**Date:** December 17, 2025  

## Table of Contents
1. [Overview](#overview)
2. [File Structure](#file-structure)
3. [Type System](#type-system)
4. [Schema Definition](#schema-definition)
5. [Data Representation](#data-representation)
6. [Parsing Algorithm](#parsing-algorithm)
7. [Serialization Rules](#serialization-rules)
8. [Error Handling](#error-handling)
9. [File Organization](#file-organization)
10. [Implementation Guidelines](#implementation-guidelines)

## Overview

MetaDat (Meta-Data-Aware Text) is a schema-first data serialization format that separates type definitions from data content to achieve:
- **40-60% size reduction** compared to JSON
- **Built-in type validation**
- **Human readability**
- **Fast parsing performance**

### Design Principles
1. Schema and data separation for efficiency
2. Minimal syntax overhead
3. Type-aware encoding
4. Human-readable format
5. Streaming-friendly structure

## File Structure

### Basic Structure
```
meta
    [schema definitions]
data
    [actual data]
```

### Sections
- **meta**: Contains type definitions and field schemas
- **data**: Contains the actual values following the schema

### Example
```
meta
    name: string
    age: int
    scores: float64[]
    balance: decimal
    avatar: binary
    flags: byte[]
data
    name:
        John Doe
    age:
        42
    scores[3]: 85.5|92.0|88.3
    balance:
        12345.6789012345
    avatar:
        SGVsbG8gV29ybGQ=
    flags[3]: 0|128|255
```

## Type System

### Basic Types
| Type | Description | Example |
|------|-------------|---------|
| `string` | UTF-8 text | `Hello World` |
| `int` | 32-bit signed integer | `42` |
| `int32` | 32-bit signed integer | `42` |
| `int64` | 64-bit signed integer | `9223372036854775807` |
| `float32` | 32-bit floating point | `3.14` |
| `float64` | 64-bit floating point | `3.141592653589793` |
| `decimal` | Arbitrary-precision decimal | `12345.6789` |
| `bool` | Boolean value | `true` or `false` |
| `binary` | Base64-encoded binary data | `SGVsbG8gV29ybGQ=` |
| `byte` | Single unsigned byte (0-255) | `255` |

### Complex Types

#### Arrays
- Syntax: `type[]`
- Example: `string[]`, `int[]`, `{field:type}[]`

#### Objects
- Syntax: `{field1:type1|field2:type2|...}`
- Fields separated by pipe (`|`)
- Example: `{name:string|age:int|active:bool}`

#### Nested Types
- Arrays of objects: `{name:string|score:float64}[]`
- Objects with arrays: `{items:string[]|count:int}`
- Deeply nested: `{data:{values:int[]|meta:string}}`

## Schema Definition

### Field Declaration
```
fieldName: type
```

### Array Size Declaration
Arrays can declare their size in the data section:
```
arrayName[size]: value1|value2|...
```

### Object Field Order
- Fields in objects must maintain declaration order
- Pipe-separated values correspond to schema field order

### Schema Examples
```
meta
    # Simple fields
    title: string
    count: int
    ratio: float64
    price: decimal

    # Binary and byte fields
    avatar: binary
    statusCode: byte

    # Array field
    tags: string[]
    payload: byte[]

    # Object field
    author: {name:string|email:string}

    # Array of objects
    items: {id:int|label:string|price:decimal}[]
```

## Data Representation

### Simple Values
```
fieldName:
    value
```

### Arrays

#### Inline Format (Simple Types)
```
arrayName[count]: value1|value2|value3
```

#### Multi-line Format (Complex Types)
```
arrayName[count]:
    value1
    value2
    value3
```

### Objects

#### Inline Format
```
objectName: value1|value2|value3
```
Values correspond to schema field order.

#### Multi-line Format
```
objectName:
    field1Value|field2Value|field3Value
```

### Arrays of Objects
```
items[2]:
    1|Product A|19.99
    2|Product B|29.99
```

### Escape Sequences
- Pipe in strings: `\|`
- Backslash: `\\`
- Newline in strings: `\n`
- Tab in strings: `\t`

## Parsing Algorithm

### High-Level Algorithm
```
1. Split content into meta and data sections
2. Parse schema from meta section
3. Build field type mapping
4. Parse data according to schema
5. Validate types during parsing
6. Return structured data
```

### Schema Parsing
```
for each line in meta section:
    if line contains ':':
        fieldName = substring before ':'
        typeStr = substring after ':'
        fieldType = parseType(typeStr)
        schema[fieldName] = fieldType
```

### Type Parsing
```
parseType(typeStr):
    if typeStr ends with '[]':
        elementType = parseType(typeStr without '[]')
        return ArrayType(elementType)
    
    if typeStr starts with '{' and ends with '}':
        fields = parseObjectFields(typeStr)
        return ObjectType(fields)
    
    return BasicType(typeStr)
```

### Data Parsing
```
parseData(dataSection, schema):
    result = {}
    currentField = null
    
    for each line in dataSection:
        if line ends with ':':
            currentField = line without ':'
            
            if line contains '[' and ']':
                arraySize = extract number from brackets
                result[currentField] = parseArray(schema[currentField], arraySize)
            else:
                result[currentField] = parseValue(schema[currentField])
    
    return result
```

## Serialization Rules

### Value Formatting
1. **Strings**: Written as-is, escape pipe characters
2. **Numbers**: Convert to string representation
3. **Decimals**: Written as exact decimal string (no floating-point rounding)
4. **Booleans**: `true` or `false`
5. **Binary**: Encode raw bytes as Base64 string
6. **Byte**: Write as unsigned integer (0-255)
7. **Null/Undefined**: Empty string

### Array Serialization
```
if all elements are simple types:
    write as: fieldName[size]: elem1|elem2|elem3
else:
    write as:
    fieldName[size]:
        element1
        element2
        element3
```

### Object Serialization
1. Extract values in schema field order
2. Join with pipe delimiter
3. Write as single line

### Indentation
- Use 4 spaces for indentation
- Nested structures increase indentation level

## Error Handling

### Parse Errors
1. **Missing meta section**: "No 'meta' section found"
2. **Missing data section**: "No 'data' section found"
3. **Invalid type syntax**: "Invalid type definition: [type]"
4. **Type mismatch**: "Expected [type] but got [actual]"
5. **Array size mismatch**: "Expected [n] elements but got [m]"

### Validation Errors
1. **Missing required field**: "Field [name] not found in data"
2. **Extra fields**: "Unknown field [name] in data"
3. **Invalid value**: "Invalid [type] value: [value]"

### Recovery Strategies
- Continue parsing on non-critical errors
- Collect all errors for comprehensive reporting
- Provide line numbers for debugging

## File Organization

### Single File Format
```
file.metadat
├── meta section
└── data section
```

### Separated Files Format
```
schema.metadat  # Contains only meta section
data.metadat    # Contains only data section
```

### Naming Conventions
- Single file: `*.metadat`
- Schema file: `*.metadat.schema` or `*-schema.metadat`
- Data file: `*.metadat.data` or `*-data.metadat`

### Use Case Guidelines

#### Single File
- Self-contained data
- One-time transfers
- Small to medium datasets
- Configuration files

#### Separated Files
- API responses (cache schema)
- Streaming data
- Large datasets
- Multiple data files with same schema

## Implementation Guidelines

### Parser Requirements
1. **Strict mode**: Enforce type validation
2. **Lenient mode**: Best-effort parsing
3. **Streaming support**: Process large files
4. **Memory efficiency**: Avoid loading entire file

### Performance Optimizations
1. **Schema caching**: Reuse parsed schemas
2. **Lazy parsing**: Parse on demand
3. **Buffer pooling**: Reuse memory buffers
4. **Parallel processing**: Parse independent sections concurrently

### Language-Specific Considerations

#### Statically Typed Languages (Go, C#, Rust)
- Generate type-safe structs from schema
- Compile-time validation where possible
- Use generics for type flexibility

#### Dynamically Typed Languages (JavaScript, Python)
- Runtime type validation
- Schema-driven object construction
- Optional TypeScript/type hint generation

### API Design
```
// Core functions
parseMetaDat(content: string): object
parseFromSeparated(schema: string, data: string): object
objectToMetaDat(obj: object): string
writeSeparated(obj: object): {schema: string, data: string}
validate(content: string): boolean

// Streaming API
createParser(schema: string): StreamParser
parser.write(chunk: string): void
parser.end(): object
```

### Error Reporting
```
interface ParseError {
    line: number
    column: number
    field: string
    message: string
    severity: 'error' | 'warning'
}
```

### Extension Points
1. **Custom type handlers**: Register parsers for domain types
2. **Validation hooks**: Custom validation logic
3. **Serialization hooks**: Custom formatting
4. **Schema transformers**: Migration between versions

## Version History
- **v1.1** (2025): Extended type system
  - Added `decimal` type for arbitrary-precision decimal values
  - Added `binary` type for Base64-encoded binary data
  - Added `byte` type for single unsigned byte values (0-255)
- **v1.0** (2025): Initial specification
  - Basic type system
  - Single and separated file formats
  - Reference implementations in 5 languages

## Future Considerations
1. **Binary encoding**: Optional binary format
2. **Schema inheritance**: Reuse and extend schemas
3. **Compression**: Built-in compression support
4. **Streaming protocol**: Native streaming format
5. **Schema evolution**: Versioning and migration