import mongoose from 'mongoose';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    throw new Error('MONGO_URI is missing. Set it in server/.env (see server/.env.example).');
  }
  await mongoose.connect(uri);
  console.log('MongoDB connected');
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    console.warn('\n!! MongoDB is not a replica set. Billing, returns and purchases save "all or nothing" and need one. See README.\n');
  }
}
