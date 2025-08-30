import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function summarizeProducts(products: Array<any>) {
  const lines = products.map((p) => {
    const price = (() => {
      try { return Number.parseFloat(p.price?.toString?.() ?? ''); } catch { return undefined; }
    })();
    const credits = (() => {
      try { return Number.parseFloat(p.creditsPerUnit?.toString?.() ?? ''); } catch { return undefined; }
    })();
    return `- id: ${p.id}\n  name: ${p.name}\n  category: ${p.category}\n  price: ${price ?? 'n/a'}\n  creditsPerUnit: ${credits ?? 'n/a'}\n  imageUrl: ${p.imageUrl ?? ''}\n  description: ${p.description ?? ''}`;
  });
  return lines.join('\n');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> | { slug: string } }
) {
  try {
    const resolvedParams = (params as any)?.then ? await (params as Promise<{ slug: string }>) : (params as { slug: string });
    const { slug } = resolvedParams;

    const body = await request.json().catch(() => ({}));
    const userMessages = (body?.messages as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>) || [];
    const question: string | undefined = body?.question || userMessages.findLast?.((m) => m.role === 'user')?.content;

    if (!slug) {
      return NextResponse.json({ error: 'slug inválido' }, { status: 400 });
    }

    // Resolve doctor by slug
    const doctor = await prisma.user.findFirst({
      where: { doctor_slug: slug, role: 'DOCTOR', is_active: true } as any,
      select: { id: true, name: true, doctor_slug: true },
    });

    if (!doctor) {
      return NextResponse.json({ error: 'Médico não encontrado' }, { status: 404 });
    }

    // Fetch active products
    const raw = await prisma.products.findMany({
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
    });

    // Fallback if no products
    if (!raw || raw.length === 0) {
      return NextResponse.json({ answer: 'No momento, não há produtos disponíveis nesta clínica.' });
    }

    const productsBlock = summarizeProducts(raw as any);

    const system = `Você é um assistente da clínica ${doctor.name}. Responda APENAS com base na lista de produtos fornecida.\n\nFormatação e estilo (Markdown):\n- Use Markdown sempre.\n- Ao listar produtos, use numeração e destaque o nome em **negrito** e mostre o preço como R$ <valor>.\n- Quando houver imagem (imageUrl), inclua na linha em Markdown: ![<nome>](<imageUrl>).\n- Use subtítulos curtos quando útil (por exemplo, "Produtos disponíveis" ou "Comparação").\n- Seja claro e objetivo.\n- Ao citar valores, diga que podem variar e que a confirmação ocorre no agendamento.\n- Se a pergunta não for sobre produtos, responda brevemente e retome o foco nos produtos.\n- Se pertinente, sugira o agendamento e, quando houver, utilize o link de confirmação do produto (confirmationUrl).\n\nProdutos (base de conhecimento):\n${productsBlock}`;

    const messages = [
      { role: 'system' as const, content: system },
      ...(userMessages?.length ? userMessages.filter((m) => m.role !== 'system') : question ? [{ role: 'user' as const, content: question }] : []),
    ];

    if (!process.env.OPENAI_API_KEY) {
      // graceful fallback in dev
      const mock = `Sou um assistente da clínica ${doctor.name}. Baseado nos produtos disponíveis, posso ajudar a escolher o melhor para você. Pergunte sobre preços, categorias ou indicações e eu explico.`;
      return NextResponse.json({ answer: mock });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.2,
      max_tokens: 500,
    });

    const answer = completion.choices?.[0]?.message?.content || 'Desculpe, não consegui gerar uma resposta agora.';

    return NextResponse.json({ answer });
  } catch (err) {
    console.error('[AI Products QA] Error:', err);
    return NextResponse.json({ error: 'Erro ao gerar resposta' }, { status: 500 });
  }
}
