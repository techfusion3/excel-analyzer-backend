const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const xlsx = require('xlsx');
const fs = require('fs');
const File = require('../models/File');
const { verifyToken } = require('../middleware/auth');

// Function to check if file exists
const fileExists = (filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (err) {
    return false;
  }
};

// Function to clean up database entries
const cleanupDatabase = async (userId) => {
  try {
    const files = await File.find({ uploadedBy: userId });
    for (const file of files) {
      if (!fileExists(file.path)) {
        await File.deleteOne({ _id: file._id });
        console.log(`Deleted non-existent file from database: ${file.filename}`);
      }
    }
  } catch (error) {
    console.error('Error cleaning up database:', error);
  }
};

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log('Setting destination:', path.join(__dirname, '../uploads/'));
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: function (req, file, cb) {
    const uniqueFilename = Date.now() + '-' + file.originalname;
    console.log('Setting filename:', uniqueFilename);
    cb(null, uniqueFilename);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: function(req, file, cb) {
    console.log('Received file:', file.originalname, 'mimetype:', file.mimetype);
    
    // Updated mime types for Excel files
    const allowedMimes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Error: Only Excel files (XLS, XLSX) and CSV files are allowed'));
    }
  }
}).single('file');

// Upload file - protected route
router.post('/upload', verifyToken, (req, res) => {
  console.log('Upload request received');
  
  upload(req, res, async function(err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({
        message: 'File upload error',
        error: err.message
      });
    } else if (err) {
      console.error('Other upload error:', err);
      return res.status(400).json({
        message: 'File upload error',
        error: err.message
      });
    }

    try {
      console.log('File received:', req.file);
      
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Create new file document in database
      const file = new File({
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype,
        uploadedBy: req.user.id,
        status: 'uploaded'
      });

      await file.save();
      console.log('File metadata saved to database:', file);

      res.status(200).json(file);
    } catch (error) {
      console.error('File processing error:', error);
      res.status(500).json({ 
        message: 'Error processing file', 
        error: error.message 
      });
    }
  });
});

// Get all files - protected route
router.get('/', verifyToken, async (req, res) => {
  try {
    // First, clean up the database
    await cleanupDatabase(req.user.id);

    // Then fetch valid files
    const files = await File.find({ 
      uploadedBy: req.user.id,
      status: { $in: ['uploaded', 'analyzed'] }
    }).sort({ uploadedAt: -1 });

    // Filter out files that don't exist physically
    const validFiles = files.filter(file => fileExists(file.path));
    
    console.log(`Found ${validFiles.length} valid files for user ${req.user.id}`);
    res.status(200).json(validFiles);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ message: 'Error fetching files', error: error.message });
  }
});

// Get file structure (columns) - protected route
router.get('/:id/structure', verifyToken, async (req, res) => {
  try {
    console.log('Getting file structure for file ID:', req.params.id);
    
    const file = await File.findOne({ 
      _id: req.params.id,
      uploadedBy: req.user.id 
    });

    if (!file) {
      console.log('File not found:', req.params.id);
      return res.status(404).json({ message: 'File not found' });
    }

    console.log('Found file:', file);
    console.log('Attempting to read file from path:', file.path);

    // Read the Excel file
    const workbook = xlsx.readFile(file.path);
    console.log('Workbook read successfully');
    console.log('Available sheets:', workbook.SheetNames);

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Get the range of the worksheet
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    console.log('Worksheet range:', range);

    const columns = [];

    // Get column headers (assuming first row contains headers)
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = xlsx.utils.encode_cell({ r: 0, c: col });
      const cell = worksheet[cellAddress];
      
      if (!cell) {
        console.log(`No header found for column ${col}`);
        continue;
      }

      console.log(`Processing column ${col}, header: ${cell.v}`);

      // Determine column type by checking values in the first few rows
      let columnType = 'string';
      for (let row = 1; row <= Math.min(5, range.e.r); row++) {
        const dataCell = worksheet[xlsx.utils.encode_cell({ r: row, c: col })];
        if (dataCell) {
          if (typeof dataCell.v === 'number') {
            columnType = 'number';
            break;
          } else if (!isNaN(Date.parse(dataCell.v))) {
            columnType = 'date';
            break;
          }
        }
      }

      columns.push({
        id: `col_${col}`,
        label: cell.v,
        type: columnType
      });
    }

    console.log('Extracted columns:', columns);
    
    // Send the response
    const response = { columns };
    console.log('Sending response:', response);
    res.status(200).json(response);
  } catch (error) {
    console.error('Error getting file structure:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Error reading file structure', 
      error: error.message,
      stack: error.stack 
    });
  }
});

// Get single file by ID - protected route
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const file = await File.findOne({ 
      _id: req.params.id,
      uploadedBy: req.user.id 
    });

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.status(200).json(file);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching file', error: error.message });
  }
});

// Delete file - protected route
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const file = await File.findOneAndDelete({ 
      _id: req.params.id,
      uploadedBy: req.user.id 
    });

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Here you would also delete the physical file
    // fs.unlinkSync(file.path);

    res.status(200).json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting file', error: error.message });
  }
});

// Generate chart from file - protected route
router.post('/:id/chart', verifyToken, async (req, res) => {
  try {
    const file = await File.findOne({ 
      _id: req.params.id,
      uploadedBy: req.user.id 
    });

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const config = req.body;
    // Logic to generate chart based on config
    // For now, return mock data
    res.status(200).json({ chartData: 'Mock chart data' });
  } catch (error) {
    console.error('Error generating chart:', error);
    res.status(500).json({ message: 'Error generating chart', error: error.message });
  }
});

module.exports = router;
