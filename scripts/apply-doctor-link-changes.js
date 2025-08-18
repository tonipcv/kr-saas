// Script para aplicar alterações necessárias para o sistema de links de médicos
// Executa: node scripts/apply-doctor-link-changes.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Iniciando aplicação de alterações para o sistema de links de médicos...');

    // 1. Verificar se a coluna doctor_slug já existe na tabela User
    console.log('Verificando se a coluna doctor_slug existe...');
    try {
      await prisma.$executeRawUnsafe(`
        SELECT doctor_slug FROM "User" LIMIT 1;
      `);
      console.log('Coluna doctor_slug já existe.');
    } catch (error) {
      console.log('Adicionando coluna doctor_slug à tabela User...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS doctor_slug TEXT UNIQUE;
      `);
      console.log('Coluna doctor_slug adicionada com sucesso.');
    }

    // 2. Criar tabela VerificationCode se não existir
    console.log('Verificando se a tabela VerificationCode existe...');
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'VerificationCode'
      );
    `;

    if (tableExists[0].exists) {
      console.log('Tabela VerificationCode já existe.');
    } else {
      console.log('Criando tabela VerificationCode...');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "VerificationCode" (
          "id" TEXT NOT NULL,
          "code" TEXT NOT NULL,
          "user_id" TEXT NOT NULL,
          "doctor_id" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "expires_at" TIMESTAMP(3) NOT NULL,
          "used_at" TIMESTAMP(3),
          
          CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
        );
      `);

      // Adicionar chaves estrangeiras
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "VerificationCode" ADD CONSTRAINT "VerificationCode_user_id_fkey" 
        FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);

      await prisma.$executeRawUnsafe(`
        ALTER TABLE "VerificationCode" ADD CONSTRAINT "VerificationCode_doctor_id_fkey" 
        FOREIGN KEY ("doctor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);

      console.log('Tabela VerificationCode criada com sucesso!');
    }

    // 3. Verificar se a tabela DoctorPatientRelation existe
    console.log('Verificando se a tabela DoctorPatientRelation existe...');
    const relationTableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'doctorPatientRelation'
      );
    `;

    if (relationTableExists[0].exists) {
      console.log('Tabela doctorPatientRelation já existe.');
    } else {
      console.log('Criando tabela doctorPatientRelation...');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "doctorPatientRelation" (
          "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
          "doctor_id" TEXT NOT NULL,
          "patient_id" TEXT NOT NULL,
          "source" TEXT NOT NULL DEFAULT 'DOCTOR_LINK',
          "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          
          CONSTRAINT "doctorPatientRelation_pkey" PRIMARY KEY ("id")
        );
      `);

      // Adicionar chaves estrangeiras
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "doctorPatientRelation" ADD CONSTRAINT "doctorPatientRelation_doctor_id_fkey" 
        FOREIGN KEY ("doctor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);

      await prisma.$executeRawUnsafe(`
        ALTER TABLE "doctorPatientRelation" ADD CONSTRAINT "doctorPatientRelation_patient_id_fkey" 
        FOREIGN KEY ("patient_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);

      console.log('Tabela doctorPatientRelation criada com sucesso!');
    }

    console.log('Alterações aplicadas com sucesso!');
  } catch (error) {
    console.error('Erro ao aplicar alterações:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
