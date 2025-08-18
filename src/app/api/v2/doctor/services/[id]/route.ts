import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import { FeeType, FeeVisibility, ServiceAvailability } from "@prisma/client";

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

// GET /api/v2/doctor/services/[id] - Get a specific service by ID
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

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

    // Get the service
    const service = await prisma.doctorService.findUnique({
      where: {
        id,
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, message: "Service not found" },
        { status: 404 }
      );
    }

    // Check if the service belongs to the authenticated doctor
    if (service.doctor_id !== userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. You can only access your own services." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: service,
    });
  } catch (error) {
    console.error("Error fetching doctor service:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch service" },
      { status: 500 }
    );
  }
}

// PATCH /api/v2/doctor/services/[id] - Update a specific service
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

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
        { success: false, message: "Unauthorized. Only doctors can update services." },
        { status: 403 }
      );
    }

    // Check if the service exists and belongs to the doctor
    const existingService = await prisma.doctorService.findUnique({
      where: { id },
    });

    if (!existingService) {
      return NextResponse.json(
        { success: false, message: "Service not found" },
        { status: 404 }
      );
    }

    if (existingService.doctor_id !== userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. You can only update your own services." },
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
      is_active,
    } = body;

    // Validate fee_type enum if provided
    if (fee_type && !Object.values(FeeType).includes(fee_type)) {
      return NextResponse.json(
        { success: false, message: "Invalid fee type" },
        { status: 400 }
      );
    }

    // Validate fee_visibility enum if provided
    if (fee_visibility && !Object.values(FeeVisibility).includes(fee_visibility)) {
      return NextResponse.json(
        { success: false, message: "Invalid fee visibility" },
        { status: 400 }
      );
    }

    // Validate availability array if provided
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

    // Update Stripe product and price if fee is updated and stripe_connect_id exists
    let stripeProductId = existingService.stripe_product_id;
    let stripePriceId = existingService.stripe_price_id;

    if (fee !== undefined && user.stripe_connect_id && (fee !== existingService.fee || fee_type !== existingService.fee_type)) {
      try {
        if (stripeProductId) {
          // Update existing product
          await stripe.products.update(
            stripeProductId,
            {
              name: name || existingService.name,
              description: description !== undefined ? description : existingService.description || undefined,
            },
            {
              stripeAccount: user.stripe_connect_id,
            }
          );

          // Create a new price (Stripe doesn't allow updating prices)
          const price = await stripe.prices.create(
            {
              product: stripeProductId,
              unit_amount: Math.round(fee * 100), // Convert to cents
              currency: 'brl',
              recurring: (fee_type || existingService.fee_type) === FeeType.ONGOING ? { interval: 'month' } : undefined,
            },
            {
              stripeAccount: user.stripe_connect_id,
            }
          );

          stripePriceId = price.id;
        } else if (user.stripe_connect_id) {
          // Create new product and price if they don't exist
          const product = await stripe.products.create(
            {
              name: name || existingService.name,
              description: description !== undefined ? description : existingService.description || undefined,
              metadata: {
                doctor_id: userId,
              },
            },
            {
              stripeAccount: user.stripe_connect_id,
            }
          );

          stripeProductId = product.id;

          const price = await stripe.prices.create(
            {
              product: product.id,
              unit_amount: Math.round(fee * 100), // Convert to cents
              currency: 'brl',
              recurring: (fee_type || existingService.fee_type) === FeeType.ONGOING ? { interval: 'month' } : undefined,
            },
            {
              stripeAccount: user.stripe_connect_id,
            }
          );

          stripePriceId = price.id;
        }
      } catch (stripeError) {
        console.error("Error updating Stripe product/price:", stripeError);
        // Continue without Stripe integration if it fails
      }
    }

    // Update the service in the database
    const updatedService = await prisma.doctorService.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        description: description !== undefined ? description : undefined,
        duration: duration !== undefined ? duration : undefined,
        fee_type: fee_type !== undefined ? fee_type : undefined,
        fee: fee !== undefined ? fee : undefined,
        fee_visibility: fee_visibility !== undefined ? fee_visibility : undefined,
        availability: availability !== undefined ? availability : undefined,
        button_label: button_label !== undefined ? button_label : undefined,
        confirmation_label: confirmation_label !== undefined ? confirmation_label : undefined,
        redirect_url: redirect_url !== undefined ? redirect_url : undefined,
        is_active: is_active !== undefined ? is_active : undefined,
        stripe_product_id: stripeProductId,
        stripe_price_id: stripePriceId,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedService,
      message: "Service updated successfully",
    });
  } catch (error) {
    console.error("Error updating doctor service:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update service" },
      { status: 500 }
    );
  }
}

// DELETE /api/v2/doctor/services/[id] - Delete a specific service
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

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
        { success: false, message: "Unauthorized. Only doctors can delete services." },
        { status: 403 }
      );
    }

    // Check if the service exists and belongs to the doctor
    const existingService = await prisma.doctorService.findUnique({
      where: { id },
    });

    if (!existingService) {
      return NextResponse.json(
        { success: false, message: "Service not found" },
        { status: 404 }
      );
    }

    if (existingService.doctor_id !== userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. You can only delete your own services." },
        { status: 403 }
      );
    }

    // Delete the associated Stripe product if it exists
    if (existingService.stripe_product_id && user.stripe_connect_id) {
      try {
        await stripe.products.update(
          existingService.stripe_product_id,
          { active: false },
          { stripeAccount: user.stripe_connect_id }
        );
      } catch (stripeError) {
        console.error("Error archiving Stripe product:", stripeError);
        // Continue with deletion even if Stripe operation fails
      }
    }

    // Delete the service from the database
    await prisma.doctorService.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Service deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting doctor service:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete service" },
      { status: 500 }
    );
  }
}
