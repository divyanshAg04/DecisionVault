import dotenv from 'dotenv';
import app from './app.js';
import { connectDb } from './config/db.js';
import { trainModels } from './utils/mlPredictor.js';
import { verifySMTP } from './utils/mailer.js';

dotenv.config();

const port = process.env.PORT || 5000;

connectDb(process.env.MONGO_URI)
  .then(() => {
    try {
      trainModels();
      verifySMTP();
    } catch (err) {
      console.error('Failed to initialize background processes on startup:', err);
    }
    app.listen(port, () => {
      console.log(`DecisionVault API running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Database connection failed');
    console.error(error);
    process.exit(1);
  });
