/**
 * Standard WebSocket hooks that replace Cloudflare's `agents/react` and `agents/ai-react`.
 *
 * These hooks provide the same API surface as the Cloudflare Agents SDK hooks
 * but use standard WebSocket connections instead of Durable Object bindings.
 */
import { useState, useEffect, useRef, useCallback, type MutableRefObject } from 'react';

// ── Types ──────────────────────────────────────────────────────

export interface AgentOptions {
  agent: string;
  name: string;
  host: string;
  onError?: (error: Event) => void;
  onMessage?: (message: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface AgentRef {
  send: (data: string | ArrayBuffer) => void;
  close: () => void;
  readyState: number;
  reconnect: () => void;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parts?: Array<{ type: string; text?: string; toolName?: string; result?: unknown }>;
  createdAt?: Date;
  toolInvocations?: Array<{
    toolCallId: string;
    toolName: string;
    args: unknown;
    state: string;
    result?: unknown;
  }>;
}

export interface UseAgentChatOptions {
  agent: AgentRef;
  maxSteps?: number;
  body?: Record<string, unknown>;
  getInitialMessages?: () => Promise<AgentChatMessage[]>;
  onError?: (error: Error) => void;
  onResponse?: (response: Response) => void;
  onToolCall?: (params: { toolCall: { toolName: string; args: unknown } }) => Promise<void>;
  onFinish?: (message: AgentChatMessage) => void;
}

export interface UseAgentChatReturn {
  messages: AgentChatMessage[];
  input: string;
  setInput: (input: string) => void;
  handleSubmit: (e?: { preventDefault?: () => void }) => void;
  isLoading: boolean;
  stop: () => void;
  clearMessages: () => void;
  setMessages: (messages: AgentChatMessage[]) => void;
  append: (message: Partial<AgentChatMessage>) => void;
  lastMessage: AgentChatMessage | undefined;
  reload: () => void;
}

// ── useAgent ───────────────────────────────────────────────────

/**
 * Replacement for `useAgent` from `agents/react`.
 * Creates a WebSocket connection to the backend server.
 */
export function useAgent(options: AgentOptions): AgentRef {
  const wsRef = useRef<WebSocket | null>(null);
  const [readyState, setReadyState] = useState(WebSocket.CLOSED);

  const connect = useCallback(() => {
    // Build WebSocket URL from HTTP host
    const hostUrl = options.host.replace(/^http/, 'ws');
    const wsUrl = `${hostUrl}/agents/${options.agent}/${options.name}`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setReadyState(WebSocket.OPEN);
        options.onOpen?.();
      };

      ws.onmessage = (event) => {
        options.onMessage?.(event);
      };

      ws.onerror = (event) => {
        options.onError?.(event);
      };

      ws.onclose = () => {
        setReadyState(WebSocket.CLOSED);
        options.onClose?.();

        // Auto-reconnect after 3 seconds
        setTimeout(() => {
          if (wsRef.current === ws) {
            connect();
          }
        }, 3000);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[useAgent] Connection error:', error);
    }
  }, [options.host, options.agent, options.name]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return {
    send: (data: string | ArrayBuffer) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    },
    close: () => {
      wsRef.current?.close();
    },
    readyState,
    reconnect: connect,
  };
}

// ── useAgentChat ───────────────────────────────────────────────

/**
 * Replacement for `useAgentChat` from `agents/ai-react`.
 * Manages chat state and communication with the AI agent via WebSocket.
 */
export function useAgentChat(options: UseAgentChatOptions): UseAgentChatReturn {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messageIdCounter = useRef(0);

  // Load initial messages
  useEffect(() => {
    if (options.getInitialMessages) {
      options.getInitialMessages().then((msgs) => {
        if (msgs.length > 0) setMessages(msgs);
      });
    }
  }, []);

  const generateId = () => {
    messageIdCounter.current++;
    return `msg-${Date.now()}-${messageIdCounter.current}`;
  };

  const handleSubmit = useCallback(
    (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      if (!input.trim() || isLoading) return;

      const userMessage: AgentChatMessage = {
        id: generateId(),
        role: 'user',
        content: input.trim(),
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);

      // Send via WebSocket
      try {
        options.agent.send(
          JSON.stringify({
            type: 'cf_agent_chat_message',
            data: {
              message: userMessage,
              messages: [...messages, userMessage],
              body: options.body,
              maxSteps: options.maxSteps,
            },
          }),
        );
      } catch (error) {
        console.error('[useAgentChat] Send error:', error);
        setIsLoading(false);
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    },
    [input, isLoading, messages, options],
  );

  // Listen for responses from the agent
  useEffect(() => {
    const originalOnMessage = (options.agent as any)._onMessage;

    // We piggyback on the WebSocket's message handler
    // The agent hook handles routing messages to onMessage
    // Chat responses come through as specific message types

    // For now, handle via polling the agent's message queue
    // This will be refined when the backend WebSocket protocol is finalized
  }, [options.agent]);

  const append = useCallback(
    (message: Partial<AgentChatMessage>) => {
      const fullMessage: AgentChatMessage = {
        id: generateId(),
        role: message.role || 'user',
        content: message.content || '',
        createdAt: new Date(),
        ...message,
      };
      setMessages((prev) => [...prev, fullMessage]);

      if (fullMessage.role === 'user') {
        setIsLoading(true);
        options.agent.send(
          JSON.stringify({
            type: 'cf_agent_chat_message',
            data: {
              message: fullMessage,
              messages: [...messages, fullMessage],
              body: options.body,
              maxSteps: options.maxSteps,
            },
          }),
        );
      }
    },
    [messages, options],
  );

  return {
    messages,
    input,
    setInput,
    handleSubmit,
    isLoading,
    stop: () => setIsLoading(false),
    clearMessages: () => setMessages([]),
    setMessages,
    append,
    lastMessage: messages[messages.length - 1],
    reload: () => {
      // Re-send the last user message
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUserMsg) {
        append(lastUserMsg);
      }
    },
  };
}
