import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CSharpCodeBlockProps {
  code: string;
  title?: string;
  highlightLine?: number;
}

const CS_KEYWORDS = new Set([
  'public', 'private', 'protected', 'internal', 'class', 'interface', 'abstract', 'sealed',
  'record', 'struct', 'enum', 'void', 'return', 'new', 'var', 'if', 'else', 'foreach', 'in',
  'for', 'while', 'try', 'catch', 'throw', 'using', 'namespace', 'virtual', 'override',
  'readonly', 'static', 'get', 'set', 'init', 'true', 'false', 'null', 'is', 'or', 'and',
  'not', 'base', 'this', 'async', 'await', 'nameof', 'typeof', 'string', 'int', 'decimal',
  'bool', 'double',
]);

type TokenKind = 'comment' | 'string' | 'keyword' | 'type' | 'number' | 'plain';

function tokenizeLine(line: string): Array<{ kind: TokenKind; text: string }> {
  const tokens: Array<{ kind: TokenKind; text: string }> = [];
  let i = 0;

  while (i < line.length) {
    // Line comment
    if (line[i] === '/' && line[i + 1] === '/') {
      tokens.push({ kind: 'comment', text: line.slice(i) });
      break;
    }
    // Razor comment @*
    if (line[i] === '@' && line[i + 1] === '*') {
      tokens.push({ kind: 'comment', text: line.slice(i) });
      break;
    }
    // Interpolated or normal string
    if (line[i] === '"' || (line[i] === '$' && line[i + 1] === '"')) {
      const start = i;
      if (line[i] === '$') i++;
      i++; // opening quote
      while (i < line.length) {
        if (line[i] === '\\') {
          i += 2;
          continue;
        }
        if (line[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      tokens.push({ kind: 'string', text: line.slice(start, i) });
      continue;
    }
    // Identifier / keyword / PascalCase type
    if (/[A-Za-z_@]/.test(line[i])) {
      const start = i;
      i++;
      while (i < line.length && /[A-Za-z0-9_]/.test(line[i])) i++;
      const word = line.slice(start, i);
      if (CS_KEYWORDS.has(word)) {
        tokens.push({ kind: 'keyword', text: word });
      } else if (/^[A-Z][A-Za-z0-9_]*$/.test(word) || /^I[A-Z][A-Za-z0-9_]*$/.test(word)) {
        tokens.push({ kind: 'type', text: word });
      } else {
        tokens.push({ kind: 'plain', text: word });
      }
      continue;
    }
    // Numbers
    if (/[0-9]/.test(line[i])) {
      const start = i;
      while (i < line.length && /[0-9._mMfFdD]/.test(line[i])) i++;
      tokens.push({ kind: 'number', text: line.slice(start, i) });
      continue;
    }
    // Whitespace / punctuation
    const start = i;
    i++;
    while (
      i < line.length &&
      !/[A-Za-z0-9_@"$]/.test(line[i]) &&
      !(line[i] === '/' && line[i + 1] === '/')
    ) {
      i++;
    }
    tokens.push({ kind: 'plain', text: line.slice(start, i) });
  }
  return tokens;
}

const TOKEN_COLORS: Record<TokenKind, string> = {
  comment: 'var(--mc-code-comment)',
  string: 'var(--mc-code-str)',
  keyword: 'var(--mc-code-kw)',
  type: 'var(--mc-code-type)',
  number: 'var(--mc-code-num)',
  plain: 'var(--mc-code-text)',
};

export const CSharpCodeBlock: React.FC<CSharpCodeBlockProps> = ({
  code,
  title = 'Program.cs',
  highlightLine,
}) => {
  const [copied, setCopied] = useState(false);
  const lines = code.split('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div
      className="w-full max-w-full overflow-hidden rounded-xl border"
      style={{
        backgroundColor: 'var(--mc-code-bg)',
        borderColor: 'var(--mc-code-border)',
      }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-xs"
        style={{
          backgroundColor: 'var(--mc-code-header)',
          borderColor: 'var(--mc-code-border)',
          color: 'var(--mc-text-secondary)',
        }}
      >
        <span className="font-mono truncate">{title}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="複製程式碼"
          className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors hover:bg-white/10"
          style={{ color: 'var(--mc-text-secondary)' }}
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          <span>{copied ? '已複製' : '複製'}</span>
        </button>
      </div>

      {/* Scrollable horizontally inside its own container so mobile 375px pages never overflow */}
      <div className="w-full overflow-x-auto">
        <pre className="m-0 p-4 text-[13px] leading-6 font-mono select-text">
          <code>
            {lines.map((line, idx) => {
              const lineNumber = idx + 1;
              const isHighlighted = highlightLine === lineNumber;
              const tokens = tokenizeLine(line);
              return (
                <div
                  key={idx}
                  className="flex whitespace-pre px-1 rounded"
                  style={{
                    backgroundColor: isHighlighted ? 'rgba(120, 183, 216, 0.14)' : 'transparent',
                  }}
                >
                  <span
                    className="mr-4 inline-block w-6 shrink-0 select-none text-right tabular-nums"
                    style={{ color: 'var(--mc-code-line)' }}
                    aria-hidden="true"
                  >
                    {lineNumber}
                  </span>
                  <span>
                    {tokens.length === 0 ? ' ' : tokens.map((tok, ti) => (
                      <span key={ti} style={{ color: TOKEN_COLORS[tok.kind] }}>
                        {tok.text}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
};
