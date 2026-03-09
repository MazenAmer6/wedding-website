const express    = require('express');
const multer     = require('multer');
const { google } = require('googleapis');
const path       = require('path');
const stream     = require('stream');
require('dotenv').config();

const app    = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Serve the website
app.use(express.static(path.join(__dirname, 'public')));

// Google Drive login
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

// Remember folder IDs so we don't recreate them
let rootFolderId   = null;
let photosFolderId = null;
let videosFolderId = null;

// Find or create a folder in Google Drive
async function findOrCreateFolder(name, parentId = null) {
  const query = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId && { parents: [parentId] }),
    },
    fields: 'id',
  });

  console.log(`📁 Created folder: "${name}"`);
  return created.data.id;
}

// Setup the folder structure
async function setupDriveFolders() {
  if (rootFolderId && photosFolderId && videosFolderId) return;
  rootFolderId   = await findOrCreateFolder('Moyassar and Mariam Wedding');
  photosFolderId = await findOrCreateFolder('Photos', rootFolderId);
  videosFolderId = await findOrCreateFolder('Videos', rootFolderId);
  console.log('✅ Google Drive folders ready!');
}

// Upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { type } = req.body;
    await setupDriveFolders();

    const targetFolderId = type === 'videos' ? videosFolderId : photosFolderId;

    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    const uploaded = await drive.files.create({
      requestBody: {
        name    : req.file.originalname,
        parents : [targetFolderId],
      },
      media: {
        mimeType : req.file.mimetype,
        body     : bufferStream,
      },
      fields: 'id, name',
    });

    console.log(`✅ Uploaded: ${uploaded.data.name} → ${type}`);
    return res.json({ success: true, fileName: uploaded.data.name });

  } catch (err) {
    console.error('❌ Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`\n🌸 Wedding server running → http://localhost:${PORT}`);
  await setupDriveFolders().catch(console.error);
});