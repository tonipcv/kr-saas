import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import { FeeType, FeeVisibility, ServiceAvailability } from "@prisma/client";

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

// GET /api/v2/doctor/services - List all services for the authenticated doctor
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
        { success: false, message: "Unauthorized. Only doctors can access services." },
        { status: 403 }
      );
    }

    // Get all services for this doctor
    const services = await prisma.doctorService.findMany({
      where: {
        doctor_id: userId,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      data: services,
    });
  } catch (error) {
    console.error("Error fetching doctor services:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch services" },
      { status: 500 }
    );
  }
}

// POST /api/v2/doctor/services - Create a new service for the authenticated doctor
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
    });

    if (!user || user.role !== "DOCTOR") {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Only doctors can create services." },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await req.json();
    const {
      name,
      description,
      duration,
      fee_type,
      fee,
      fee_visibility,
      availability,
      button_label,
      confirmation_label,
      redirect_url,
    } = body;

    // Validate required fields
    if (!name) {
      return NextResponse.json(
        { success: false, message: "Service name is required" },
        { status: 400 }
      );
    }

    // Validate fee_type enum
    if (fee_type && !Object.values(FeeType).includes(fee_type)) {
      return NextResponse.json(
        { success: false, message: "Invalid fee type" },
        { status: 400 }
      );
    }

    // Validate fee_visibility enum
    if (fee_visibility && !Object.values(FeeVisibility).includes(fee_visibility)) {
      return NextResponse.json(
        { success: false, message: "Invalid fee visibility" },
        { status: 400 }
      );
    }

    // Validate availability array
    if (availability && Array.isArray(availability)) {
      for (const item of availability) {
        if (!Object.values(ServiceAvailability).includes(item)) {
          return NextResponse.json(
            { success: false, message: "Invalid service availability option" },
            { status: 400 }
          );
        }
      }
    }

    // Create Stripe product and price if fee is provided
    let stripeProductId = null;
    let stripePriceId = null;

    if (fee && user.stripe_connect_id) {
      try {
        // Create a product in Stripe
        const product = await stripe.products.create({
          name,
          description: description || undefined,
          metadata: {
            doctor_id: userId,
          },
        }, {
          stripeAccount: user.stripe_connect_id, // Use the doctor's connected account
        });

        stripeProductId = product.id;

        // Create a price for the product
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: Math.round(fee * 100), // Convert to cents
          currency: 'brl',
          recurring: fee_type === FeeType.ONGOING ? { interval: 'month' } : undefined,
        }, {
          stripeAccount: user.stripe_connect_id, // Use the doctor's connected account
        });

        stripePriceId = price.id;
      } catch (stripeError) {
        console.error("Error creating Stripe product/price:", stripeError);
        // Continue without Stripe integration if it fails
      }
    }

    // Create the service in the database
    const service = await prisma.doctorService.create({
      data: {
        doctor_id: userId,
        name,
        description,
        duration: duration || 30,
        fee_type: fee_type || FeeType.FIXED,
        fee,
        fee_visibility: fee_visibility || FeeVisibility.DISPLAY_FEE,
        availability: availability || [],
        button_label: button_label || "Book Appointment",
        confirmation_label: confirmation_label || "Appointment Confirmed",
        redirect_url,
        stripe_product_id: stripeProductId,
        stripe_price_id: stripePriceId,
      },
    });

    return NextResponse.json({
      success: true,
      data: service,
      message: "Service created successfully",
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating doctor service:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create service" },
      { status: 500 }
    );
  }
}
