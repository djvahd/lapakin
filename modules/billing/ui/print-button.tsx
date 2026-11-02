'use client';

import { Button } from '@/components/ui/button';

// PDF dibuat oleh dialog cetak peramban ("Save as PDF"): tanpa library, jalan di Workers.
export function PrintButton() {
  return (
    <Button type="button" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => window.print()}>
      Print / Save as PDF
    </Button>
  );
}
