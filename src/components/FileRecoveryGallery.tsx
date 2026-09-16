import React, { useState } from 'react';
import {
  Download,
  FileText,
  Image as ImageIcon,
  Archive,
  Film,
  Music,
  ExternalLink,
  Package,
  CheckCircle,
  FolderArchive,
  Search,
  Filter,
} from 'lucide-react';
import JSZip from 'jszip';
import { CarvedFile } from '../types';
import { formatBytes } from '../services/recoveryEngine';

interface FileRecoveryGalleryProps {
  files: CarvedFile[];
}

export const FileRecoveryGallery: React.FC<FileRecoveryGalleryProps> = ({ files }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipSuccess, setZipSuccess] = useState<boolean>(false);

  const filteredFiles = files.filter((f) => {
    const matchesCategory = selectedCategory === 'all' || f.category === selectedCategory;
    const matchesSearch =
      f.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.extension.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleDownloadSingle = (file: CarvedFile) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllZip = async () => {
    if (files.length === 0) return;
    setIsZipping(true);

    try {
      const zip = new JSZip();
      const folder = zip.folder('recovered_files');

      for (const file of files) {
        // Read blob as arrayBuffer to add to zip
        const arrayBuffer = await file.blob.arrayBuffer();
        folder?.file(file.filename, arrayBuffer);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recovered_files_archive.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setZipSuccess(true);
      setTimeout(() => setZipSuccess(false), 5000);
    } catch (err) {
      console.error('Error generating zip archive:', err);
    } finally {
      setIsZipping(false);
    }
  };

  const getCategoryIcon = (category: CarvedFile['category']) => {
    switch (category) {
      case 'image':
        return <ImageIcon className="w-4 h-4 text-emerald-400" />;
      case 'document':
        return <FileText className="w-4 h-4 text-blue-400" />;
      case 'archive':
        return <Archive className="w-4 h-4 text-amber-400" />;
      case 'video':
        return <Film className="w-4 h-4 text-rose-400" />;
      case 'audio':
        return <Music className="w-4 h-4 text-purple-400" />;
      default:
        return <FileText className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <Package className="w-5 h-5 text-cyan-400" />
              <span>Deep-Carved Files ({files.length})</span>
            </h3>
            <span className="text-xs bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2 py-0.5 rounded-full font-medium">
              100% Genuine File Extractor
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Raw signatures scanned directly off disk sectors. Every file is reconstructed into a verified, downloadable file.
          </p>
        </div>

        {files.length > 0 && (
          <button
            type="button"
            id="btn-download-all-zip"
            onClick={handleDownloadAllZip}
            disabled={isZipping}
            className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-950/40 flex items-center justify-center space-x-2 transition-transform hover:scale-[1.02]"
          >
            <FolderArchive className="w-4 h-4" />
            <span>{isZipping ? 'Archiving ZIP...' : 'Download All as ZIP'}</span>
          </button>
        )}
      </div>

      {zipSuccess && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <b>ZIP Archive Ready!</b> Downloaded <code className="font-mono bg-emerald-900/60 px-1 py-0.5 rounded">recovered_files_archive.zip</code> containing all {files.length} extracted files.
          </span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
          {['all', 'image', 'document', 'archive', 'video'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                selectedCategory === cat
                  ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search recovered files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* File Grid */}
      {filteredFiles.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
          <p className="text-xs text-slate-400">
            {files.length === 0
              ? 'No files carved yet. Run a deep scan on a disk image.'
              : 'No files match your search criteria.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between hover:border-slate-700 transition-all group"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      {getCategoryIcon(file.category)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200 truncate max-w-[170px]" title={file.filename}>
                        {file.filename}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Offset: 0x{file.offsetBytes.toString(16).toUpperCase()} • {formatBytes(file.sizeBytes)}
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    .{file.extension}
                  </span>
                </div>

                {/* Preview Thumbnail if Image */}
                {file.previewUrl && (
                  <div className="mt-3 h-28 bg-slate-900/80 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                    <img
                      src={file.previewUrl}
                      alt={file.filename}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Download Action */}
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] text-emerald-400 flex items-center space-x-1">
                  <CheckCircle className="w-3 h-3" />
                  <span>Signature Valid</span>
                </span>

                <button
                  type="button"
                  id={`btn-download-${file.id}`}
                  onClick={() => handleDownloadSingle(file)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center space-x-1"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
