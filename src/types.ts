export type DiskSourceType = 'file' | 'generated-sample' | 'custom-dump';

export interface PartitionTableEntry {
  index: number;
  bootable: boolean;
  typeCode: number;
  typeName: string;
  startLBA: number;
  totalSectors: number;
  sizeBytes: number;
  status: 'valid' | 'corrupted' | 'recovered' | 'unallocated';
  filesystemHint?: string;
}

export interface MbrAnalysis {
  hasValidSignature: boolean; // 0x55AA at offset 510-511
  rawSignatureHex: string;
  isAllZeroes: boolean;
  isProtectiveGPT: boolean;
  codeBootstrapPresent: boolean;
  partitions: PartitionTableEntry[];
  validationIssues: string[];
}

export interface GptAnalysis {
  found: boolean;
  signature: string; // 'EFI PART'
  headerLBA: number;
  backupLBA: number;
  firstUsableLBA: number;
  lastUsableLBA: number;
  diskGUID: string;
  partitionEntriesLBA: number;
  numPartitionEntries: number;
  partitionEntrySize: number;
  partitions: PartitionTableEntry[];
  crc32Valid: boolean;
  validationIssues: string[];
}

export interface FilesystemMarker {
  type: 'NTFS' | 'FAT32' | 'exFAT' | 'ext4' | 'FAT16';
  lba: number;
  byteOffset: number;
  isBackupBootSector: boolean;
  oemName?: string;
  bytesPerSector?: number;
  sectorsPerCluster?: number;
  volumeLabel?: string;
  totalSectorsEstimated?: number;
  mftCluster?: number; // for NTFS
}

export interface CarvedFile {
  id: string;
  filename: string;
  extension: string;
  mimeType: string;
  category: 'image' | 'document' | 'archive' | 'audio' | 'video' | 'text' | 'data';
  offsetBytes: number;
  sizeBytes: number;
  blob: Blob;
  previewUrl?: string;
  textSnippet?: string;
  checksumMd5?: string;
  integrity: 'verified' | 'recovered' | 'partial';
}

export interface DiskAnalysisResult {
  diskName: string;
  totalBytes: number;
  totalSectors: number;
  bytesPerSector: number;
  mbr: MbrAnalysis;
  gpt: GptAnalysis;
  discoveredFilesystems: FilesystemMarker[];
  carvedFiles: CarvedFile[];
  scanDurationMs: number;
  sectorsScanned: number;
  diagnostics: {
    status: 'healthy' | 'warning' | 'critical' | 'unallocated';
    headline: string;
    description: string;
    identifiedIssues: string[];
    canAutoRepairPartitionTable: boolean;
    recommendedAction: string;
  };
}

export interface SectorData {
  lba: number;
  offset: number;
  bytes: Uint8Array;
  hexRows: {
    offsetHex: string;
    bytesHex: string[];
    ascii: string;
  }[];
}

export interface RepairPlan {
  id: string;
  title: string;
  description: string;
  type: 'RESTORE_MBR' | 'RESTORE_GPT' | 'RESTORE_BOOT_SECTOR';
  targetLBA: number;
  repairedSectorBytes: Uint8Array;
  powershellScript: string;
  bashScript: string;
  pythonScript: string;
}

export interface PhysicalUsbDeviceInfo {
  id: string;
  vendorId: number;
  productId: number;
  vendorIdHex: string;
  productIdHex: string;
  productName: string;
  manufacturerName: string;
  serialNumber: string;
  usbVersionMajor: number;
  usbVersionMinor: number;
  usbVersionSubminor: number;
  deviceClass: number;
  deviceSubclass: number;
  deviceProtocol: number;
  opened: boolean;
  claimedInterface?: number;
  status: 'connected' | 'claimed' | 'access_restricted' | 'error';
  statusMessage: string;
  interfaces: {
    interfaceNumber: number;
    alternateSetting: number;
    interfaceClass: number;
    interfaceSubclass: number;
    interfaceProtocol: number;
    endpoints: {
      endpointNumber: number;
      direction: 'in' | 'out';
      type: string;
      packetSize: number;
    }[];
  }[];
  scsiInquiry?: {
    vendor: string;
    product: string;
    revision: string;
    removable: boolean;
  };
  scsiCapacity?: {
    totalSectors: number;
    blockSize: number;
    totalSizeBytes: number;
  };
  sector0Buffer?: Uint8Array;
}

