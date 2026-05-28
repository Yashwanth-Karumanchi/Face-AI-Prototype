import { Upload } from "lucide-react";

type Props = {
  label: string;
  helper: string;
  onFile: (file: File) => void;
};

export function FileInput({ label, helper, onFile }: Props) {
  return (
    <label className="fileInput">
      <Upload size={18} />
      <span>
        <strong>{label}</strong>
        <small>{helper}</small>
      </span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
