'use client';

function cleanAuditLine(value: string) {
  return value
    .replace(/^[-*•\s]+/, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function cleanDescriptionBlock(value: string) {
  return value
    .split('\n')
    .map((line) => cleanAuditLine(line.replace(/^[\s/]+/, '')))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function parseAuditLines(value: string, blockedLabel: string) {
  return value
    .split('\n')
    .map(cleanAuditLine)
    .filter((line) => line.length > 0 && !line.toLowerCase().includes(blockedLabel));
}

function getMarkdownSection(rawText: string, headingPattern: RegExp) {
  const match = rawText.match(headingPattern);

  if (!match || typeof match.index !== 'number') {
    return '';
  }

  const contentStart = match.index + match[0].length;
  const remainingContent = rawText.slice(contentStart);
  const nextHeading = remainingContent.match(/\n\s*##\s+/);

  return nextHeading && typeof nextHeading.index === 'number'
    ? remainingContent.slice(0, nextHeading.index).trim()
    : remainingContent.trim();
}

function getLegacyTableColumns(rawText: string) {
  const tableLines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('|') && !/^\|?[\s|:-]+\|?$/.test(line));

  if (tableLines.length < 2) {
    return {
      leftSideGoods: [] as string[],
      rightSideBads: [] as string[],
    };
  }

  const rows = tableLines.map((line) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean)
  );
  const headerCells = rows[0].map((cell) => cell.toLowerCase());
  const goodsIndex = headerCells.findIndex((cell) => /good|strength|positive|asset|win|roadmap/.test(cell));
  const badsIndex = headerCells.findIndex((cell) => /bad|flaw|issue|risk|weak|vulnerab/.test(cell));
  const dataRow = rows.find((row, index) => index > 0 && row.some((cell) => !/^:?-{2,}:?$/.test(cell)));

  if (!dataRow) {
    return {
      leftSideGoods: [] as string[],
      rightSideBads: [] as string[],
    };
  }

  if (goodsIndex >= 0 || badsIndex >= 0) {
    return {
      leftSideGoods:
        goodsIndex >= 0
          ? dataRow[goodsIndex]?.split(/<br\s*\/?>/i).map(cleanAuditLine).filter(Boolean) ?? []
          : [],
      rightSideBads:
        badsIndex >= 0
          ? dataRow[badsIndex]?.split(/<br\s*\/?>/i).map(cleanAuditLine).filter(Boolean) ?? []
          : [],
    };
  }

  if (dataRow.length >= 2 && !/evaluation criteria|assigned grade/i.test(tableLines[0])) {
    return {
      leftSideGoods: dataRow[0].split(/<br\s*\/?>/i).map(cleanAuditLine).filter(Boolean),
      rightSideBads: dataRow[1].split(/<br\s*\/?>/i).map(cleanAuditLine).filter(Boolean),
    };
  }

  return {
    leftSideGoods: [] as string[],
    rightSideBads: [] as string[],
  };
}

function parseAuditReport(rawText: string) {
  let cleanDescriptionText = 'No asset description compiled yet.';
  let leftSideGoods: string[] = [];
  let rightSideBads: string[] = [];

  if (rawText.includes('[DESCRIPTION]') || rawText.includes('[GOODS]')) {
    const descBlock = rawText.match(/\[DESCRIPTION\]([\s\S]*?)(?=\[GOODS\]|$)/i);
    const goodsBlock = rawText.match(/\[GOODS\]([\s\S]*?)(?=\[BADS\]|$)/i);
    const badsBlock = rawText.match(/\[BADS\]([\s\S]*?)$/i);

    if (descBlock) {
      cleanDescriptionText = cleanDescriptionBlock(descBlock[1]);
    }

    if (goodsBlock) {
      leftSideGoods = parseAuditLines(goodsBlock[1], 'goods');
    }

    if (badsBlock) {
      rightSideBads = parseAuditLines(badsBlock[1], 'bads');
    }
  } else {
    const legacyDescription =
      getMarkdownSection(
        rawText,
        /##\s*(?:[^\w\n#]+\s*)?(?:executive\s+summary\s*\/\s*updated\s+description|updated\s+description|description)\s*/i
      ) || rawText.match(/\/\s*Updated Description([\s\S]*?)(?=##|$)/i)?.[1];
    const legacyGoods = getMarkdownSection(
      rawText,
      /##\s*(?:[^\w\n#]+\s*)?(?:strategic\s+positives(?:\s*&\s*roadmap)?|strategic\s+improvement\s+roadmap|goods?|strengths?)\s*/i
    );
    const legacyBads = getMarkdownSection(
      rawText,
      /##\s*(?:[^\w\n#]+\s*)?(?:technical\s+flaws(?:\s*&\s*bad\s+points)?|bad\s+points|bads?|flaws?|issues?|vulnerabilities?)\s*/i
    );
    const tableColumns = getLegacyTableColumns(rawText);

    if (legacyDescription) {
      cleanDescriptionText = cleanDescriptionBlock(legacyDescription);
    } else if (rawText.trim() && !rawText.includes('|')) {
      cleanDescriptionText = cleanDescriptionBlock(rawText);
    }

    leftSideGoods = parseAuditLines(legacyGoods, 'goods');
    rightSideBads = parseAuditLines(legacyBads, 'bads');

    if (leftSideGoods.length === 0) {
      leftSideGoods = tableColumns.leftSideGoods;
    }

    if (rightSideBads.length === 0) {
      rightSideBads = tableColumns.rightSideBads;
    }

    if (leftSideGoods.length === 0 || rightSideBads.length === 0) {
      const genericBulletLines = rawText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^[-*•]\s+/.test(line));

      if (leftSideGoods.length === 0) {
        leftSideGoods = genericBulletLines
          .filter((line) => !/bad|flaw|risk|issue|weak|vulnerab/i.test(line))
          .map(cleanAuditLine)
          .filter(Boolean);
      }

      if (rightSideBads.length === 0) {
        rightSideBads = genericBulletLines
          .filter((line) => /bad|flaw|risk|issue|weak|vulnerab/i.test(line))
          .map(cleanAuditLine)
          .filter(Boolean);
      }
    }
  }

  return {
    cleanDescriptionText: cleanDescriptionText || 'No asset description compiled yet.',
    leftSideGoods,
    rightSideBads,
  };
}

type StructuredAuditData = {
  audit_summary?: string | null;
  description?: string | null;
  executive_summary?: string | null;
  summary?: string | null;
  pros?: string[] | null;
  cons?: string[] | null;
  recommendations?: string[] | null;
};

function getStructuredItems(value?: string[] | null) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && Boolean(item.trim())) : [];
}

function AuditBulletList({
  items,
  tone,
  emptyText,
}: {
  items: string[];
  tone: 'emerald' | 'rose' | 'cyan';
  emptyText: string;
}) {
  const indicatorClass =
    tone === 'emerald' ? 'bg-emerald-400' : tone === 'rose' ? 'bg-rose-400' : 'bg-cyan-400';

  if (items.length === 0) {
    return <p className="text-xs italic text-slate-500">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2.5">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex items-start gap-3 text-xs leading-relaxed text-slate-300">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${indicatorClass}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function AuditReviewModal({
  assetTitle,
  onClose,
  reportText,
  auditData,
}: {
  assetTitle: string;
  onClose: () => void;
  reportText: string;
  auditData?: StructuredAuditData | null;
}) {
  const { cleanDescriptionText, leftSideGoods, rightSideBads } = parseAuditReport(reportText);
  const structuredSummary =
    auditData?.description?.trim() ||
    auditData?.executive_summary?.trim() ||
    auditData?.summary?.trim() ||
    auditData?.audit_summary?.trim() ||
    '';
  const structuredPros = getStructuredItems(auditData?.pros);
  const structuredCons = getStructuredItems(auditData?.cons);
  const structuredRecommendations = getStructuredItems(auditData?.recommendations);
  const hasStructuredAudit = Boolean(
    structuredSummary || structuredPros.length || structuredCons.length || structuredRecommendations.length
  );

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#05091b] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col p-6 shadow-2xl relative">
        <div className="flex items-center justify-between border-b border-slate-900 pb-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 tracking-wide">Technical Audit Protocol</h2>
            <p className="text-xs text-slate-500 mt-0.5">Asset Identification: {assetTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer transition-colors"
            aria-label="Close audit protocol"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
          {hasStructuredAudit ? (
            <>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-2">Executive Summary</h4>
                <p className="text-sm text-slate-300 mb-6 line-clamp-4 leading-relaxed">
                  {structuredSummary || 'No executive summary has been generated yet.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-5">
                  <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                    Goods & Strengths
                  </h4>
                  <AuditBulletList
                    items={structuredPros}
                    tone="emerald"
                    emptyText="No structural strengths identified yet."
                  />
                </div>

                <div className="rounded-xl border border-rose-500/15 bg-rose-500/[0.04] p-5">
                  <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-rose-300">
                    Bads & Flaws
                  </h4>
                  <AuditBulletList
                    items={structuredCons}
                    tone="rose"
                    emptyText="No critical weaknesses identified yet."
                  />
                </div>
              </div>

              <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.04] p-5">
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-cyan-300">
                  Strategic Recommendations
                </h4>
                <AuditBulletList
                  items={structuredRecommendations}
                  tone="cyan"
                  emptyText="No strategic recommendations generated yet."
                />
              </div>
            </>
          ) : (
            <>
              <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-900">
                <h4 className="text-xs font-bold text-cyan-500 uppercase tracking-widest mb-2">Asset Description</h4>
                <p className="text-sm leading-relaxed text-slate-300">{cleanDescriptionText}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-emerald-950/5 border border-emerald-900/20 flex flex-col">
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3 pb-1.5 border-b border-emerald-900/10">
                    Goods & Strengths
                  </div>
                  <AuditBulletList
                    items={leftSideGoods}
                    tone="emerald"
                    emptyText="No structural strengths identified yet."
                  />
                </div>

                <div className="p-5 rounded-xl bg-rose-950/5 border border-rose-900/20 flex flex-col">
                  <div className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-3 pb-1.5 border-b border-rose-900/10">
                    Bads & Flaws
                  </div>
                  <AuditBulletList
                    items={rightSideBads}
                    tone="rose"
                    emptyText="No critical vulnerabilities or flaws identified."
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-slate-900 pt-4 mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close Review Protocol
          </button>
        </div>
      </div>
    </div>
  );
}
