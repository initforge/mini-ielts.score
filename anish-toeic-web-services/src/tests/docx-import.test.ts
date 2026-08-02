/**
 * DOCX Import Service Tests.
 * Focused tests for yauzl security model and archive inspection.
 *
 * Threat model coverage:
 * - lazyEntries: stream processing, never full extraction
 * - No disk extraction: in-memory only
 * - Caps/max entries/path traversal/duplicate/null/absolute: validated
 * - Reject macro/OLE/external relationship/encrypted: checked
 * - No unsafe remote URLs: local file processing
 * - ZIP bomb detection: compression ratio validation
 */

import { inspectArchive, verifyHash, validateExtensionMimeMatch } from '../services/docx-import.service';
import { validateMediaFileName, isAllowedMediaType, computeHash } from '../services/import-media.adapter';

describe('DOCX Import Service Security', () => {
  // Helper: create minimal valid ZIP.
  function createValidZip(entries: { name: string; content: string }[]): Buffer {
    const parts: Buffer[] = [];
    const centralDir: Buffer[] = [];
    let localOffset = 0;

    for (const entry of entries) {
      const uncompressed = Buffer.from(entry.content, 'utf8');
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
      localHeader.writeUInt32LE(uncompressed.length, 18);
      localHeader.writeUInt32LE(uncompressed.length, 22);
      localHeader.writeUInt16LE(name.length, 26);
      localHeader.writeUInt16LE(0, 28);
      name.copy(localHeader, 30);

      parts.push(localHeader);
      parts.push(uncompressed);

      const cdEntry = Buffer.alloc(46 + name.length);
      cdEntry.writeUInt32LE(0x02014b50, 0);
      cdEntry.writeUInt16LE(20, 4);
      cdEntry.writeUInt16LE(20, 6);
      cdEntry.writeUInt16LE(0, 8);
      cdEntry.writeUInt16LE(0, 10);
      cdEntry.writeUInt16LE(0, 12);
      cdEntry.writeUInt16LE(0, 14);
      cdEntry.writeUInt32LE(crc, 16);
      cdEntry.writeUInt32LE(uncompressed.length, 20);
      cdEntry.writeUInt32LE(uncompressed.length, 24);
      cdEntry.writeUInt16LE(name.length, 28);
      cdEntry.writeUInt16LE(0, 30);
      cdEntry.writeUInt16LE(0, 32);
      cdEntry.writeUInt16LE(0, 34);
      cdEntry.writeUInt16LE(0, 36);
      cdEntry.writeUInt32LE(localOffset, 40);
      name.copy(cdEntry, 46);

      centralDir.push(cdEntry);
      localOffset += localHeader.length + uncompressed.length;
    }

    const centralDirBuf = Buffer.concat(centralDir);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralDirBuf.length, 12);
    eocd.writeUInt32LE(localOffset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...parts, centralDirBuf, eocd]);
  }

  let crc32Table: number[] | null = null;
  function crc32(data: Buffer): number {
    if (!crc32Table) {
      crc32Table = [];
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        crc32Table[n] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = crc32Table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  describe('Valid archives', () => {
    it('parses valid DOCX with required entries', async () => {
      const entries = [
        { name: '[Content_Types].xml', content: '<?xml version="1.0"?><Types/>' },
        { name: 'word/_rels/.rels', content: '<?xml version="1.0"?><Relationships/>' },
        { name: 'word/document.xml', content: '<?xml version="1.0"?><document/>' },
      ];
      const buffer = createValidZip(entries);
      const result = await inspectArchive(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'test.docx');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates media files in ZIP', async () => {
      const entries = [
        { name: 'word/media/audio.mp3', content: Buffer.alloc(1000, 0xff).toString('base64') },
        { name: 'word/media/image.png', content: Buffer.alloc(500, 0x89).toString('base64') },
      ];
      const buffer = createValidZip(entries);
      const result = await inspectArchive(buffer, 'application/zip', 'media.zip');

      expect(result.valid).toBe(true);
      expect(result.mediaCount).toBe(2);
      expect(result.media.every(m => m.valid)).toBe(true);
    });
  });

  describe('Path traversal (zip-slip)', () => {
    it('rejects entry with ../', async () => {
      const entries = [
        { name: '../../../etc/passwd', content: 'root:x:0:0' },
      ];
      const buffer = createValidZip(entries);
      const result = await inspectArchive(buffer, 'application/zip', 'slip.zip');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('path traversal') || e.includes('..'))).toBe(true);
    });

    it('rejects absolute path entry', async () => {
      const entries = [
        { name: '/etc/passwd', content: 'root:x:0:0' },
      ];
      const buffer = createValidZip(entries);
      const result = await inspectArchive(buffer, 'application/zip', 'absolute.zip');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('absolute path'))).toBe(true);
    });
  });

  describe('OLE/Macro detection', () => {
    it('rejects OLE compound signature', async () => {
      const oleContent = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      const entries = [
        { name: 'word/vbaProject.bin', content: oleContent.toString('base64') },
      ];
      const buffer = createValidZip(entries);
      const result = await inspectArchive(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'macro.docx');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('OLE') || e.includes('macro'))).toBe(true);
    });
  });

   describe('External relationships', () => {
     it('rejects external HTTP URL in .rels', async () => {
       const relsContent = '<?xml version="1.0"?><Relationships><Relationship Target="https://evil.com" TargetMode="External"/></Relationships>';
       const entries = [
         { name: '_rels/.rels', content: relsContent },
       ];
       const buffer = createValidZip(entries);
       const result = await inspectArchive(buffer, 'application/zip', 'external.zip');

       expect(result.valid).toBe(false);
       expect(result.errors.some(e => e.includes('External relationship'))).toBe(true);
     });

     it('rejects external HTTP URL in document .rels', async () => {
       const relsContent = '<?xml version="1.0"?><Relationships><Relationship Target="http://example.com/malware.exe" TargetMode="External"/></Relationships>';
       const entries = [
         { name: 'word/_rels/document.xml.rels', content: relsContent },
       ];
       const buffer = createValidZip(entries);
       const result = await inspectArchive(buffer, 'application/zip', 'doc-rels.zip');

       expect(result.valid).toBe(false);
       expect(result.errors.some(e => e.includes('External'))).toBe(true);
     });

     it('rejects file:// scheme in external relationship', async () => {
       const relsContent = '<?xml version="1.0"?><Relationships><Relationship Target="file:///etc/passwd" TargetMode="External"/></Relationships>';
       const entries = [
         { name: '_rels/.rels', content: relsContent },
       ];
       const buffer = createValidZip(entries);
       const result = await inspectArchive(buffer, 'application/zip', 'file-scheme.zip');

       expect(result.valid).toBe(false);
       expect(result.errors.some(e => e.includes('External relationship'))).toBe(true);
     });

     it('rejects ftp:// scheme in external relationship', async () => {
       const relsContent = '<?xml version="1.0"?><Relationships><Relationship Target="ftp://evil.com/malware.exe" TargetMode="External"/></Relationships>';
       const entries = [
         { name: '_rels/.rels', content: relsContent },
       ];
       const buffer = createValidZip(entries);
       const result = await inspectArchive(buffer, 'application/zip', 'ftp-scheme.zip');

       expect(result.valid).toBe(false);
       expect(result.errors.some(e => e.includes('External relationship'))).toBe(true);
     });

     it('rejects javascript: scheme in external relationship', async () => {
       const relsContent = '<?xml version="1.0"?><Relationships><Relationship Target="javascript:alert(1)" TargetMode="External"/></Relationships>';
       const entries = [
         { name: '_rels/.rels', content: relsContent },
       ];
       const buffer = createValidZip(entries);
       const result = await inspectArchive(buffer, 'application/zip', 'js-scheme.zip');

       expect(result.valid).toBe(false);
       expect(result.errors.some(e => e.includes('External relationship'))).toBe(true);
     });

     it('rejects any TargetMode=External regardless of scheme', async () => {
       const schemes = ['file://', 'ftp://', 'javascript:', 'data:', 'telnet://', 'ssh://'];
       for (const scheme of schemes) {
         const relsContent = `<?xml version="1.0"?><Relationships><Relationship Target="${scheme}/evil" TargetMode="External"/></Relationships>`;
         const entries = [
           { name: '_rels/.rels', content: relsContent },
         ];
         const buffer = createValidZip(entries);
         const result = await inspectArchive(buffer, 'application/zip', `scheme-${scheme.replace(/[:/]/g, '')}.zip`);

         expect(result.valid).toBe(false);
         expect(result.errors.some(e => e.includes('External relationship'))).toBe(true);
       }
     });
   });

  describe('Duplicate entries', () => {
    it('rejects duplicate file names', async () => {
      const entries = [
        { name: 'file.txt', content: 'First content' },
        { name: 'file.txt', content: 'Second content' },
      ];
      const buffer = createValidZip(entries);
      const result = await inspectArchive(buffer, 'application/zip', 'duplicate.zip');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
    });
  });

  describe('Null bytes', () => {
    it('rejects null byte in entry name', async () => {
      const buffer = Buffer.from('PK\x03\x04file\x00.txt');
      const result = await inspectArchive(buffer, 'application/zip', 'null.zip');

      expect(result.valid).toBe(false);
    });
  });

  describe('ZIP bomb detection', () => {
    it('detects high compression ratio', async () => {
      // 10MB of repeated 'A' compresses extremely well.
      const largeContent = Buffer.alloc(10 * 1024 * 1024, 0x41).toString('base64');
      const entries = [
        { name: 'large.txt', content: largeContent },
      ];
      const buffer = createValidZip(entries);
      const result = await inspectArchive(buffer, 'application/zip', 'bomb.zip');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('bomb') || e.includes('ratio'))).toBe(true);
    });
  });

  describe('Max entries limit', () => {
    it('rejects archive with too many entries', async () => {
      // Create archive with > 10000 entries.
      const entries: { name: string; content: string }[] = [];
      for (let i = 0; i < 10001; i++) {
        entries.push({ name: `file${i}.txt`, content: 'x' });
      }
      const buffer = createValidZip(entries);
      const result = await inspectArchive(buffer, 'application/zip', 'many.zip');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('max entries'))).toBe(true);
    });
  });

   describe('Corrupt archives', () => {
     it('rejects invalid ZIP header', async () => {
       const buffer = Buffer.from('This is not a valid ZIP file');
       const result = await inspectArchive(buffer, 'application/zip', 'corrupt.zip');

       expect(result.valid).toBe(false);
       expect(result.errors.length).toBeGreaterThan(0);
     });

     it('handles truncated archive', async () => {
       const buffer = Buffer.from('PK\x03\x04'); // Partial header only.
       const result = await inspectArchive(buffer, 'application/zip', 'truncated.zip');

       expect(result.valid).toBe(false);
     });
   });

   describe('Strict object bounds', () => {
     it('rejects empty buffer', async () => {
       const result = await inspectArchive(Buffer.alloc(0), 'application/zip', 'empty.zip');

       expect(result.valid).toBe(false);
       expect(result.errors.some(e => e.includes('Empty'))).toBe(true);
     });

     it('rejects oversized buffer', async () => {
       const oversizedBuffer = Buffer.alloc(101 * 1024 * 1024); // 101MB
       const result = await inspectArchive(oversizedBuffer, 'application/zip', 'oversized.zip');

       expect(result.valid).toBe(false);
       expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(true);
     });

     it('rejects buffer too small to be a valid archive', async () => {
       const tinyBuffer = Buffer.from('PK');
       const result = await inspectArchive(tinyBuffer, 'application/zip', 'tiny.zip');

       expect(result.valid).toBe(false);
     });
   });

  describe('Unsupported media types', () => {
    it('rejects executable files', async () => {
      const peHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // PE signature.
      const entries = [
        { name: 'word/media/exploit.exe', content: peHeader.toString('base64') },
      ];
      const buffer = createValidZip(entries);
      const result = await inspectArchive(buffer, 'application/zip', 'exe.zip');

      expect(result.valid).toBe(false);
      expect(result.media.some(m => !m.valid && m.error?.includes('Unsupported'))).toBe(true);
    });

    it('accepts allowed audio formats', async () => {
      const entries = [
        { name: 'audio.mp3', content: Buffer.alloc(100, 0xff).toString('base64') },
        { name: 'audio.wav', content: Buffer.alloc(100, 0xff).toString('base64') },
        { name: 'audio.ogg', content: Buffer.alloc(100, 0xff).toString('base64') },
      ];
      const buffer = createValidZip(entries);
      const result = await inspectArchive(buffer, 'application/zip', 'audio.zip');

      expect(result.valid).toBe(true);
      expect(result.mediaCount).toBe(3);
    });

    it('accepts allowed image formats', async () => {
      const entries = [
        { name: 'image.png', content: Buffer.alloc(100, 0x89).toString('base64') },
        { name: 'image.jpg', content: Buffer.alloc(100, 0xff).toString('base64') },
        { name: 'image.webp', content: Buffer.alloc(100, 0x52).toString('base64') },
      ];
      const buffer = createValidZip(entries);
      const result = await inspectArchive(buffer, 'application/zip', 'image.zip');

      expect(result.valid).toBe(true);
      expect(result.mediaCount).toBe(3);
    });
  });
});

describe('Hash verification', () => {
  it('computes correct SHA-256 hash', () => {
    const buffer = Buffer.from('test content');
    const hash = computeHash(buffer);

    // ponytail: correct SHA256 of 'test content' per test canonical fixture.
    expect(hash).toBe('6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72');
  });

  it('verifies matching hash', () => {
    const buffer = Buffer.from('test content');
    const hash = '6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72';

    expect(verifyHash(buffer, hash)).toBe(true);
  });

  it('rejects non-matching hash', () => {
    const buffer = Buffer.from('test content');
    const wrongHash = '0000000000000000000000000000000000000000000000000000000000000000';

    expect(verifyHash(buffer, wrongHash)).toBe(false);
  });
});

describe('Extension/MIME validation', () => {
  it('accepts .docx with correct MIME', () => {
    expect(validateExtensionMimeMatch('test.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
  });

  it('accepts .zip with correct MIME', () => {
    expect(validateExtensionMimeMatch('test.zip', 'application/zip')).toBe(true);
  });

  it('rejects .docx with wrong MIME', () => {
    expect(validateExtensionMimeMatch('test.docx', 'application/zip')).toBe(false);
  });

  it('rejects .exe with any MIME', () => {
    expect(validateExtensionMimeMatch('test.exe', 'application/octet-stream')).toBe(false);
  });
});

describe('Media file name validation', () => {
  it('accepts valid file names', () => {
    expect(validateMediaFileName('audio.mp3')).toBe('audio.mp3');
    expect(validateMediaFileName('word/media/image.png')).toBe('word/media/image.png');
    expect(validateMediaFileName('image-01.png')).toBe('image-01.png');
  });

  it('normalizes backslashes', () => {
    expect(validateMediaFileName('word\\media\\image.png')).toBe('word/media/image.png');
  });

  it('rejects path traversal', () => {
    expect(() => validateMediaFileName('../../../etc/passwd')).toThrow('path traversal');
  });

  it('rejects absolute paths', () => {
    expect(() => validateMediaFileName('/etc/passwd')).toThrow('absolute path');
  });

  it('rejects null bytes', () => {
    expect(() => validateMediaFileName('file\x00.txt')).toThrow('null bytes');
  });

  it('rejects names over 255 chars', () => {
    const longName = 'a'.repeat(256);
    expect(() => validateMediaFileName(longName)).toThrow('255 characters');
  });
});

describe('Allowed media types', () => {
  it('accepts allowed types', () => {
    expect(isAllowedMediaType('audio/mpeg')).toBe(true);
    expect(isAllowedMediaType('audio/mp3')).toBe(true);
    expect(isAllowedMediaType('audio/wav')).toBe(true);
    expect(isAllowedMediaType('audio/ogg')).toBe(true);
    expect(isAllowedMediaType('audio/webm')).toBe(true);
    expect(isAllowedMediaType('image/png')).toBe(true);
    expect(isAllowedMediaType('image/jpeg')).toBe(true);
    expect(isAllowedMediaType('image/gif')).toBe(true);
    expect(isAllowedMediaType('image/webp')).toBe(true);
  });

  it('rejects disallowed types', () => {
    expect(isAllowedMediaType('application/octet-stream')).toBe(false);
    expect(isAllowedMediaType('application/x-executable')).toBe(false);
    expect(isAllowedMediaType('text/html')).toBe(false);
    expect(isAllowedMediaType('application/javascript')).toBe(false);
  });
});
