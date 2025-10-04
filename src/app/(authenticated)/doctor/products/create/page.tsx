'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { ProtocolImagePicker } from '@/components/protocol/protocol-image-picker';

export default function CreateProductPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [categoriesLoading, setCategoriesLoading] = useState<boolean>(false);
  const [creatingCategory, setCreatingCategory] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [waModalOpen, setWaModalOpen] = useState<boolean>(false);
  const [waNumber, setWaNumber] = useState<string>('');
  const [waText, setWaText] = useState<string>('Olá, tenho interesse no {{nome do produto}}!');
  const [formData, setFormData] = useState({
    name: '',
    subtitle: '',
    description: '',
    imageUrl: '',
    originalPrice: '',
    discountPrice: '',
    discountPercentage: '',
    usageStats: '0',
    purchaseUrl: '',
    creditsPerUnit: '',
    category: '',
    isActive: true,
    confirmationUrl: '',
    priority: '0'
  });

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
      
      // Align with POST /api/products accepted fields
      const payload: any = {
        name: formData.name,
        description: formData.description,
        imageUrl: formData.imageUrl || undefined,
        originalPrice: formData.originalPrice ? Number(formData.originalPrice) : undefined,
        creditsPerUnit: formData.creditsPerUnit ? Number(formData.creditsPerUnit) : undefined,
        category: formData.category || 'Geral',
        confirmationUrl: formData.confirmationUrl?.trim() || undefined,
        priority: formData.priority !== '' ? Number(formData.priority) : undefined,
      };

      const response = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push('/business/products');
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

  const getWhatsAppLink = () => {
    const digits = (waNumber || '').replace(/\D/g, '');
    if (!digits) return '';
    const message = (waText || '').replace(/\{\{\s*nome do produto\s*\}\}/gi, formData.name || 'produto');
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
        
          {/* Header */}
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" asChild className="h-9 rounded-xl px-3 border border-gray-200 text-gray-700 hover:bg-gray-50">
              <Link href="/business/products">
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
                {/* Gallery & Basic Information */}
                <Card className="bg-white border-gray-200 shadow-sm rounded-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-gray-900">Galeria de imagens</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                    <div className="mt-6">
                      <Label htmlFor="priority" className="text-gray-900 font-medium">Priority (higher shows first)</Label>
                      <Input
                        id="priority"
                        value={formData.priority}
                        onChange={(e) => handleInputChange('priority', e.target.value)}
                        placeholder="0"
                        type="number"
                        className="mt-2 border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-700 placeholder:text-gray-500 rounded-xl h-10"
                      />
                      <p className="text-xs text-gray-500 mt-2">Use to control display order. Higher numbers appear first.</p>
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
                    <Link href="/business/products">
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
 