import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DoctorProductsPage({ params }: { params: { slug: string } }) {
  const { slug } = params;

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
                  {doctor.image ? (
                    <img
                      src={doctor.image}
                      alt={doctor.name}
                      className="h-16 w-16 rounded-full object-cover ring-2 ring-gray-100"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-lg font-medium ring-2 ring-gray-100">
                      {doctor.name?.charAt(0) || 'D'}
                    </div>
                  )}
                  <h1 className="mt-3 text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">{doctor.name}</h1>
                  <p className="mt-1 text-sm text-gray-600">Produtos e serviços da clínica</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p: any) => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition p-4">
                <div className="aspect-w-16 aspect-h-9 mb-3 bg-gray-100 rounded-xl overflow-hidden">
                  {p.imageUrl ? (
                    <img 
                      src={p.imageUrl} 
                      alt={p.name} 
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 flex items-center justify-center bg-gray-100">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 truncate">{p.name}</h3>
                  {typeof p.price === 'number' ? (
                    <span className="text-sm font-medium text-gray-900">R$ {p.price.toFixed(2)}</span>
                  ) : null}
                </div>
                {p.category ? (
                  <span className="mt-1 inline-block text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 border border-gray-200">{p.category}</span>
                ) : null}
                {p.description ? (
                  <p className="mt-2 text-xs text-gray-600 line-clamp-3">{p.description}</p>
                ) : null}
                <div className="mt-3">
                  <Link
                    href={`/${slug}`}
                    className="hidden"
                  >
                    Voltar
                  </Link>
                  <Link
                    href={`/patient/appointments/${doctor.id}?productId=${p.id}&from=${encodeURIComponent(slug)}`}
                    className="inline-flex items-center justify-center rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                  >
                    Agendar serviço
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
