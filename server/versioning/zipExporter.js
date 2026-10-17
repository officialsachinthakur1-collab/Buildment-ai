// server/versioning/zipExporter.js — Secure Native ZIP Archive Packager
const zlib = require('node:zlib');
const path = require('path');
const { FileModel, ProjectModel } = require('../db');

/**
 * Creates a standard PKZip-formatted Buffer from an array of { path, content } objects.
 * Uses native node:zlib deflateRawSync and crc32 with 0 external dependencies.
 */
function createZipBuffer(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const cleanPath = file.path.replace(/\\/g, '/');
    const filenameBuf = Buffer.from(cleanPath, 'utf8');
    const uncompressedData = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content || '', 'utf8');

    const crc = zlib.crc32(uncompressedData);
    const compressedData = zlib.deflateRawSync(uncompressedData);

    // Local file header (30 bytes)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4);          // Version needed (2.0)
    localHeader.writeUInt16LE(0, 6);           // General purpose bit flag
    localHeader.writeUInt16LE(8, 8);           // Compression method (8 = Deflate)
    localHeader.writeUInt16LE(0, 10);          // Last mod time
    localHeader.writeUInt16LE(0, 12);          // Last mod date
    localHeader.writeUInt32LE(crc, 14);        // CRC-32
    localHeader.writeUInt32LE(compressedData.length, 18);   // Compressed size
    localHeader.writeUInt32LE(uncompressedData.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(filenameBuf.length, 26);      // Filename length
    localHeader.writeUInt16LE(0, 28);          // Extra field length

    localHeaders.push(localHeader, filenameBuf, compressedData);

    // Central directory header (46 bytes)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4);          // Version made by
    centralHeader.writeUInt16LE(20, 6);          // Version needed
    centralHeader.writeUInt16LE(0, 8);           // Bit flag
    centralHeader.writeUInt16LE(8, 10);          // Compression method
    centralHeader.writeUInt16LE(0, 12);          // Mod time
    centralHeader.writeUInt16LE(0, 14);          // Mod date
    centralHeader.writeUInt32LE(crc, 16);        // CRC-32
    centralHeader.writeUInt32LE(compressedData.length, 20);   // Compressed size
    centralHeader.writeUInt32LE(uncompressedData.length, 24); // Uncompressed size
    centralHeader.writeUInt16LE(filenameBuf.length, 28);      // Filename length
    centralHeader.writeUInt16LE(0, 30);          // Extra field length
    centralHeader.writeUInt16LE(0, 32);          // Comment length
    centralHeader.writeUInt16LE(0, 34);          // Disk start
    centralHeader.writeUInt16LE(0, 36);          // Internal attributes
    centralHeader.writeUInt32LE(0, 38);          // External attributes
    centralHeader.writeUInt32LE(offset, 42);     // Offset of local header

    centralHeaders.push(centralHeader, filenameBuf);
    offset += localHeader.length + filenameBuf.length + compressedData.length;
  }

  const centralDirSize = centralHeaders.reduce((sum, b) => sum + b.length, 0);
  const centralDirOffset = offset;

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);       // Signature
  eocd.writeUInt16LE(0, 4);                // Disk number
  eocd.writeUInt16LE(0, 6);                // Start disk
  eocd.writeUInt16LE(files.length, 8);     // Total entries on disk
  eocd.writeUInt16LE(files.length, 10);    // Total entries
  eocd.writeUInt32LE(centralDirSize, 12);  // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16);// Offset of central directory
  eocd.writeUInt16LE(0, 20);               // Comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

/**
 * Checks if a filename or path should be excluded for security reasons.
 */
function isExcludedFile(filePath) {
  const normalized = filePath.toLowerCase().replace(/\\/g, '/');
  const base = path.basename(normalized);

  // Exclude hidden files, environment files, secrets, database files, and logs
  if (base.startsWith('.env') || base.endsWith('.env')) return true;
  if (base.includes('secret') || base.includes('credential') || base.includes('token')) return true;
  if (base.endsWith('.sqlite') || base.endsWith('.db') || base.endsWith('.log')) return true;
  if (normalized.startsWith('.git/') || normalized.startsWith('node_modules/')) return true;

  return false;
}

class ZipExporter {
  exportProject(projectId) {
    const project = ProjectModel.getById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const rawFiles = FileModel.getByProject(projectId);
    if (!rawFiles || rawFiles.length === 0) {
      throw new Error('Project has no files to export. Generate or save files first.');
    }

    // Filter and sanitize files
    const exportableFiles = [];
    let hasReadme = false;

    for (const f of rawFiles) {
      const cleanPath = f.path.replace(/\\/g, '/');
      if (isExcludedFile(cleanPath)) continue;

      // Validate path safety
      if (cleanPath.startsWith('/') || cleanPath.includes('..') || cleanPath.includes('\0')) {
        throw new Error(`Invalid or dangerous file path in export: ${cleanPath}`);
      }

      if (cleanPath.toLowerCase() === 'readme.md') {
        hasReadme = true;
      }

      exportableFiles.push({
        path: cleanPath,
        content: f.content
      });
    }

    if (exportableFiles.length === 0) {
      throw new Error('No exportable files found after applying security exclusions.');
    }

    // Auto-generate a helpful setup README if the project doesn't have one
    if (!hasReadme) {
      const projectName = project.name || 'BuildAI Application';
      const projectDesc = project.description || project.prompt || 'Modern web application generated by BuildAI.';
      const readmeContent = `# ${projectName}

${projectDesc}

> Exported from **BuildAI** — Full-Stack AI Application Builder Platform.

---

## 🚀 How to Run Locally

This is a modern, standalone web application. You can run it locally using any of the following methods:

### Option 1: Direct in Web Browser
Open \`index.html\` directly in any modern web browser (Google Chrome, Microsoft Edge, Firefox, or Safari).

### Option 2: Using Node.js (Recommended)
If you have Node.js installed, launch a local web server:
\`\`\`bash
npx serve .
\`\`\`
Or with http-server:
\`\`\`bash
npx http-server -p 8080 .
\`\`\`

### Option 3: Using Python 3
\`\`\`bash
python -m http.server 8000
\`\`\`
Then navigate to \`http://localhost:8000\` in your browser.

---

## 📁 File Structure
${exportableFiles.map(f => `- \`${f.path}\``).join('\n')}
`;
      exportableFiles.push({
        path: 'README.md',
        content: readmeContent
      });
    }

    const zipBuffer = createZipBuffer(exportableFiles);

    // Sanitize filename for HTTP header
    const slug = (project.name || 'project')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project';

    const filename = `${slug}-v${Date.now()}.zip`;

    return {
      buffer: zipBuffer,
      filename,
      fileCount: exportableFiles.length,
      totalBytes: zipBuffer.length
    };
  }
}

module.exports = new ZipExporter();
