import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONGO_CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'mongodb-binaries');

let mongod;

export async function connectTestDb() {
  if (mongoose.connection.readyState === 1) return;
  process.env.MONGOMS_DOWNLOAD_DIR = MONGO_CACHE_DIR;
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

export async function disconnectTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

export async function clearTestDb() {
  if (mongoose.connection.readyState !== 1) return;
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}
