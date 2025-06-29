#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

class TestRunner {
  constructor() {
    this.options = {
      verbose: false,
      coverage: false,
      watch: false,
      testPattern: null,
      bail: false,
      silent: false
    };
  }

  parseArgs() {
    const args = process.argv.slice(2);
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--verbose':
        case '-v':
          this.options.verbose = true;
          break;
        case '--coverage':
        case '-c':
          this.options.coverage = true;
          break;
        case '--watch':
        case '-w':
          this.options.watch = true;
          break;
        case '--pattern':
        case '-p':
          this.options.testPattern = args[++i];
          break;
        case '--bail':
        case '-b':
          this.options.bail = true;
          break;
        case '--silent':
        case '-s':
          this.options.silent = true;
          break;
        case '--help':
        case '-h':
          this.showHelp();
          process.exit(0);
          break;
        default:
          if (arg.startsWith('--')) {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
          }
          // Treat as test pattern
          this.options.testPattern = arg;
      }
    }
  }

  showHelp() {
    console.log(`
MT5 Trading Platform Test Runner

Usage: node test-runner.js [options] [pattern]

Options:
  -v, --verbose     Show verbose output
  -c, --coverage    Generate coverage report
  -w, --watch       Watch files for changes
  -p, --pattern     Test file pattern to run
  -b, --bail        Stop on first test failure
  -s, --silent      Suppress console output
  -h, --help        Show this help message

Examples:
  node test-runner.js                    # Run all tests
  node test-runner.js --coverage         # Run with coverage
  node test-runner.js --watch            # Watch mode
  node test-runner.js auth               # Run auth tests only
  node test-runner.js integration -v     # Run integration tests verbosely

Test Suites:
  server.test.js      - Main API tests
  middleware.test.js  - Middleware and utility tests
  integration.test.js - Full integration tests
`);
  }

  buildJestArgs() {
    const jestArgs = [];

    // Basic Jest configuration
    jestArgs.push('--testEnvironment=node');
    jestArgs.push('--setupFilesAfterEnv=__tests__/setup.js');

    if (this.options.verbose) {
      jestArgs.push('--verbose');
    }

    if (this.options.coverage) {
      jestArgs.push('--coverage');
      jestArgs.push('--collectCoverageFrom=**/*.js');
      jestArgs.push('--collectCoverageFrom=!node_modules/**');
      jestArgs.push('--collectCoverageFrom=!coverage/**');
      jestArgs.push('--collectCoverageFrom=!__tests__/**');
    }

    if (this.options.watch) {
      jestArgs.push('--watch');
    }

    if (this.options.bail) {
      jestArgs.push('--bail');
    }

    if (this.options.silent) {
      jestArgs.push('--silent');
    }

    if (this.options.testPattern) {
      jestArgs.push(`--testNamePattern=${this.options.testPattern}`);
    }

    // Force exit to prevent hanging
    jestArgs.push('--forceExit');

    return jestArgs;
  }

  async runTests() {
    console.log('🧪 Starting MT5 Trading Platform Tests...\n');

    const jestArgs = this.buildJestArgs();
    
    console.log('📋 Test Configuration:');
    console.log(`   Verbose: ${this.options.verbose}`);
    console.log(`   Coverage: ${this.options.coverage}`);
    console.log(`   Watch Mode: ${this.options.watch}`);
    console.log(`   Pattern: ${this.options.testPattern || 'All tests'}`);
    console.log(`   Bail on Failure: ${this.options.bail}`);
    console.log('');

    return new Promise((resolve, reject) => {
      const jestPath = path.resolve('./node_modules/.bin/jest');
      const jest = spawn('node', [jestPath, ...jestArgs], {
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'test'
        }
      });

      jest.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ All tests passed!');
          resolve();
        } else {
          console.log(`\n❌ Tests failed with exit code ${code}`);
          reject(new Error(`Tests failed with exit code ${code}`));
        }
      });

      jest.on('error', (error) => {
        console.error('\n💥 Failed to start test runner:', error);
        reject(error);
      });
    });
  }

  async run() {
    try {
      this.parseArgs();
      await this.runTests();
    } catch (error) {
      console.error('Test runner failed:', error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.run();
}

module.exports = TestRunner;