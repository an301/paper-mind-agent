import { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './DocumentViewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentViewerProps {
  fileUrl: string | null;
  fileName: string | null;
  onReadingPositionChange: (current: number, max: number, total: number) => void;
  onCurrentLineChange: (snippet: string, page: number) => void;
  onSelectContext: (selectedText: string) => void;
}

export default function DocumentViewer({
  fileUrl,
  fileName,
  onReadingPositionChange,
  onCurrentLineChange,
  onSelectContext,
}: DocumentViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [textContent, setTextContent] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const maxPageRef = useRef(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isPdf = fileName?.toLowerCase().endsWith('.pdf');
  const isText = fileName ? /\.(txt|md|csv)$/i.test(fileName) : false;

  // Track container width for responsive PDF pages
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Read text files
  useEffect(() => {
    if (!fileUrl || !isText) {
      setTextContent(null);
      return;
    }
    fetch(fileUrl)
      .then((res) => res.text())
      .then(setTextContent);
  }, [fileUrl, isText]);

  // Reset state when file changes
  useEffect(() => {
    setNumPages(0);
    maxPageRef.current = 0;
    setSelectionPos(null);
    setSelectedText('');
  }, [fileUrl]);

  // Intersection Observer for reading position
  // Tracks BOTH the live current page (most visible) and the max page ever seen.
  // Current page is the UI position; max is what drives the spoiler clamp.
  useEffect(() => {
    if (!containerRef.current || numPages === 0) return;

    // Track which pages are currently intersecting + their visible ratio.
    const visibility = new Map<number, number>();

    const emit = () => {
      // Current page = most visible page on screen right now
      let current = 0;
      let bestRatio = 0;
      visibility.forEach((ratio, page) => {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          current = page;
        }
      });
      if (current === 0) return;

      if (current > maxPageRef.current) {
        maxPageRef.current = current;
      }
      onReadingPositionChange(current, maxPageRef.current, numPages);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNum = parseInt(
            entry.target.getAttribute('data-page') || '0'
          );
          if (!pageNum) return;
          if (entry.isIntersecting) {
            visibility.set(pageNum, entry.intersectionRatio);
          } else {
            visibility.delete(pageNum);
          }
        });
        emit();
      },
      {
        root: containerRef.current,
        // Fire at multiple thresholds so we can pick the "most visible" page accurately
        threshold: [0.1, 0.25, 0.5, 0.75, 1.0],
      }
    );

    const pages = containerRef.current.querySelectorAll('[data-page]');
    pages.forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [numPages, onReadingPositionChange]);

  // Line-level reading position tracker.
  //
  // Primary signal: the user's mouse position. Most readers hover over the
  // column/line they're reading. If the mouse has moved recently (within
  // MOUSE_FRESH_MS), we use its position as the anchor. This fixes the
  // two-column problem — mouse X disambiguates which column is active.
  //
  // Fallback signal: viewport center. If the mouse has been idle (reader is
  // just scrolling with trackpad / arrow keys), we fall back to the line
  // closest to the middle of the viewport.
  //
  // Neither signal is eye-tracking, but together they're a strong proxy.
  useEffect(() => {
    if (!containerRef.current || numPages === 0) return;
    const container = containerRef.current;

    const MOUSE_FRESH_MS = 4000; // mouse trusted for 4s after last move
    let lastEmitted = '';
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let mouseX = 0;
    let mouseY = 0;
    let mouseLastMove = 0;

    const detectCurrentLine = () => {
      const rect = container.getBoundingClientRect();
      const now = performance.now();
      const mouseFresh = now - mouseLastMove < MOUSE_FRESH_MS;

      // Anchor point = either mouse (fresh) or viewport center (stale).
      const anchorX = mouseFresh ? mouseX : rect.left + rect.width / 2;
      const anchorY = mouseFresh ? mouseY : rect.top + rect.height / 2;

      // Gather text spans from pages visible in the viewport.
      const visiblePages = Array.from(
        container.querySelectorAll<HTMLElement>('[data-page]')
      ).filter((pageEl) => {
        const pr = pageEl.getBoundingClientRect();
        return pr.bottom >= rect.top && pr.top <= rect.bottom;
      });

      let bestSpan: HTMLElement | null = null;
      let bestDistance = Infinity;

      for (const page of visiblePages) {
        const spans = page.querySelectorAll<HTMLElement>('.textLayer span');
        spans.forEach((span) => {
          const sr = span.getBoundingClientRect();
          if (sr.height === 0 || sr.width === 0) return;
          if (sr.bottom < rect.top || sr.top > rect.bottom) return;

          const spanCenterX = sr.left + sr.width / 2;
          const spanCenterY = sr.top + sr.height / 2;

          // When mouse is fresh, use 2D distance so X disambiguates columns.
          // Y is weighted more than X since lines are horizontal — a small
          // Y delta matters more than the same X delta when picking a line.
          const dx = spanCenterX - anchorX;
          const dy = spanCenterY - anchorY;
          const dist = mouseFresh
            ? Math.sqrt(dx * dx * 0.25 + dy * dy) // Y-weighted 2D
            : Math.abs(dy);

          if (dist < bestDistance) {
            bestDistance = dist;
            bestSpan = span;
          }
        });
      }

      if (!bestSpan) return;

      // Stitch adjacent spans on the same visual line into a richer snippet.
      // But when mouse-anchored, also require same-column (within a few
      // hundred px of the anchor X) so we don't jump columns.
      const span = bestSpan as HTMLElement;
      const lineTop = span.getBoundingClientRect().top;
      const parent = span.parentElement;
      let snippet = span.textContent?.trim() || '';
      if (parent) {
        const neighbors = Array.from(
          parent.querySelectorAll<HTMLElement>('span')
        )
          .filter((s) => {
            const r = s.getBoundingClientRect();
            const sameLine = Math.abs(r.top - lineTop) < 3;
            if (!sameLine) return false;
            if (mouseFresh) {
              // Stay within ~400px of the mouse column to avoid bridging columns
              const sx = r.left + r.width / 2;
              if (Math.abs(sx - anchorX) > 400) return false;
            }
            return true;
          })
          .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
          .map((s) => s.textContent?.trim() || '')
          .filter(Boolean);
        if (neighbors.length > 1) {
          snippet = neighbors.join(' ');
        }
      }
      snippet = snippet.replace(/\s+/g, ' ').trim();
      if (!snippet || snippet === lastEmitted) return;
      lastEmitted = snippet;

      const pageWrapper = span.closest<HTMLElement>('[data-page]');
      const pageNum = parseInt(
        pageWrapper?.getAttribute('data-page') || '0'
      );
      onCurrentLineChange(snippet, pageNum);
    };

    const schedule = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(detectCurrentLine, 150);
    };

    const onScroll = () => schedule();
    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      mouseLastMove = performance.now();
      schedule();
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('mousemove', onMouseMove, { passive: true });
    // Run once after PDF loads so we emit an initial position.
    const initialTimer = setTimeout(detectCurrentLine, 500);

    return () => {
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('mousemove', onMouseMove);
      if (debounceTimer) clearTimeout(debounceTimer);
      clearTimeout(initialTimer);
    };
  }, [numPages, onCurrentLineChange]);

  // Handle text selection — show "Ask about this" button
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // Ignore if the click was on the "Ask about this" button itself
    if (buttonRef.current?.contains(e.target as Node)) return;

    setTimeout(() => {
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 2) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelectedText(sel.toString().trim());
        setSelectionPos({
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
      } else {
        setSelectionPos(null);
        setSelectedText('');
      }
    }, 10);
  }, []);

  // Dismiss button on scroll
  const handleScroll = useCallback(() => {
    setSelectionPos(null);
    setSelectedText('');
  }, []);

  // "Ask about this" clicked — send context to chat input
  const handleAskClick = useCallback(() => {
    if (selectedText) {
      onSelectContext(selectedText);
      setSelectionPos(null);
      setSelectedText('');
      window.getSelection()?.removeAllRanges();
    }
  }, [selectedText, onSelectContext]);

  if (!fileUrl) {
    return (
      <div className="doc-viewer-empty">
        <div className="doc-empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="8" y="4" width="32" height="40" rx="4" stroke="currentColor" strokeWidth="2" />
            <line x1="16" y1="16" x2="32" y2="16" stroke="currentColor" strokeWidth="2" />
            <line x1="16" y1="22" x2="28" y2="22" stroke="currentColor" strokeWidth="2" />
            <line x1="16" y1="28" x2="30" y2="28" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
        <h3>No paper selected</h3>
        <p>Upload a research paper and click it to start reading.</p>
      </div>
    );
  }

  if (!isPdf && !isText) {
    return (
      <div className="doc-viewer-empty">
        <div className="doc-empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="8" y="4" width="32" height="40" rx="4" stroke="currentColor" strokeWidth="2" />
            <line x1="16" y1="16" x2="32" y2="16" stroke="currentColor" strokeWidth="2" />
            <line x1="16" y1="22" x2="28" y2="22" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
        <h3>{fileName}</h3>
        <p>Preview not available for this format, but you can still ask questions about it in the chat.</p>
      </div>
    );
  }

  // PDF page width: fill the container with small margins
  const pageWidth = containerWidth > 0 ? containerWidth - 16 : undefined;

  return (
    <div
      className="doc-viewer"
      ref={containerRef}
      onMouseUp={handleMouseUp}
      onScroll={handleScroll}
    >
      {isPdf && (
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages: n }) => {
            setNumPages(n);
            maxPageRef.current = 1;
            onReadingPositionChange(1, 1, n);
          }}
          loading={<div className="doc-loading">Loading PDF...</div>}
          error={<div className="doc-error">Failed to load PDF.</div>}
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div key={i + 1} data-page={i + 1} className="doc-page-wrapper">
              <Page
                pageNumber={i + 1}
                width={pageWidth}
                loading=""
              />
              <div className="doc-page-number">Page {i + 1}</div>
            </div>
          ))}
        </Document>
      )}

      {isText && textContent !== null && (
        <div className="doc-text-content">
          <pre>{textContent}</pre>
        </div>
      )}

      {/* Floating "Ask about this" button near selection */}
      {selectionPos && (
        <button
          ref={buttonRef}
          className="ask-selection-btn"
          style={{
            position: 'fixed',
            left: Math.max(16, Math.min(selectionPos.x, window.innerWidth - 160)),
            top: selectionPos.y - 12,
            transform: 'translate(-50%, -100%)',
            zIndex: 1000,
          }}
          onMouseDown={(e) => e.preventDefault()} // prevent stealing focus / deselecting
          onClick={handleAskClick}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M14.5 1.5L7 9M14.5 1.5L10 14.5L7 9M14.5 1.5L1.5 6L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Ask about this
        </button>
      )}
    </div>
  );
}
