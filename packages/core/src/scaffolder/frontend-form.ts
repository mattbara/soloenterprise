/**
 * Frontend Form Scaffolder
 *
 * Generates React Hook Form + Zod resolver + shadcn/ui client components.
 */

import type { ZodSchemaOutput } from './zod-from-drizzle';

// ============================================================================
// Types
// ============================================================================

export interface FormScaffoldInput {
  /** Resource name (e.g., 'users') */
  resourceName: string;
  /** Zod schema for the form */
  zodSchemas: ZodSchemaOutput;
  /** Field names to include in the form (subset of insert schema) */
  fields: FormField[];
  /** API endpoint for submission */
  submitEndpoint: string;
  /** HTTP method */
  submitMethod?: 'POST' | 'PUT';
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'email' | 'select' | 'checkbox' | 'date';
  /** For select fields: list of options */
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  required?: boolean;
}

export interface ScaffoldedFile {
  path: string;
  content: string;
}

// ============================================================================
// Form Scaffolder
// ============================================================================

/**
 * Generate a React Hook Form client component with Zod validation.
 */
export function scaffoldFrontendForm(input: FormScaffoldInput): ScaffoldedFile {
  const { resourceName, zodSchemas, fields, submitEndpoint, submitMethod = 'POST' } = input;
  const pascal = toPascalCase(resourceName);

  const parts: string[] = [];

  // Client component directive
  parts.push("'use client';\n");

  // Imports
  parts.push("import { useForm } from 'react-hook-form';");
  parts.push("import { zodResolver } from '@hookform/resolvers/zod';");
  parts.push("import { useRouter } from 'next/navigation';");
  parts.push("import { useState } from 'react';");
  parts.push(`import { insert${pascal}Schema, type Create${pascal}Input } from '../validators/${resourceName}';`);
  parts.push('');

  // Component
  parts.push(`interface ${pascal}FormProps {`);
  parts.push(`  defaultValues?: Partial<Create${pascal}Input>;`);
  parts.push(`  mode?: 'create' | 'edit';`);
  parts.push(`}`);
  parts.push('');

  parts.push(`export function ${pascal}Form({ defaultValues, mode = 'create' }: ${pascal}FormProps) {`);
  parts.push(`  const router = useRouter();`);
  parts.push(`  const [isSubmitting, setIsSubmitting] = useState(false);`);
  parts.push(`  const [error, setError] = useState<string | null>(null);`);
  parts.push('');
  parts.push(`  const form = useForm<Create${pascal}Input>({`);
  parts.push(`    resolver: zodResolver(insert${pascal}Schema),`);
  parts.push(`    defaultValues: defaultValues ?? {},`);
  parts.push(`  });`);
  parts.push('');

  // Submit handler
  parts.push(`  async function onSubmit(data: Create${pascal}Input) {`);
  parts.push(`    setIsSubmitting(true);`);
  parts.push(`    setError(null);`);
  parts.push(`    try {`);
  parts.push(`      const response = await fetch('${submitEndpoint}', {`);
  parts.push(`        method: '${submitMethod}',`);
  parts.push(`        headers: { 'Content-Type': 'application/json' },`);
  parts.push(`        body: JSON.stringify(data),`);
  parts.push(`      });`);
  parts.push(`      if (!response.ok) throw new Error('Failed to save');`);
  parts.push(`      router.refresh();`);
  parts.push(`      // TODO: Navigate or show success`);
  parts.push(`    } catch (err) {`);
  parts.push(`      setError(err instanceof Error ? err.message : 'An error occurred');`);
  parts.push(`    } finally {`);
  parts.push(`      setIsSubmitting(false);`);
  parts.push(`    }`);
  parts.push(`  }`);
  parts.push('');

  // JSX
  parts.push(`  return (`);
  parts.push(`    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">`);
  parts.push(`      {error && (`);
  parts.push(`        <div className="p-3 bg-destructive/10 text-destructive rounded">{error}</div>`);
  parts.push(`      )}`);
  parts.push('');

  // Form fields
  for (const field of fields) {
    parts.push(generateFormField(field));
  }

  // Submit button
  parts.push(`      <button`);
  parts.push(`        type="submit"`);
  parts.push(`        disabled={isSubmitting}`);
  parts.push(`        className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"`);
  parts.push(`      >`);
  parts.push(`        {isSubmitting ? 'Saving...' : mode === 'edit' ? 'Update' : 'Create'}`);
  parts.push(`      </button>`);
  parts.push(`    </form>`);
  parts.push(`  );`);
  parts.push(`}`);

  return {
    path: `src/components/${resourceName}-form.tsx`,
    content: parts.join('\n'),
  };
}

// ============================================================================
// Field Generator
// ============================================================================

function generateFormField(field: FormField): string {
  const errorRef = `form.formState.errors.${field.name}`;
  const register = `{...form.register('${field.name}'${field.type === 'number' ? ', { valueAsNumber: true }' : ''})}`;

  const parts: string[] = [];
  parts.push(`      <div className="space-y-2">`);
  parts.push(`        <label htmlFor="${field.name}" className="text-sm font-medium">${field.label}</label>`);

  switch (field.type) {
    case 'textarea':
      parts.push(`        <textarea`);
      parts.push(`          id="${field.name}"`);
      parts.push(`          ${register}`);
      parts.push(`          placeholder="${field.placeholder || ''}"`);
      parts.push(`          className="w-full px-3 py-2 border rounded-md"`);
      parts.push(`          rows={4}`);
      parts.push(`        />`);
      break;

    case 'select':
      parts.push(`        <select`);
      parts.push(`          id="${field.name}"`);
      parts.push(`          ${register}`);
      parts.push(`          className="w-full px-3 py-2 border rounded-md"`);
      parts.push(`        >`);
      parts.push(`          <option value="">Select...</option>`);
      if (field.options) {
        for (const opt of field.options) {
          parts.push(`          <option value="${opt.value}">${opt.label}</option>`);
        }
      }
      parts.push(`        </select>`);
      break;

    case 'checkbox':
      parts.push(`        <input`);
      parts.push(`          type="checkbox"`);
      parts.push(`          id="${field.name}"`);
      parts.push(`          ${register}`);
      parts.push(`          className="rounded border"`);
      parts.push(`        />`);
      break;

    default:
      parts.push(`        <input`);
      parts.push(`          type="${field.type}"`);
      parts.push(`          id="${field.name}"`);
      parts.push(`          ${register}`);
      parts.push(`          placeholder="${field.placeholder || ''}"`);
      parts.push(`          className="w-full px-3 py-2 border rounded-md"`);
      parts.push(`        />`);
  }

  parts.push(`        {${errorRef} && <p className="text-sm text-destructive">{${errorRef}.message}</p>}`);
  parts.push(`      </div>`);
  parts.push('');

  return parts.join('\n');
}

function toPascalCase(name: string): string {
  return name.replace(/(^|[-_])([a-z])/g, (_, _p, c) => c.toUpperCase());
}
