const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
fs.mkdirSync('.test-build', { recursive: true });
fs.writeFileSync(
  '.test-build/package.json',
  JSON.stringify({ type: 'commonjs' }),
);
const args = [
  'node_modules/typescript/bin/tsc',
  '--module',
  'commonjs',
  '--moduleResolution',
  'node',
  '--esModuleInterop',
  '--target',
  'es2022',
  '--skipLibCheck',
  '--outDir',
  '.test-build',
  'lib/device-vision.ts',
  'lib/barcode.ts',
  'lib/inspection.ts',
  'lib/export.ts',
  'lib/file-export.ts',
  'lib/standard-export.ts',
  'lib/camera-layout.ts',
  'lib/record-store.ts',
];
let result = spawnSync(process.execPath, args, { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
result = spawnSync(
  process.execPath,
  [
    '--test',
    'tests/inspection.test.cjs',
    'tests/bad-cases.test.cjs',
    'tests/body-boundary.test.cjs',
    'tests/record-store.test.cjs',
    'tests/file-export.test.cjs',
    'tests/mobile-export.test.cjs',
    'tests/standard-export.test.cjs',
    'tests/camera-layout.test.cjs',
  ],
  {
    stdio: 'inherit',
  },
);
process.exit(result.status || 0);
