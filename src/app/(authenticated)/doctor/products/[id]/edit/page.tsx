'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { 
  ArrowLeftIcon,
  ShoppingBagIcon,
  CheckIcon,
  XMarkIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProtocolImagePicker } from '@/components/protocol/protocol-image-picker';

interface Product {
  id: string;
  name: string;
  description?: string;
  brand?: string;
  imageUrl?: string;
  originalPrice?: number;
  discountPrice?: number;
  discountPercentage?: number;
  purchaseUrl?: string;
  usageStats?: number;
  creditsPerUnit?: number;
  category?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditProductPage({ params }: PageProps) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [productId, setProductId] = useState<string>('');
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [categoriesLoading, setCategoriesLoading] = useState<boolean>(false);
  const [creatingCategory, setCreatingCategory] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');

  interface FormValues {
    name: string;
    subtitle: string;
    description: string;
    brand: string;
    imageUrl: string;
    originalPrice: string;
    discountPrice: string;
    discountPercentage: string;
    purchaseUrl: string;
    usageStats: string;
    creditsPerUnit: string;
    category: string;
    isActive: boolean;
    confirmationUrl?: string;
  }

  const [formData, setFormData] = useState<FormValues>({
    name: '',
    subtitle: '',
    description: '',
    brand: '',
    imageUrl: '',
    originalPrice: '',
    discountPrice: '',
    discountPercentage: '',
    purchaseUrl: '',
    usageStats: '0',
    creditsPerUnit: '',
    category: '',
    isActive: true,
    confirmationUrl: ''
  });
  const [images, setImages] = useState<Array<{ id?: string; url: string; kind?: string; orderIndex?: number }>>([]);
  const [isImagesLoading, setIsImagesLoading] = useState(false);
  const [isSavingImages, setIsSavingImages] = useState(false);
  const [beforeImageUrl, setBeforeImageUrl] = useState<string>('');
  const [afterImageUrl, setAfterImageUrl] = useState<string>('');
  // WhatsApp modal state
  const [waModalOpen, setWaModalOpen] = useState<boolean>(false);
  const [waNumber, setWaNumber] = useState<string>('');
  const [waText, setWaText] = useState<string>('Olá, tenho interesse no {{nome do produto}}!');

  const getWhatsAppLink = () => {
    const digits = (waNumber || '').replace(/\D/g, '');
    if (!digits) return '';
    const message = (waText || '').replace(/\{\{\s*nome do produto\s*\}\}/gi, formData.name || 'produto');
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  };

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params;
      setProductId(resolvedParams.id);
    };
    getParams();
  }, [params]);

  useEffect(() => {
    if (productId) {
      loadProduct();
    }
  }, [productId]);

  useEffect(() => {
    // load categories for doctor
    const fetchCategories = async () => {
      try {
        setCategoriesLoading(true);
        const res = await fetch('/api/product-categories');
        if (res.ok) {
          const data = await res.json();
          setCategories(data || []);
        }
      } catch (e) {
        console.error('Error fetching categories', e);
      } finally {
        setCategoriesLoading(false);
      }
    };
    fetchCategories();
  }, []);

  const loadProduct = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/products/${productId}`);
      if (response.ok) {
        const data = await response.json();
        setProduct(data);
        setFormData({
          name: data.name || '',
          subtitle: data.subtitle || '',
          description: data.description || '',
          brand: data.brand || '',
          imageUrl: data.imageUrl || '',
          originalPrice: (data.originalPrice ?? data.price ?? '')?.toString() || '',
          discountPrice: (data.discountPrice ?? '')?.toString() || '',
          discountPercentage: (data.discountPercentage ?? '')?.toString() || '',
          purchaseUrl: data.purchaseUrl || '',
          usageStats: (data.usageStats ?? '0')?.toString(),
          creditsPerUnit: (data.creditsPerUnit ?? '')?.toString() || '',
          category: data.category || '',
          isActive: data.isActive,
          confirmationUrl: data.confirmationUrl || ''
        });
        if (Array.isArray(data.images)) {
          const before = data.images.find((it: any) => (it.kind || '').toUpperCase() === 'BEFORE');
          const after = data.images.find((it: any) => (it.kind || '').toUpperCase() === 'AFTER');
          setBeforeImageUrl(before?.url || '');
          setAfterImageUrl(after?.url || '');
          const gallery = data.images.filter((it: any) => (it.kind || '').toUpperCase() === 'GALLERY' || !it.kind);
          setImages(gallery.map((it: any) => ({ id: it.id, url: it.url, kind: 'GALLERY', orderIndex: it.orderIndex })));
        }
      } else {
        router.push('/doctor/products');
      }
    } catch (error) {
      console.error('Error loading product:', error);
      router.push('/doctor/products');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Auto-calculate discount percentage like create page
    if (field === 'originalPrice' || field === 'discountPrice') {
      const original = field === 'originalPrice' ? parseFloat(value as string) : parseFloat((formData.originalPrice as string));
      const discount = field === 'discountPrice' ? parseFloat(value as string) : parseFloat((formData.discountPrice as string));
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
      setIsSaving(true);

      const payload: any = {
        name: formData.name,
        description: formData.description,
        // API expects originalPrice and creditsPerUnit
        originalPrice: formData.originalPrice ? Number(formData.originalPrice) : undefined,
        creditsPerUnit: formData.creditsPerUnit ? Number(formData.creditsPerUnit) : undefined,
        imageUrl: formData.imageUrl?.trim() ? formData.imageUrl.trim() : null,
        category: formData.category,
        isActive: formData.isActive,
        confirmationUrl: formData.confirmationUrl?.trim() || null,
        // extra fields preserved (ignored by API but safe)
        discountPrice: formData.discountPrice ? Number(formData.discountPrice) : undefined,
        discountPercentage: formData.discountPercentage ? Number(formData.discountPercentage) : undefined,
      };

      const response = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push('/doctor/products');
      } else {
        const error = await response.json();
        alert(error.error || 'Error updating product');
      }
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Error updating product');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      return;
    }

    try {
      setIsDeleting(true);
      
      const response = await fetch(`/api/products/${productId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/doctor/products');
      } else {
        const error = await response.json();
        alert(error.error || 'Error deleting product');
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Error deleting product');
    } finally {
      setIsDeleting(false);
    }
  };

  const getDiscountPercentage = () => {
    const original = parseFloat(formData.originalPrice);
    const discount = parseFloat(formData.discountPrice);
    if (original && discount && original > discount) {
      return Math.round(((original - discount) / original) * 100);
    }
    return 0;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="container mx-auto p-6 lg:p-8 pt-[88px] lg:pt-8 lg:ml-64">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-gray-200 rounded-full"></div>
                <div className="absolute top-0 left-0 w-16 h-16 border-4 border-[#5154e7] border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold text-gray-900">Loading Product</h3>
                <p className="text-sm text-gray-500">Please wait while we fetch the product details...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-white">
        <div className="container mx-auto p-6 lg:p-8 pt-[88px] lg:pt-8 lg:ml-64">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                <ShoppingBagIcon className="h-8 w-8 text-gray-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-900">Product Not Found</h3>
                <p className="text-sm text-gray-500">The product you're looking for doesn't exist or has been removed.</p>
              </div>
              <Button asChild className="bg-[#5154e7] hover:bg-[#4145d1] text-white">
                <Link href="/doctor/products">Back to Products</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <div className="flex-1 flex items-center justify-between">
            <div>
              <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Edit Product</h1>
              <p className="text-sm text-gray-500 mt-1">
                Update product details
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={handleDelete}
              disabled={isDeleting}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 rounded-xl bg-white h-9"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <TrashIcon className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </div>
        </div>

        <div>
          {/* Form */}
          <div>
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Gallery Manager */}
              <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-gray-900">Galeria de imagens</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Product Image */}
                  <div>
                    <Label className="text-gray-900 font-medium">Product Image</Label>
                    <div className="mt-2">
                      <ProtocolImagePicker
                        selectedImage={formData.imageUrl || ''}
                        onSelectImage={(url) => handleInputChange('imageUrl', url)}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Faça upload de uma imagem ou cole uma URL abaixo.</p>
                  </div>

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
                    <Label htmlFor="subtitle" className="text-gray-900 font-medium">Subtitle</Label>
                    <Input
                      id="subtitle"
                      value={formData.subtitle}
                      onChange={(e) => handleInputChange('subtitle', e.target.value)}
                      placeholder="Breve subtítulo do produto"
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
                    <div className="flex items-center justify-between">
                      <Label htmlFor="confirmationUrl" className="text-gray-900 font-medium">Confirmation URL</Label>
                      <button
                        type="button"
                        className="text-xs text-[#5154e7] hover:underline"
                        onClick={() => setWaModalOpen(true)}
                      >
                        Gerar link de WhatsApp
                      </button>
                    </div>
                    <Input
                      id="confirmationUrl"
                      value={formData.confirmationUrl || ''}
                      onChange={(e) => handleInputChange('confirmationUrl', e.target.value)}
                      placeholder="Ex.: /thank-you ou https://seusite.com/obrigado"
                      className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10"
                    />
                    <p className="text-xs text-gray-500 mt-2">Após o cadastro pelo público, redirecionaremos para esta URL. Pode ser relativa (no mesmo domínio) ou absoluta.</p>
                  </div>

                  <div>
                    <Label htmlFor="category" className="text-gray-900 font-medium">Category</Label>
                    <div className="mt-2">
                      <Select
                        value={formData.category || ''}
                        onValueChange={(val) => {
                          if (val === '__create__') {
                            // trigger create mode
                            setCreatingCategory(true);
                            return;
                          }
                          setCreatingCategory(false);
                          handleInputChange('category', val);
                        }}
                      >
                        <SelectTrigger className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 rounded-xl h-10">
                          <SelectValue placeholder={categoriesLoading ? 'Loading...' : 'Select a category'} />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Current value if not in list */}
                          {formData.category && !categories.some(c => c.name === formData.category) && (
                            <SelectItem value={formData.category}>{formData.category}</SelectItem>
                          )}
                          {categories.map(c => (
                            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                          ))}
                          <SelectItem value="__create__">+ Create new category…</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {creatingCategory && (
                      <div className="mt-3 flex gap-2">
                        <Input
                          id="newCategory"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="New category name"
                          className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10 flex-1"
                        />
                        <Button
                          type="button"
                          className="bg-[#5154e7] hover:bg-[#4145d1] text-white rounded-xl h-10"
                          disabled={!newCategoryName.trim()}
                          onClick={async () => {
                            const name = newCategoryName.trim();
                            if (!name) return;
                            try {
                              const res = await fetch('/api/product-categories', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name })
                              });
                              if (res.ok) {
                                const created = await res.json();
                                // refresh list
                                const listRes = await fetch('/api/product-categories');
                                if (listRes.ok) {
                                  const list = await listRes.json();
                                  setCategories(list || []);
                                }
                                handleInputChange('category', created?.name || name);
                                setNewCategoryName('');
                                setCreatingCategory(false);
                              } else {
                                const err = await res.json();
                                alert(err.error || 'Erro ao criar categoria');
                              }
                            } catch (e) {
                              console.error('Error creating category', e);
                              alert('Erro ao criar categoria');
                            }
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50 rounded-xl h-10"
                          onClick={() => { setCreatingCategory(false); setNewCategoryName(''); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2">Se deixar vazio, será usada a categoria 'Geral'.</p>
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
                    <Label htmlFor="creditsPerUnit" className="text-gray-900 font-medium">Points per purchase</Label>
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
                <Button type="submit" disabled={isSaving} className="flex-1 bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-10 shadow-sm font-medium">
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckIcon className="h-4 w-4 mr-2" />
                      Save Changes
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

      {/* WhatsApp Generator Modal */}
      {waModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setWaModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Gerar link de WhatsApp</h3>
              <button onClick={() => setWaModalOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <Label className="text-gray-900 font-medium">Número de WhatsApp</Label>
                <Input
                  value={waNumber}
                  onChange={(e) => setWaNumber(e.target.value)}
                  placeholder="Ex.: 5591999999999"
                  className="mt-1 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10"
                />
              </div>
              <div>
                <Label className="text-gray-900 font-medium">Mensagem</Label>
                <Textarea
                  value={waText}
                  onChange={(e) => setWaText(e.target.value)}
                  rows={3}
                  className="mt-1 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl"
                />
                <p className="text-xs text-gray-500 mt-1">Use {'{{nome do produto}}'} para inserir automaticamente o nome do produto.</p>
              </div>
              <div className="text-xs text-gray-500">
                Pré-visualização: <a className="text-[#5154e7] underline break-all" target="_blank" href={getWhatsAppLink()}>{getWhatsAppLink() || '—'}</a>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  className="bg-[#5154e7] hover:bg-[#4145d1] text-white rounded-xl h-10 flex-1"
                  onClick={() => {
                    const link = getWhatsAppLink();
                    if (!link) {
                      alert('Informe um número válido.');
                      return;
                    }
                    handleInputChange('confirmationUrl', link);
                    setWaModalOpen(false);
                  }}
                >
                  Usar este link
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => setWaModalOpen(false)}>Cancelar</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}