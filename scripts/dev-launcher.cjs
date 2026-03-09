#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const argStartIndex = /dev-launcher\.cjs$/i.test(process.argv[1] || '') ? 2 : 1;
const extraArgs = process.argv.slice(argStartIndex);
const launchCwd = process.env.INIT_CWD || process.cwd();

function runLocalVite() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['run', 'dev:local'];
  if (extraArgs.length > 0) {
    args.push('--', ...extraArgs);
  }

  const result = spawnSync(npmCommand, args, {
    stdio: 'inherit',
    env: process.env,
    cwd: launchCwd,
  });

  process.exit(result.status ?? 1);
}

function toWslLocation(cwd) {
  const match = cwd.match(/^\\\\wsl(?:\.localhost)?\\([^\\]+)\\(.+)$/i);
  if (!match) {
    return null;
  }

  const distro = match[1];
  const linuxPath = `/${match[2].replace(/\\/g, '/')}`;
  return { distro, linuxPath };
}

function quoteForBash(value) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

if (process.platform === 'win32') {
  const wslLocation = toWslLocation(launchCwd);
  if (wslLocation) {
    const forwardedArgs = extraArgs.map(quoteForBash).join(' ');
    const devCommand = forwardedArgs
      ? `node ./node_modules/vite/bin/vite.js ${forwardedArgs}`
      : 'node ./node_modules/vite/bin/vite.js';
    const bashCommand = `cd ${quoteForBash(wslLocation.linuxPath)} && ${devCommand}`;

    const result = spawnSync(
      'wsl',
      ['-d', wslLocation.distro, 'bash', '-lc', bashCommand],
      {
        stdio: 'inherit',
        env: process.env,
      }
    );

    if (typeof result.status === 'number') {
      process.exit(result.status);
    }

    console.error(
      'Unable to launch Vite inside WSL from this UNC path. Start VS Code in WSL and rerun `npm run dev`.'
    );
    process.exit(1);
  }
}

runLocalVite();
