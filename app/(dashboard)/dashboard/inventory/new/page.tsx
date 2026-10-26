import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTenantContext } from '@/lib/auth/tenant';
import { createProductAction } from '@/modules/inventory/actions';
import { ProductForm } from '@/modules/inventory/ui/product-form';

export default async function NewProductPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link href="/dashboard/inventory" className="mb-4 inline-block text-sm text-orange-600">← Inventory</Link>
      <h1 className="mb-6 text-lg lg:text-2xl font-medium text-gray-900">New product</h1>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm action={createProductAction} submitLabel="Create product" />
        </CardContent>
      </Card>
    </section>
  );
}
