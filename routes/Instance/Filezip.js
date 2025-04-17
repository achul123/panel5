const express = require('express');
const router = express.Router();
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

// Route to create a backup ZIP
router.get('/:serverId/create-backup', (req, res) => {
    const serverId = req.params.serverId;
    const serverDir = `/home/container/${serverId}`;
    const backupDir = `backups`;
    const backupFile = `${backupDir}/backup-${serverId}-${Date.now()}.zip`;

    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

    const zip = new AdmZip();
    zip.addLocalFolder(serverDir);
    zip.writeZip(backupFile);

    res.download(backupFile, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Backup failed.");
        }
        // Optionally delete after download
        fs.unlinkSync(backupFile);
    });
});

module.exports = router;
