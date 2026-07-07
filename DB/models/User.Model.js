import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['freelancer', 'admin'],
      default: 'freelancer',
    },
    // SHA-256 hashes of issued refresh tokens (ticket SEC-108 / auth flow).
    // We store hashes, never plaintext, so a DB read cannot leak live tokens.
    refreshTokens: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model('User', userSchema);
