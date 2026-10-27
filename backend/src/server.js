const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables: backend/.env first, then root .env with override
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const uploadRoutes = require('./routes/uploadRoutes');
const googleSheetsConfig = require('./config/googleSheetsConfig');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend Vite dev server (typically port 5173) and any local origins
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount API routes
app.use('/api', uploadRoutes);

// Root diagnostic route
app.get('/', (req, res) => {
  res.json({
    name: 'Dispatch Sheet Automation API',
    status: 'running',
    version: '1.0.0',
    documentation: 'See README.md for setup and API details',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server] Uncaught error:', err);
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  }
  return res.status(500).json({ error: err.message || 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(` Dispatch Sheet Automation Backend Server`);
    console.log(` Listening on: http://localhost:${PORT}`);
    console.log(` Target Sheet ID: ${googleSheetsConfig.getSpreadsheetId() || 'Not Configured'}`);
    console.log(` Target Tab Name: ${googleSheetsConfig.getTabName()}`);
    console.log(` Status: http://localhost:${PORT}/api/health`);
    console.log(`======================================================\n`);

    if (!googleSheetsConfig.isConfigured() && !googleSheetsConfig.isMock()) {
      console.warn(`[Config Notice] Google Sheets is not fully configured yet:`);
      console.warn(` - ${googleSheetsConfig.getConfigError() || 'Check .env settings'}`);
      console.warn(` - Set MOCK_GOOGLE_SHEETS=true in .env to test without Google Cloud credentials.\n`);
    }
  });
}

module.exports = app;
