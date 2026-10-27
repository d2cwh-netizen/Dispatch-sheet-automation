const express = require('express');
const multer = require('multer');
const uploadController = require('../controllers/uploadController');

const router = express.Router();

// Memory storage for uploaded marketplace files (processed immediately)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
});

router.post('/preview', upload.single('file'), uploadController.handlePreview);
router.post('/preview-batch', upload.array('files', 20), uploadController.handlePreviewBatch);
router.post('/confirm', uploadController.handleConfirm);
router.post('/confirm-batch', uploadController.handleConfirmBatch);
router.get('/health', uploadController.handleHealth);

module.exports = router;
