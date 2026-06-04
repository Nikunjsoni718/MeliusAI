import { type ReactNode } from 'react';

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*.*?\*\*)/g).map((segment, index) => {
    const key = `${keyPrefix}-inline-${index}`;

    if (segment.startsWith('**') && segment.endsWith('**')) {
      return (
        <strong key={key} className="font-bold text-cyan-400">
          {segment.slice(2, -2)}
        </strong>
      );
    }

    return <span key={key}>{segment}</span>;
  });
}

function getMarkdownTableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line?: string) {
  return Boolean(line?.trim() && /^\|?[\s|:-]+\|?$/.test(line.trim()) && line.includes('-'));
}

export function FormattedMarkdown({ content }: { content?: string | null }) {
  if (!content?.trim()) {
    return null;
  }

  const lines = content.split('\n');
  const rendered: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmedLine = line.trim();
    const key = `${index}-${line}`;

    if (!trimmedLine) {
      rendered.push(<div key={key} className="h-2" />);
      index += 1;
      continue;
    }

    if (trimmedLine.includes('|') && isMarkdownTableSeparator(lines[index + 1])) {
      const headerCells = getMarkdownTableCells(trimmedLine);
      const tableRows: string[][] = [];
      index += 2;

      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        tableRows.push(getMarkdownTableCells(lines[index]));
        index += 1;
      }

      rendered.push(
        <div key={key} className="my-3 overflow-x-auto rounded-xl border border-blue-950/70">
          <table className="min-w-full divide-y divide-blue-950/70 text-left text-xs">
            <thead className="bg-blue-950/30 text-cyan-300">
              <tr>
                {headerCells.map((cell, cellIndex) => (
                  <th key={`${key}-head-${cellIndex}`} className="px-3 py-2 font-semibold">
                    {renderInlineMarkdown(cell, `${key}-head-${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-950/40 text-slate-300">
              {tableRows.map((row, rowIndex) => (
                <tr key={`${key}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${key}-cell-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top">
                      {renderInlineMarkdown(cell, `${key}-cell-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (trimmedLine.startsWith('### ')) {
      rendered.push(
        <h3 key={key} className="mt-3 text-sm font-semibold text-slate-100 first:mt-0">
          {renderInlineMarkdown(trimmedLine.replace(/^###\s+/, ''), key)}
        </h3>
      );
      index += 1;
      continue;
    }

    if (trimmedLine.startsWith('## ')) {
      rendered.push(
        <h2 key={key} className="mt-4 text-base font-semibold text-slate-100 first:mt-0">
          {renderInlineMarkdown(trimmedLine.replace(/^##\s+/, ''), key)}
        </h2>
      );
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(trimmedLine)) {
      rendered.push(<div key={key} className="my-4 border-t border-blue-950/60" />);
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmedLine)) {
      rendered.push(
        <div key={key} className="my-1 flex items-start gap-2 pl-2 text-sm leading-relaxed text-slate-300">
          <span className="mt-0.5 text-cyan-500">•</span>
          <span>{renderInlineMarkdown(trimmedLine.replace(/^[-*]\s+/, ''), key)}</span>
        </div>
      );
      index += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmedLine)) {
      const listNumber = trimmedLine.match(/^(\d+)\./)?.[1] ?? '';
      rendered.push(
        <div key={key} className="my-1 flex items-start gap-2 pl-2 text-sm leading-relaxed text-slate-300">
          <span className="mt-0.5 min-w-4 text-cyan-500">{listNumber}.</span>
          <span>{renderInlineMarkdown(trimmedLine.replace(/^\d+\.\s+/, ''), key)}</span>
        </div>
      );
      index += 1;
      continue;
    }

    rendered.push(
      <p key={key} className="text-sm leading-relaxed text-slate-300">
        {renderInlineMarkdown(trimmedLine, key)}
      </p>
    );
    index += 1;
  }

  return <div className="space-y-2">{rendered}</div>;
}
