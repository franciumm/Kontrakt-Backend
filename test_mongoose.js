import mongoose from 'mongoose';
import { Contract } from './DB/models/Contract.Model.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  // Try to create a dummy contract and fetch it
  const c = new Contract({
    userId: new mongoose.Types.ObjectId(),
    title: 'test',
    gigDescription: 'test',
    gigType: 'software',
    answeredState: { foo: 'bar' },
    exposureScore: 10
  });
  await c.save();

  const fetched = await Contract.findById(c._id);
  console.log('Type of answeredState:', typeof fetched.answeredState);
  console.log('Is foo in answeredState?', 'foo' in fetched.answeredState);
  console.log('Is it a Mongoose map?', fetched.answeredState instanceof Map);
  console.log('Keys:', Object.keys(fetched.answeredState));

  await Contract.deleteOne({ _id: c._id });
  await mongoose.disconnect();
}
run().catch(console.error);
