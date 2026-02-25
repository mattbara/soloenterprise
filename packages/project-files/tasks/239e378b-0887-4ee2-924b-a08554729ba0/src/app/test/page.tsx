// Server Component wrapper — client form component receives server data
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Test',
};

export default async function CreateTestPage() {
  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Create Test</h1>
      <p className="text-muted-foreground">
        Test form component placeholder. Replace with actual form implementation.
      </p>
    </div>
  );
}