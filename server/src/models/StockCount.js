import mongoose from 'mongoose';

// A physical count of the shelf. It NEVER changes stock by itself: differences are fixed through the
// two-person stock adjustment flow, so a count cannot be used to hide a loss.
const s = new mongoose.Schema(
  {
    countNo: { type: String, required: true },
    scope: { metal: String, purity: String },
    expected: Number,  // pieces the system says are available (in scope)
    scanned: Number,   // distinct tags scanned
    matched: Number,
    missing: [{ _id: false, barcode: String, name: String }],              // system says available, not scanned
    unexpected: [{ _id: false, barcode: String, name: String, status: String }], // scanned, but unknown or not available
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
s.index({ tenant: 1, countNo: 1 }, { unique: true });
export default mongoose.model('StockCount', s);
