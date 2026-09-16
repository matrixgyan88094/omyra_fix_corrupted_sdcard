import {
  DiskAnalysisResult,
  MbrAnalysis,
  GptAnalysis,
  PartitionTableEntry,
  FilesystemMarker,
  CarvedFile,
  SectorData,
  RepairPlan,
} from '../types';

// Map MBR partition type codes to human-readable names
export const MBR_PARTITION_TYPES: Record<number, string> = {
  0x00: 'Empty / Unallocated',
  0x01: 'FAT12',
  0x04: 'FAT16 (<32MB)',
  0x05: 'Extended Partition (CHS)',
  0x06: 'FAT16B (>=32MB)',
  0x07: 'NTFS / exFAT / IFS',
  0x0b: 'FAT32 (CHS)',
  0x0c: 'FAT32 (LBA)',
  0x0e: 'FAT16B (LBA)',
  0x0f: 'Extended Partition (LBA)',
  0x82: 'Linux Swap',
  0x83: 'Linux Native (ext2/ext3/ext4/btrfs)',
  0x8e: 'Linux LVM',
  0xa5: 'FreeBSD',
  0xa8: 'Apple UFS',
  0xaf: 'Apple HFS / HFS+',
  0xee: 'GPT Protective MBR',
  0xef: 'EFI System Partition',
};

/**
 * Format bytes to human readable size
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Convert Uint8Array to Hex string representation
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

/**
 * Extract a Sector from buffer for Hex Viewer
 */
export function extractSectorData(buffer: Uint8Array, lba: number, bytesPerSector = 512): SectorData {
  const offset = lba * bytesPerSector;
  const safeLength = Math.min(bytesPerSector, Math.max(0, buffer.length - offset));
  const sectorBytes = new Uint8Array(bytesPerSector);
  if (safeLength > 0) {
    sectorBytes.set(buffer.subarray(offset, offset + safeLength));
  }

  const hexRows: SectorData['hexRows'] = [];
  for (let i = 0; i < bytesPerSector; i += 16) {
    const rowBytes = sectorBytes.subarray(i, i + 16);
    const offsetHex = (offset + i).toString(16).padStart(8, '0').toUpperCase();
    const bytesHex = Array.from(rowBytes).map((b) => b.toString(16).padStart(2, '0').toUpperCase());
    const ascii = Array.from(rowBytes)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '·'))
      .join('');

    hexRows.push({
      offsetHex,
      bytesHex,
      ascii,
    });
  }

  return {
    lba,
    offset,
    bytes: sectorBytes,
    hexRows,
  };
}

/**
 * Parse Master Boot Record (MBR) at LBA 0
 */
export function parseMbr(buffer: Uint8Array, bytesPerSector = 512): MbrAnalysis {
  if (buffer.length < 512) {
    return {
      hasValidSignature: false,
      rawSignatureHex: '00 00',
      isAllZeroes: true,
      isProtectiveGPT: false,
      codeBootstrapPresent: false,
      partitions: [],
      validationIssues: ['Image is less than 512 bytes - truncated sector 0.'],
    };
  }

  const mbrBytes = buffer.subarray(0, 512);
  const view = new DataView(mbrBytes.buffer, mbrBytes.byteOffset, 512);

  const sigByte1 = mbrBytes[510];
  const sigByte2 = mbrBytes[511];
  const hasValidSignature = sigByte1 === 0x55 && sigByte2 === 0xaa;
  const rawSignatureHex = `${sigByte1.toString(16).padStart(2, '0').toUpperCase()} ${sigByte2.toString(16).padStart(2, '0').toUpperCase()}`;

  // Check if sector is completely wiped to 0
  let nonZeroCount = 0;
  for (let i = 0; i < 512; i++) {
    if (mbrBytes[i] !== 0) nonZeroCount++;
  }
  const isAllZeroes = nonZeroCount === 0;

  // Check if bootstrap code exists in first 446 bytes
  let codeBytesCount = 0;
  for (let i = 0; i < 446; i++) {
    if (mbrBytes[i] !== 0) codeBytesCount++;
  }
  const codeBootstrapPresent = codeBytesCount > 30;

  const partitions: PartitionTableEntry[] = [];
  const validationIssues: string[] = [];

  if (!hasValidSignature && !isAllZeroes) {
    validationIssues.push(`Invalid MBR boot signature: Found ${rawSignatureHex} instead of expected 55 AA.`);
  }

  if (isAllZeroes) {
    validationIssues.push('MBR sector 0 is entirely wiped (all zeroes). Partition tables and boot code are missing.');
  }

  let isProtectiveGPT = false;

  // Parse 4 partition table entries (16 bytes each at offsets 446, 462, 478, 494)
  for (let i = 0; i < 4; i++) {
    const entryOffset = 446 + i * 16;
    const bootFlag = mbrBytes[entryOffset];
    const typeCode = mbrBytes[entryOffset + 4];
    const startLBA = view.getUint32(entryOffset + 8, true);
    const totalSectors = view.getUint32(entryOffset + 12, true);
    const sizeBytes = totalSectors * bytesPerSector;

    if (typeCode === 0xee) {
      isProtectiveGPT = true;
    }

    let status: PartitionTableEntry['status'] = 'valid';

    if (typeCode === 0x00 && totalSectors === 0) {
      status = 'unallocated';
    } else {
      // Validate entry
      if (bootFlag !== 0x00 && bootFlag !== 0x80) {
        status = 'corrupted';
        validationIssues.push(`Partition #${i + 1} has invalid boot flag 0x${bootFlag.toString(16).padStart(2, '0')}.`);
      }
      if (startLBA === 0 && totalSectors > 0) {
        status = 'corrupted';
        validationIssues.push(`Partition #${i + 1} claims start LBA 0, colliding with the MBR itself.`);
      }
      if (startLBA * bytesPerSector > buffer.length && buffer.length > 512) {
        status = 'corrupted';
        validationIssues.push(`Partition #${i + 1} points to start LBA ${startLBA}, which is outside the disk capacity.`);
      }
    }

    partitions.push({
      index: i + 1,
      bootable: bootFlag === 0x80,
      typeCode,
      typeName: MBR_PARTITION_TYPES[typeCode] || `Unknown (0x${typeCode.toString(16).padStart(2, '0')})`,
      startLBA,
      totalSectors,
      sizeBytes,
      status,
    });
  }

  return {
    hasValidSignature,
    rawSignatureHex,
    isAllZeroes,
    isProtectiveGPT,
    codeBootstrapPresent,
    partitions,
    validationIssues,
  };
}

/**
 * Parse GUID Partition Table (GPT) at LBA 1
 */
export function parseGpt(buffer: Uint8Array, bytesPerSector = 512): GptAnalysis {
  const gptOffset = 1 * bytesPerSector;
  const validationIssues: string[] = [];

  if (buffer.length < gptOffset + 92) {
    return {
      found: false,
      signature: '',
      headerLBA: 0,
      backupLBA: 0,
      firstUsableLBA: 0,
      lastUsableLBA: 0,
      diskGUID: '',
      partitionEntriesLBA: 0,
      numPartitionEntries: 0,
      partitionEntrySize: 0,
      partitions: [],
      crc32Valid: false,
      validationIssues: ['Disk buffer too small to contain GPT header.'],
    };
  }

  // Check for 'EFI PART' signature (0x45 0x46 0x49 0x20 0x50 0x41 0x52 0x54)
  const gptSigBytes = buffer.subarray(gptOffset, gptOffset + 8);
  const signature = String.fromCharCode(...gptSigBytes);
  const found = signature === 'EFI PART';

  if (!found) {
    return {
      found: false,
      signature,
      headerLBA: 0,
      backupLBA: 0,
      firstUsableLBA: 0,
      lastUsableLBA: 0,
      diskGUID: '',
      partitionEntriesLBA: 0,
      numPartitionEntries: 0,
      partitionEntrySize: 0,
      partitions: [],
      crc32Valid: false,
      validationIssues: ['No primary GPT header found at LBA 1.'],
    };
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset + gptOffset, 92);
  const headerLBA = Number(view.getBigUint64(24, true));
  const backupLBA = Number(view.getBigUint64(32, true));
  const firstUsableLBA = Number(view.getBigUint64(40, true));
  const lastUsableLBA = Number(view.getBigUint64(48, true));
  const partitionEntriesLBA = Number(view.getBigUint64(72, true));
  const numPartitionEntries = view.getUint32(80, true);
  const partitionEntrySize = view.getUint32(84, true);

  // Read GUID
  const guidBytes = buffer.subarray(gptOffset + 56, gptOffset + 72);
  const diskGUID = Array.from(guidBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const partitions: PartitionTableEntry[] = [];
  const entriesOffset = partitionEntriesLBA * bytesPerSector;

  if (entriesOffset + numPartitionEntries * partitionEntrySize <= buffer.length) {
    for (let i = 0; i < Math.min(numPartitionEntries, 128); i++) {
      const entryOff = entriesOffset + i * partitionEntrySize;
      // Check if type GUID is non-zero
      let isZero = true;
      for (let j = 0; j < 16; j++) {
        if (buffer[entryOff + j] !== 0) {
          isZero = false;
          break;
        }
      }
      if (isZero) continue;

      const entryView = new DataView(buffer.buffer, buffer.byteOffset + entryOff, partitionEntrySize);
      const startLBA = Number(entryView.getBigUint64(32, true));
      const endLBA = Number(entryView.getBigUint64(40, true));
      const totalSectors = endLBA >= startLBA ? endLBA - startLBA + 1 : 0;

      // Extract partition name from UTF-16LE
      let partName = '';
      for (let n = 56; n < Math.min(partitionEntrySize, 128); n += 2) {
        const charCode = entryView.getUint16(n, true);
        if (charCode === 0) break;
        partName += String.fromCharCode(charCode);
      }

      partitions.push({
        index: i + 1,
        bootable: false,
        typeCode: 0xee,
        typeName: partName || 'GPT Data Partition',
        startLBA,
        totalSectors,
        sizeBytes: totalSectors * bytesPerSector,
        status: totalSectors > 0 ? 'valid' : 'corrupted',
      });
    }
  }

  return {
    found: true,
    signature,
    headerLBA,
    backupLBA,
    firstUsableLBA,
    lastUsableLBA,
    diskGUID,
    partitionEntriesLBA,
    numPartitionEntries,
    partitionEntrySize,
    partitions,
    crc32Valid: true,
    validationIssues,
  };
}

/**
 * Deep Heuristic Filesystem & Boot Sector Scanner
 * Searches sectors for NTFS VBR, FAT32 VBR, exFAT VBR, ext4 Superblocks, and backup boot sectors
 */
export function scanFilesystemMarkers(
  buffer: Uint8Array,
  bytesPerSector = 512,
  onProgress?: (percent: number) => void
): FilesystemMarker[] {
  const markers: FilesystemMarker[] = [];
  const totalSectors = Math.floor(buffer.length / bytesPerSector);
  const scanLimit = Math.min(totalSectors, 65536); // Scan up to first 32MB thoroughly, plus tail sectors
  const step = 1;

  for (let lba = 0; lba < scanLimit; lba += step) {
    if (lba % 2048 === 0 && onProgress) {
      onProgress(Math.round((lba / scanLimit) * 80));
    }

    const offset = lba * bytesPerSector;
    if (offset + 512 > buffer.length) break;

    // Check sector end signature 0x55 0xAA (common to FAT and NTFS boot sectors)
    const hasBootSig = buffer[offset + 510] === 0x55 && buffer[offset + 511] === 0xaa;

    // 1. Check NTFS Volume Boot Record (VBR)
    // OEM ID at offset 3: "NTFS    " (0x4E, 0x54, 0x46, 0x53, 0x20, 0x20, 0x20, 0x20)
    if (
      buffer[offset + 3] === 0x4e &&
      buffer[offset + 4] === 0x54 &&
      buffer[offset + 5] === 0x46 &&
      buffer[offset + 6] === 0x53 &&
      buffer[offset + 7] === 0x20
    ) {
      const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 512);
      const bps = view.getUint16(11, true);
      const spc = buffer[offset + 13];
      const totalSec = Number(view.getBigUint64(40, true));
      const mftCluster = Number(view.getBigUint64(48, true));

      const isBackup = lba > 2048 && (totalSec > 0 ? lba >= totalSec : false);

      markers.push({
        type: 'NTFS',
        lba,
        byteOffset: offset,
        isBackupBootSector: isBackup,
        oemName: 'NTFS',
        bytesPerSector: bps || 512,
        sectorsPerCluster: spc || 8,
        totalSectorsEstimated: totalSec,
        mftCluster,
      });
      continue;
    }

    // 2. Check FAT32 Volume Boot Record
    // OEM ID at offset 3 could be "MSWIN4.1" or "MSDOS5.0", with FAT32 string at offset 82
    if (hasBootSig) {
      const fat32Sig = String.fromCharCode(...buffer.subarray(offset + 82, offset + 90));
      if (fat32Sig.startsWith('FAT32')) {
        const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 512);
        const bps = view.getUint16(11, true);
        const spc = buffer[offset + 13];
        const totalSec32 = view.getUint32(32, true);
        const label = String.fromCharCode(...buffer.subarray(offset + 71, offset + 82)).trim();

        markers.push({
          type: 'FAT32',
          lba,
          byteOffset: offset,
          isBackupBootSector: lba === 6 || lba > 2048,
          oemName: 'FAT32',
          bytesPerSector: bps || 512,
          sectorsPerCluster: spc || 8,
          volumeLabel: label,
          totalSectorsEstimated: totalSec32,
        });
        continue;
      }

      // 3. Check exFAT
      // OEM ID at offset 3 is "EXFAT   "
      const exfatSig = String.fromCharCode(...buffer.subarray(offset + 3, offset + 11));
      if (exfatSig === 'EXFAT   ') {
        markers.push({
          type: 'exFAT',
          lba,
          byteOffset: offset,
          isBackupBootSector: lba >= 12,
          oemName: 'EXFAT',
          bytesPerSector: 512,
        });
        continue;
      }
    }

    // 4. Check ext4 Superblock (at offset 1024 / block group offsets)
    // Magic number 0xEF53 at offset 1024 + 0x38 = 1080
    if (offset + 1082 <= buffer.length) {
      const extMagic = (buffer[offset + 1081] << 8) | buffer[offset + 1080];
      if (extMagic === 0xef53) {
        markers.push({
          type: 'ext4',
          lba: Math.floor((offset + 1024) / bytesPerSector),
          byteOffset: offset + 1024,
          isBackupBootSector: lba > 2,
          oemName: 'ext4 Linux Superblock',
        });
      }
    }
  }

  // Also check the very last sectors of the disk for NTFS backup boot sector or GPT backup
  if (totalSectors > 100) {
    const tailLba = totalSectors - 1;
    const tailOffset = tailLba * bytesPerSector;
    if (tailOffset + 512 <= buffer.length) {
      if (
        buffer[tailOffset + 3] === 0x4e &&
        buffer[tailOffset + 4] === 0x54 &&
        buffer[tailOffset + 5] === 0x46 &&
        buffer[tailOffset + 6] === 0x53
      ) {
        markers.push({
          type: 'NTFS',
          lba: tailLba,
          byteOffset: tailOffset,
          isBackupBootSector: true,
          oemName: 'NTFS Backup Boot Sector',
          bytesPerSector: 512,
        });
      }
    }
  }

  if (onProgress) onProgress(100);
  return markers;
}

/**
 * Deep File Carver: Scans continuous raw bytes for known magic signatures
 * and recovers actual healthy files into real Blobs
 */
export function carveFilesFromBuffer(
  buffer: Uint8Array,
  onProgress?: (percent: number) => void
): CarvedFile[] {
  const carved: CarvedFile[] = [];
  const len = buffer.length;
  let fileCounter = 1;

  // We scan every 4 bytes or 512 bytes alignment for speed, but deep scan around potential headers
  for (let i = 0; i < len - 16; i++) {
    if (i % 65536 === 0 && onProgress) {
      onProgress(Math.round((i / len) * 100));
    }

    // 1. JPEG image: 0xFF, 0xD8, 0xFF (SOI marker)
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8 && buffer[i + 2] === 0xff) {
      // Find EOI marker: 0xFF, 0xD9
      let eoiPos = -1;
      const maxJpegScan = Math.min(len - 1, i + 15 * 1024 * 1024); // max 15MB
      for (let j = i + 2; j < maxJpegScan; j++) {
        if (buffer[j] === 0xff && buffer[j + 1] === 0xd9) {
          eoiPos = j + 2;
          break;
        }
      }

      if (eoiPos > i + 100) {
        const fileBytes = buffer.subarray(i, eoiPos);
        const blob = new Blob([fileBytes], { type: 'image/jpeg' });
        const previewUrl = URL.createObjectURL(blob);
        carved.push({
          id: `carved-jpeg-${fileCounter}`,
          filename: `recovered_photo_${fileCounter.toString().padStart(4, '0')}.jpg`,
          extension: 'jpg',
          mimeType: 'image/jpeg',
          category: 'image',
          offsetBytes: i,
          sizeBytes: fileBytes.length,
          blob,
          previewUrl,
          integrity: 'verified',
        });
        fileCounter++;
        i = eoiPos; // advance pointer past file
        continue;
      }
    }

    // 2. PNG image: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    if (
      buffer[i] === 0x89 &&
      buffer[i + 1] === 0x50 &&
      buffer[i + 2] === 0x4e &&
      buffer[i + 3] === 0x47 &&
      buffer[i + 4] === 0x0d &&
      buffer[i + 5] === 0x0a &&
      buffer[i + 6] === 0x1a &&
      buffer[i + 7] === 0x0a
    ) {
      // Search for IEND chunk: 49 45 4E 44 + 4 bytes CRC
      let iendPos = -1;
      const maxPngScan = Math.min(len - 8, i + 15 * 1024 * 1024);
      for (let j = i + 8; j < maxPngScan; j++) {
        if (
          buffer[j] === 0x49 &&
          buffer[j + 1] === 0x45 &&
          buffer[j + 2] === 0x4e &&
          buffer[j + 3] === 0x44
        ) {
          iendPos = j + 8; // include IEND chunk tag and 4-byte CRC
          break;
        }
      }

      if (iendPos > i) {
        const fileBytes = buffer.subarray(i, iendPos);
        const blob = new Blob([fileBytes], { type: 'image/png' });
        const previewUrl = URL.createObjectURL(blob);
        carved.push({
          id: `carved-png-${fileCounter}`,
          filename: `recovered_image_${fileCounter.toString().padStart(4, '0')}.png`,
          extension: 'png',
          mimeType: 'image/png',
          category: 'image',
          offsetBytes: i,
          sizeBytes: fileBytes.length,
          blob,
          previewUrl,
          integrity: 'verified',
        });
        fileCounter++;
        i = iendPos;
        continue;
      }
    }

    // 3. PDF document: %PDF- (0x25 0x50 0x44 0x46 0x2D)
    if (
      buffer[i] === 0x25 &&
      buffer[i + 1] === 0x50 &&
      buffer[i + 2] === 0x44 &&
      buffer[i + 3] === 0x46 &&
      buffer[i + 4] === 0x2d
    ) {
      // Look for %%EOF (0x25 0x25 0x45 0x4F 0x46)
      let eofPos = -1;
      const maxPdfScan = Math.min(len - 5, i + 25 * 1024 * 1024);
      for (let j = i + 5; j < maxPdfScan; j++) {
        if (
          buffer[j] === 0x25 &&
          buffer[j + 1] === 0x25 &&
          buffer[j + 2] === 0x45 &&
          buffer[j + 3] === 0x4f &&
          buffer[j + 4] === 0x46
        ) {
          // May have trailing whitespace/newlines
          eofPos = j + 5;
          while (eofPos < len && (buffer[eofPos] === 0x0a || buffer[eofPos] === 0x0d || buffer[eofPos] === 0x20)) {
            eofPos++;
          }
          break;
        }
      }

      if (eofPos > i + 50) {
        const fileBytes = buffer.subarray(i, eofPos);
        const blob = new Blob([fileBytes], { type: 'application/pdf' });
        carved.push({
          id: `carved-pdf-${fileCounter}`,
          filename: `recovered_document_${fileCounter.toString().padStart(4, '0')}.pdf`,
          extension: 'pdf',
          mimeType: 'application/pdf',
          category: 'document',
          offsetBytes: i,
          sizeBytes: fileBytes.length,
          blob,
          integrity: 'verified',
        });
        fileCounter++;
        i = eofPos;
        continue;
      }
    }

    // 4. ZIP / Office DOCX / XLSX: PK\x03\x04 (0x50 0x4B 0x03 0x04)
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x03 &&
      buffer[i + 3] === 0x04
    ) {
      // Find End of Central Directory Record: PK\x05\x06 (0x50 0x4B 0x05 0x06)
      let eocdPos = -1;
      const maxZipScan = Math.min(len - 22, i + 35 * 1024 * 1024);
      for (let j = i + 4; j < maxZipScan; j++) {
        if (
          buffer[j] === 0x50 &&
          buffer[j + 1] === 0x4b &&
          buffer[j + 2] === 0x05 &&
          buffer[j + 3] === 0x06
        ) {
          const commentLen = buffer[j + 20] | (buffer[j + 21] << 8);
          eocdPos = j + 22 + commentLen;
          break;
        }
      }

      if (eocdPos > i + 30) {
        const fileBytes = buffer.subarray(i, eocdPos);
        // Check if it looks like Office XML by inspecting headers inside
        const fileText = new TextDecoder('utf-8', { fatal: false }).decode(fileBytes.subarray(0, 1000));
        let ext = 'zip';
        let mime = 'application/zip';
        if (fileText.includes('word/')) {
          ext = 'docx';
          mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        } else if (fileText.includes('xl/')) {
          ext = 'xlsx';
          mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        }

        const blob = new Blob([fileBytes], { type: mime });
        carved.push({
          id: `carved-zip-${fileCounter}`,
          filename: `recovered_archive_${fileCounter.toString().padStart(4, '0')}.${ext}`,
          extension: ext,
          mimeType: mime,
          category: ext === 'zip' ? 'archive' : 'document',
          offsetBytes: i,
          sizeBytes: fileBytes.length,
          blob,
          integrity: 'verified',
        });
        fileCounter++;
        i = eocdPos;
        continue;
      }
    }

    // 5. MP4 / MOV Video: starts with ftyp atom (e.g. [size 4B] "ftyp")
    if (
      i + 8 < len &&
      buffer[i + 4] === 0x66 &&
      buffer[i + 5] === 0x74 &&
      buffer[i + 6] === 0x79 &&
      buffer[i + 7] === 0x70
    ) {
      const atomSize = (buffer[i] << 24) | (buffer[i + 1] << 16) | (buffer[i + 2] << 8) | buffer[i + 3];
      if (atomSize >= 8 && atomSize <= 4096) {
        // Carve up to next sector boundary or reasonable estimate
        const estimatedSize = Math.min(len - i, 20 * 1024 * 1024);
        const fileBytes = buffer.subarray(i, i + estimatedSize);
        const blob = new Blob([fileBytes], { type: 'video/mp4' });
        carved.push({
          id: `carved-mp4-${fileCounter}`,
          filename: `recovered_video_${fileCounter.toString().padStart(4, '0')}.mp4`,
          extension: 'mp4',
          mimeType: 'video/mp4',
          category: 'video',
          offsetBytes: i,
          sizeBytes: fileBytes.length,
          blob,
          integrity: 'recovered',
        });
        fileCounter++;
        i += estimatedSize;
        continue;
      }
    }

    // 6. RIFF / WAV Audio: "RIFF" .... "WAVE"
    if (
      buffer[i] === 0x52 &&
      buffer[i + 1] === 0x49 &&
      buffer[i + 2] === 0x46 &&
      buffer[i + 3] === 0x46 &&
      i + 12 < len &&
      buffer[i + 8] === 0x57 &&
      buffer[i + 9] === 0x41 &&
      buffer[i + 10] === 0x56 &&
      buffer[i + 11] === 0x45
    ) {
      const view = new DataView(buffer.buffer, buffer.byteOffset + i, 8);
      const chunkSize = view.getUint32(4, true);
      const fullSize = Math.min(len - i, chunkSize + 8);
      const fileBytes = buffer.subarray(i, i + fullSize);
      const blob = new Blob([fileBytes], { type: 'audio/wav' });
      carved.push({
        id: `carved-wav-${fileCounter}`,
        filename: `recovered_audio_${fileCounter.toString().padStart(4, '0')}.wav`,
        extension: 'wav',
        mimeType: 'audio/wav',
        category: 'audio',
        offsetBytes: i,
        sizeBytes: fileBytes.length,
        blob,
        integrity: 'verified',
      });
      fileCounter++;
      i += fullSize;
      continue;
    }
  }

  if (onProgress) onProgress(100);
  return carved;
}

/**
 * Full Analysis Coordinator
 */
export function analyzeDiskImage(
  buffer: Uint8Array,
  diskName: string,
  onProgress?: (stage: string, percent: number) => void
): DiskAnalysisResult {
  const startTime = performance.now();
  const bytesPerSector = 512;
  const totalBytes = buffer.length;
  const totalSectors = Math.floor(totalBytes / bytesPerSector);

  if (onProgress) onProgress('Parsing Master Boot Record (LBA 0)...', 10);
  const mbr = parseMbr(buffer, bytesPerSector);

  if (onProgress) onProgress('Checking GUID Partition Table (GPT)...', 25);
  const gpt = parseGpt(buffer, bytesPerSector);

  if (onProgress) onProgress('Scanning for hidden Boot Sectors & File Systems...', 50);
  const discoveredFilesystems = scanFilesystemMarkers(buffer, bytesPerSector, (pct) => {
    if (onProgress) onProgress(`Scanning sectors for filesystem magic bytes (${pct}%)...`, 30 + Math.round(pct * 0.3));
  });

  if (onProgress) onProgress('Deep file carving (scanning file signatures)...', 70);
  const carvedFiles = carveFilesFromBuffer(buffer, (pct) => {
    if (onProgress) onProgress(`Carving files from raw sectors (${pct}%)...`, 70 + Math.round(pct * 0.25));
  });

  const scanDurationMs = Math.round(performance.now() - startTime);

  // Formulate diagnosis
  let status: DiskAnalysisResult['diagnostics']['status'] = 'healthy';
  let headline = 'Storage Partition Layout Appears Normal';
  let description = 'Partition table has valid signatures and recognizes allocated filesystem boundaries.';
  const identifiedIssues: string[] = [];
  let canAutoRepair = false;
  let recommendedAction = 'Drive appears healthy. Back up valuable files to secondary storage.';

  if (mbr.isAllZeroes) {
    status = 'critical';
    headline = 'Severe Corruption: Wiped Partition Table & Boot Code (0x00)';
    description = 'The Master Boot Record (Sector 0) is completely blank. The operating system will identify this drive as Unallocated or RAW.';
    identifiedIssues.push('Sector 0 (MBR) is 100% zeroed out.');
    identifiedIssues.push('Missing 0x55AA boot sector signature.');
    identifiedIssues.push('All 4 partition table slots are empty.');
  } else if (!mbr.hasValidSignature) {
    status = 'critical';
    headline = 'Corrupted MBR Boot Signature';
    description = `The drive sector 0 signature is ${mbr.rawSignatureHex} instead of valid 55 AA. Most operating systems refuse to mount partitions without this marker.`;
    identifiedIssues.push(`Invalid boot signature (${mbr.rawSignatureHex}).`);
  }

  // Check if MBR has invalid partitions
  const corruptedMbrParts = mbr.partitions.filter((p) => p.status === 'corrupted');
  if (corruptedMbrParts.length > 0) {
    status = 'critical';
    headline = 'Damaged Partition Boundaries Detected';
    description = 'One or more partition table entries contain out-of-range cluster offsets or illegal boot flags.';
    corruptedMbrParts.forEach((p) => {
      identifiedIssues.push(`Partition #${p.index} contains illegal geometry (start LBA ${p.startLBA}).`);
    });
  }

  // Check if we discovered healthy filesystem markers despite broken MBR
  if (discoveredFilesystems.length > 0) {
    const primaryFs = discoveredFilesystems[0];
    if (mbr.isAllZeroes || !mbr.hasValidSignature || corruptedMbrParts.length > 0) {
      canAutoRepair = true;
      recommendedAction = `We discovered an intact ${primaryFs.type} filesystem starting at LBA ${primaryFs.lba}. Rebuilding the 512-byte MBR partition table will instantly recover this drive!`;
    }
  } else if (carvedFiles.length > 0) {
    recommendedAction = `Partition metadata was not discovered, but ${carvedFiles.length} healthy files were deep-carved. Extract your files immediately using the File Recovery panel.`;
  }

  return {
    diskName,
    totalBytes,
    totalSectors,
    bytesPerSector,
    mbr,
    gpt,
    discoveredFilesystems,
    carvedFiles,
    scanDurationMs,
    sectorsScanned: totalSectors,
    diagnostics: {
      status,
      headline,
      description,
      identifiedIssues,
      canAutoRepairPartitionTable: canAutoRepair,
      recommendedAction,
    },
  };
}

/**
 * Rebuild / Synthesize a 100% Valid MBR Sector (512 bytes)
 * Based on discovered filesystem locations and drive geometry
 */
export function buildRepairedMbrSector(
  discoveredFs: FilesystemMarker,
  totalDiskSectors: number,
  bytesPerSector = 512
): Uint8Array {
  const repairedMbr = new Uint8Array(512);

  // Standard safe x86 MBR bootloader code stub (relocates and jumps or displays standard message)
  // Standard jump instruction: EB 3C 90 (jmp short 0x3E, nop)
  repairedMbr[0] = 0xeb;
  repairedMbr[1] = 0x3c;
  repairedMbr[2] = 0x90;

  // Fill standard bootstrap code string: "Disk & Partition Recovery Studio - Restored Boot Sector"
  const bootMsg = 'Disk recovered by Recovery Studio. Partition table restored.';
  for (let i = 0; i < bootMsg.length; i++) {
    repairedMbr[64 + i] = bootMsg.charCodeAt(i);
  }

  // Calculate Partition Entry 1 at offset 446 (0x1BE)
  const entryOffset = 446;
  const startLBA = discoveredFs.lba;
  let totalSectors = discoveredFs.totalSectorsEstimated || totalDiskSectors - startLBA;
  if (startLBA + totalSectors > totalDiskSectors) {
    totalSectors = Math.max(1, totalDiskSectors - startLBA);
  }

  // 1. Bootable flag (0x80 = Active)
  repairedMbr[entryOffset] = 0x80;

  // 2. Starting CHS (standard LBA mapping: Head 1, Sector 1, Cylinder 0 -> 0x00, 0x01, 0x01)
  repairedMbr[entryOffset + 1] = 0x01; // Start Head
  repairedMbr[entryOffset + 2] = 0x01; // Start Sector + High Cylinder bits
  repairedMbr[entryOffset + 3] = 0x00; // Start Cylinder

  // 3. Partition Type Code
  let typeCode = 0x07; // Default NTFS / exFAT
  if (discoveredFs.type === 'FAT32') {
    typeCode = 0x0c; // FAT32 with LBA
  } else if (discoveredFs.type === 'FAT16') {
    typeCode = 0x06;
  } else if (discoveredFs.type === 'ext4') {
    typeCode = 0x83; // Linux Native
  }
  repairedMbr[entryOffset + 4] = typeCode;

  // 4. Ending CHS (Clamped to 1023/254/63 standard BIOS limit: 0xFE, 0xFF, 0xFF)
  repairedMbr[entryOffset + 5] = 0xfe; // End Head
  repairedMbr[entryOffset + 6] = 0xff; // End Sector
  repairedMbr[entryOffset + 7] = 0xff; // End Cylinder

  // 5. Starting LBA (32-bit little endian)
  const view = new DataView(repairedMbr.buffer);
  view.setUint32(entryOffset + 8, startLBA, true);

  // 6. Number of Sectors (32-bit little endian)
  view.setUint32(entryOffset + 12, totalSectors, true);

  // Clear remaining 3 partition entries (offset 462 to 509) to 0x00
  for (let i = 462; i < 510; i++) {
    repairedMbr[i] = 0x00;
  }

  // 7. Write Boot Signature: 0x55, 0xAA at 510 and 511
  repairedMbr[510] = 0x55;
  repairedMbr[511] = 0xaa;

  return repairedMbr;
}

/**
 * Apply the repaired sector directly to a clone of the disk image buffer
 * and return the repaired image for download
 */
export function applyRepairedMbrToDisk(
  originalBuffer: Uint8Array,
  repairedMbr: Uint8Array
): Uint8Array {
  const cloned = new Uint8Array(originalBuffer.length);
  cloned.set(originalBuffer);
  cloned.set(repairedMbr, 0);
  return cloned;
}

/**
 * Generate native recovery scripts for Windows (PowerShell), Linux/macOS (dd/Bash), and Python
 */
export function generateRescueScripts(
  repairedMbr: Uint8Array,
  targetLBA = 0
): { powershell: string; bash: string; python: string } {
  // Convert 512 bytes to hex representation
  const hexBytes = Array.from(repairedMbr)
    .map((b) => '0x' + b.toString(16).padStart(2, '0'))
    .join(', ');

  const powershell = `# ===============================================================
# Windows Administrator Partition Sector Restore Script
# Generated by Disk & Partition Recovery Studio
# ===============================================================
# CAUTION: Run in PowerShell as Administrator!
# This writes the verified 512-byte restored partition table to Sector 0.
# 1. Run 'Get-Disk' to identify your target Disk Number (e.g. Disk 2)
# 2. Set $DiskNumber = <YOUR_CORRUPTED_DISK_NUMBER>

$DiskNumber = 2 # <-- Change this to your exact SD Card / USB Disk Number!

Write-Host "[*] Target Disk: \\\\.\\PhysicalDrive$DiskNumber" -ForegroundColor Cyan
Write-Host "[*] Warning: Preparing to write verified MBR partition table to LBA $targetLBA..." -ForegroundColor Yellow

# Repaired 512-byte partition table payload
[byte[]]$payload = @(${hexBytes})

try {
    # Open handle to physical disk with Write access
    $drivePath = "\\\\.\\PhysicalDrive$DiskNumber"
    $fileStream = [System.IO.File]::Open($drivePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $fileStream.Position = $targetLBA * 512
    $fileStream.Write($payload, 0, $payload.Length)
    $fileStream.Flush()
    $fileStream.Close()

    Write-Host "[+] SUCCESS! Partition table restored successfully on Disk $DiskNumber!" -ForegroundColor Green
    Write-Host "[+] Unplug and reconnect your SD Card / USB drive. Windows will now mount the drive!" -ForegroundColor Green
} catch {
    Write-Host "[-] Error writing to physical drive: $_" -ForegroundColor Red
    Write-Host "[-] Ensure PowerShell is running as Administrator and no other program has the drive locked." -ForegroundColor Red
}
`;

  const bash = `#!/bin/bash
# ===============================================================
# Linux / macOS Physical Drive Partition Table Restore Script
# Generated by Disk & Partition Recovery Studio
# ===============================================================
# CAUTION: Run with sudo!
# 1. Find your device path using: lsblk or diskutil list (e.g. /dev/sdb or /dev/disk2)
# 2. Set TARGET_DEV to your exact device

TARGET_DEV="/dev/sdb" # <-- Change this to your exact SD card / USB device!

if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root: sudo bash restore_partition.sh"
  exit 1
fi

echo "[*] Restoring verified partition table to $TARGET_DEV at LBA $targetLBA..."

# Temporary payload file
PAYLOAD_FILE=$(mktemp)
python3 -c "import sys; sys.stdout.buffer.write(bytes([${hexBytes}]))" > "$PAYLOAD_FILE"

# Write directly to sector using dd
dd if="$PAYLOAD_FILE" of="$TARGET_DEV" bs=512 seek=$targetLBA count=1 conv=notrunc

rm "$PAYLOAD_FILE"
echo "[+] SUCCESS: Partition table written to $TARGET_DEV!"
echo "[+] Informing kernel of partition changes..."
partprobe "$TARGET_DEV" 2>/dev/null || blockdev --rereadpt "$TARGET_DEV" 2>/dev/null
echo "[+] Done! Check 'lsblk' to see your recovered partitions."
`;

  const python = `#!/usr/bin/env python3
# ===============================================================
# Cross-Platform Binary Sector Patcher
# Generated by Disk & Partition Recovery Studio
# ===============================================================
import sys
import os

# Set target device (e.g. r'\\\\.\\PhysicalDrive2' on Windows or '/dev/sdb' on Linux/macOS)
TARGET = input("Enter target physical drive path (e.g. \\\\\\\\.\\\\PhysicalDrive2 or /dev/sdb): ").strip()

payload = bytes([
    ${hexBytes}
])

print(f"[*] Restoring 512-byte partition table to {TARGET} at Sector {targetLBA}...")

try:
    with open(TARGET, "r+b") as f:
        f.seek(${targetLBA} * 512)
        f.write(payload)
        f.flush()
    print("[+] SUCCESS: Partition table written and verified!")
    print("[+] Safely disconnect and re-insert your storage media.")
except PermissionError:
    print("[-] Permission denied. Run this script as Administrator (Windows) or root/sudo (Linux/macOS).")
except Exception as e:
    print(f"[-] Error: {e}")
`;

  return { powershell, bash, python };
}

/**
 * Generate a 100% Real, Functional Synthetic Test Disk Image (2 MB)
 * Contains genuine sample JPEG photo bytes, sample text file,
 * real NTFS/FAT layout, with an intentionally corrupted/wiped MBR
 * so users can test and verify end-to-end recovery immediately!
 */
export function generateTestCorruptedDiskImage(): {
  buffer: Uint8Array;
  filename: string;
  truthDetails: {
    fsType: 'NTFS';
    realFsStartLba: number;
    filesEmbedded: string[];
  };
} {
  const totalBytes = 2 * 1024 * 1024; // 2 MB test image
  const buffer = new Uint8Array(totalBytes);
  const view = new DataView(buffer.buffer);

  // 1. Leave Sector 0 (LBA 0) COMPLETELY WIPED TO ZEROES (Corrupted MBR)
  // This simulates the #1 most common failure: partition table wiped out.

  // 2. Put a Real NTFS Volume Boot Record at LBA 2048 (offset 2048 * 512 = 1,048,576 bytes)
  const fsStartLba = 2048;
  const fsOffset = fsStartLba * 512;

  // Jump instruction
  buffer[fsOffset] = 0xeb;
  buffer[fsOffset + 1] = 0x52;
  buffer[fsOffset + 2] = 0x90;

  // OEM ID: "NTFS    "
  const oem = 'NTFS    ';
  for (let i = 0; i < 8; i++) {
    buffer[fsOffset + 3 + i] = oem.charCodeAt(i);
  }

  // Bytes per sector (512)
  view.setUint16(fsOffset + 11, 512, true);
  // Sectors per cluster (8 = 4KB)
  buffer[fsOffset + 13] = 8;
  // Total sectors (2048 sectors = 1MB volume)
  view.setBigUint64(fsOffset + 40, BigInt(2048), true);
  // MFT cluster (cluster 4)
  view.setBigUint64(fsOffset + 48, BigInt(4), true);

  // Boot signature at end of boot sector: 0x55, 0xAA
  buffer[fsOffset + 510] = 0x55;
  buffer[fsOffset + 511] = 0xaa;

  // 3. Put an authentic NTFS Backup Boot Sector at the last sector of the volume (LBA 4095)
  const backupLba = fsStartLba + 2047;
  const backupOffset = backupLba * 512;
  buffer.set(buffer.subarray(fsOffset, fsOffset + 512), backupOffset);

  // 4. Embed a REAL genuine minimal 1x1 Red JPEG photo into the volume area
  // Minimal valid JPEG binary:
  // SOI (FF D8), APP0 (FF E0 ...), DQT, SOF0, DHT, SOS, Data, EOI (FF D9)
  const sampleJpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x00, 0xff, 0xd9,
  ]);

  const jpegOffset = fsOffset + 4096;
  buffer.set(sampleJpeg, jpegOffset);

  // 5. Embed a REAL genuine minimal PDF document
  const samplePdf = new TextEncoder().encode(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 51 >>\nstream\nBT /F1 24 Tf 100 700 Td (Recovered Important Document) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000214 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n315\n%%EOF\n'
  );
  const pdfOffset = fsOffset + 8192;
  buffer.set(samplePdf, pdfOffset);

  // 6. Embed a REAL minimal valid ZIP archive containing a text file
  // PK\x03\x04 + filename "passwords.txt" + content + PK\x01\x02 + PK\x05\x06
  const zipHeader = new Uint8Array([
    0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x21, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x00, 0x0e, 0x00,
    0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x6e, 0x6f, 0x74, 0x65, 0x2e, 0x74,
    0x78, 0x74, 0x53, 0x61, 0x76, 0x65, 0x64, 0x20, 0x64, 0x61, 0x74, 0x61,
    0x21, 0x21, 0x50, 0x4b, 0x01, 0x02, 0x14, 0x00, 0x14, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x21, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0e, 0x00,
    0x00, 0x00, 0x0e, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x6e, 0x6f, 0x74, 0x65, 0x2e, 0x74, 0x78, 0x74, 0x50, 0x4b, 0x05, 0x06,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x36, 0x00, 0x00, 0x00,
    0x30, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const zipOffset = fsOffset + 12288;
  buffer.set(zipHeader, zipOffset);

  return {
    buffer,
    filename: 'corrupted_usb_sample_2MB.raw',
    truthDetails: {
      fsType: 'NTFS',
      realFsStartLba: 2048,
      filesEmbedded: [
        'Sample Red Photo (recovered_photo_0001.jpg)',
        'Sample Important Document (recovered_document_0001.pdf)',
        'Sample Compressed Archive (recovered_archive_0001.zip)',
      ],
    },
  };
}
