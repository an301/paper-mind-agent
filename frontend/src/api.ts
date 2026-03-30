// API client for the Research Mind backend

export interface UploadResult {
  paper_id: string;
  title: string;
  authors: string;
  num_sections: number;
  section_names: string[];
  error?: string;
}

export interface StreamEvent {
  type: 'token' | 'tool_call' | 'done' | 'error';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  session_id?: string;
  error?: string;
}

export async function uploadPaper(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Send a chat message and read the SSE stream.
 * Calls onEvent for each event received.
 * Returns the session_id from the done event.
 */
export async function sendChatMessage(
  message: string,
  sessionId: string | null,
  onEvent: (event: StreamEvent) => void
): Promise<string | null> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      session_id: sessionId,
    }),
  });

  if (!res.ok) {
    throw new Error(`Chat failed: ${res.statusText}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let returnedSessionId: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from the buffer
    const parts = buffer.split('\n\n');
    // Keep the last part as it may be incomplete
    buffer = parts.pop() || '';

    for (const part of parts) {
      if (!part.trim()) continue;

      const lines = part.split('\n');
      let eventType = '';
      let data = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7);
        } else if (line.startsWith('data: ')) {
          data = line.slice(6);
        }
      }

      if (data) {
        try {
          const parsed = JSON.parse(data) as StreamEvent;
          parsed.type = eventType as StreamEvent['type'];

          if (eventType === 'done' && parsed.session_id) {
            returnedSessionId = parsed.session_id;
          }

          onEvent(parsed);
        } catch {
          // Skip malformed events
        }
      }
    }
  }

  return returnedSessionId;
}

export async function getKnowledgeGraph(userId: string = 'default') {
  const res = await fetch(`/api/knowledge-graph?user_id=${userId}`);
  if (!res.ok) throw new Error('Failed to fetch knowledge graph');
  return res.json();
}
