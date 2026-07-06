'use client';

import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { MeliusAppLogo } from '@/components/branding/melius-app-logo';
import { useViewerProfile } from '@/lib/viewer-client';
import type { Json, ProjectRow } from '@/types/supabase';

type ProjectAttachment = ProjectRow & {
  tags?: string[] | string | null;
  tech_stack?: string[] | string | null;
};

type ChatMessageMetadata = {
  attachedAssetKind?: string;
  attachedAssetTitle?: string;
  attachedProjectTitle?: string;
} & Partial<ProjectAttachment>;

type MeliusChatRole = 'user' | 'assistant' | 'system';

type MeliusChatMessage = {
  id: string;
  role: MeliusChatRole;
  content: string;
  metadata?: ChatMessageMetadata;
};

type ChatThread = {
  id: string;
  title: string;
  messages: MeliusChatMessage[];
};

type StoredChatRow = {
  id: string;
  title?: string | null;
  messages?: unknown;
};

const MELIUS_CHAT_ENDPOINT = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/chat`
  : '/api/chat';
const CRITICAL_EVALUATION_MARKER =
  '[CRITICAL EVALUATION SYSTEM NOTICE: THE USER HAS LINKED A CHOSEN VAULT PROJECT]';
const USER_QUESTION_MARKER = '[USER QUESTION / ACTION INSTRUCTION]:';
const ANALYZING_PROJECT_MARKER = '[Analyzing Profile Project:';

const sloganTemplates = [
  (displayName: string) => `Hi ${displayName}, ready to audit your next protocol?`,
  (displayName: string) => `Hi ${displayName}, what architecture are we stress-testing today?`,
  (displayName: string) => `Hi ${displayName}, let's verify some technical assets.`,
  (displayName: string) => `Hi ${displayName}, ready to scale your engineering authority?`,
];

function getFirstName(value?: string | null) {
  return value?.trim().split(/\s+/)[0] || null;
}

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createChatThreadId() {
  return globalThis.crypto?.randomUUID?.() ?? createMessageId('thread');
}

function getMessageText(message: MeliusChatMessage) {
  return message.content;
}

function getVisibleUserMessageText(text: string) {
  if (!text.includes(USER_QUESTION_MARKER)) {
    return text.replace(/^\[Analyzing Profile Project:[^\]]+\]\s*/m, '').trim() || 'Assess the linked vault project.';
  }

  return text
    .split(USER_QUESTION_MARKER)[1]
    ?.trim() || 'Assess the linked vault project.';
}

function createThreadTitle(messageText: string) {
  const trimmedText = getVisibleUserMessageText(messageText).trim();

  if (trimmedText.length <= 44) {
    return trimmedText || 'Untitled audit thread';
  }

  return `${trimmedText.slice(0, 44)}...`;
}

function formatStackValue(value?: Json[] | string[] | string | null) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .filter(Boolean)
      .join(', ');
  }

  return typeof value === 'string' ? value : '';
}

function getProjectTitle(project: ProjectAttachment | null) {
  return project?.title?.trim() || project?.name?.trim() || project?.file_name?.trim() || 'Untitled Project';
}

function getProjectTechStack(project: ProjectAttachment | null) {
  return (
    formatStackValue(project?.tech_stack) ||
    formatStackValue(project?.tags) ||
    formatStackValue(project?.stack) ||
    project?.profession?.trim() ||
    'Profile Vault Asset'
  );
}

function getProjectDescription(project: ProjectAttachment | null) {
  return (
    project?.description?.trim() ||
    project?.summary?.trim() ||
    project?.ai_summary?.trim() ||
    'No description found.'
  );
}

function getLinkedProjectTitle(message: MeliusChatMessage) {
  const messageText = getMessageText(message);
  const titleMatch =
    messageText.match(/Project Asset Title:\s*(.+)/) ||
    messageText.match(/\[Analyzing Profile Project:\s*([^\]]+)\]/);

  return (
    message.metadata?.attachedAssetTitle ??
    message.metadata?.attachedProjectTitle ??
    message.metadata?.title ??
    message.metadata?.name ??
    message.metadata?.file_name ??
    titleMatch?.[1]?.trim() ??
    null
  );
}

function hasLinkedProjectContext(message: MeliusChatMessage) {
  return Boolean(
    message.metadata?.attachedAssetTitle ||
      message.metadata?.attachedProjectTitle ||
      message.metadata?.title ||
      getMessageText(message).includes(ANALYZING_PROJECT_MARKER) ||
      getMessageText(message).includes(CRITICAL_EVALUATION_MARKER)
  );
}

function buildVaultProjectPayload(inputText: string, stagedAsset: ProjectAttachment | null) {
  const userQuestion = inputText.trim() || 'Please evaluate this linked vault project.';

  if (!stagedAsset) {
    return userQuestion;
  }

  return `${CRITICAL_EVALUATION_MARKER}

Project Asset Title: ${getProjectTitle(stagedAsset)}

Technology Stack / Industry Tags: ${getProjectTechStack(stagedAsset)}

Detailed Content & Project Description: ${getProjectDescription(stagedAsset)}

Vault Database Row ID: ${stagedAsset.id}

Source URL: ${stagedAsset.source_url || 'No source URL saved.'}

File URL: ${stagedAsset.file_url || 'No file URL saved.'}

${USER_QUESTION_MARKER}
${userQuestion}`;
}

function serializeChatMessages(messageStack: MeliusChatMessage[]) {
  return messageStack.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    metadata: message.metadata ?? null,
  }));
}

function normalizeStoredChatMessages(messagesPayload: unknown): MeliusChatMessage[] {
  if (!Array.isArray(messagesPayload)) {
    return [];
  }

  return messagesPayload
    .map((message, index): MeliusChatMessage | null => {
      if (!message || typeof message !== 'object') {
        return null;
      }

      const record = message as Record<string, unknown>;
      const role: MeliusChatRole =
        record.role === 'assistant' || record.role === 'system' || record.role === 'user'
          ? record.role
          : 'user';
      const content =
        typeof record.content === 'string'
          ? record.content
          : typeof record.text === 'string'
            ? record.text
            : '';

      if (!content.trim()) {
        return null;
      }

      return {
        id: typeof record.id === 'string' ? record.id : createMessageId(`${role}-${index}`),
        role,
        content,
        metadata:
          record.metadata && typeof record.metadata === 'object'
            ? (record.metadata as ChatMessageMetadata)
            : undefined,
      };
    })
    .filter((message): message is MeliusChatMessage => Boolean(message));
}

function formatConversationalText(text: string, keyPrefix = 'conversation'): ReactNode {
  if (!text) {
    return '';
  }

  const segments = text.split(/\*\*(.*?)\*\*/g);

  return segments.map((chunk, index) =>
    index % 2 === 1 ? (
      <strong key={`${keyPrefix}-bold-${index}`} className="font-bold text-cyan-400">
        {chunk}
      </strong>
    ) : (
      <span key={`${keyPrefix}-text-${index}`}>{chunk}</span>
    )
  );
}

function renderInlineMarkdown(text: string, keyPrefix: string) {
  return formatConversationalText(text, `${keyPrefix}-inline`);
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

function renderFormattedMarkdown(text: string) {
  if (!text) {
    return null;
  }

  const lines = text.split('\n');
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
        <h2 key={key} className="mt-3 text-base font-semibold text-slate-100 first:mt-0">
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

    if (
      /^(executive summary|technical flaws(?: & issues)?|strategic improvement roadmap|strategic roadmap|global integrity scorecard|meliusai professional integrity scorecard|meliusai integrity rating):?$/i.test(
        trimmedLine
      )
    ) {
      rendered.push(
        <h2 key={key} className="mt-4 text-base font-semibold text-slate-100 first:mt-0">
          {renderInlineMarkdown(trimmedLine.replace(/:$/, ''), key)}
        </h2>
      );
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

  return rendered;
}

export default function MeliusAIPage() {
  const { profile, supabase, user } = useViewerProfile();
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [input, setInput] = useState('');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [profileProjects, setProfileProjects] = useState<ProjectAttachment[]>([]);
  const [stagedAsset, setStagedAsset] = useState<ProjectAttachment | null>(null);
  const [isVaultOpen, setIsVaultOpen] = useState<boolean>(false);
  const [sloganIndex, setSloganIndex] = useState(0);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MeliusChatMessage[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const activeChatIdRef = useRef<string | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const streamAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSloganIndex(Math.floor(Math.random() * sloganTemplates.length));
  }, []);

  useEffect(() => {
    if (!supabase || !user?.id) {
      setProfileProjects([]);
      setStagedAsset(null);
      setIsVaultOpen(false);
      return;
    }

    let active = true;

    const fetchProfileProjects = async () => {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });

        if (!active) {
          return;
        }

        if (error) {
          console.warn('Unable to fetch MeliusAI profile projects:', error);
          setProfileProjects([]);
          return;
        }

        const scopedProjects = ((data ?? []) as ProjectAttachment[]).filter((project) => {
          return project.user_id === user.id || project.owner_id === user.id;
        });

        setProfileProjects(scopedProjects);
      } catch (error) {
        if (!active) {
          return;
        }

        console.warn('Unable to fetch MeliusAI profile projects:', error);
        setProfileProjects([]);
      }
    };

    void fetchProfileProjects();

    return () => {
      active = false;
    };
  }, [supabase, user?.id]);

  useEffect(() => {
    if (!supabase || !user?.id) {
      setChats([]);
      return;
    }

    let active = true;

    const fetchStoredChats = async () => {
      try {
        const { data, error } = await (supabase as unknown as { from: (table: string) => any })
          .from('chats')
          .select('id,title,messages')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (!active) {
          return;
        }

        if (error) {
          console.warn('Unable to fetch MeliusAI chat history:', error);
          return;
        }

        const storedChats = ((data ?? []) as StoredChatRow[])
          .map((chat) => ({
            id: chat.id,
            title: chat.title || 'Untitled audit thread',
            messages: normalizeStoredChatMessages(chat.messages),
          }))
          .filter((chat) => chat.messages.length > 0);

        setChats(storedChats);
      } catch (error) {
        if (!active) {
          return;
        }

        console.warn('Unable to fetch MeliusAI chat history:', error);
      }
    };

    void fetchStoredChats();

    return () => {
      active = false;
    };
  }, [supabase, user?.id]);

  const displayName = useMemo(() => {
    const metadataFullName =
      typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null;

    return (
      getFirstName(profile?.display_name) ??
      getFirstName(metadataFullName) ??
      getFirstName(user?.email?.split('@')[0]) ??
      'Developer'
    );
  }, [profile?.display_name, user?.email, user?.user_metadata?.full_name]);

  const currentSlogan = sloganTemplates[sloganIndex](displayName);
  const isBusy = isChatStreaming;

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages]);

  async function syncChatThread(messageStack: MeliusChatMessage[], targetThreadId?: string) {
    const threadId = targetThreadId ?? activeChatIdRef.current ?? createChatThreadId();
    const firstUserMessage = messageStack.find((message) => message.role === 'user');
    const title = createThreadTitle(
      firstUserMessage ? getMessageText(firstUserMessage) : 'Untitled audit thread'
    );

    activeChatIdRef.current = threadId;
    setActiveChatId(threadId);
    setChats((currentChats) => {
      const existingThread = currentChats.find((chat) => chat.id === threadId);

      if (existingThread) {
        return currentChats.map((chat) =>
          chat.id === threadId
            ? {
                ...chat,
                messages: messageStack,
                title,
              }
            : chat
        );
      }

      return [
        {
          id: threadId,
          messages: messageStack,
          title,
        },
        ...currentChats,
      ];
    });

    if (!supabase || !user?.id || messageStack.length === 0) {
      return;
    }

    try {
      const { error } = await (supabase as unknown as { from: (table: string) => any })
        .from('chats')
        .upsert(
          {
            id: threadId,
            user_id: user.id,
            title,
            messages: serializeChatMessages(messageStack),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      if (error) {
        console.warn('Unable to persist MeliusAI chat history:', error);
      }
    } catch (error) {
      console.warn('Unable to persist MeliusAI chat history:', error);
    }
  }

  function handleResetChatSession() {
    if (isChatStreaming) {
      streamAbortControllerRef.current?.abort();
    }

    setMessages([]);
    setInput('');
    setStagedAsset(null);
    setIsVaultOpen(false);
    setCopiedMessageId(null);
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setStreamError(null);
    setIsChatStreaming(false);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    setInput(event.target.value);
  }

  async function handleFormSubmit(event?: FormEvent<HTMLFormElement> | KeyboardEvent<HTMLInputElement>) {
    event?.preventDefault?.();

    if ((!input.trim() && !stagedAsset) || isBusy) {
      return;
    }

    const threadId = activeChatIdRef.current ?? activeChatId ?? createChatThreadId();
    const linkedProject = stagedAsset;
    const currentTypedText = input.trim();
    const visualContent = currentTypedText || `Reviewing linked asset: ${getProjectTitle(linkedProject)}`;
    const userMessage: MeliusChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: visualContent,
      metadata: linkedProject
        ? {
            ...linkedProject,
            attachedAssetKind: 'vault-project',
            attachedAssetTitle: getProjectTitle(linkedProject),
            attachedProjectTitle: getProjectTitle(linkedProject),
          }
        : undefined,
    };
    const updatedHistory = [...messages, userMessage];
    let backendPayloadContent = currentTypedText;

    if (linkedProject) {
      backendPayloadContent = `
[SYSTEM CONTEXT: USER LINKED VAULT ASSET]
Asset Title: ${getProjectTitle(linkedProject)}
File Type: ${linkedProject.file_name?.split('.').pop() || 'Unknown'}
Technology Stack / Industry Tags: ${getProjectTechStack(linkedProject)}
Project Analysis History Content:
${getProjectDescription(linkedProject)}

[USER QUESTION/COMMAND]: ${currentTypedText || 'Provide a review with a mentor score.'}`;
    }

    const requestHistory = [
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: 'user' as const,
        content: backendPayloadContent,
      },
    ];
    const assistantMessage: MeliusChatMessage = {
      id: createMessageId('assistant'),
      role: 'assistant',
      content: '',
    };
    const abortController = new AbortController();

    activeChatIdRef.current = threadId;
    setActiveChatId(threadId);
    setIsVaultOpen(false);
    setStreamError(null);
    setInput('');
    setStagedAsset(null);
    setIsChatStreaming(true);
    streamAbortControllerRef.current = abortController;
    setMessages([...updatedHistory, assistantMessage]);

    try {
      const response = await fetch(MELIUS_CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: requestHistory }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || `MeliusAI chat endpoint returned HTTP ${response.status}.`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('MeliusAI chat endpoint did not expose a readable stream.');
      }

      let streamAccumulator = '';

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        const tokenChunk = decoder.decode(value, { stream: true });

        if (!tokenChunk) {
          continue;
        }

        streamAccumulator += tokenChunk;

        setMessages([
          ...updatedHistory,
          {
            ...assistantMessage,
            content: streamAccumulator,
          },
        ]);
      }

      const finalChunk = decoder.decode();

      if (finalChunk) {
        streamAccumulator += finalChunk;
      }

      const finalHistory = [
        ...updatedHistory,
        {
          ...assistantMessage,
          content: streamAccumulator,
        },
      ];

      setMessages(finalHistory);
      await syncChatThread(finalHistory, threadId);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('MeliusAI Chat Stream Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'MeliusAI chat stream failed.';
      const finalHistory = [
        ...updatedHistory,
        {
          ...assistantMessage,
          content: `MeliusAI connection issue: ${errorMessage}`,
        },
      ];

      setStreamError(errorMessage);
      setMessages(finalHistory);
      await syncChatThread(finalHistory, threadId);
    } finally {
      if (streamAbortControllerRef.current === abortController) {
        streamAbortControllerRef.current = null;
      }

      setIsChatStreaming(false);
    }
  }

  async function handleCopyMessage(messageId: string, messageText: string) {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopiedMessageId(messageId);
      window.setTimeout(() => setCopiedMessageId(null), 1400);
    } catch (error) {
      console.error('Unable to copy MeliusAI message', error);
    }
  }

  function handleEditMessage(messageIndex: number) {
    const targetMessage = messages[messageIndex];

    if (!targetMessage) {
      return;
    }

    setInput(getVisibleUserMessageText(getMessageText(targetMessage)));
    setMessages((currentMessages) => currentMessages.slice(0, messageIndex));
    setStreamError(null);
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      void handleFormSubmit(event);
    }
  }

  function renderPromptComposer() {
    return (
      <form
        onSubmit={handleFormSubmit}
        className="relative z-30 w-full max-w-2xl bg-[#060b1e]/90 border border-blue-950/80 rounded-2xl p-3 flex flex-col gap-2 shadow-2xl backdrop-blur-xl focus-within:border-cyan-500/40 transition-all"
      >
        {isVaultOpen && (
          <div className="absolute bottom-full left-2 mb-3 w-72 max-h-64 overflow-y-auto bg-[#0a102d]/95 border border-cyan-500/30 rounded-xl p-2.5 shadow-2xl z-50 backdrop-blur-md animate-fade-in flex flex-col gap-1">
            <div className="text-[10px] font-bold text-slate-400 px-2 pb-2 border-b border-blue-950/80 uppercase tracking-wider">
              Select Project from Profile Vault
            </div>
            <div className="flex flex-col gap-1 mt-2">
              {profileProjects.length > 0 ? (
                profileProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      setStagedAsset(project);
                      setIsVaultOpen(false);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-cyan-950/40 border border-transparent hover:border-cyan-500/20 text-left transition-all group cursor-pointer"
                  >
                    <span className="text-base shrink-0 grayscale group-hover:grayscale-0 transition-transform group-hover:scale-105">
                      📁
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-cyan-400 transition-colors">
                        {getProjectTitle(project)}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">{getProjectTechStack(project)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-xs text-slate-500 text-center py-5">
                  No projects linked to your profile vault.
                </div>
              )}
            </div>
          </div>
        )}

        {stagedAsset ? (
          <div className="flex flex-col gap-2 bg-cyan-950/40 border border-cyan-500/30 rounded-xl p-2 self-start max-w-sm select-none animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-sm" aria-hidden="true">
                📁
              </span>
              <div className="flex flex-col min-w-0">
                <div className="text-[11px] font-bold text-slate-200 truncate">{getProjectTitle(stagedAsset)}</div>
                <div className="text-[9px] text-cyan-400 font-medium uppercase tracking-wider truncate">
                  {getProjectTechStack(stagedAsset)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStagedAsset(null)}
                className="ml-3 text-slate-400 hover:text-white font-bold cursor-pointer text-xs"
                title="Remove linked project"
                aria-label="Remove linked project"
              >
                ×
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsVaultOpen(!isVaultOpen)}
            className={`w-8 h-8 rounded-lg bg-blue-950/50 border flex items-center justify-center transition-all cursor-pointer font-bold text-base ${
              stagedAsset || isVaultOpen
                ? 'border-cyan-500/30 text-cyan-400'
                : 'border-blue-900/60 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30'
            }`}
            title="Attach profile project"
            aria-label="Attach profile project"
          >
            +
          </button>
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handlePromptKeyDown}
            placeholder={
              stagedAsset
                ? 'Ask MeliusAI to evaluate this linked profile project...'
                : 'Type a message or link a profile project...'
            }
            className="flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder-slate-500"
            aria-label="Ask MeliusAI"
          />
          <button
            type="submit"
            disabled={(!input.trim() && !stagedAsset) || isBusy}
            className="w-8 h-8 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800/40 disabled:text-slate-600 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
            aria-label="Send Message"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
            </svg>
          </button>
        </div>
      </form>
    );
  }

  return (
    <main className="flex-1 h-screen flex bg-gradient-to-br from-[#020617] via-[#030712] to-[#010b24] overflow-hidden text-slate-100">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/20 via-transparent to-transparent pointer-events-none" />

      <aside className="w-60 min-w-[15rem] h-full bg-[#060b1e]/40 border-r border-blue-950/30 flex flex-col p-4 z-20">
        <div className="mb-7 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">MeliusAI</p>
          <p className="mt-2 text-sm font-semibold text-white">Chat Station</p>
        </div>

        <div className="flex flex-col gap-1.5 w-full mb-6 mt-3 border-b border-blue-950/30 pb-4">
          <button
            type="button"
            onClick={handleResetChatSession}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-sans font-medium text-slate-300 hover:text-white bg-blue-950/20 hover:bg-blue-950/40 border border-blue-950/40 hover:border-cyan-500/30 rounded-lg transition-all duration-200 cursor-pointer"
          >
            <span className="text-cyan-400 font-bold text-sm leading-none">+</span> New Chat
          </button>

          <Link
            href="/vault"
            prefetch
            className="group w-full flex items-center gap-2.5 px-3 py-2 text-xs font-sans font-medium text-slate-400 hover:text-slate-200 hover:bg-blue-950/20 rounded-lg transition-all duration-200"
          >
            <span className="text-slate-500 group-hover:text-cyan-400">📁</span> View Vault
          </Link>

          <Link
            href="/search"
            prefetch
            className="group w-full flex items-center gap-2.5 px-3 py-2 text-xs font-sans font-medium text-slate-400 hover:text-slate-200 hover:bg-blue-950/20 rounded-lg transition-all duration-200"
          >
            <span className="text-slate-500 group-hover:text-cyan-400">🔍</span> Search Opportunities
          </Link>

          <Link
            href="/profile"
            prefetch
            className="group w-full flex items-center gap-2.5 px-3 py-2 text-xs font-sans font-medium text-slate-400 hover:text-slate-200 hover:bg-blue-950/20 rounded-lg transition-all duration-200"
          >
            <span className="text-slate-500 group-hover:text-cyan-400">🏠</span> Home
          </Link>
        </div>

        <section>
          <p className="mb-3 px-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">Chat History</p>
          {chats.length === 0 ? (
            <div className="px-3 py-4 text-xs font-sans font-medium text-slate-500 tracking-wide italic select-none">
              No chats...
            </div>
          ) : (
            chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                onClick={() => {
                  activeChatIdRef.current = chat.id;
                  setActiveChatId(chat.id);
                  setMessages(chat.messages);
                  setInput('');
                  setStagedAsset(null);
                  setIsVaultOpen(false);
                  setStreamError(null);
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:text-cyan-400 hover:bg-blue-950/20 rounded-lg transition-all mb-1 truncate cursor-pointer ${
                  activeChatId === chat.id ? 'bg-blue-950/20 text-cyan-400' : 'text-slate-400'
                }`}
              >
                {chat.title}
              </button>
            ))
          )}
        </section>
      </aside>

      <section className="flex-1 h-full flex flex-col justify-between items-center p-6 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(8,145,178,0.14),transparent_28%)]" />

        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center">
          {messages.length === 0 ? (
            <div className="w-full max-w-2xl mx-auto flex flex-col justify-center items-center px-4 animate-fade-in">
              <h1 className="mb-6 text-center text-xl md:text-2xl font-semibold tracking-tight text-slate-200 font-sans">
                {currentSlogan}
              </h1>
            </div>
          ) : (
            <div className="relative z-10 w-full flex-1 overflow-y-auto px-6 pb-44 scroll-smooth">
              <div className="mx-auto w-full max-w-2xl space-y-4 pt-4">
                {messages.map((message, index) => {
                  const messageText = getMessageText(message);

                  return (
                    <div key={message.id} className="relative group w-full flex flex-col mb-4">
                      <div className="absolute -top-3 right-2 flex items-center gap-1.5 bg-[#060b1e] border border-blue-950/60 rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-xl z-20">
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(message.id, messageText)}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-blue-950/40 hover:text-cyan-400"
                          title="Copy message"
                          aria-label="Copy message"
                        >
                          {copiedMessageId === message.id ? (
                            <span className="text-xs text-emerald-400">✓</span>
                          ) : (
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 8h10v10H8zM6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                              />
                            </svg>
                          )}
                        </button>
                        {message.role === 'user' ? (
                          <button
                            type="button"
                            onClick={() => handleEditMessage(index)}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-blue-950/40 hover:text-cyan-400"
                            title="Edit message"
                            aria-label="Edit message"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L9.75 16.902 5.25 18l1.098-4.5L16.862 4.487Z"
                              />
                            </svg>
                          </button>
                        ) : null}
                      </div>

                      <div className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start gap-3'}>
                        {message.role === 'assistant' ? (
                          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-950/20 shadow-lg shadow-cyan-950/10">
                            <MeliusAppLogo className="h-6 w-6" />
                          </div>
                        ) : null}
                        <div
                          className={
                            message.role === 'user'
                              ? 'max-w-[82%] whitespace-pre-wrap rounded-2xl border border-cyan-500/20 bg-cyan-950/20 px-4 py-3 text-sm leading-relaxed text-slate-200 shadow-lg backdrop-blur-sm'
                              : 'max-w-[82%] whitespace-pre-wrap rounded-2xl border border-blue-950/50 bg-[#060b1e]/70 px-4 py-3 text-sm leading-relaxed text-slate-200 shadow-lg backdrop-blur-sm'
                          }
                        >
                          {message.role === 'assistant' ? (
                            messageText ? (
                              <div className="space-y-2">{renderFormattedMarkdown(messageText)}</div>
                            ) : (
                              <span className="text-sm text-slate-500 animate-pulse">
                                MeliusAI is structuring the audit...
                              </span>
                            )
                          ) : (
                            <div className="space-y-2">{renderFormattedMarkdown(messageText)}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {streamError ? <p className="text-center text-xs text-rose-300">{streamError}</p> : null}
                <div ref={scrollAnchorRef} />
              </div>
            </div>
          )}

          <div
            className={
              messages.length === 0
                ? 'w-full max-w-2xl mt-6 transition-all duration-500'
                : 'fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 mb-4 pb-2 z-30 transition-all duration-500'
            }
          >
            {renderPromptComposer()}
          </div>
        </div>
      </section>
    </main>
  );
}
