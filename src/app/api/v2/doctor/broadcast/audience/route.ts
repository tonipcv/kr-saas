import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/v2/doctor/broadcast/audience?segment=all|inactive_30d|birthday_7d|purchased_30d&full=true
// Returns: { success, data: { count, sample, contacts?, totalPatients, eligibleCount, invalidCount } }
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const doctorId = session.user.id;
    const { searchParams } = new URL(req.url);
    const segment = (searchParams.get('segment') || 'all') as 'all' | 'inactive_30d' | 'birthday_7d' | 'purchased_30d';
    const channel = (searchParams.get('channel') || 'whatsapp') as 'whatsapp' | 'sms' | 'email';
    const returnFull = searchParams.get('full') === 'true';
    const clinicId = searchParams.get('clinicId');

    console.log(`[Audience] Request params: doctorId=${doctorId}, clinicId=${clinicId}, segment=${segment}, channel=${channel}`);
    
    // STEP 1: Get just the patient IDs from relationships (no join that could cause null issues)
    const relationshipIds = await prisma.doctorPatientRelationship.findMany({
      where: {
        ...(clinicId ? { clinicId } : { doctorId }),
        isActive: true
      },
      select: {
        patientId: true
      }
    });
    
    console.log(`[Audience] Found ${relationshipIds.length} active patient relationships`);
    
    // Extract patient IDs
    const patientIds = relationshipIds.map(r => r.patientId);
    
    if (patientIds.length === 0) {
      console.log('[Audience] No patients found');
      return NextResponse.json({ 
        success: true, 
        data: { 
          count: 0, 
          sample: [],
          ...(returnFull ? { contacts: [] } : {}),
          totalPatients: 0,
          eligibleCount: 0,
          invalidCount: 0
        } 
      });
    }
    
    // STEP 2: Get patient details in a separate query
    const patients = await prisma.user.findMany({
      where: {
        id: { in: patientIds }
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        birth_date: true,
        is_active: true
      }
    });
    
    console.log(`[Audience] Found ${patients.length} patients with details`);
    
    // Create a map for easy access
    const patientMap = new Map(patients.map(p => [p.id, p]));
    
    // Create a list of patients with all details
    const validPatients = patients.filter(p => p !== null);

    // We already have an early return above, this is redundant
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Check for valid phone numbers
    const hasValidPhone = (patient: any) => {
      const phone = (patient?.phone || '').toString();
      const digits = phone.replace(/\D+/g, '');
      return digits.length >= 10;
    };
    const hasValidEmail = (patient: any) => {
      const email = (patient?.email || '').toString().trim();
      return /.+@.+\..+/.test(email);
    };
    
    // Eligible bases per channel
    const patientsWithValidPhone = validPatients.filter(hasValidPhone);
    const patientsWithValidEmail = validPatients.filter(hasValidEmail);
    
    // Log phone validation results
    const phoneCounts = {
      total: validPatients.length,
      valid: patientsWithValidPhone.length,
      invalid: validPatients.length - patientsWithValidPhone.length
    };
    console.log(`[Audience] Phone validation: total=${phoneCounts.total}, valid=${phoneCounts.valid}, invalid=${phoneCounts.invalid}`);
    if (channel === 'email') {
      const emailCounts = {
        total: validPatients.length,
        valid: patientsWithValidEmail.length,
        invalid: validPatients.length - patientsWithValidEmail.length,
      };
      console.log(`[Audience] Email validation: total=${emailCounts.total}, valid=${emailCounts.valid}, invalid=${emailCounts.invalid}`);
    }
    
    const totalPatients = validPatients.length;

    // Function to pick sample patients (up to 10) with valid contacts per channel
    const pickSample = () => {
      const base = channel === 'email' ? patientsWithValidEmail : patientsWithValidPhone;
      return base
        .slice(0, 10)
        .map(p => ({
          id: p.id,
          name: p.name || '',
          phone: p.phone || '',
          email: p.email || undefined,
        }));
    };
    
    // Function to get all contacts with valid contacts per channel
    const getAllContacts = () => {
      const base = channel === 'email' ? patientsWithValidEmail : patientsWithValidPhone;
      return base
        .map(p => ({
          id: p.id,
          name: p.name || '',
          phone: p.phone || '',
          email: p.email || undefined,
        }));
    };

    if (segment === 'all') {
      const eligibleCount = channel === 'email' ? patientsWithValidEmail.length : patientsWithValidPhone.length;
      return NextResponse.json({ 
        success: true, 
        data: { 
          count: eligibleCount, 
          sample: pickSample(),
          ...(returnFull ? { contacts: getAllContacts() } : {}),
          totalPatients,
          eligibleCount,
          invalidCount: totalPatients - eligibleCount
        } 
      });
    }

    if (segment === 'inactive_30d') {
      // Active in last 30d = had customer_visit or purchase_made
      const recent = await prisma.event.findMany({
        where: {
          customerId: { in: patientIds },
          timestamp: { gte: thirtyDaysAgo },
          eventType: { in: ['customer_visit', 'purchase_made'] as any }
        },
        select: { customerId: true },
      });
      
      const activeSet = new Set(recent.map(e => e.customerId!).filter(Boolean));
      
      // Filter patients who are inactive (not in activeSet)
      const base = channel === 'email' ? patientsWithValidEmail : patientsWithValidPhone;
      const inactivePatients = base.filter(p => !activeSet.has(p.id));
      
      const eligibleCount = inactivePatients.length;
      
      // Sample and contacts functions for this segment
      const segmentSample = () => {
        return inactivePatients
          .slice(0, 10)
          .map(p => ({
            id: p.id,
            name: p.name || '',
            phone: p.phone || '',
            email: p.email || undefined,
          }));
      };
      
      const segmentContacts = () => {
        return inactivePatients
          .map(p => ({
            id: p.id,
            name: p.name || '',
            phone: p.phone || '',
            email: p.email || undefined,
          }));
      };
      
      return NextResponse.json({ 
        success: true, 
        data: { 
          count: eligibleCount, 
          sample: segmentSample(),
          ...(returnFull ? { contacts: segmentContacts() } : {}),
          totalPatients,
          eligibleCount,
          invalidCount: totalPatients - eligibleCount
        } 
      });
    }

    if (segment === 'purchased_30d') {
      const recent = await prisma.event.findMany({
        where: { customerId: { in: patientIds }, timestamp: { gte: thirtyDaysAgo }, eventType: 'purchase_made' as any },
        select: { customerId: true },
      });
      
      const purchasedSet = new Set(recent.map(e => e.customerId!).filter(Boolean));
      
      // Filter patients who have purchased in last 30 days
      const base = channel === 'email' ? patientsWithValidEmail : patientsWithValidPhone;
      const purchasedPatients = base.filter(p => purchasedSet.has(p.id));
      
      const eligibleCount = purchasedPatients.length;
      
      // Sample and contacts functions for this segment
      const segmentSample = () => {
        return purchasedPatients
          .slice(0, 10)
          .map(p => ({
            id: p.id,
            name: p.name || '',
            phone: p.phone || '',
            email: p.email || undefined,
          }));
      };
      
      const segmentContacts = () => {
        return purchasedPatients
          .map(p => ({
            id: p.id,
            name: p.name || '',
            phone: p.phone || '',
            email: p.email || undefined,
          }));
      };
      
      return NextResponse.json({ 
        success: true, 
        data: { 
          count: eligibleCount, 
          sample: segmentSample(),
          ...(returnFull ? { contacts: segmentContacts() } : {}),
          totalPatients,
          eligibleCount,
          invalidCount: totalPatients - eligibleCount
        } 
      });
    }

    if (segment === 'birthday_7d') {
      // Filter patients with birthdays in the next 7 days
      const birthdayPatients = validPatients.filter(p => {
        const bd = p.birth_date;
        if (!bd) return false;
        const b = new Date(bd);
        // Build this year's birthday
        const thisYear = new Date(now.getFullYear(), b.getMonth(), b.getDate());
        const next = thisYear < now ? new Date(now.getFullYear() + 1, b.getMonth(), b.getDate()) : thisYear;
        return next >= now && next <= sevenDaysAhead;
      });
      
      // Filter for valid contact per channel
      const birthdayPatientsEligible = (channel === 'email' ? birthdayPatients.filter(hasValidEmail) : birthdayPatients.filter(hasValidPhone));
      
      const eligibleCount = birthdayPatientsEligible.length;
      
      // Sample and contacts functions for this segment
      const segmentSample = () => {
        return birthdayPatientsEligible
          .slice(0, 10)
          .map(p => ({
            id: p.id,
            name: p.name || '',
            phone: p.phone || '',
            email: p.email || undefined,
          }));
      };
      
      const segmentContacts = () => {
        return birthdayPatientsEligible
          .map(p => ({
            id: p.id,
            name: p.name || '',
            phone: p.phone || '',
            email: p.email || undefined,
          }));
      };
      
      return NextResponse.json({ 
        success: true, 
        data: { 
          count: eligibleCount, 
          sample: segmentSample(),
          ...(returnFull ? { contacts: segmentContacts() } : {}),
          totalPatients,
          eligibleCount,
          invalidCount: totalPatients - eligibleCount
        } 
      });
    }

    // Default fallback for unknown segments
    return NextResponse.json({ 
      success: true, 
      data: { 
        count: 0, 
        sample: [],
        ...(returnFull ? { contacts: [] } : {}),
        totalPatients,
        eligibleCount: 0,
        invalidCount: totalPatients
      } 
    });
  } catch (e: any) {
    console.error('Audience endpoint error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
