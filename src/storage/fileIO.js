const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function createSerialQueue() {
  let tail = Promise.resolve();
  return (operation) => {
    const current = tail.then(operation);
    // 호출자에게 실패를 반환하되 다음 저장 작업까지 계속 실패하지 않게 합니다.
    tail = current.catch(() => {});
    return current;
  };
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    const file = await fs.open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    // 같은 디렉터리의 임시 파일을 교체하여 쓰기 도중 기존 JSON이 잘리지 않게 합니다.
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

module.exports = { createSerialQueue, writeJsonAtomic };
