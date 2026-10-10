import {
  existsSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  chmodSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
const mode = process.argv[2] || 'debug';
if (!['debug', 'release'].includes(mode))
  throw new Error('Use debug or release');
const root = resolve(import.meta.dirname, '..');
const studioJava =
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
function javaVersion(home) {
  if (!home) return 0;
  const check = spawnSync(`${home}/bin/java`, ['-version'], {
    encoding: 'utf8',
  });
  return Number((check.stderr || '').match(/version "(\d+)/)?.[1] || 0);
}
const java =
  javaVersion(process.env.JAVA_HOME) >= 21
    ? process.env.JAVA_HOME
    : javaVersion(studioJava) >= 21
      ? studioJava
      : null;
if (!java)
  throw new Error('JDK 21+ required. Set JAVA_HOME to a JDK 21 installation.');
const sdk =
  process.env.ANDROID_HOME || `${process.env.HOME}/Library/Android/sdk`;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
const signing = resolve(root, 'signing');
if (mode === 'release') {
  mkdirSync(signing, { recursive: true, mode: 0o700 });
  const key = resolve(signing, 'jiantu.jks');
  const properties = resolve(signing, 'keystore.properties');
  if (!existsSync(key) && !existsSync(properties)) {
    const password = randomBytes(32).toString('hex');
    const passwordFile = resolve(signing, 'password');
    writeFileSync(passwordFile, password, { mode: 0o600 });
    run(`${java}/bin/keytool`, [
      '-genkeypair',
      '-keystore',
      key,
      '-alias',
      'jiantu',
      '-keyalg',
      'RSA',
      '-keysize',
      '3072',
      '-validity',
      '10000',
      '-dname',
      'CN=JianTu Local, O=JianTu, C=CN',
      '-storepass:file',
      passwordFile,
      '-keypass:file',
      passwordFile,
    ]);
    writeFileSync(
      properties,
      `storeFile=${key}\nstorePassword=${password}\nkeyAlias=jiantu\nkeyPassword=${password}\n`,
      { mode: 0o600 },
    );
    chmodSync(key, 0o600);
  } else if (!existsSync(key) || !existsSync(properties))
    throw new Error(
      'Signing files incomplete. Restore signing backup before rebuilding.',
    );
}
run(
  './gradlew',
  [
    mode === 'release' ? ':app:assembleRelease' : ':app:assembleDebug',
    '--console=plain',
    '--no-daemon',
  ],
  {
    cwd: resolve(root, 'android'),
    env: { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk },
  },
);
mkdirSync(resolve(root, 'releases'), { recursive: true });
const version = readFileSync(resolve(root, 'android/app/build.gradle'), 'utf8')
  .match(/versionName\s+"([0-9]+\.[0-9]+\.[0-9]+)"/)?.[1];
if (!version) throw new Error('Android versionName must be a numeric x.y.z version');
const target = resolve(root, 'releases', `jiantu-${version}-${mode}.apk`);
copyFileSync(
  resolve(root, 'android/app/build/outputs/apk', mode, `app-${mode}.apk`),
  target,
);
const sha = createHash('sha256').update(readFileSync(target)).digest('hex');
writeFileSync(`${target}.sha256`, `${sha}  ${target.split('/').at(-1)}\n`);
console.log(`APK: ${target}`);
