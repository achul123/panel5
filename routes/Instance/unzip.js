const express = require('express');
const router = express.Router();
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const upload = multer({ dest: 'uploads/' });

// Route to upload & extract a backup ZIP
router.post('/:serverId/upload-backup', upload.single('backupZip'), (req, res) => {
    const serverId = req.params.serverId;
    const filePath = req.file.path;
    const serverDir = `/home/container/${serverId}`;

    // Ensure server directory exists
    if (!fs.existsSync(serverDir)) fs.mkdirSync(serverDir, { recursive: true });

    const zip = new AdmZip(filePath);
    zip.extractAllTo(serverDir, true);

    fs.unlinkSync(filePath); // Delete uploaded zip

    res.json({ status: 'success', message: `Backup for ${serverId} restored successfully!` });
});

module.exports = router;
