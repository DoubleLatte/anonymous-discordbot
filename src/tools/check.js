const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// 새로 추가된 파일도 자동으로 검사하며, 봇 로그인이나 .env 로딩은 하지 않습니다.
function checkDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) checkDirectory(file);
    else if (entry.isFile() && file.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exitCode = 1;
    }
  }
}

checkDirectory(path.resolve(__dirname, '..'));
