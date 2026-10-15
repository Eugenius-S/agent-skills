// usage: node engine/bin/setup.js [--yes]
// One-time setup → ~/.animator/env.json. Without --yes it only prints what it would install and changes nothing:
// show the plan to the user and re-run with --yes once they agree. It installs only what is missing: the pinned npm
// dependencies (npm ci from deps/package-lock.json, install scripts off) into ~/.animator/deps, Chrome for Testing
// (a pinned build) into ~/.animator/chrome when no Chrome, Chromium or Edge is installed, and ffmpeg with Homebrew
// (macOS) or winget (Windows) when there is none with the needed encoders. Agents' skill folders are not touched.
const path = require('path');
const { execSync } = require('child_process');
const { HOME, DEPS, missingDeps, installDeps } = require('../src/env/deps');
const { findChrome, downloadChrome, CHROME_BUILD } = require('../src/env/chrome');
const { findFfmpeg, readEncoders, missingEncoders, hevcEncoder, INSTALL } = require('../src/env/ffmpeg');
const { saveEnv, ENV_FILE } = require('../src/env');

const ROOT = path.resolve(__dirname, '..', '..');
const yes = process.argv.includes('--yes');

(async () => {
  const deps = missingDeps();
  const chrome = findChrome();
  let ffmpeg = findFfmpeg();
  const ffMissing = ffmpeg ? missingEncoders(process.platform, readEncoders(ffmpeg)) : null;
  const ffCmd = !ffmpeg || ffMissing.length ? INSTALL[process.platform] : null;
  if ((!ffmpeg || ffMissing.length) && !ffCmd) throw new Error(`Install ffmpeg with ${ffmpeg ? ffMissing.join(', ') : 'prores_ks and gif'} manually and set its path in ANIMATOR_FFMPEG`);

  const plan = [
    deps.length && `npm ci into ${DEPS}: ${deps.join(', ')}`,
    !chrome && `download Chrome for Testing ${CHROME_BUILD} into ${path.join(HOME, 'chrome')} (no Chrome, Chromium or Edge found)`,
    ffCmd && `run: ${ffCmd} (${ffmpeg ? `ffmpeg lacks ${ffMissing.join(', ')}` : 'no ffmpeg found'})`,
  ].filter(Boolean);
  if (plan.length && !yes) {
    console.log(`Setup would:\n${plan.map((p) => `- ${p}`).join('\n')}\nNothing was changed. Ask the user, then run again with --yes.`);
    process.exit(2);
  }

  if (deps.length) installDeps();
  const browser = chrome || (await downloadChrome(path.join(HOME, 'chrome')));
  if (ffCmd) {
    console.log('Installing ffmpeg:', ffCmd);
    execSync(ffCmd, { stdio: 'inherit' });
    ffmpeg = findFfmpeg();
  }
  if (!ffmpeg) throw new Error('ffmpeg not found after install');
  const enc = readEncoders(ffmpeg);
  const miss = missingEncoders(process.platform, enc);
  if (miss.length) throw new Error(`ffmpeg lacks encoders: ${miss.join(', ')}`);

  const ffprobe = path.join(path.dirname(ffmpeg), 'ffprobe' + (process.platform === 'win32' ? '.exe' : ''));
  saveEnv({ root: ROOT, chrome: browser, ffmpeg, ffprobe, hevc: hevcEncoder(process.platform, enc) });
  console.log('Environment ready:', ENV_FILE);
  console.log({ root: ROOT, chrome: browser, ffmpeg, hevc: hevcEncoder(process.platform, enc) });
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
