'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeftIcon,
  ShoppingBagIcon,
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function CreateProductPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    brand: '',
    imageUrl: '',
    originalPrice: '',
    discountPrice: '',
    discountPercentage: '',
    purchaseUrl: '',
    usageStats: '0',
    creditsPerUnit: '',
    isActive: true
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Auto-calculate discount percentage
    if (field === 'originalPrice' || field === 'discountPrice') {
      const original = field === 'originalPrice' ? parseFloat(value as string) : parseFloat(formData.originalPrice);
      const discount = field === 'discountPrice' ? parseFloat(value as string) : parseFloat(formData.discountPrice);
      
      if (original && discount && original > discount) {
        const percentage = Math.round(((original - discount) / original) * 100);
        setFormData(prev => ({
          ...prev,
          [field]: value,
          discountPercentage: percentage.toString()
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert('Name is required');
      return;
    }

    try {
      setIsLoading(true);
      
      const payload: any = {
        ...formData,
        // normalize numeric fields
        originalPrice: formData.originalPrice ? Number(formData.originalPrice) : undefined,
        discountPrice: formData.discountPrice ? Number(formData.discountPrice) : undefined,
        usageStats: formData.usageStats ? Number(formData.usageStats) : undefined,
        creditsPerUnit: formData.creditsPerUnit ? Number(formData.creditsPerUnit) : undefined,
      };

      const response = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push('/doctor/products');
      } else {
        const error = await response.json();
        alert(error.error || 'Error creating product');
      }
    } catch (error) {
      console.error('Error creating product:', error);
      alert('Error creating product');
    } finally {
      setIsLoading(false);
    }
  };

  const formatPrice = (price: string) => {
    if (!price) return '';
    const num = parseFloat(price);
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num);
  };

  const getDiscountPercentage = () => {
    const original = parseFloat(formData.originalPrice);
    const discount = parseFloat(formData.discountPrice);
    if (original && discount && original > discount) {
      return Math.round(((original - discount) / original) * 100);
    }
    return 0;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
        
          {/* Header */}
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" asChild className="h-9 rounded-xl px-3 border border-gray-200 text-gray-700 hover:bg-gray-50">
              <Link href="/doctor/products">
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">New Product</h1>
              <p className="text-sm text-gray-500 mt-1">Add a new product to recommend to clients</p>
            </div>
          </div>

          <div>
            {/* Form */}
            <div>
              <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* Basic Information */}
                <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-gray-900">Basic Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <Label htmlFor="name" className="text-gray-900 font-medium">Product Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="e.g., Ultra Light Sunscreen"
                        required
                        className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10"
                      />
                    </div>

                    <div>
                      <Label htmlFor="brand" className="text-gray-900 font-medium">Brand</Label>
                      <Input
                        id="brand"
                        value={formData.brand}
                        onChange={(e) => handleInputChange('brand', e.target.value)}
                        placeholder="e.g., La Roche-Posay"
                        className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10"
                      />
                    </div>

                    <div>
                      <Label htmlFor="description" className="text-gray-900 font-medium">Description</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        placeholder="Describe the product and its benefits..."
                        rows={4}
                        className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl"
                      />
                    </div>

                    <div>
                      <Label htmlFor="imageUrl" className="text-gray-900 font-medium">Image URL</Label>
                      <Input
                        id="imageUrl"
                        value={formData.imageUrl}
                        onChange={(e) => handleInputChange('imageUrl', e.target.value)}
                        placeholder="https://example.com/image.jpg"
                        type="url"
                        className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Pricing */}
                <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-gray-900">Pricing</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="originalPrice" className="text-gray-900 font-medium">Original Price</Label>
                        <Input
                          id="originalPrice"
                          value={formData.originalPrice}
                          onChange={(e) => handleInputChange('originalPrice', e.target.value)}
                          placeholder="0.00"
                          type="number"
                          step="0.01"
                          min="0"
                          className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10"
                        />
                      </div>

                      <div>
                        <Label htmlFor="discountPrice" className="text-gray-900 font-medium">Discount Price</Label>
                        <Input
                          id="discountPrice"
                          value={formData.discountPrice}
                          onChange={(e) => handleInputChange('discountPrice', e.target.value)}
                          placeholder="0.00"
                          type="number"
                          step="0.01"
                          min="0"
                          className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10"
                        />
                      </div>
                    </div>

                    {getDiscountPercentage() > 0 && (
                      <div className="p-4 bg-[#5154e7] bg-opacity-10 rounded-xl border border-[#5154e7] border-opacity-20">
                        <p className="text-[#5154e7] font-semibold">
                          Calculated discount: {getDiscountPercentage()}%
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Points */}
                <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-gray-900">Points</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div>
                      <Label htmlFor="creditsPerUnit" className="text-gray-900 font-medium">Points per Unit</Label>
                      <Input
                        id="creditsPerUnit"
                        value={formData.creditsPerUnit}
                        onChange={(e) => handleInputChange('creditsPerUnit', e.target.value)}
                        placeholder="0"
                        type="number"
                        min="0"
                        className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Purchase Details */}
                <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-gray-900">Purchase Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <Label htmlFor="purchaseUrl" className="text-gray-900 font-medium">Purchase Link</Label>
                      <Input
                        id="purchaseUrl"
                        value={formData.purchaseUrl}
                        onChange={(e) => handleInputChange('purchaseUrl', e.target.value)}
                        placeholder="https://store.com/product"
                        type="url"
                        className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10"
                      />
                    </div>

                    <div>
                      <Label htmlFor="usageStats" className="text-gray-900 font-medium">Usage Statistics (%)</Label>
                      <Input
                        id="usageStats"
                        value={formData.usageStats}
                        onChange={(e) => handleInputChange('usageStats', e.target.value)}
                        placeholder="0"
                        type="number"
                        min="0"
                        max="100"
                        className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10"
                      />
                      <p className="text-sm text-gray-500 font-medium mt-2">
                        Percentage of clients who use this product
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Status */}
                <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-gray-900">Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="isActive" className="text-gray-900 font-medium">Active Product</Label>
                        <p className="text-gray-500 font-medium mt-1">
                          Active products can be recommended in protocols
                        </p>
                      </div>
                      <Switch
                        id="isActive"
                        checked={formData.isActive}
                        onCheckedChange={(checked) => handleInputChange('isActive', checked)}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button type="submit" disabled={isLoading} className="flex-1 bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-10 shadow-sm font-medium">
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Creating...
                      </>
                    ) : (
                      <>
                        <CheckIcon className="h-4 w-4 mr-2" />
                        Create Product
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="outline" asChild className="border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-xl h-10 px-4 shadow-sm font-medium">
                    <Link href="/doctor/products">
                      <XMarkIcon className="h-4 w-4 mr-2" />
                      Cancel
                    </Link>
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 