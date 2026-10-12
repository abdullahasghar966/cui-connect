/** Uploading and listing files for assignments, submissions and course materials. */
import {
  FILE_ACCEPT,
  type FileDTO,
  type FilePurpose,
  fileExtension,
  fileTypeFor,
  formatBytes,
  MAX_FILE_BYTES,
  MAX_FILES_PER_ITEM,
} from '@cui/shared';
import {
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  type LucideIcon,
  Paperclip,
  Presentation,
  X,
} from 'lucide-react';
import { type Dispatch, type SetStateAction, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const ICONS: [string[], LucideIcon][] = [
  [['pdf', 'doc', 'docx', 'odt', 'txt', 'md'], FileText],
  [['ppt', 'pptx'], Presentation],
  [['xls', 'xlsx', 'csv'], FileSpreadsheet],
  [['zip', 'rar', '7z'], FileArchive],
  [['png', 'jpg', 'jpeg', 'gif', 'webp'], FileImage],
];

export function fileIcon(name: string): LucideIcon {
  const ext = fileExtension(name);
  if (!ext) return File;
  return ICONS.find(([exts]) => exts.includes(ext))?.[1] ?? FileCode;
}

export function FileLink({ file, className }: { file: FileDTO; className?: string }) {
  const Icon = fileIcon(file.name);
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-md border bg-surface px-2.5 py-1.5 text-[13px] hover:bg-surface-2',
        className,
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate font-semibold">{file.name}</span>
      <span className="shrink-0 text-[12px] text-muted-foreground">{formatBytes(file.size)}</span>
    </a>
  );
}

export function FileList({ files, className }: { files: FileDTO[]; className?: string }) {
  if (!files.length) return null;
  return (
    <ul className={cn('flex flex-wrap gap-2', className)}>
      {files.map((file) => (
        <li key={file.id} className="min-w-0">
          <FileLink file={file} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Uploads chosen files straight away (each is checked on the server too) and lists them with a
 * remove button. Files removed before saving are deleted; saved ones are tidied by the server.
 */
export function FilePicker({
  files,
  onChange,
  purpose,
  offeringId,
  max = MAX_FILES_PER_ITEM,
  label = 'Attach files',
}: {
  files: FileDTO[];
  onChange: Dispatch<SetStateAction<FileDTO[]>>;
  purpose: FilePurpose;
  offeringId: string;
  max?: number;
  label?: string;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const fresh = useRef(new Set<string>());
  const [uploading, setUploading] = useState(0);

  const pick = async (list: globalThis.FileList | null) => {
    const chosen = [...(list ?? [])].slice(0, Math.max(0, max - files.length));
    if (input.current) input.current.value = '';
    await Promise.all(
      chosen.map(async (file) => {
        if (!fileTypeFor(file.name)) {
          toast.error(`${file.name}: this kind of file can't be uploaded.`);
          return;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}.`);
          return;
        }
        setUploading((n) => n + 1);
        try {
          const uploaded = await api.files.upload(file, purpose, offeringId);
          fresh.current.add(uploaded.id);
          onChange((prev) => [...prev, uploaded]);
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
  };

  const remove = (file: FileDTO) => {
    onChange((prev) => prev.filter((f) => f.id !== file.id));
    if (fresh.current.delete(file.id)) void api.files.discard(file.id).catch(() => {});
  };

  return (
    <div className="space-y-2">
      <input
        ref={input}
        id={inputId}
        type="file"
        multiple={max > 1}
        accept={FILE_ACCEPT}
        aria-label={label}
        className="sr-only"
        onChange={(e) => void pick(e.target.files)}
      />
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((file) => {
            const Icon = fileIcon(file.name);
            return (
              <li
                key={file.id}
                className="flex items-center gap-2 rounded-md border bg-surface-2 px-2.5 py-1.5 text-[13px]"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-semibold">{file.name}</span>
                <span className="text-[12px] text-muted-foreground">{formatBytes(file.size)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => remove(file)}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          loading={uploading > 0}
          disabled={files.length >= max}
          onClick={() => input.current?.click()}
        >
          <Paperclip /> {uploading > 0 ? 'Uploading…' : label}
        </Button>
        <span className="text-[12px] text-muted-foreground">
          {max === 1
            ? `One file, at most ${formatBytes(MAX_FILE_BYTES)}`
            : `Up to ${max} files, at most ${formatBytes(MAX_FILE_BYTES)} each`}
          : PDF, Office, text, code, images or ZIP.
        </span>
      </div>
    </div>
  );
}
