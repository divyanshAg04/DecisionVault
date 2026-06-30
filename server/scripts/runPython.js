import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');

function resolvePythonBin() {
  const candidates = [
    process.env.PYTHON_BIN,
    path.join(serverDir, '.venv', 'Scripts', 'python.exe'),
    path.join(serverDir, '.venv', 'bin', 'python'),
    'python3',
    'python',
  ].filter(Boolean);

  return candidates.find((candidate) => {
    if (candidate.includes(path.sep)) {
      return fs.existsSync(candidate);
    }

    const result = spawnSync(candidate, ['--version'], {
      encoding: 'utf-8',
      windowsHide: true,
    });
    return !result.error && result.status === 0;
  }) || 'python';
}

const pythonBin = resolvePythonBin();
const args = process.argv.slice(2);
const result = spawnSync(pythonBin, args, {
  cwd: serverDir,
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
