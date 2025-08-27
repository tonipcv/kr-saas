import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";
import { createVerificationEmail } from "@/email-templates/auth/verification";

if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.SMTP_FROM) {
  throw new Error('Missing SMTP configuration environment variables');
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true, // use SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

export async function POST(req: Request) {
  try {
    const { name, email, password, doctorId } = await req.json();

    // Basic validation
    if (!name || !email || !password) {
      return NextResponse.json(
        { message: "All fields are required" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    // Variable to store the user ID (new or existing)
    let userId;

    // If the user already exists, update their data instead of creating a new one
    if (existingUser) {
      console.log('User already exists, updating data:', { email, name });
      
      // Update existing user data
      const updatedUser = await prisma.user.update({
        where: { email },
        data: {
          name, // Update the name if different
          is_active: true, // Ensure the user is active
        },
      });
      
      userId = updatedUser.id;
    }

    // Generate verification code (6 digits)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Validate doctorId if provided
    let doctor = null;
    if (doctorId) {
      doctor = await prisma.user.findFirst({
        where: {
          id: doctorId,
          role: 'DOCTOR',
          is_active: true
        }
      });
      
      if (!doctor) {
        return NextResponse.json(
          { message: "Doctor not found" },
          { status: 404 }
        );
      }
    }

    // Create or use existing user
    let user;
    
    if (!existingUser) {
      // Generate a unique ID for the new user
      const newUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      
      // Create new user if not exists
      user = await prisma.user.create({
        data: {
          id: newUserId,
          name,
          email,
          password: hashedPassword,
          email_verified: null,
          role: 'PATIENT' // Ensure the user is created as patient
        },
      });
      
      userId = user.id;
      
      // Create verification token for new users
      await prisma.verificationToken.create({
        data: {
          identifier: email,
          token: verificationCode,
          expires: codeExpiry
        }
      });
    } else {
      // Use the already updated existing user
      user = existingUser;
    }
    
    // If there is an associated doctor, check if relationship exists and create if not
    if (doctor) {
      // Check if there is already a doctor-patient relationship
      const existingRelation = await prisma.doctorPatientRelationship.findFirst({
        where: {
          doctorId: doctorId,
          patientId: user.id
        }
      });
      
      if (!existingRelation) {
        // Log that the patient came via the doctor's link
        await prisma.doctorPatientRelationship.create({
          data: {
            doctorId: doctorId,
            patientId: user.id,
            // Remove field source that does not exist in the model
            status: 'ACTIVE'
          }
        });
        
        // Acquisition log (using console.log as accessLog model does not exist)
        console.log('PATIENT_REGISTRATION_VIA_DOCTOR_LINK', {
          user_id: user.id,
          action: 'PATIENT_REGISTRATION_VIA_DOCTOR_LINK',
          details: `Registration via doctor link ${doctorId}`,
          ip_address: req.headers.get('x-forwarded-for') || 'unknown'
        });
      } else {
        console.log('Doctor-patient relationship already exists:', {
          doctor_id: doctorId,
          patient_id: user.id
        });
      }
    }

    // Send verification email only for new users
    if (!existingUser) {
      console.log('Sending verification email to new user:', email);
      
      // Send verification email using new template
      try {
        await transporter.verify();
        console.log('SMTP connection verified');

        const emailHtml = createVerificationEmail({
          name,
          code: verificationCode,
          expiryHours: 1
        });

        await transporter.sendMail({
          from: {
            name: 'Zuzz',
            address: process.env.SMTP_FROM as string
          },
          to: email,
          subject: '[Zuzz] Verify Your Email',
          html: emailHtml
        });

        console.log('Verification email sent successfully');
      } catch (emailError) {
        console.error('Email sending error:', emailError);
        // If email fails, delete the user and verification token
        await prisma.user.delete({
          where: { id: user.id }
        });
        await prisma.verificationToken.delete({
          where: {
            identifier_token: {
              identifier: email,
              token: verificationCode
            }
          }
        });
        throw emailError;
      }
    } else {
      console.log('Existing user, skipping verification email:', email);
    }

    // Custom message depending on whether it is a new or existing user
    const message = existingUser
      ? "Account updated successfully. Redirecting to the doctor area."
      : "User created successfully. Check your email to confirm registration.";
    
    const statusCode = existingUser ? 200 : 201; // 200 for update, 201 for creation
    
    return NextResponse.json(
      {
        message,
        userId: user.id,
        isNewUser: !existingUser,
        doctorId: doctorId || null
      },
      { status: statusCode }
    );
  } catch (error) {
    console.error("Registration error:", error);
    // Provide a more detailed error message
    let errorMessage = "Error creating user";
    
    if (error instanceof Error) {
      errorMessage = `Error creating user: ${error.message}`;
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    
    return NextResponse.json(
      { message: errorMessage, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
 