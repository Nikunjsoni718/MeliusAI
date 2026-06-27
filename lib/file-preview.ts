export type StructuredPreviewSection = {
  id: string;
  title: string;
  lines?: string[];
  image_urls?: string[];
  table?: string[][];
};

export type StructuredPreview = {
  kind: 'presentation' | 'document' | 'spreadsheet' | 'code' | 'binary';
  summary: string;
  note?: string;
  sections: StructuredPreviewSection[];
};

export type FilePreviewResponse = {
  data?: StructuredPreview;
  error?: string;
};
