import { describe, it, expect } from 'vitest';
import {
  summarizeArtifact,
  shouldSummarize,
  estimateTokens,
} from '../artifact-summarizer';

// =============================================================================
// estimateTokens
// =============================================================================

describe('estimateTokens', () => {
  it('estimates ~1 token per 4 chars', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2); // ceil(5/4) = 2
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });
});

// =============================================================================
// shouldSummarize
// =============================================================================

describe('shouldSummarize', () => {
  const longContent = 'x'.repeat(600);
  const shortContent = 'x'.repeat(400);

  it('returns false for short files', () => {
    expect(shouldSummarize('component.tsx', shortContent)).toBe(false);
  });

  it('returns true for large TypeScript files', () => {
    expect(shouldSummarize('component.tsx', longContent)).toBe(true);
  });

  it('returns false for schema.ts (never summarize)', () => {
    expect(shouldSummarize('db/schema.ts', longContent)).toBe(false);
  });

  it('returns false for types.ts (never summarize)', () => {
    expect(shouldSummarize('src/types.ts', longContent)).toBe(false);
    expect(shouldSummarize('src/types.tsx', longContent)).toBe(false);
  });

  it('returns false for index.ts (never summarize)', () => {
    expect(shouldSummarize('src/index.ts', longContent)).toBe(false);
  });

  it('returns false for .d.ts files', () => {
    expect(shouldSummarize('types/global.d.ts', longContent)).toBe(false);
  });

  it('returns false for test files', () => {
    expect(shouldSummarize('utils.test.ts', longContent)).toBe(false);
    expect(shouldSummarize('utils.test.tsx', longContent)).toBe(false);
  });

  it('returns false for config files', () => {
    expect(shouldSummarize('vite.config.ts', longContent)).toBe(false);
    expect(shouldSummarize('tsconfig.config.js', longContent)).toBe(false);
    expect(shouldSummarize('next.config.mjs', longContent)).toBe(false);
  });
});

// =============================================================================
// summarizeArtifact — TypeScript files
// =============================================================================

describe('summarizeArtifact — TypeScript', () => {
  it('extracts exported interfaces', () => {
    const content = `
import React from 'react';

export interface ButtonProps {
  variant: 'primary' | 'secondary';
  size: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

function internalHelper() {
  return 'not exported';
}

export default function Button({ variant, size, children }: ButtonProps) {
  const className = computeClasses(variant, size);
  return (
    <button className={className}>
      {children}
    </button>
  );
}
`;
    const result = summarizeArtifact('src/components/Button.tsx', content);

    expect(result.summary).toContain('ButtonProps');
    expect(result.summary).toContain('variant');
    expect(result.summary).toContain('size');
    expect(result.summary).toContain('children');
    expect(result.summary).toContain('export default function Button');
    // Should NOT include internal helper
    expect(result.summary).not.toContain('internalHelper');
    // Should NOT include import statements
    expect(result.summary).not.toContain("from 'react'");
    // Should have token reduction
    expect(result.reductionPercent).toBeGreaterThan(0);
  });

  it('extracts exported type aliases', () => {
    const content = `
export type Theme = 'light' | 'dark';

export type Status = 'pending' | 'running' | 'completed' | 'failed';

const internal = 'not exported';
console.log(internal);
`.repeat(3); // make it long enough

    const result = summarizeArtifact('src/types/theme.ts', content);

    expect(result.summary).toContain("export type Theme = 'light' | 'dark';");
    expect(result.summary).toContain('export type Status');
    expect(result.summary).not.toContain("const internal = 'not exported'");
  });

  it('extracts exported enums', () => {
    const content = `
export enum Direction {
  Up = 'UP',
  Down = 'DOWN',
  Left = 'LEFT',
  Right = 'RIGHT',
}

function movePlayer(dir: Direction) {
  // lots of internal logic
  switch (dir) {
    case Direction.Up: return { y: -1 };
    case Direction.Down: return { y: 1 };
    case Direction.Left: return { x: -1 };
    case Direction.Right: return { x: 1 };
  }
}

export function getDirection(): Direction {
  return Direction.Up;
}
`;
    const result = summarizeArtifact('src/utils/direction.ts', content);

    expect(result.summary).toContain('export enum Direction');
    expect(result.summary).toContain("Up = 'UP'");
    expect(result.summary).toContain('export function getDirection');
    expect(result.summary).not.toContain('movePlayer');
  });

  it('extracts exported function signatures without bodies', () => {
    const content = `
import { db } from '@soloenterprise/db';

export async function fetchWeather(city: string): Promise<WeatherData> {
  const response = await fetch(\`https://api.weather.com/\${city}\`);
  if (!response.ok) {
    throw new Error('Failed to fetch');
  }
  const data = await response.json();
  return processWeatherData(data);
}

function processWeatherData(raw: unknown): WeatherData {
  // 50 lines of internal processing
  return raw as WeatherData;
}

export function formatTemperature(temp: number, unit: 'C' | 'F'): string {
  if (unit === 'F') return \`\${temp * 9/5 + 32}°F\`;
  return \`\${temp}°C\`;
}
`;
    const result = summarizeArtifact('src/api/weather.ts', content);

    expect(result.summary).toContain('export async function fetchWeather');
    expect(result.summary).toContain('export function formatTemperature');
    expect(result.summary).toContain('/* ... */');
    // Should NOT include function bodies
    expect(result.summary).not.toContain('fetch(`https://api.weather.com/');
    expect(result.summary).not.toContain('processWeatherData');
  });

  it('extracts exported const arrow functions', () => {
    const content = `
export const useWeather = (city: string) => {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWeather(city).then(setData).finally(() => setLoading(false));
  }, [city]);

  return { data, loading };
};

export const API_BASE = 'https://api.weather.com';

const internalState = new Map();
`;
    const result = summarizeArtifact('src/hooks/useWeather.ts', content);

    expect(result.summary).toContain('export const useWeather');
    expect(result.summary).toContain('/* ... */');
    expect(result.summary).toContain('export const API_BASE');
    expect(result.summary).not.toContain('useState');
    expect(result.summary).not.toContain('internalState');
  });

  it('extracts exported classes', () => {
    const content = `
export class WeatherService {
  private cache: Map<string, WeatherData>;

  constructor() {
    this.cache = new Map();
  }

  async getWeather(city: string): Promise<WeatherData> {
    if (this.cache.has(city)) return this.cache.get(city)!;
    const data = await fetch(city);
    this.cache.set(city, data);
    return data;
  }
}

function helperFn() { return 42; }
`;
    const result = summarizeArtifact('src/services/weather.ts', content);

    expect(result.summary).toContain('export class WeatherService');
    expect(result.summary).toContain('/* ... */');
    expect(result.summary).not.toContain('this.cache');
    expect(result.summary).not.toContain('helperFn');
  });

  it('extracts re-exports', () => {
    const content = `
export { Button } from './Button';
export * from './types';
export type { Theme } from './theme';

// Internal setup
const setup = () => {};
setup();
`.repeat(3);

    const result = summarizeArtifact('src/components/barrel.ts', content);

    expect(result.summary).toContain("export { Button } from './Button';");
    expect(result.summary).toContain("export * from './types';");
  });

  it('falls back to first 10 lines for files with no exports', () => {
    const content = `// This is a setup file
const app = express();
app.use(cors());
app.use(json());
app.listen(3000);
console.log('Server started');
const db = connect();
db.sync();
const cache = redis.connect();
cache.ping();
// More internal setup
// Should not appear
`.repeat(2);

    const result = summarizeArtifact('src/setup.ts', content);

    expect(result.summary).toContain('No exports detected');
    expect(result.summary).toContain('This is a setup file');
    expect(result.summary).toContain('truncated');
  });

  it('reports meaningful token reduction for large component files', () => {
    // Simulate a real component with 80+ lines
    const content = `
import React, { useState, useEffect, useMemo } from 'react';
import { cn } from '../utils/cn';
import { Theme } from '../types';

export interface CardProps {
  title: string;
  description?: string;
  image?: string;
  actions?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'outlined' | 'elevated';
}

export function Card({ title, description, image, actions, className, variant = 'default' }: CardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const cardClasses = useMemo(() => {
    return cn(
      'rounded-lg p-4',
      variant === 'outlined' && 'border border-gray-200',
      variant === 'elevated' && 'shadow-lg',
      isHovered && 'shadow-md transition-shadow',
      className
    );
  }, [variant, isHovered, className]);

  useEffect(() => {
    if (image) {
      const img = new Image();
      img.onload = () => setImageLoaded(true);
      img.src = image;
    }
  }, [image]);

  return (
    <div
      className={cardClasses}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {image && imageLoaded && (
        <img src={image} alt={title} className="w-full h-48 object-cover rounded-t-lg" />
      )}
      <div className="p-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && <p className="text-gray-600 mt-2">{description}</p>}
      </div>
      {actions && (
        <div className="px-4 pb-4 flex gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export default Card;
`;

    const result = summarizeArtifact('src/components/Card.tsx', content);

    // Should extract interface and function signature
    expect(result.summary).toContain('CardProps');
    expect(result.summary).toContain('title: string');
    expect(result.summary).toContain('export function Card');

    // Should NOT contain JSX or implementation
    expect(result.summary).not.toContain('<div');
    expect(result.summary).not.toContain('useState');
    expect(result.summary).not.toContain('useMemo');
    expect(result.summary).not.toContain('onMouseEnter');

    // Should have significant reduction (>50%)
    expect(result.reductionPercent).toBeGreaterThan(50);
  });
});

// =============================================================================
// summarizeArtifact — CSS
// =============================================================================

describe('summarizeArtifact — CSS', () => {
  it('extracts CSS class names', () => {
    const content = `
.card {
  border-radius: 8px;
  padding: 16px;
}

.card-header {
  font-size: 1.25rem;
  font-weight: 600;
}

.card-body {
  margin-top: 8px;
}
`;
    const result = summarizeArtifact('src/styles/card.css', content);

    expect(result.summary).toContain('.card');
    expect(result.summary).toContain('.card-header');
    expect(result.summary).toContain('.card-body');
    expect(result.summary).not.toContain('border-radius');
  });

  it('handles CSS with no classes', () => {
    const content = `
:root {
  --primary: #3b82f6;
  --secondary: #64748b;
}

* {
  box-sizing: border-box;
}
`;
    const result = summarizeArtifact('src/styles/global.css', content);
    expect(result.summary).toContain('no class names detected');
  });
});

// =============================================================================
// summarizeArtifact — JSON
// =============================================================================

describe('summarizeArtifact — JSON', () => {
  it('extracts top-level keys', () => {
    const content = JSON.stringify(
      {
        name: 'my-app',
        version: '1.0.0',
        dependencies: { react: '18.0.0' },
        scripts: { dev: 'next dev' },
      },
      null,
      2
    );
    const result = summarizeArtifact('package.json', content);

    expect(result.summary).toContain('name');
    expect(result.summary).toContain('version');
    expect(result.summary).toContain('dependencies');
    expect(result.summary).toContain('scripts');
    expect(result.summary).not.toContain('react');
  });

  it('handles unparseable JSON', () => {
    const result = summarizeArtifact('broken.json', '{ broken json !!!');
    expect(result.summary).toContain('unparseable');
  });
});

// =============================================================================
// summarizeArtifact — Markdown
// =============================================================================

describe('summarizeArtifact — Markdown', () => {
  it('includes only first 5 lines', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
    const content = lines.join('\n');
    const result = summarizeArtifact('README.md', content);

    expect(result.summary).toContain('Line 1');
    expect(result.summary).toContain('Line 5');
    expect(result.summary).not.toContain('Line 6');
    expect(result.summary).toContain('truncated');
  });
});

// =============================================================================
// summarizeArtifact — Unknown file types
// =============================================================================

describe('summarizeArtifact — Unknown types', () => {
  it('includes first 10 lines for unknown extensions', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
    const content = lines.join('\n');
    const result = summarizeArtifact('config.yaml', content);

    expect(result.summary).toContain('Line 1');
    expect(result.summary).toContain('Line 10');
    expect(result.summary).not.toContain('Line 11');
    expect(result.summary).toContain('truncated');
  });
});

// =============================================================================
// ArtifactSummary metadata
// =============================================================================

describe('ArtifactSummary metadata', () => {
  it('includes correct filePath in result', () => {
    const result = summarizeArtifact('src/foo.ts', 'export const x = 1;'.repeat(50));
    expect(result.filePath).toBe('src/foo.ts');
  });

  it('calculates originalTokens and summaryTokens', () => {
    const longContent = `
export interface Props {
  name: string;
}

${'// internal code\n'.repeat(100)}
`;
    const result = summarizeArtifact('src/comp.tsx', longContent);
    expect(result.originalTokens).toBeGreaterThan(result.summaryTokens);
    expect(result.reductionPercent).toBeGreaterThan(0);
  });

  it('handles edge case of empty content gracefully', () => {
    const result = summarizeArtifact('empty.ts', '');
    expect(result.originalTokens).toBe(0);
    expect(result.summaryTokens).toBeGreaterThanOrEqual(0);
  });
});
