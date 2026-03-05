import { useState, useRef } from 'react';
import { Upload, FileCheck } from 'lucide-react';
import { Label } from '@/components/ui/label';

interface DriverLicenseUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  label: string;
  required?: boolean;
}

const DriverLicenseUpload = ({ onFileSelect, selectedFile, label, required = false }: DriverLicenseUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValidFileType = (file: File) => ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type);

  return (
    <div className="space-y-2">
      <Label>{label} {required && '*'}</Label>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file && isValidFileType(file)) onFileSelect(file); }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'} ${selectedFile ? 'bg-green-500/10 border-green-500' : ''}`}
      >
        <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file && isValidFileType(file)) onFileSelect(file); }} className="hidden" />
        {selectedFile ? (
          <div className="flex flex-col items-center gap-2">
            <FileCheck className="h-10 w-10 text-green-500" />
            <p className="text-sm text-green-600 font-medium">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">Click to change file</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Drag and drop or click to upload</p>
            <p className="text-xs text-muted-foreground">JPG, PNG, WEBP or PDF</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverLicenseUpload;
