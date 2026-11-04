import mongoose from 'mongoose';

// Business setup + per-shop rules. One document per retailer.
export default mongoose.model(
  'Setting',
  new mongoose.Schema(
    {
      branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
      shopName: { type: String, default: '' },
      gstin: String,
      stateCode: String, // first 2 digits of the GSTIN; decides CGST+SGST (same state) vs IGST
      address: String,
      phone: String,
      logo: String, // small image as a data URL
      timezone: { type: String, default: 'Asia/Kolkata' },
      invoicePrefix: { type: String, default: 'INV' },
      barcodePrefix: { type: String, default: 'WN' },
      gstPercent: { type: Number, default: 3 },
      roundTo: { type: Number, default: 1 },
      maxDiscountPercent: { type: Number, default: 5 },
      maxManagerRefund: { type: Number, default: 50000 },
      stockValuation: { type: String, enum: ['purchase_cost', 'weighted_average'], default: 'purchase_cost' }, // how cost of goods sold is valued in the margin report
      maxRateChangePercent: { type: Number, default: 10 }, // a metal rate move bigger than this must be confirmed
    },
    { timestamps: true }
  )
);
