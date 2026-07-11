import { convertToModelMessages, streamText, type ModelMessage, type UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';

export const runtime = 'edge';

const SYSTEM_PROMPT = `
You are MeliusAI, the user's universal career mentor and portfolio evaluation engine.
You possess full multimodal file-reading authorization. When a user uploads or references a file (such as a PowerPoint PPT, PDF, or resume image document), you can read and analyze its textual and structural components.

MULTIMODAL EVALUATION INSTRUCTIONS:
- Review the presentation deck slides or uploaded file content closely.
- Audit the logical flow, design clarity, information density, and industry viability.
- Always append your definitive "MeliusAI Professional Integrity Scorecard" metrics table at the absolute bottom of your response markdown text layout.

FORMATTING RULE (ABSOLUTE COMPULSION): For the \`pros\`, \`cons\`, and \`recommendations\` arrays, you MUST use the exact format: 'Catchy Hook: Short explanation'.
Example: 'XSS Vulnerability: Using innerHTML allows malicious script injection.'
MAX 15 words per item. NO ESSAYS. NO EXCEPTIONS.
`;

const ATTACHED_ASSET_MARKER = '[SYSTEM NOTICE: AN ASSET HAS BEEN ATTACHED FOR EVALUATION]';
const LEGACY_ATTACHED_ASSET_MARKER = '[SYSTEM NOTICE: AN ASSET HAS BEEN ATTACHED FOR EXPLICIT EVALUATION]';

type AttachedProjectPayload = {
  description?: string | null;
  name?: string | null;
  tech_stack?: string | null;
  title?: string | null;
};

type FileAttachmentPayload = {
  base64Data?: string | null;
  mimeType?: string | null;
  title?: string | null;
};

type IncomingMessage = UIMessage | ModelMessage;

function getAttachedProjectTitle(project: AttachedProjectPayload) {
  return project.title?.trim() || project.name?.trim() || 'Untitled Project Asset';
}

function getMessageContent(message: IncomingMessage & { content?: unknown }) {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => ('type' in part && part.type === 'text' ? part.text : ''))
      .join('');
  }

  if ('parts' in message) {
    return message.parts
      ?.map((part) => (part.type === 'text' ? part.text : ''))
      .join('') ?? '';
  }

  return '';
}

function extractLineValue(content: string, label: string) {
  const match = content.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i'));

  return match?.[1]?.trim() || null;
}

function buildAttachedProjectContext(project: AttachedProjectPayload) {
  return `- Asset Title: ${getAttachedProjectTitle(project)}
- Core Industry/Stack Signals: ${project.tech_stack || 'Universal Profile'}
- Project Description: ${project.description || 'No description provided.'}`;
}

function isUIMessageStack(messages: IncomingMessage[]): messages is UIMessage[] {
  return messages.every((message) => 'parts' in message);
}

function extractPersistentProjectContext(messages: IncomingMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const content = getMessageContent(messages[index]);

    if (!content.includes(ATTACHED_ASSET_MARKER) && !content.includes(LEGACY_ATTACHED_ASSET_MARKER)) {
      continue;
    }

    const markerIndex = content.includes(ATTACHED_ASSET_MARKER)
      ? content.indexOf(ATTACHED_ASSET_MARKER)
      : content.indexOf(LEGACY_ATTACHED_ASSET_MARKER);
    const markerBlock = content.slice(markerIndex);
    const title =
      extractLineValue(markerBlock, 'Asset Document Name') ||
      extractLineValue(markerBlock, 'Project Asset Title') ||
      'Uploaded File';
    const techStack =
      extractLineValue(markerBlock, 'Target Domain/Tech Stack') ||
      extractLineValue(markerBlock, 'Target Demographics/Tech Stack') ||
      'Universal Profile';
    const description =
      extractLineValue(markerBlock, 'Asset Profile Description') ||
      extractLineValue(markerBlock, 'Architectural & Functional Description') ||
      'Reviewing custom provided metadata parameters.';

    return `- Asset Title: ${title}
- Core Industry/Stack Signals: ${techStack}
- Project Description: ${description}`;
  }

  return '';
}

export async function POST(req: Request) {
  try {
    const { attachedProject, fileAttachment, messages } = (await req.json().catch(() => ({}))) as {
      attachedProject?: AttachedProjectPayload | null;
      fileAttachment?: FileAttachmentPayload | null;
      messages?: IncomingMessage[];
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: 'At least one chat message is required.' }, { status: 400 });
    }

    const finalizedMessages: ModelMessage[] = isUIMessageStack(messages)
      ? await convertToModelMessages(messages)
      : (messages as ModelMessage[]);
    const persistentProjectContext = attachedProject
      ? buildAttachedProjectContext(attachedProject)
      : extractPersistentProjectContext(messages);

    if (persistentProjectContext) {
      finalizedMessages.unshift({
        role: 'system',
        content: `
[PERMANENT CONVERSATION CONTEXT ANCHOR]
You are currently mentoring and evaluating the user regarding the following asset profile throughout this entire session:
${persistentProjectContext}

When the user asks follow-up questions like "can you view it", references "the file", or asks for deeper review, they are referring directly to this data. Never state that you cannot view it. Read this data closely and answer the user's specific questions regarding it. At the end of project-related responses, always provide a structured score matrix out of 100 based on this asset's strength.
`,
      });
    }

    if (fileAttachment?.base64Data) {
      finalizedMessages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `[FILE SYSTEM INGESTION] Please inspect this attached file asset profile carefully and grade it.\n\nFilename: ${fileAttachment.title || 'Uploaded file'}\nMIME Type: ${fileAttachment.mimeType || 'application/octet-stream'}`,
          },
          {
            type: 'file',
            filename: fileAttachment.title || 'uploaded-file',
            mediaType: fileAttachment.mimeType || 'application/octet-stream',
            data: fileAttachment.base64Data,
          },
        ],
      });
    }

    const responseStream = streamText({
      model: openai('gpt-4o'),
      system: SYSTEM_PROMPT,
      messages: finalizedMessages,
    });

    return responseStream.toUIMessageStreamResponse();
  } catch (error) {
    console.error('MeliusAI OpenAI chat stream failed', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to process chat request.' },
      { status: 500 }
    );
  }
}
