// Script para adicionar o modelo VerificationCode ao banco de dados
// Este script deve ser executado com: node scripts/add-verification-code-model.js

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Iniciando migração para adicionar modelo VerificationCode...');

    // Verificar se a tabela já existe
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'verification_code'
      );
    `;

    if (tableExists[0].exists) {
      console.log('Tabela verification_code já existe. Pulando criação.');
    } else {
      // Criar tabela verification_code
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "verification_code" (
          "id" TEXT NOT NULL,
          "code" TEXT NOT NULL,
          "user_id" TEXT NOT NULL,
          "doctor_id" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "expires_at" TIMESTAMP(3) NOT NULL,
          "used_at" TIMESTAMP(3),
          
          CONSTRAINT "verification_code_pkey" PRIMARY KEY ("id")
        );
      `);

      // Adicionar chaves estrangeiras
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "verification_code" ADD CONSTRAINT "verification_code_user_id_fkey" 
        FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);

      await prisma.$executeRawUnsafe(`
        ALTER TABLE "verification_code" ADD CONSTRAINT "verification_code_doctor_id_fkey" 
        FOREIGN KEY ("doctor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);

      console.log('Tabela verification_code criada com sucesso!');
    }

    // Adicionar o modelo ao schema.prisma
    const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Verificar se o modelo já existe no schema
    if (schema.includes('model VerificationCode {')) {
      console.log('Modelo VerificationCode já existe no schema.prisma. Pulando adição.');
    } else {
      // Definição do modelo VerificationCode para adicionar ao schema
      const verificationCodeModel = `
model VerificationCode {
  id         String    @id @default(cuid())
  code       String
  user_id    String
  doctor_id  String
  type       String
  created_at DateTime  @default(now())
  expires_at DateTime
  used_at    DateTime?
  
  user       User      @relation("UserVerificationCodes", fields: [user_id], references: [id], onDelete: Cascade)
  doctor     User      @relation("DoctorVerificationCodes", fields: [doctor_id], references: [id], onDelete: Cascade)
}
`;

      // Adicionar o modelo ao final do arquivo
      const updatedSchema = schema + '\n' + verificationCodeModel;
      fs.writeFileSync(schemaPath, updatedSchema, 'utf8');

      console.log('Modelo VerificationCode adicionado ao schema.prisma');
    }

    // Verificar se as relações já existem no modelo User
    if (!schema.includes('UserVerificationCodes') || !schema.includes('DoctorVerificationCodes')) {
      // Adicionar relações ao modelo User
      const userModelUpdated = schema.replace(
        'model User {',
        'model User {\n  user_verification_codes    VerificationCode[] @relation("UserVerificationCodes")\n  doctor_verification_codes  VerificationCode[] @relation("DoctorVerificationCodes")'
      );

      fs.writeFileSync(schemaPath, userModelUpdated, 'utf8');
      console.log('Relações adicionadas ao modelo User');
    } else {
      console.log('Relações já existem no modelo User. Pulando adição.');
    }

    console.log('Gerando cliente Prisma atualizado...');
    // Nota: O comando abaixo não será executado pelo script, deve ser executado manualmente
    console.log('Execute o comando: npx prisma generate');

    console.log('Migração concluída com sucesso!');
  } catch (error) {
    console.error('Erro durante a migração:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
