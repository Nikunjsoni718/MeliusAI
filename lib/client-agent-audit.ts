const FALLBACK_FASTAPI_REVIEW_ENDPOINT = 'http://localhost:8000/api/review';

export function getFastApiReviewEndpoint() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_FASTAPI_URL?.trim().replace(/\/$/, '');

  if (configuredBaseUrl) {
    return configuredBaseUrl.endsWith('/api/review')
      ? configuredBaseUrl
      : `${configuredBaseUrl}/api/review`;
  }

  return process.env.NEXT_PUBLIC_MELIUS_AGENT_URL?.trim() || FALLBACK_FASTAPI_REVIEW_ENDPOINT;
}

async function readFastApiErrorDetail(response: Response) {
  try {
    const errorJson = (await response.clone().json()) as { detail?: unknown };

    if (typeof errorJson.detail === 'string' && errorJson.detail.trim()) {
      return errorJson.detail;
    }

    if (errorJson.detail !== undefined) {
      return JSON.stringify(errorJson.detail);
    }

    return JSON.stringify(errorJson);
  } catch {
    try {
      const errorText = await response.clone().text();
      return errorText || `HTTP Status ${response.status}`;
    } catch {
      return `HTTP Status ${response.status}`;
    }
  }
}

export async function transmitAgentPayload(uploadPayload: FormData) {
  const targetEndpoint = getFastApiReviewEndpoint();
  let response: Response;

  try {
    response = await fetch(targetEndpoint, {
      body: uploadPayload,
      method: 'POST',
    });
  } catch (fetchError) {
    console.error('Network Ingestion Interface Failure:', fetchError);
    const message = fetchError instanceof Error ? fetchError.message : 'Unknown network transport error.';

    throw new Error(
      `Failed to establish connection with local Python processing agent on port 8000. Ensure uvicorn is active. (${message})`
    );
  }

  if (!response.ok) {
    const backendErrorDetail = await readFastApiErrorDetail(response);
    throw new Error(`[FastAPI Server Error Code ${response.status}]: ${backendErrorDetail}`);
  }

  return response;
}

export function extractEvaluationScore(reportText: string) {
  const explicitHundredScore =
    reportText.match(/Cumulative Evaluation Score.*?\*\*(\d{1,3})\s*\/\s*100\*\*/i) ??
    reportText.match(/MeliusAI[^:\n]*Score[^:\n]*:\s*(\d{1,3})\s*\/\s*100/i) ??
    reportText.match(/(\d{1,3})\s*\/\s*100/);

  if (explicitHundredScore) {
    return Math.max(0, Math.min(100, Number.parseInt(explicitHundredScore[1], 10)));
  }

  const tenPointScore = reportText.match(/Cumulative Evaluation Score.*?\*\*(\d{1,2})\s*\/\s*10\*\*/i);

  if (tenPointScore) {
    return Math.max(0, Math.min(100, Number.parseInt(tenPointScore[1], 10) * 10));
  }

  return 80;
}

export async function streamAssetAudit({
  fileUrl,
  filename,
  instruction,
  onChunk,
}: {
  fileUrl: string;
  filename?: string;
  instruction?: string;
  onChunk: (chunk: string) => void;
}) {
  if (!fileUrl?.trim()) {
    throw new Error('Verification Failed: This asset does not contain a valid storage file link (file_url is missing).');
  }

  const storageResponse = await fetch(fileUrl);

  if (!storageResponse.ok) {
    throw new Error(
      `Supabase Storage could not find or serve this file. Status: ${storageResponse.status} ${storageResponse.statusText}`
    );
  }

  const binaryBlob = await storageResponse.blob();

  if (binaryBlob.size < 100) {
    throw new Error(
      'The downloaded asset file is empty or corrupted. Check your Supabase Storage Bucket access policies.'
    );
  }

  const uploadPayload = new FormData();
  uploadPayload.append('file', binaryBlob, filename?.trim() || 'asset_payload.pptx');

  if (instruction?.trim()) {
    uploadPayload.append('instruction', instruction.trim());
  }

  const response = await transmitAgentPayload(uploadPayload);
  const chunkReader = response.body?.getReader();
  const stringDecoder = new TextDecoder();

  if (!chunkReader) {
    throw new Error('FastAPI Agent Reviewer did not expose a readable token stream.');
  }

  let accumulatedReportText = '';

  while (true) {
    const { value, done } = await chunkReader.read();

    if (done) {
      break;
    }

    const incomingTokens = stringDecoder.decode(value, { stream: true });

    if (!incomingTokens) {
      continue;
    }

    accumulatedReportText += incomingTokens;
    onChunk(incomingTokens);
  }

  const finalChunk = stringDecoder.decode();

  if (finalChunk) {
    accumulatedReportText += finalChunk;
    onChunk(finalChunk);
  }

  return accumulatedReportText;
}
