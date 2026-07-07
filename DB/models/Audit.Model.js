import mongoose from 'mongoose';

const flagSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
  },
  severity: {
    type: String,
    enum: ['red', 'yellow', 'green'],
    required: true,
  },
  clause_quote: {
    type: String,
    required: true,
  },
  plain_english: {
    type: String,
    required: true,
  },
});

const auditSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    originalText: {
      type: String,
      required: true,
    },
    flags: {
      type: [flagSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const Audit = mongoose.model('Audit', auditSchema);
