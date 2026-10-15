// Builds the Android app: web client → Capacitor sync → Gradle → apps/android/release/*.apk
//   node apps/android/build.mjs debug      (installable test build, signed with the debug key)
//   node apps/android/build.mjs release    (needs a keystore: see docs/ANDROID.md)
// JAVA_HOME and ANDROID_HOME/ANDROID_SDK_ROOT are taken from the environment, falling back to
// %USERPROFILE%/AndroidTools (where the setup script puts a portable JDK 21 and the SDK).

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const kind = process.argv[2] === 'release' ? 'release' : 'debug';
const win = process.platform === 'win32';

const tools = join(homedir(), 'AndroidTools');
const jdkDir = existsSync(join(tools, 'jdk')) ? readdirSync(join(tools, 'jdk')).find((d) => d.startsWith('jdk')) : undefined;
const JAVA_HOME = process.env.JAVA_HOME || (jdkDir ? join(tools, 'jdk', jdkDir) : undefined);
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(tools, 'sdk');
if (!JAVA_HOME || !existsSync(SDK)) {
  console.error('Need JAVA_HOME (JDK 21) and the Android SDK (ANDROID_HOME). See docs/ANDROID.md.');
  process.exit(1);
}
const env = { ...process.env, JAVA_HOME, ANDROID_HOME: SDK, ANDROID_SDK_ROOT: SDK };

function run(cmd, args, cwd) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: win });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('npm', ['run', 'build', '-w', '@contaminant/client'], repo);
run('npx', ['cap', 'sync', 'android'], here);
writeFileSync(join(here, 'android', 'local.properties'), `sdk.dir=${SDK.replace(/\\/g, '/')}\n`);
run(join(here, 'android', win ? 'gradlew.bat' : 'gradlew'), [kind === 'release' ? 'assembleRelease' : 'assembleDebug', '--no-daemon'], join(here, 'android'));

const outDir = join(here, 'android', 'app', 'build', 'outputs', 'apk', kind);
const apk = readdirSync(outDir).find((f) => f.endsWith('.apk'));
if (!apk) {
  console.error(`no APK in ${outDir}`);
  process.exit(1);
}
mkdirSync(join(here, 'release'), { recursive: true });
const target = join(here, 'release', `Contaminant-${kind}.apk`);
copyFileSync(join(outDir, apk), target);
console.log(`\nAPK: ${target}`);
