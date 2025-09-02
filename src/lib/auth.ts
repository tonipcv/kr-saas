import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
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
  }
}

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
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

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          }
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
            const secret = process.env.NEXTAUTH_SECRET || 'default-secret-key';
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
        
        // Autenticação normal com senha
        if (!user.password) {
          throw new Error("Invalid credentials");
        }

        const isPasswordValid = await compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error("Invalid credentials");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      }
    })
  ],
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      // Persist existing values across calls
      token.role = token.role ?? null;
      token.activeDoctorSlug = token.activeDoctorSlug ?? null;
      token.activeDoctorId = token.activeDoctorId ?? null;

      if (user) {
        token.role = user.role;
        // On initial sign-in, if the user is a doctor, set active doctor context by their own slug
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true, role: true, doctor_slug: true },
          });
          if (dbUser?.role === 'DOCTOR' && dbUser.doctor_slug) {
            token.activeDoctorSlug = dbUser.doctor_slug;
            token.activeDoctorId = dbUser.id;
          }
        } catch (e) {
          // noop: avoid breaking auth on lookup errors
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.sub!;
        session.user.role = token.role;
        session.user.activeDoctorSlug = token.activeDoctorSlug ?? null;
        session.user.activeDoctorId = token.activeDoctorId ?? null;

        // Always refresh basic user fields from DB to reflect latest profile updates
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub! },
            select: { name: true, email: true, image: true, role: true, doctor_slug: true, id: true },
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
          }
        } catch (e) {
          // Avoid breaking session on lookup errors
        }
      }
      return session;
    },
  },
}; 