import { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './DocumentViewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentViewerProps {
  fileUrl: string | null;
  fileName: string | null;
  onReadingPositionChange: (page: number, totalPages: number) => void;
  onSelectContext: (selectedText: string) => void;
}

export default function DocumentViewer({
  fileUrl,
  fileName,
  onReadingPositionChange,
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
  useEffect(() => {
    if (!containerRef.current || numPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(
              entry.target.getAttribute('data-page') || '0'
            );
            if (pageNum > maxPageRef.current) {
              maxPageRef.current = pageNum;
              onReadingPositionChange(pageNum, numPages);
            }
          }
        });
      },
      { root: containerRef.current, threshold: 0.3 }
    );

    const pages = containerRef.current.querySelectorAll('[data-page]');
    pages.forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [numPages, onReadingPositionChange]);

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
            onReadingPositionChange(1, n);
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
