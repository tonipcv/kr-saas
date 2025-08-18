import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16",
});

// GET /api/v2/doctor/stripe-connect - Get the Stripe Connect account status
export async function GET(req: NextRequest) {
  try {
    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    
    // Check if user is a doctor
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== "DOCTOR") {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Only doctors can access Stripe Connect." },
        { status: 403 }
      );
    }

    // Check if the user already has a Stripe Connect account
    if (!user.stripe_connect_id) {
      return NextResponse.json({
        success: true,
        data: {
          connected: false,
          message: "Stripe Connect account not linked",
        },
      });
    }

    try {
      // Retrieve the account details from Stripe
      const account = await stripe.accounts.retrieve(user.stripe_connect_id);
      
      return NextResponse.json({
        success: true,
        data: {
          connected: true,
          account_id: user.stripe_connect_id,
          details_submitted: account.details_submitted,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
        },
      });
    } catch (stripeError) {
      console.error("Error retrieving Stripe account:", stripeError);
      return NextResponse.json({
        success: true,
        data: {
          connected: false,
          message: "Error retrieving Stripe account information",
        },
      });
    }
  } catch (error) {
    console.error("Error checking Stripe Connect status:", error);
    return NextResponse.json(
      { success: false, message: "Failed to check Stripe Connect status" },
      { status: 500 }
    );
  }
}

// POST /api/v2/doctor/stripe-connect - Create or connect a Stripe Connect account
export async function POST(req: NextRequest) {
  try {
    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    
    // Check if user is a doctor
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        stripe_connect_id: true,
      },
    });

    if (!user || user.role !== "DOCTOR") {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Only doctors can create Stripe Connect accounts." },
        { status: 403 }
      );
    }

    // Check if the user already has a Stripe Connect account
    if (user.stripe_connect_id) {
      // Generate an account link for the existing account
      const accountLink = await stripe.accountLinks.create({
        account: user.stripe_connect_id,
        refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/doctor/settings?stripe=refresh`,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/doctor/settings?stripe=success`,
        type: "account_onboarding",
      });

      return NextResponse.json({
        success: true,
        data: {
          url: accountLink.url,
          message: "Stripe Connect account already exists. Redirecting to onboarding.",
        },
      });
    }

    // Create a new Stripe Connect account
    const account = await stripe.accounts.create({
      type: "express",
      country: "BR",
      email: user.email,
      business_type: "individual",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        name: user.name || undefined,
        product_description: "Medical services",
      },
      metadata: {
        user_id: user.id,
      },
    });

    // Update user with the Stripe Connect account ID
    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripe_connect_id: account.id,
      },
    });

    // Generate an account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/doctor/settings?stripe=refresh`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/doctor/settings?stripe=success`,
      type: "account_onboarding",
    });

    return NextResponse.json({
      success: true,
      data: {
        account_id: account.id,
        url: accountLink.url,
        message: "Stripe Connect account created. Redirecting to onboarding.",
      },
    });
  } catch (error: any) {
    console.error("Error creating Stripe Connect account:", error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeInvalidRequestError') {
      // Check for platform profile setup error
      if (error.message && error.message.includes('responsibilities of managing losses')) {
        return NextResponse.json(
          { 
            success: false, 
            message: "Your Stripe account requires additional setup. Please log into your Stripe Dashboard and complete the platform profile setup.",
            details: "Go to Settings > Connect settings > Platform profile and review the responsibilities for managing losses."
          },
          { status: 400 }
        );
      }
    }
    
    return NextResponse.json(
      { success: false, message: "Failed to create Stripe Connect account", details: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// DELETE /api/v2/doctor/stripe-connect - Disconnect Stripe Connect account
export async function DELETE(req: NextRequest) {
  try {
    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    
    // Check if user is a doctor
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== "DOCTOR") {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Only doctors can disconnect Stripe Connect." },
        { status: 403 }
      );
    }

    // Check if the user has a Stripe Connect account
    if (!user.stripe_connect_id) {
      return NextResponse.json({
        success: false,
        message: "No Stripe Connect account to disconnect",
      }, { status: 400 });
    }

    // We don't actually delete the Stripe account, just disconnect it from our system
    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripe_connect_id: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Stripe Connect account disconnected successfully",
    });
  } catch (error) {
    console.error("Error disconnecting Stripe Connect account:", error);
    return NextResponse.json(
      { success: false, message: "Failed to disconnect Stripe Connect account" },
      { status: 500 }
    );
  }
}
