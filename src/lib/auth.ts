import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
// GoogleProvider removed to enforce email + code (2FA) only login
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { emitEvent } from '@/lib/events';
import { EventActor, EventType } from '@prisma/client';
import { compare } from "bcryptjs";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string | null;
      activeDoctorSlug?: string | null;
      activeDoctorId?: string | null;
      accessGranted?: boolean | null;
    }
  }

  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string | null;
    doctor_slug?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string | null;
    activeDoctorSlug?: string | null;
    activeDoctorId?: string | null;
    accessGranted?: boolean | null;
  }
}

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials");
        }

        const email = credentials.email.toLowerCase().trim();
        const user = await prisma.user.findUnique({
          where: { email },
          // Select only needed fields to avoid fetching legacy/problematic columns
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
            password: true,
            doctor_slug: true,
          },
        });

        if (!user) {
          throw new Error("Invalid credentials");
        }
        
        // Verificar se é uma autenticação via token
        if (credentials.password.startsWith('token:')) {
          // Extrair o token da string
          const token = credentials.password.substring(6);
          
          try {
            // Verificar o token JWT
            // Keep in sync with src/app/api/auth/register/verify/route.ts
            const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || 'your-secret-key';
            const decoded = require('jsonwebtoken').verify(token, secret);
            
            // Verificar se o token pertence ao usuário correto
            if (decoded.email !== user.email) {
              throw new Error("Token não pertence a este usuário");
            }
            
            console.log('Autenticação via token bem-sucedida para:', user.email);
            
            // Token válido, autenticar o usuário
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.image,
              role: user.role,
            };
          } catch (error) {
            console.error('Erro ao verificar token JWT:', error);
            throw new Error("Token inválido ou expirado");
          }
        }
        
        // Bloquear login apenas com senha: exigir 2FA via token (password deve começar com 'token:')
        // Neste ponto, se chegou aqui sem o prefixo 'token:', o fluxo correto é:
        // 1) validar senha via /api/auth/password/verify
        // 2) enviar código via /api/auth/register/email
        // 3) validar código em /api/auth/register/verify e obter JWT
        // 4) chamar signIn('credentials', { email, password: 'token:' + jwt })
        throw new Error("Two-factor authentication required");
      }
    })
  ],
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
    // Force re-authentication after 2 hours for security
    maxAge: 2 * 60 * 60, // 2 hours in seconds
  },
  jwt: {
    // JWT token validity matches session policy (2 hours)
    maxAge: 2 * 60 * 60, // 2 hours in seconds
  },
  callbacks: {
    async jwt({ token, user }) {
      // Persist existing values across calls
      token.role = token.role ?? null;
      token.activeDoctorSlug = token.activeDoctorSlug ?? null;
      token.activeDoctorId = token.activeDoctorId ?? null;
      token.accessGranted = token.accessGranted ?? null;

      if (user) {
        token.role = user.role;
        // On initial sign-in, if the user is a doctor, set active doctor context by their own slug
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true, role: true, doctor_slug: true, accessGranted: true },
          });
          if (dbUser?.role === 'DOCTOR' && dbUser.doctor_slug) {
            token.activeDoctorSlug = dbUser.doctor_slug;
            token.activeDoctorId = dbUser.id;
          }
          token.accessGranted = dbUser?.accessGranted ?? false;
        } catch (e) {
          // noop: avoid breaking auth on lookup errors
        }
      }
      if (!user && token?.sub && (token.accessGranted == null)) {
        try {
          const dbUser = await prisma.user.findUnique({ where: { id: token.sub }, select: { accessGranted: true } });
          token.accessGranted = dbUser?.accessGranted ?? false;
        } catch {}
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.sub!;
        session.user.role = token.role;
        session.user.activeDoctorSlug = token.activeDoctorSlug ?? null;
        session.user.activeDoctorId = token.activeDoctorId ?? null;
        session.user.accessGranted = token.accessGranted ?? false;

        // Always refresh basic user fields from DB to reflect latest profile updates
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub! },
            select: { name: true, email: true, image: true, role: true, doctor_slug: true, id: true, accessGranted: true },
          });
          if (dbUser) {
            session.user.name = dbUser.name ?? session.user.name;
            session.user.email = dbUser.email ?? session.user.email;
            session.user.image = dbUser.image ?? session.user.image;
            // Keep role and active doctor context in sync if they changed
            if (dbUser.role && dbUser.role !== session.user.role) {
              session.user.role = dbUser.role;
            }
            if (dbUser.role === 'DOCTOR' && dbUser.doctor_slug) {
              session.user.activeDoctorSlug = dbUser.doctor_slug;
              session.user.activeDoctorId = dbUser.id;
            }
            if (typeof dbUser.accessGranted === 'boolean') {
              session.user.accessGranted = dbUser.accessGranted;
            }
          }
        } catch (e) {
          // Avoid breaking session on lookup errors
        }
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      try {
        // Resolve clinicId differently for PATIENT vs DOCTOR/STAFF to ensure events appear on doctor events page
        let clinicId: string | null = null;

        const roleRaw = (user as any)?.role || null;
        const role = typeof roleRaw === 'string'
          ? (roleRaw.toLowerCase() === 'super admin' || roleRaw.toLowerCase() === 'super_admin'
              ? 'super_admin'
              : roleRaw.toLowerCase())
          : null;
        if (role === 'PATIENT') {
          // Find patient's active doctor, then infer that doctor's clinic
          try {
            const rel = await prisma.doctorPatientRelationship.findFirst({
              where: { patientId: user.id, isActive: true },
              select: { doctorId: true },
            });
            if (rel?.doctorId) {
              // Prefer clinic owned by doctor
              const owned = await prisma.clinic.findFirst({ where: { ownerId: rel.doctorId }, select: { id: true } });
              if (owned?.id) clinicId = owned.id;
              // Fallback: first clinic where doctor is a member
              if (!clinicId) {
                const membership = await prisma.clinicMember.findFirst({ where: { userId: rel.doctorId, isActive: true }, select: { clinicId: true } });
                if (membership?.clinicId) clinicId = membership.clinicId;
              }
            }
          } catch (e) {
            console.warn('[auth.signIn] Failed to resolve clinic for PATIENT via relationship', e);
          }
        }

        // For doctors or staff, keep previous heuristic on their own identity
        if (!clinicId) {
          try {
            const owned = await prisma.clinic.findFirst({ where: { ownerId: user.id }, select: { id: true } });
            if (owned?.id) clinicId = owned.id;
          } catch {}
        }
        if (!clinicId) {
          try {
            const membership = await prisma.clinicMember.findFirst({ where: { userId: user.id, isActive: true }, select: { clinicId: true } });
            if (membership?.clinicId) clinicId = membership.clinicId;
          } catch {}
        }

        if (clinicId) {
          await emitEvent({
            eventType: EventType.user_logged_in,
            actor: EventActor.system,
            clinicId,
            metadata: { user_id: user.id, role: role as any },
          });
        } else {
          console.warn('[events] user_logged_in not emitted: clinicId unresolved for user', user.id, 'role', role);
        }
      } catch (e) {
        console.error('[events] user_logged_in emit failed', e);
      }
    },
  },
};