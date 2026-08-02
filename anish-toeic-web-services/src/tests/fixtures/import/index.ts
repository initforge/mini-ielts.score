/**
 * Test fixtures for DOCX/ZIP import tests.
 *
 * This file generates minimal valid and malicious test fixtures.
 * Fixtures are generated at runtime to avoid binary corruption issues.
 */

import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';

// Minimal ZIP structure builder (no external deps).
function createMinimalZip(entries: { name: string; content: string }[]): Buffer {
  const parts: Buffer[] = [];
  const entriesData: { offset: number; name: string; crc: number; compressed: Buffer; uncompressed: Buffer }[] = [];

  let offset = 0;

  for (const entry of entries) {
    const uncompressed = Buffer.from(entry.content, 'utf8');
    // Store method (no compression) for simplicity.
    const compressed = uncompressed;

    const name = Buffer.from(entry.name, 'utf8');
    const localHeader = Buffer.alloc(30 + name.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression (stored)
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    const crc = crc32(uncompressed);
    localHeader.writeUInt32LE(crc, 14); // crc32
    localHeader.writeUInt32LE(compressed.length, 18); // compressed size
    localHeader.writeUInt32LE(uncompressed.length, 22); // uncompressed size
    localHeader.writeUInt16LE(name.length, 26); // name length
    localHeader.writeUInt16LE(0, 28); // extra length

    parts.push(Buffer.concat([name]));
    entriesData.push({ offset, name: entry.name, crc, compressed, uncompressed });
    offset += localHeader.length + compressed.length;
  }

  // Reconstruct with proper offsets.
  const localParts: Buffer[] = [];
  let currentOffset = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const uncompressed = Buffer.from(entry.content, 'utf8');
    const compressed = uncompressed;
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(uncompressed);

    const localHeader = Buffer.alloc(30 + name.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    name.copy(localHeader, 30);

    localParts.push(Buffer.concat([localHeader, compressed]));
    currentOffset += localHeader.length + compressed.length;
  }

  // Central directory.
  const centralDir: Buffer[] = [];
  let centralOffset = currentOffset;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const uncompressed = Buffer.from(entry.content, 'utf8');
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(uncompressed);

    const cdEntry = Buffer.alloc(46 + name.length);
    cdEntry.writeUInt32LE(0x02014b50, 0); // signature
    cdEntry.writeUInt16LE(20, 4); // version made by
    cdEntry.writeUInt16LE(20, 6); // version needed
    cdEntry.writeUInt16LE(0, 8); // flags
    cdEntry.writeUInt16LE(0, 10); // compression
    cdEntry.writeUInt16LE(0, 12); // mod time
    cdEntry.writeUInt16LE(0, 14); // mod date
    cdEntry.writeUInt32LE(crc, 16); // crc32
    cdEntry.writeUInt32LE(uncompressed.length, 20); // compressed size
    cdEntry.writeUInt32LE(uncompressed.length, 24); // uncompressed size
    cdEntry.writeUInt16LE(name.length, 28); // name length
    cdEntry.writeUInt16LE(0, 30); // extra length
    cdEntry.writeUInt16LE(0, 32); // comment length
    cdEntry.writeUInt16LE(0, 34); // disk number
    cdEntry.writeUInt16LE(0, 36); // internal attrs
    cdEntry.writeUInt16LE(0, 38); // external attrs
    cdEntry.writeUInt32LE(centralOffset, 40); // relative offset
    name.copy(cdEntry, 46);

    centralDir.push(cdEntry);
    centralOffset += Buffer.alloc(30 + name.length).length + uncompressed.length;
  }

  const centralDirBuf = Buffer.concat(centralDir);
  const centralDirOffset = currentOffset;

  // End of central directory.
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with cd
  eocd.writeUInt16LE(entries.length, 8); // entries on disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDirBuf.length, 12); // cd size
  eocd.writeUInt32LE(centralDirOffset, 16); // cd offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

// Simple CRC32 for ZIP (used for valid ZIP files).
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  const table = getCrc32Table();
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let crc32Table: number[] | null = null;
function getCrc32Table(): number[] {
  if (crc32Table) return crc32Table;
  crc32Table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crc32Table[n] = c >>> 0;
  }
  return crc32Table;
}

// Fixtures directory.
export const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'import');

// Ensure fixtures directory exists.
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

// 1. Valid minimal DOCX fixture.
export const VALID_DOCX_FIXTURE = {
  name: 'valid-minimal.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  content: `[Content_Types].xml:
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
word/_rels/.rels:
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
word/document.xml:
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Sample Question</w:t></w:r></w:p>
  </w:body>
</w:document>
word/media/audio.mp3:
{{AUDIO_DATA_PLACEHOLDER}}
`,
};

// 2. Malicious: ZIP slip (path traversal).
export const ZIP_SLIP_FIXTURE = {
  name: 'malicious-zip-slip.zip',
  mimeType: 'application/zip',
  entryName: '../../../etc/passwd',
  content: 'root:x:0:0:root:/root:/bin/bash',
};

// 3. Malicious: macro/OLE signature.
export const MACRO_FIXTURE = {
  name: 'malicious-macro.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  entryName: 'word/vbaProject.bin',
  // OLE signature: D0 CF 11 E0 A1 B1 1A E1
  content: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).toString('base64'),
};

// 4. Malicious: ZIP bomb (high compression ratio).
export const ZIP_BOMB_FIXTURE = {
  name: 'malicious-zip-bomb.zip',
  mimeType: 'application/zip',
  // Create a file that compresses extremely well (repeated bytes).
  content: Buffer.alloc(10 * 1024 * 1024, 0x41).toString('base64'), // 10MB of 'A's compresses to tiny.
};

// 5. Malicious: MIME/extension mismatch.
export const MIME_MISMATCH_FIXTURE = {
  name: 'fake-image.zip',
  mimeType: 'application/zip',
  content: '[Content_Types].xml:<?xml version="1.0"?><Types/>',
};

// 6. Malicious: duplicate entries.
export const DUPLICATE_FIXTURE = {
  name: 'duplicate-entries.zip',
  mimeType: 'application/zip',
  entries: [
    { name: 'file.txt', content: 'First' },
    { name: 'file.txt', content: 'Second' },
  ],
};

// 7. Malicious: external relationship (http URL in .rels).
export const EXTERNAL_REL_FIXTURE = {
  name: 'malicious-external-rel.zip',
  mimeType: 'application/zip',
  relsContent: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://evil.example.com/exploit" TargetMode="External"/>
</Relationships>`,
};

// 8. Malicious: corrupt ZIP (invalid header).
export const CORRUPT_FIXTURE = {
  name: 'corrupt.zip',
  mimeType: 'application/zip',
  content: 'This is not a valid ZIP file',
};

// 9. Malicious: null byte in entry name.
export const NULL_BYTE_FIXTURE = {
  name: 'null-byte.zip',
  mimeType: 'application/zip',
  entryName: 'file\x00.txt',
  content: 'test',
};

// 10. Malicious: absolute path.
export const ABSOLUTE_PATH_FIXTURE = {
  name: 'absolute-path.zip',
  mimeType: 'application/zip',
  entryName: '/etc/passwd',
  content: 'root:x:0:0:root:/root:/bin/bash',
};

// 11. Malicious: unsupported media type.
export const UNSUPPORTED_MEDIA_FIXTURE = {
  name: 'unsupported-media.zip',
  mimeType: 'application/zip',
  entryName: 'word/media/exploit.exe',
  content: Buffer.from([0x4d, 0x5a, 0x90, 0x00]).toString('base64'), // PE header
};

// Generate fixture files for testing.
// This function creates actual binary fixture files.
export function generateFixtures(): void {
  // Valid DOCX.
  const validDocxEntries = [
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: 'word/_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Sample Question</w:t></w:r></w:p></w:body></w:document>' },
  ];
  fs.writeFileSync(path.join(FIXTURES_DIR, 'valid-minimal.docx'), createMinimalZip(validDocxEntries));

  // Valid ZIP with media.
  const validZipEntries = [
    { name: 'audio.mp3', content: Buffer.alloc(1000, 0xff).toString('base64') },
  ];
  fs.writeFileSync(path.join(FIXTURES_DIR, 'valid-with-media.zip'), createMinimalZip(validZipEntries));

  console.log('Test fixtures generated in:', FIXTURES_DIR);
}

// Run generator if called directly.
if (require.main === module) {
  generateFixtures();
}
