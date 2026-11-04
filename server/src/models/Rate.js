import mongoose from 'mongoose';

// Daily metal rate per gram, per purity. Latest document wins.
export default mongoose.model(
  'Rate',
  new mongoose.Schema(
    {
      metal: { type: String, required: true },
      purity: { type: String, required: true },
      perGram: { type: Number, required: true },
      branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
      setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
  )
);
