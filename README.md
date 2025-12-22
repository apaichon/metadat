# Metadat - Meta-Data-Aware Text Format

## What is Metadat?

Metadat is a novel data serialization format designed as a more efficient alternative to JSON. It achieves 40-60% file size reduction while maintaining human readability and adding built-in type validation through explicit schema definitions.

## Purpose

Metadat addresses key limitations of JSON:
- **Verbosity**: JSON's repetitive syntax leads to large file sizes
- **Type Safety**: JSON lacks built-in type information, requiring external validation
- **Performance**: Parsing complexity increases with nested structures

Metadat solves these issues by:
- Using compact syntax with pipe delimiters (`|`) instead of commas and quotes
- Embedding schema definitions directly in the format
- Simplifying parsing through clear structure separation

## Inspiration

The Metadat format was inspired by:
- **TOON Format**: A compact encoding system for LLM prompts that demonstrated significant size reductions
- **Protocol Buffers**: Schema-first approach for type safety
- **CSV**: Simple delimited format for tabular data
- **Real-world needs**: API bandwidth optimization, configuration management, and data storage efficiency

The research emerged from observing that modern applications often transmit repetitive JSON structures where schema information could be separated from data for better efficiency.

## Technical Specifications

### Format Structure

Metadat files consist of two sections:

```
meta
    [schema definitions]
data
    [actual data]
```

### Type System

**Basic Types:**
- `string` - UTF-8 encoded text
- `int`, `int32`, `int64` - Signed integers  
- `float32`, `float64` - Floating-point numbers
- `bool` - Boolean values (true/false)

**Complex Types:**
- Arrays: `type[]` (e.g., `string[]`, `int[]`)
- Objects: `{field1:type1|field2:type2|...}`
- Nested structures supported

### Key Features

1. **Pipe Delimited**: Uses `|` to separate values, eliminating need for quotes
2. **Compact Arrays**: `arrayName[size]: val1|val2|val3`
3. **Schema Validation**: Type checking during parsing
4. **Escape Sequences**: Support for `\|`, `\\`, `\n`, `\t`
5. **File Modes**: Single file or separated schema/data files

### Example

JSON (353 bytes):
```json
{
  "friends": ["ana", "luis", "sam"],
  "hikes": [
    {"id": 1, "name": "Blue Lake Trail", "distanceKm": 7.5},
    {"id": 2, "name": "Eagle Peak", "distanceKm": 12.3},
    {"id": 3, "name": "Sunset Ridge", "distanceKm": 5.8},
    {"id": 4, "name": "Crystal Falls", "distanceKm": 9.2},
    {"id": 5, "name": "Pine Valley Loop", "distanceKm": 6.7}
  ]
}
```

Metadat (269 bytes):
```
meta
    friends: string[]
    hikes: {id:int|name:string|distanceKm:float32}[]
data
    friends[3]: ana|luis|sam
    hikes[5]:
        1|Blue Lake Trail|7.5
        2|Eagle Peak|12.3
        3|Sunset Ridge|5.8
        4|Crystal Falls|9.2
        5|Pine Valley Loop|6.7
```

## Programming Language Implementations

### 1. Go Implementation
**Repository**: [`metadat-go`](https://github.com/apaichon/metadat-go)
- Full parser and converter implementation
- CLI tools for JSON↔Metadat conversion
- Excellent performance characteristics
- Idiomatic Go with error handling

### 2. Rust Implementation  
**Repository**: [`metadat-rs`](https://github.com/apaichon/metadat-rs)
- Fastest benchmark performance (~6ms for 1000 records)
- Memory-efficient streaming support
- Strong type safety with Rust's type system
- Production-ready with comprehensive tests

### 3. Node.js Implementation
**Repository**: [`metadat-nodejs`](https://github.com/apaichon/metadat-nodejs)
- NPM package for easy integration
- Browser and Node.js compatibility
- TypeScript definitions included
- Suitable for web applications

### 4. Python Implementation
**Repository**: [`metadat-py`](https://github.com/apaichon/metadat-py)
- Pip-installable package
- Pythonic API design
- Integration with popular data libraries
- Good for data science workflows

### 5. C# Implementation
**Repository**: [`metadat-csharp`](https://github.com/apaichon/metadat-csharp)
- .NET Standard compatible
- NuGet package available
- LINQ support for data queries
- Enterprise application ready

## Use Cases

- **API Communication**: Reduce bandwidth usage for mobile/web applications
- **Configuration Files**: Type-safe configuration with built-in validation
- **Data Storage**: Efficient storage for logs, metrics, and time-series data
- **Microservices**: Fast data exchange between services
- **IoT Applications**: Minimal overhead for constrained devices

## Getting Started

Each language implementation includes:
- Parser for Metadat to native objects
- Converter between JSON and Metadat formats
- CLI tools for file conversion
- Comprehensive documentation and examples

### Setup Instructions for Benchmarking

#### 1. Go Implementation
```bash
# Clone and build
git clone https://github.com/apaichon/metadat-go.git
cd metadat-go
go mod tidy
go build -o metadat-go ./cmd/metadat

# Run benchmark
./metadat-go benchmark
```

#### 2. Rust Implementation
```bash
# Clone and build
git clone https://github.com/apaichon/metadat-rs.git
cd metadat-rs
cargo build --release

# Run benchmark
cargo run --release --bin benchmark
```

#### 3. Node.js Implementation
```bash
# Clone and setup
git clone https://github.com/apaichon/metadat-nodejs.git
cd metadat-nodejs
npm install
npm run build

# Configure benchmark settings (optional)
# Edit benchmark/config.json to adjust:
# - Number of iterations
# - Data size
# - Output format
cp benchmark/config.example.json benchmark/config.json
nano benchmark/config.json

# Run benchmark with Node.js
npm run benchmark

# For faster performance with Bun runtime
# Install Bun: curl -fsSL https://bun.sh/install | bash
bun install
bun run benchmark
```

#### 4. Python Implementation
```bash
# Clone and setup
git clone https://github.com/apaichon/metadat-py.git
cd metadat-py
pip install -r requirements.txt
pip install -e .

# Run benchmark
python benchmark/benchmark.py
```

#### 5. C# Implementation
```bash
# Clone and build
git clone https://github.com/apaichon/metadat-csharp.git
cd metadat-csharp
dotnet restore
dotnet build --configuration Release

# Run benchmark
dotnet run --project Benchmark --configuration Release
```

Choose the implementation that best fits your technology stack and refer to the language-specific README for detailed installation and usage instructions.

### Running Cross-Platform Benchmarks

The benchmark suite compares performance across all language implementations. Follow these steps to run comprehensive benchmarks:

#### Prerequisites
```bash
# Ensure you have the benchmark runner setup
cd /metadat-format/metadat
npm install
```

#### Directory Structure Setup
Ensure all language implementations are cloned as sibling directories:
```
metadat-format/
├── metadat/                    # Main benchmark runner
├── metadat-go/                 # Go implementation
├── metadat-nodejs/             # Node.js implementation  
├── metadat-csharp/             # C# implementation
├── metadat-rs/                 # Rust implementation
└── metadat-py/                 # Python implementation
```

#### Running Benchmarks

**Basic benchmark (all languages, default settings):**
```bash
bun src/benchmark.ts
```

**Custom language selection:**
```bash
bun src/benchmark.ts --languages Go,Rust,Node.js
```

**Custom test sizes and data types:**
```bash
bun src/benchmark.ts --sizes 100,1000,5000 --types users,products
```

**Extended benchmark with more iterations:**
```bash
bun src/benchmark.ts --iterations 5 --sizes 1000,10000
```

**Available Options:**
- `--languages <lang1,lang2>`: Languages to test (Go, Node.js, C#, Rust, Python)
- `--sizes <size1,size2>`: Test record counts (default: 100,1000,5000)
- `--types <type1,type2>`: Data types (users, products)
- `--iterations <number>`: Iterations per test (default: 3)
- `--all-languages`: Test all available languages
- `--help`: Show help information

#### Benchmark Output
Results are saved to `./benchmark-results/`:
- `raw-results.json`: Detailed timing data
- `summary-report.json`: Statistical summary
- `BENCHMARK_REPORT.md`: Human-readable markdown report

#### System Requirements
The benchmark automatically checks for:
- Language runtimes (go, node, dotnet, cargo, python3)
- Implementation directories
- Build tools and dependencies
- Builds each implementation before testing

## License

MIT License - See LICENSE file for details

## Author

Created by Apaichon Punopas.