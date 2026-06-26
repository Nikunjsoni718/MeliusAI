import { NextResponse } from 'next/server';
import JSZip from 'jszip';

import type { FilePreviewResponse, StructuredPreview } from '@/lib/file-preview';

export const runtime = 'nodejs';

const MAX_FILE_PREVIEW_BYTES = 5 * 1024 * 1024;

function isPreviewPayloadTooLarge(request: Request) {
  const contentLength = request.headers.get('content-length');

  if (!contentLength) {
    return false;
  }

  const parsedLength = Number.parseInt(contentLength, 10);
  return Number.isFinite(parsedLength) && parsedLength > MAX_FILE_PREVIEW_BYTES;
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.trim().toLowerCase() ?? '';
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#xA;/gi, '\n')
    .replace(/&#10;/g, '\n');
}

function sortNumberedPaths(paths: string[]) {
  return [...paths].sort((left, right) => {
    const leftMatch = left.match(/(\d+)(?=\.[^.]+$)/);
    const rightMatch = right.match(/(\d+)(?=\.[^.]+$)/);
    const leftIndex = leftMatch ? Number(leftMatch[1]) : 0;
    const rightIndex = rightMatch ? Number(rightMatch[1]) : 0;

    return leftIndex - rightIndex;
  });
}

function chunkItems(items: string[], size: number) {
  const chunks: string[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function buildUnsupportedPreview(label: string, note?: string): StructuredPreview {
  return {
    kind: 'binary',
    summary: `${label} is ready in your vault`,
    note: note ?? 'This file type does not have an in-app preview yet.',
    sections: [
      {
        id: 'unsupported-preview',
        title: 'Preview not available',
        lines: ['Try a PDF, image, text file, or PPTX file for a richer web preview.'],
      },
    ],
  };
}

function extractTagText(xml: string, expression: RegExp) {
  const results: string[] = [];

  for (const match of xml.matchAll(expression)) {
    const value = normalizeWhitespace(decodeXmlEntities(match[1] ?? ''));

    if (value) {
      results.push(value);
    }
  }

  return results;
}

async function buildPptxPreview(file: File): Promise<StructuredPreview> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slidePaths = sortNumberedPaths(
    Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
  );

  if (slidePaths.length === 0) {
    return buildUnsupportedPreview('Presentation', 'We could not find readable slides in this file.');
  }

  const sections = [];

  for (const [index, slidePath] of slidePaths.slice(0, 20).entries()) {
    const slideXml = await zip.file(slidePath)?.async('text');

    if (!slideXml) {
      continue;
    }

    const texts = extractTagText(slideXml, /<a:t[^>]*>([\s\S]*?)<\/a:t>/g);
    const titleCandidate = texts[0] ?? '';
    const title = titleCandidate.length > 0 && titleCandidate.length <= 120 ? titleCandidate : `Slide ${index + 1}`;
    const lines = (title === titleCandidate ? texts.slice(1) : texts).slice(0, 10);

    sections.push({
      id: slidePath,
      title,
      lines: lines.length > 0 ? lines : ['No text was found on this slide.'],
    });
  }

  return {
    kind: 'presentation',
    summary: `${slidePaths.length} slide${slidePaths.length === 1 ? '' : 's'} ready to view`,
    note: 'Your presentation now opens inside the site.',
    sections:
      sections.length > 0
        ? sections
        : [
            {
              id: 'pptx-empty',
              title: 'Slides',
              lines: ['We found the file, but there was no readable slide text.'],
            },
          ],
  };
}

async function buildDocxPreview(file: File): Promise<StructuredPreview> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('text');

  if (!documentXml) {
    return buildUnsupportedPreview('Document', 'We could not find readable text in this file.');
  }

  const paragraphs = Array.from(documentXml.matchAll(/<w:p[\s\S]*?>([\s\S]*?)<\/w:p>/g))
    .map((match) => extractTagText(match[1] ?? '', /<w:t[^>]*>([\s\S]*?)<\/w:t>/g).join(' '))
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);

  return {
    kind: 'document',
    summary: `${paragraphs.length || 1} paragraph${paragraphs.length === 1 ? '' : 's'} ready to read`,
    note: 'This document opens inside the site as readable text.',
    sections:
      chunkItems(paragraphs, 4).map((chunk, index) => ({
        id: `docx-section-${index + 1}`,
        title: index === 0 ? 'Overview' : `Section ${index + 1}`,
        lines: chunk,
      })) || [],
  };
}

async function buildPptPreview(file: File): Promise<StructuredPreview> {
  const cfbModule = await import('cfb');
  const pptModule = await import('ppt');
  const CFB = (cfbModule as unknown as { default?: { read: Function }; read?: Function }).default ?? cfbModule;
  const PPT =
    (pptModule as unknown as {
      default?: { parse_pptcfb: Function; utils: { to_text: Function } };
      parse_pptcfb?: Function;
      utils?: { to_text: Function };
    }).default ?? pptModule;

  const buffer = Buffer.from(await file.arrayBuffer());
  const container = (CFB as { read: Function }).read(buffer, { type: 'buffer' });
  const presentation = (PPT as { parse_pptcfb: Function }).parse_pptcfb(container, {});
  const rawSlides = ((PPT as { utils?: { to_text?: Function } }).utils?.to_text?.(presentation) ?? []) as unknown[];

  const slideTexts = rawSlides
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }

      if (Array.isArray(entry)) {
        return entry
          .map((part) => (typeof part === 'string' ? part : ''))
          .filter(Boolean)
          .join('\n');
      }

      return '';
    })
    .map((entry) => entry.split(/\r?\n+/).map((line) => normalizeWhitespace(line)).filter(Boolean))
    .filter((entry) => entry.length > 0);

  if (slideTexts.length === 0) {
    return buildUnsupportedPreview(
      'Presentation',
      'This older PowerPoint file opened, but we could not extract slide text yet.'
    );
  }

  return {
    kind: 'presentation',
    summary: `${slideTexts.length} slide${slideTexts.length === 1 ? '' : 's'} ready to view`,
    note: 'This older PowerPoint file is now shown as readable slide text.',
    sections: slideTexts.map((lines, index) => ({
      id: `ppt-slide-${index + 1}`,
      title: lines[0] && lines[0].length <= 120 ? lines[0] : `Slide ${index + 1}`,
      lines: (lines[0] && lines[0].length <= 120 ? lines.slice(1) : lines).slice(0, 10),
    })),
  };
}

export async function POST(request: Request) {
  try {
    if (isPreviewPayloadTooLarge(request)) {
      return NextResponse.json<FilePreviewResponse>(
        { error: 'File preview payloads must be 5 MB or smaller.' },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const sourceKind = String(formData.get('sourceKind') ?? 'File');

    if (!(file instanceof File)) {
      return NextResponse.json<FilePreviewResponse>(
        { error: 'A file is required.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_PREVIEW_BYTES) {
      return NextResponse.json<FilePreviewResponse>(
        { error: 'File preview payloads must be 5 MB or smaller.' },
        { status: 413 }
      );
    }

    const extension = getFileExtension(file.name);
    let preview: StructuredPreview;

    if (extension === 'pptx') {
      preview = await buildPptxPreview(file);
    } else if (extension === 'ppt') {
      preview = await buildPptPreview(file);
    } else if (extension === 'docx') {
      preview = await buildDocxPreview(file);
    } else if (['doc', 'xls', 'xlsx', 'odp', 'odt', 'ods', 'zip'].includes(extension)) {
      preview = buildUnsupportedPreview(
        sourceKind,
        'This file is saved here, but this format does not have a rich web preview yet.'
      );
    } else {
      preview = buildUnsupportedPreview(sourceKind);
    }

    return NextResponse.json<FilePreviewResponse>({ data: preview });
  } catch (error) {
    console.error('Failed to build file preview', error);

    return NextResponse.json<FilePreviewResponse>(
      { error: error instanceof Error ? error.message : 'Unable to build file preview.' },
      { status: 500 }
    );
  }
}
