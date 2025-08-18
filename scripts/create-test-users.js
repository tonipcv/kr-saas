const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createTestUsers() {
  try {
    const password = 'testpassword123';
    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date();
    const futureDate = new Date();
    futureDate.setMonth(now.getMonth() + 1); // 1 month from now

    console.log('Criando usuários de teste...');

    const timestamp = Date.now();
    
    // 1. Create test doctor
    const doctor = await prisma.user.create({
      data: {
        id: `doc_${timestamp}`,
        email: `testdoctor_${timestamp}@example.com`,
        password: hashedPassword,
        name: 'Dr. Teste Silva',
        role: 'DOCTOR',
        email_verified: now,
        is_active: true,
        created_at: now,
        updated_at: now,
        phone: `+5511999999999`,
        // Additional doctor-specific fields
        gender: 'MALE',
        address: 'Rua do Médico, 123',
        emergency_contact: 'Secretária',
        emergency_phone: '+5511999999998'
      }
    });
    console.log('✓ Médico criado');

    // 2. Create test admin
    const admin = await prisma.user.create({
      data: {
        id: `adm_${timestamp}`,
        email: `testadmin_${timestamp}@example.com`,
        password: hashedPassword,
        name: 'Admin Teste',
        role: 'ADMIN',
        email_verified: now,
        is_active: true,
        created_at: now,
        updated_at: now,
        phone: `+5511888${timestamp.toString().slice(-4)}`
      }
    });
    console.log('✓ Admin criado');

    // 3. Create test patient
    const patient = await prisma.user.create({
      data: {
        id: `pat_${timestamp}`,
        email: `testpatient_${timestamp}@example.com`,
        password: hashedPassword,
        name: 'Paciente Teste',
        role: 'PATIENT',
        email_verified: now,
        is_active: true,
        created_at: now,
        updated_at: now,
        phone: `+5511777${timestamp.toString().slice(-4)}`,
        birth_date: new Date('1990-01-01'),
        gender: 'OTHER',
        // Additional patient-specific fields
        address: 'Rua do Paciente, 456',
        emergency_contact: 'Familiar',
        emergency_phone: `+5511777${(timestamp + 1).toString().slice(-4)}`,
        medical_history: 'Nenhum histórico médico relevante',
        allergies: 'Nenhuma alergia conhecida',
        medications: 'Nenhuma medicação em uso',
        doctor_id: doctor.id  // Link patient to doctor
      }
    });
    console.log('✓ Paciente criado');

    // 4. Create a protocol for the doctor
    const protocol = await prisma.protocol.create({
      data: {
        name: 'Protocolo de Teste',
        description: 'Protocolo criado para testes',
        doctor_id: doctor.id,
        is_active: true,
        duration: 30,
        show_doctor_info: true,
        is_template: false,
        created_at: now,
        updated_at: now
      }
    });
    console.log('✓ Protocolo criado');

    // 5. Create protocol prescription linking doctor and patient
    const prescription = await prisma.protocolPrescription.create({
      data: {
        protocol_id: protocol.id,
        user_id: patient.id,
        prescribed_by: doctor.id,
        prescribed_at: now,
        planned_start_date: now,
        planned_end_date: futureDate,
        status: 'PRESCRIBED',
        current_day: 1,
        created_at: now,
        updated_at: now
      }
    });
    console.log('✓ Prescrição criada');

    console.log('\n✅ Usuários de teste criados com sucesso!');
    console.log('\n👨‍⚕️ Médico:');
    console.log(`- Email: ${doctor.email}`);
    console.log(`- Senha: ${password}`);
    console.log(`- ID: ${doctor.id}`);
    
    console.log('\n👨‍💼 Admin:');
    console.log(`- Email: ${admin.email}`);
    console.log(`- Senha: ${password}`);
    console.log(`- ID: ${admin.id}`);
    
    console.log('\n👤 Paciente:');
    console.log(`- Email: ${patient.email}`);
    console.log(`- Senha: ${password}`);
    console.log(`- ID: ${patient.id}`);
    
    console.log('\n📋 Prescrição:');
    console.log(`- ID: ${prescription.id}`);
    console.log(`- Protocolo: ${protocol.name} (${protocol.id})`);
    console.log(`- Data de início: ${now.toLocaleDateString()}`);
    console.log(`- Data de término: ${futureDate.toLocaleDateString()}`);
  } catch (error) {
    console.error('❌ Erro ao criar usuários de teste:');
    console.error(error);
    process.exit(1);
  }
}

createTestUsers()
  .finally(async () => {
    await prisma.$disconnect();
    console.log('\nConexão com o banco de dados encerrada.');
  });
