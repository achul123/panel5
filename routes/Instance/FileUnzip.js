const express = require("express");
const router = express.Router();
const axios = require("axios");
const { db } = require("../../handlers/db.js");
const { isUserAuthorizedForContainer } = require("../../utils/authHelper");
const path = require("path");

router.get("/instance/:id/files/unzip/:file", async (req, res) => {
  const { id, file } = req.params;
  const filePath = req.query.path || ''; // Get path or default to empty string
  const subPath = filePath ? `?path=${encodeURIComponent(filePath)}` : "";

  try {
    // Validate parameters
    if (!id || !file) {
      return res.status(400).send("Missing instance ID or file parameter");
    }

    const instance = await db.get(`${id}_instance`);
    if (!instance) {
      console.error(`Instance with ID ${id} not found`);
      return res.status(404).send("Instance not found");
    }

    // Check authorization
    const isAuthorized = await isUserAuthorizedForContainer(
      req.user.userId,
      instance.Id
    );
    if (!isAuthorized) {
      console.error(`User ${req.user.userId} unauthorized for instance ${id}`);
      return res.status(403).send("Unauthorized access to this instance");
    }

    // Check instance suspension status
    if (instance.suspended) {
      return res.redirect(`../../instances?err=SUSPENDED`);
    }

    // Ensure instance has required properties
    if (!instance.VolumeId || !instance.Node || !instance.Node.address || !instance.Node.port || !instance.Node.apiKey) {
      console.error(`Instance ${id} missing required properties (VolumeId or Node info)`);
      return res.status(500).send("Instance configuration error");
    }

    // Construct the API URL with proper path handling
    const apiUrl = `http://${instance.Node.address}:${instance.Node.port}/fs/${instance.VolumeId}/files/unzip/${encodeURIComponent(file)}${subPath}`;

    try {
      await axios.post(
        apiUrl,
        {},
        {
          auth: {
            username: "Skyport",
            password: instance.Node.apiKey,
          },
          timeout: 10000 // 10 seconds timeout
        }
      );
      
      // Proper redirect with the original path
      const redirectQuery = filePath ? `&path=${encodeURIComponent(filePath)}` : '';
      return res.redirect(`/instance/${id}/files?success=UNZIPPED${redirectQuery}`);
    } catch (error) {
      console.error(`Error unzipping file ${file} for instance ${id}:`, error.message);
      
      let errorMessage = "Failed to unzip file";
      if (error.response) {
        errorMessage = error.response.data?.error || errorMessage;
      }

      const redirectQuery = filePath ? `&path=${encodeURIComponent(filePath)}` : '';
      return res.redirect(`/instance/${id}/files?err=${encodeURIComponent(errorMessage)}${redirectQuery}`);
    }
  } catch (err) {
    console.error(`Unexpected error in unzip route for instance ${id}:`, err);
    const filePath = req.query.path || '';
    const redirectQuery = filePath ? `&path=${encodeURIComponent(filePath)}` : '';
    return res.redirect(`/instance/${id}/files?err=${encodeURIComponent("Internal Server Error")}${redirectQuery}`);
  }
});

module.exports = router;
// credit darco labes
