import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { nanoid } from 'nanoid';
import { minioClient, BUCKET_NAME } from '@/lib/minio';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = (formData.get('file') || formData.get('image')) as File | null;
    
    if (!file) {
      return NextResponse.json({ error: 'Nenhuma imagem enviada' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Arquivo deve ser uma imagem' }, { status: 400 });
    }

    // Generate unique filename with extension
    const ext = file.name.split('.').pop();
    const filename = `${nanoid()}.${ext}`;

    // Convert File to Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    try {
      // Upload to MinIO
      await minioClient.putObject(
        BUCKET_NAME,
        filename,
        buffer,
        buffer.length,
        { 'Content-Type': file.type }
      );

      // Generate public URL
      const url = `https://boop-minioboop.dpbdp1.easypanel.host/${BUCKET_NAME}/${filename}`;

      return NextResponse.json({ url });
    } catch (uploadError) {
      console.error('MinIO upload error:', uploadError);
      return NextResponse.json(
        { error: 'Erro ao fazer upload da imagem para o MinIO' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { error: 'Erro ao processar a imagem' },
      { status: 500 }
    );
  }
} 