import mongoose from 'mongoose';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    console.warn('\n!! MongoDB is not a replica set. Billing, returns and purchases save "all or nothing" and need one. See README.\n');
  }
}
