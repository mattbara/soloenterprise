"use client";

import ReactMarkdown from "react-markdown";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Renders markdown content with consistent styling.
 * Used for displaying agent questions and other markdown text.
 */
export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        components={{
        // Headings
        h1: ({ children }) => (
          <h1 className="text-xl font-bold text-gray-900 mb-3 mt-4">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-semibold text-gray-900 mb-2 mt-3">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold text-gray-900 mb-2 mt-2">{children}</h3>
        ),
        // Paragraphs
        p: ({ children }) => (
          <p className="text-gray-700 mb-3 leading-relaxed">{children}</p>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-3 space-y-1 text-gray-700">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-3 space-y-1 text-gray-700">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-gray-700">{children}</li>
        ),
        // Inline elements
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-gray-700">{children}</em>
        ),
        // Code
        code: ({ className, children }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
                {children}
              </code>
            );
          }
          return (
            <code className={className}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto mb-3 text-sm">
            {children}
          </pre>
        ),
        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            className="text-blue-600 hover:text-blue-800 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600 mb-3">
            {children}
          </blockquote>
        ),
        // Horizontal rule
        hr: () => <hr className="border-t border-gray-200 my-4" />,
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
