import * as dotenv from 'dotenv';

dotenv.config();

const { MONGO_URI } = process.env;

export default {
  uri: MONGO_URI,
  templatePath: './migrations/template.ts',
  autosync: true,
};
