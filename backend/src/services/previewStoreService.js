const { v4: uuidv4 } = require('uuid');

// In-memory store for pending preview batches
// Key: previewToken (UUID)
// Value: { newRows, marketplace, orderDate, createdAt, expiresAt }
const previewStore = new Map();

// Default TTL: 30 minutes in milliseconds
const TOKEN_TTL_MS = 30 * 60 * 1000;

function savePreview(data) {
  const previewToken = uuidv4();
  const now = Date.now();
  previewStore.set(previewToken, {
    ...data,
    createdAt: now,
    expiresAt: now + TOKEN_TTL_MS,
  });
  return previewToken;
}

function getPreview(previewToken) {
  if (!previewToken || !previewStore.has(previewToken)) {
    return null;
  }

  const record = previewStore.get(previewToken);
  if (Date.now() > record.expiresAt) {
    previewStore.delete(previewToken);
    return null;
  }

  return record;
}

function consumePreview(previewToken) {
  const record = getPreview(previewToken);
  if (record) {
    previewStore.delete(previewToken);
  }
  return record;
}

// In-memory store for pending batch preview sessions
// Key: batchToken (UUID)
// Value: { sheets, sheetTokens, createdAt, expiresAt }
const batchStore = new Map();

function saveBatchPreview(data) {
  const batchToken = uuidv4();
  const now = Date.now();
  batchStore.set(batchToken, {
    ...data,
    createdAt: now,
    expiresAt: now + TOKEN_TTL_MS,
  });
  return batchToken;
}

function getBatchPreview(batchToken) {
  if (!batchToken || !batchStore.has(batchToken)) {
    return null;
  }
  const record = batchStore.get(batchToken);
  if (Date.now() > record.expiresAt) {
    batchStore.delete(batchToken);
    return null;
  }
  return record;
}

function consumeBatchPreview(batchToken) {
  const record = getBatchPreview(batchToken);
  if (record) {
    batchStore.delete(batchToken);
  }
  return record;
}

// Clean up expired tokens every 5 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [token, record] of previewStore.entries()) {
    if (now > record.expiresAt) {
      previewStore.delete(token);
    }
  }
  for (const [token, record] of batchStore.entries()) {
    if (now > record.expiresAt) {
      batchStore.delete(token);
    }
  }
}, 5 * 60 * 1000);

if (cleanupInterval.unref) {
  cleanupInterval.unref(); // Don't prevent process exit in tests
}

module.exports = {
  savePreview,
  getPreview,
  consumePreview,
  saveBatchPreview,
  getBatchPreview,
  consumeBatchPreview,
};
