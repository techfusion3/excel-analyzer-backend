const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');

dotenv.config();
const app = express();

// Configure CORS to accept requests from your frontend URLs
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'https://excel-analyzer-frontend.vercel.app' 
  ],
  credentials: true
}));

app.use(express.json());
app.use('/api/auth', authRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => app.listen(process.env.PORT || 5000, () => 
    console.log(`Server running on port ${process.env.PORT || 5000}`)))
  .catch((err) => console.error(err));