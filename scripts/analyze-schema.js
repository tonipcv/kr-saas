const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeSchema() {
  try {
    console.log('Analisando schema do Prisma...\n');

    // Testar consulta em Protocol
    console.log('=== Testando Protocol ===');
    try {
      const protocol = await prisma.protocol.findFirst({
        select: { doctor_id: true }
      });
      console.log('Campo em Protocol:', protocol ? Object.keys(protocol) : 'Nenhum registro');
    } catch (error) {
      console.log('Erro em Protocol:', error.message);
      // Tentar com doctorId
      try {
        const protocol = await prisma.protocol.findFirst({
          select: { doctorId: true }
        });
        console.log('Campo alternativo em Protocol:', protocol ? Object.keys(protocol) : 'Nenhum registro');
      } catch (error) {
        console.log('Erro com campo alternativo em Protocol:', error.message);
      }
    }

    // Testar consulta em User
    console.log('\n=== Testando User ===');
    try {
      const user = await prisma.user.findFirst({
        select: { doctor_id: true }
      });
      console.log('Campo em User:', user ? Object.keys(user) : 'Nenhum registro');
    } catch (error) {
      console.log('Erro em User:', error.message);
      // Tentar com doctorId
      try {
        const user = await prisma.user.findFirst({
          select: { doctorId: true }
        });
        console.log('Campo alternativo em User:', user ? Object.keys(user) : 'Nenhum registro');
      } catch (error) {
        console.log('Erro com campo alternativo em User:', error.message);
      }
    }

    // Testar consulta em Course
    console.log('\n=== Testando Course ===');
    try {
      const course = await prisma.course.findFirst({
        select: { doctor_id: true }
      });
      console.log('Campo em Course:', course ? Object.keys(course) : 'Nenhum registro');
    } catch (error) {
      console.log('Erro em Course:', error.message);
      // Tentar com doctorId
      try {
        const course = await prisma.course.findFirst({
          select: { doctorId: true }
        });
        console.log('Campo alternativo em Course:', course ? Object.keys(course) : 'Nenhum registro');
      } catch (error) {
        console.log('Erro com campo alternativo em Course:', error.message);
      }
    }

    // Testar uma consulta específica
    console.log('\n=== Testando consulta específica ===');
    try {
      const count = await prisma.protocol.count({
        where: { doctor_id: 'test' }
      });
      console.log('Consulta com doctor_id funcionou');
    } catch (error) {
      console.log('Erro com doctor_id:', error.message);
      try {
        const count = await prisma.protocol.count({
          where: { doctorId: 'test' }
        });
        console.log('Consulta com doctorId funcionou');
      } catch (error) {
        console.log('Erro com doctorId:', error.message);
      }
    }

  } catch (error) {
    console.error('Erro geral:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeSchema();
