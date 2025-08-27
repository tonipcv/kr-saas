import React from 'react';
import { prisma } from '@/lib/prisma';
import ProductsGrid from '@/components/products/ProductsGrid';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DoctorProductsPage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  // Next.js 15: params may be a Promise
  const resolvedParams = (params as any)?.then ? await (params as Promise<{ slug: string }>) : (params as { slug: string });
  const { slug } = resolvedParams;

  // Resolve doctor by slug
  const doctor = await prisma.user.findFirst({
    where: { doctor_slug: slug, role: 'DOCTOR', is_active: true } as any,
    select: { id: true, name: true, doctor_slug: true, image: true },
  });

  // List active products
  const products = doctor
    ? await prisma.products.findMany({
        where: { doctorId: doctor.id, isActive: true } as any,
        orderBy: { createdAt: 'desc' } as any,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          creditsPerUnit: true,
          price: true,
          imageUrl: true,
          confirmationUrl: true,
        } as any,
      })
    : [];

  return (
    <main className="min-h-screen bg-[#f7f8ff] text-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex flex-col items-center text-center">
              {doctor ? (
                <>
                  <div className="relative mb-2">
                    {doctor.image ? (
                      <div className="relative w-28 h-28 sm:w-32 sm:h-32 mx-auto">
                        <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full opacity-75 blur-lg" />
                        <img
                          src={doctor.image}
                          alt={doctor.name}
                          className="relative w-full h-full rounded-full object-cover border-4 border-white/30 shadow-2xl"
                        />
                      </div>
                    ) : (
                      <div className="relative w-28 h-28 sm:w-32 sm:h-32 mx-auto">
                        <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full opacity-75 blur-lg" />
                        <div className="relative w-full h-full rounded-full bg-gradient-to-r from-gray-500 to-gray-600 flex items-center justify-center border-4 border-white/30 shadow-2xl">
                          <span className="text-white text-4xl font-light">{doctor.name?.charAt(0) || 'D'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <h1 className="mt-1 text-xl sm:text-2xl font-semibold tracking-tight bg-gradient-to-b from-gray-800 via-gray-600 to-gray-500 bg-clip-text text-transparent">{doctor.name}</h1>
                </>
              ) : (
                <>
                  <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">Produtos e Serviços</h1>
                  <p className="mt-1 text-sm text-gray-600">Seleção de serviços e produtos da clínica.</p>
                </>
              )}
            </div>
          </div>
        </div>
        {!doctor ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
            Não foi possível encontrar a clínica.
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
            Nenhum produto disponível no momento.
          </div>
        ) : (
          <ProductsGrid slug={slug} doctorId={doctor.id as any} products={products as any} />
        )}
      </div>
      {/* Footer */}
      <div className="mt-10 pb-8 flex justify-center">
        <a
          href="https://zuzuvu.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700"
        >
          <span>Powered by</span>
          <img src="/logo.png" alt="Zuzuvu" className="h-4 w-auto opacity-80" />
        </a>
      </div>
    </main>
  );
}
