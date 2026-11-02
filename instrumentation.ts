import type { Instrumentation } from 'next';
import { formatRequestError } from '@/lib/observability';

// Setiap galat server (render, route handler, server action) dicatat sebagai satu baris JSON di
// Workers Logs, supaya bisa dicari dan diberi peringatan tanpa menunggu laporan pengguna.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  console.error(JSON.stringify(formatRequestError(err, request, context)));
};
