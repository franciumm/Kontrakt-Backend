import mongoose from 'mongoose';

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/** Returns true when `value` is a valid MongoDB ObjectId string. */
export function isValidObjectId(value) {
  return typeof value === 'string' && OBJECT_ID_RE.test(value) && mongoose.isValidObjectId(value);
}
