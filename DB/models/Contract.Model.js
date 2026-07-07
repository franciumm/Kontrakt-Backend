import mongoose from 'mongoose';

const contractSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    gigType: {
      type: String,
      enum: ['software', 'design', 'marketing', 'other'],
      required: true,
    },
    answeredState: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },
    exposureScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ['draft', 'finalized'],
      default: 'draft',
    },
  },
  {
    timestamps: true,
  }
);

export const Contract = mongoose.model('Contract', contractSchema);
