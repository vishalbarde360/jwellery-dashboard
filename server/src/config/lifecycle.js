// Life of a piece (PDF page 06). Only "available" pieces can be sold.
export const STATUSES = ['available', 'sold', 'returned_check', 'repair', 'reserved', 'in_transit', 'damaged', 'lost'];

export const STATUS_LABEL = {
  available: 'Available', sold: 'Sold', returned_check: 'Returned, under check', repair: 'Repair',
  reserved: 'Reserved', in_transit: 'In transit', damaged: 'Damaged', lost: 'Lost',
};

// Inspection results -> the statuses a piece may be in before it
export const INSPECT = {
  available: ['returned_check', 'repair'],
  repair: ['returned_check'],
  damaged: ['returned_check', 'repair'],
};
