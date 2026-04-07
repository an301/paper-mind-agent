import { useState, useRef, useCallback } from 'react';
import './UploadZone.css';

interface UploadZoneProps {
  onFileUpload: (file: File) => void;
}

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'text/plain',
  'text/markdown',
  'application/epub+zip',
  'text/csv',
]);

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.epub', '.csv'];

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  return ACCEPTED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
}

export default function UploadZone({ onFileUpload }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && isAcceptedFile(file)) {
      onFileUpload(file);
    }
  }, [onFileUpload]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
      e.target.value = '';
    }
  };

  return (
    <div
      className={`upload-zone ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={handleFileSelect}
        hidden
      />
      <div className="upload-icon">
        <i className="ph ph-cloud-arrow-up" style={{ fontSize: 20 }}></i>
      </div>
      <p className="upload-text">Drop PDF here to analyze</p>
      <p className="upload-hint">or click to browse</p>
    </div>
  );
}
