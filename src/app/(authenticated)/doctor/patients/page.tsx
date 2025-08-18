'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  PlusIcon,
  UsersIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  DocumentTextIcon,
  CalendarDaysIcon,
  EnvelopeIcon,
  XMarkIcon,
  TrashIcon,
  CheckCircleIcon,
  PaperAirplaneIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  ArrowUpTrayIcon,
  UserPlusIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import { toast } from 'react-hot-toast';
 

interface Patient {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  birth_date?: string;
  gender?: string;
  address?: string;
  emergency_contact?: string;
  emergency_phone?: string;
  medical_history?: string;
  allergies?: string;
  medications?: string;
  notes?: string;
  image?: string;
  is_active: boolean;
  assigned_protocols?: Array<{
    id: string;
    protocol: {
      id: string;
      name: string;
      duration: number;
    };
    start_date: Date;
    end_date: Date;
    is_active: boolean;
  }>;
}

interface NewPatientForm {
  name: string;
  email: string;
  phone: string;
  birth_date: string;
  gender: string;
  address: string;
  emergency_contact: string;
  emergency_phone: string;
  medical_history: string;
  allergies: string;
  medications: string;
  notes: string;
}

interface ImportResults {
  message: string;
  errors: Array<{
    row: number;
    email: string;
    error: string;
  }>;
}

export default function PatientsPage() {
  const { data: session } = useSession();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [isAddingPatient, setIsAddingPatient] = useState(false);
  const [showEditPatient, setShowEditPatient] = useState(false);
  const [isEditingPatient, setIsEditingPatient] = useState(false);
  const [patientToEdit, setPatientToEdit] = useState<Patient | null>(null);
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showCredentials, setShowCredentials] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [isImprovingNotes, setIsImprovingNotes] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(6);
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [balances, setBalances] = useState<Record<string, number>>({});
  
  const [newPatient, setNewPatient] = useState<NewPatientForm>({
    name: '',
    email: '',
    phone: '',
    birth_date: '',
    gender: '',
    address: '',
    emergency_contact: '',
    emergency_phone: '',
    medical_history: '',
    allergies: '',
    medications: '',
    notes: ''
  });

  const [showImportModal, setShowImportModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResults | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<Array<Record<string, string>>>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [isValidatingCsv, setIsValidatingCsv] = useState(false);

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      setIsLoading(true);
      console.log('🔄 Loading patients...');
      
      const response = await fetch('/api/patients', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('📥 API Response status:', response.status);
      
      const data = await response.json();
      console.log('📦 API Response data:', data);

      if (response.ok) {
        // Transform patients data to match expected format
        const transformedPatients = Array.isArray(data) ? data.map((patient: any) => ({
          id: patient.id,
          name: patient.name,
          email: patient.email,
          phone: patient.phone,
          birth_date: patient.birthDate,
          gender: patient.gender,
          address: patient.address,
          emergency_contact: patient.emergencyContact,
          emergency_phone: patient.emergencyPhone,
          medical_history: patient.medicalHistory,
          allergies: patient.allergies,
          medications: patient.medications,
          notes: patient.notes,
          is_active: true,
          assigned_protocols: patient.assignedProtocols?.map((protocol: any) => ({
            id: protocol.id,
            protocol: protocol.protocol,
            start_date: protocol.startDate,
            end_date: protocol.endDate,
            is_active: protocol.isActive
          })) || []
        })) : [];

        setPatients(transformedPatients);
        console.log('✅ Patients loaded:', transformedPatients.length);
      } else {
        console.error('❌ Error loading patients:', data.error);
        toast.error(data.error || 'Erro ao carregar pacientes');
      }
    } catch (error) {
      console.error('❌ Error in loadPatients:', error);
      toast.error('Erro ao carregar pacientes');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setNewPatient({
      name: '',
      email: '',
      phone: '',
      birth_date: '',
      gender: '',
      address: '',
      emergency_contact: '',
      emergency_phone: '',
      medical_history: '',
      allergies: '',
      medications: '',
      notes: ''
    });
    setShowOptionalFields(false);
  };

  const openEditModal = (patient: Patient) => {
    setPatientToEdit(patient);
    setNewPatient({
      name: patient.name || '',
      email: patient.email || '',
      phone: patient.phone || '',
      birth_date: patient.birth_date || '',
      gender: patient.gender || '',
      address: patient.address || '',
      emergency_contact: patient.emergency_contact || '',
      emergency_phone: patient.emergency_phone || '',
      medical_history: patient.medical_history || '',
      allergies: patient.allergies || '',
      medications: patient.medications || '',
      notes: patient.notes || ''
    });
    setShowEditPatient(true);
  };

  const updatePatient = async () => {
    if (!newPatient.name.trim() || !newPatient.email.trim() || !patientToEdit) {
      toast.error('Nome e email são obrigatórios');
      return;
    }

    try {
      setIsEditingPatient(true);
      
      // Prepare data for sending (remove empty fields)
      const patientData: any = {
        name: newPatient.name.trim(),
        email: newPatient.email.trim()
      };

      // Add optional fields only if filled
      if (newPatient.phone?.trim()) patientData.phone = newPatient.phone.trim();
      if (newPatient.birth_date) patientData.birthDate = newPatient.birth_date;
      if (newPatient.gender) patientData.gender = newPatient.gender;
      if (newPatient.address?.trim()) patientData.address = newPatient.address.trim();
      if (newPatient.emergency_contact?.trim()) patientData.emergencyContact = newPatient.emergency_contact.trim();
      if (newPatient.emergency_phone?.trim()) patientData.emergencyPhone = newPatient.emergency_phone.trim();
      if (newPatient.medical_history?.trim()) patientData.medicalHistory = newPatient.medical_history.trim();
      if (newPatient.allergies?.trim()) patientData.allergies = newPatient.allergies.trim();
      if (newPatient.medications?.trim()) patientData.medications = newPatient.medications.trim();
      if (newPatient.notes?.trim()) patientData.notes = newPatient.notes.trim();

      const response = await fetch(`/api/patients/${patientToEdit.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(patientData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar cliente');
      }

      // Reload clients list
      await loadPatients();
      resetForm();
      setShowEditPatient(false);
      setPatientToEdit(null);
      toast.success('Cliente atualizado com sucesso!');
    } catch (error: any) {
      console.error('Error updating patient:', error);
      toast.error(error.message || 'Erro ao atualizar cliente');
    } finally {
      setIsEditingPatient(false);
    }
  };

  const addPatient = async () => {
    if (!newPatient.name.trim() || !newPatient.email.trim()) {
      toast.error('Nome e email são obrigatórios');
      return;
    }

    try {
      setIsAddingPatient(true);
      
      // Prepare data for sending (remove empty fields)
      const patientData: any = {
        name: newPatient.name.trim(),
        email: newPatient.email.trim()
      };

      // Add optional fields only if filled
      if (newPatient.phone?.trim()) patientData.phone = newPatient.phone.trim();
      if (newPatient.birth_date) patientData.birthDate = newPatient.birth_date;
      if (newPatient.gender) patientData.gender = newPatient.gender;
      if (newPatient.address?.trim()) patientData.address = newPatient.address.trim();
      if (newPatient.emergency_contact?.trim()) patientData.emergencyContact = newPatient.emergency_contact.trim();
      if (newPatient.emergency_phone?.trim()) patientData.emergencyPhone = newPatient.emergency_phone.trim();
      if (newPatient.medical_history?.trim()) patientData.medicalHistory = newPatient.medical_history.trim();
      if (newPatient.allergies?.trim()) patientData.allergies = newPatient.allergies.trim();
      if (newPatient.medications?.trim()) patientData.medications = newPatient.medications.trim();
      if (newPatient.notes?.trim()) patientData.notes = newPatient.notes.trim();

      const response = await fetch('/api/patients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(patientData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar paciente');
      }

      // Automatically send password reset email
      if (result.id) {
        await sendPasswordResetEmail(result.id, result.email || newPatient.email);
      }

      toast.success('Cliente criado com sucesso!');
      loadPatients();
      setShowAddPatient(false);
      resetForm();
    } catch (err) {
      console.error('Error creating patient:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao criar paciente');
    } finally {
      setIsAddingPatient(false);
    }
  };

  const deletePatient = async (patientId: string, patientName: string) => {
    try {
      setDeletingPatientId(patientId);
      
      const response = await fetch(`/api/patients/${patientId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Reload clients list
        await loadPatients();
        alert(`Cliente ${patientName} foi removido com sucesso`);
      } else {
        const error = await response.json();
        alert(`Erro ao remover: ${error.error || 'Erro ao deletar cliente'}`);
      }
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('Erro ao deletar cliente');
    } finally {
      setDeletingPatientId(null);
      setShowDeleteConfirm(false);
      setPatientToDelete(null);
    }
  };

  const handleDeleteConfirm = () => {
    if (patientToDelete) {
      deletePatient(patientToDelete.id, patientToDelete.name);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setPatientToDelete(null);
  };

  const sendPasswordResetEmail = async (patientId: string, patientEmail: string) => {
    try {
      setSendingEmailId(patientId);
      
      const response = await fetch(`/api/patients/${patientId}/send-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Email de redefinição de senha enviado para ${patientEmail} com sucesso!`);
        console.log('Reset URL (for testing):', result.resetUrl);
      } else {
        const error = await response.json();
        alert(`Erro ao enviar email de redefinição de senha: ${error.error || 'Erro ao enviar email de redefinição de senha'}`);
      }
    } catch (error) {
      console.error('Error sending password reset email:', error);
      alert('Erro ao enviar email de redefinição de senha');
    } finally {
      setSendingEmailId(null);
    }
  };

  const filteredPatients = patients.filter(patient => 
    patient.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination logic
  const totalPatients = filteredPatients.length;
  const totalPages = Math.ceil(totalPatients / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPatients = filteredPatients.slice(startIndex, endIndex);

  // Fetch credit balances for visible patients
  useEffect(() => {
    const fetchBalances = async () => {
      try {
        const ids = currentPatients.map((p) => p.id);
        if (ids.length === 0) return;
        const params = new URLSearchParams({ ids: ids.join(',') });
        const res = await fetch(`/api/patients/credits?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.balances) setBalances((prev) => ({ ...prev, ...data.balances }));
      } catch (e) {
        console.error('Failed to load balances', e);
      }
    };
    fetchBalances();
  }, [currentPatients.map((p) => p.id).join(','), searchTerm, currentPage]);

  // Handle page change with smooth scroll
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Smooth scroll to top of patients section
    const patientsSection = document.querySelector('[data-patients-section]');
    if (patientsSection) {
      patientsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Reset pagination when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const getPatientInitials = (name?: string) => {
    if (!name) return 'C';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getActiveProtocol = (patient: Patient) => {
    return patient.assigned_protocols?.find((p: any) => p.is_active);
  };

  const improveNotesWithAI = async () => {
    if (!newPatient.notes.trim()) {
      alert('Please write something in the notes before using AI to improve it.');
      return;
    }

    try {
      setIsImprovingNotes(true);
      
      const response = await fetch('/api/ai/improve-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: newPatient.notes,
          context: 'medical_notes'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setNewPatient({...newPatient, notes: data.improvedText});
        alert('Text improved successfully with AI!');
      } else {
        const errorData = await response.json();
        alert(`Error improving text: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error improving notes:', error);
      alert('Connection error while trying to improve text with AI.');
    } finally {
      setIsImprovingNotes(false);
    }
  };

  // CSV helpers
  const resetCsvImport = () => {
    setSelectedFile(null);
    setCsvHeaders([]);
    setCsvPreviewRows([]);
    setCsvErrors([]);
    setIsValidatingCsv(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const parseCsv = (text: string) => {
    // naive CSV parse: handles simple commas and quotes
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [] as string[], rows: [] as Record<string, string>[] };
    const splitLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
          else { inQuotes = !inQuotes; }
        } else if (ch === ',' && !inQuotes) {
          result.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      result.push(cur);
      return result.map((s) => s.trim());
    };
    const rawHeaders = splitLine(lines[0]).map((h) => h.replace(/^\ufeff/, ''));
    const headers = rawHeaders.map((h) => h.toLowerCase());
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = splitLine(lines[i]);
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = (parts[idx] ?? '').trim();
      });
      rows.push(obj);
    }
    return { headers, rows };
  };

  const validateCsv = (headers: string[], rows: Record<string, string>[]) => {
    const errors: string[] = [];
    const required = ['name', 'email'];
    const allowed = ['name', 'email', 'phone'];
    // headers present
    for (const req of required) {
      if (!headers.includes(req)) errors.push(`Missing required column: ${req}`);
    }
    // unexpected columns
    headers.forEach((h) => {
      if (!allowed.includes(h)) errors.push(`Unexpected column: ${h}. Allowed: name, email, phone`);
    });
    // row-level validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    rows.forEach((row, idx) => {
      const line = idx + 2; // account for header line
      if (!row['name'] || row['name'].length === 0) errors.push(`Row ${line}: name is required`);
      if (!row['email'] || row['email'].length === 0) errors.push(`Row ${line}: email is required`);
      else if (!emailRegex.test(row['email'])) errors.push(`Row ${line}: email is invalid`);
    });
    return errors;
  };

  const handleCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setCsvErrors([]);
    setCsvHeaders([]);
    setCsvPreviewRows([]);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Upload a CSV file (.csv)');
      return;
    }
    try {
      setIsValidatingCsv(true);
      const text = await file.text();
      const { headers, rows } = parseCsv(text);
      setCsvHeaders(headers);
      const errors = validateCsv(headers, rows);
      setCsvErrors(errors);
      setCsvPreviewRows(rows.slice(0, 10));
    } catch (e) {
      console.error('Failed to read CSV', e);
      toast.error('Failed to read CSV');
    } finally {
      setIsValidatingCsv(false);
    }
  };

  const confirmCsvUpload = async () => {
    if (!selectedFile) return;
    try {
      setIsImporting(true);
      const formData = new FormData();
      formData.append('file', selectedFile);
      const response = await fetch('/api/patients/import', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error importing patients');
      setImportResults(data);
      await loadPatients();
      toast.success(data.message || 'Import completed');
      resetCsvImport();
      setShowImportModal(false);
    } catch (e) {
      console.error('Error importing patients:', e);
      toast.error(e instanceof Error ? e.message : 'Error importing patients');
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            
            {/* Header Skeleton */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-6">
              <div className="space-y-3">
                <div className="h-8 bg-gray-200 rounded-lg w-32 animate-pulse"></div>
                <div className="h-5 bg-gray-100 rounded-lg w-64 animate-pulse"></div>
              </div>
              <div className="h-10 bg-gray-200 rounded-xl w-36 animate-pulse"></div>
            </div>

            {/* Search Skeleton */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 mb-4">
              <div className="h-12 bg-gray-100 rounded-xl animate-pulse"></div>
            </div>

            {/* Clients List Skeleton */}
            <div className="space-y-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="h-12 w-12 bg-gray-200 rounded-xl animate-pulse"></div>
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="h-5 bg-gray-200 rounded w-32 animate-pulse"></div>
                          <div className="h-5 bg-gray-100 rounded-xl w-24 animate-pulse"></div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="h-4 bg-gray-100 rounded w-40 animate-pulse"></div>
                          <div className="h-4 bg-gray-100 rounded w-24 animate-pulse"></div>
                        </div>
                        <div className="space-y-2">
                          <div className="h-4 bg-gray-100 rounded w-48 animate-pulse"></div>
                          <div className="h-3 bg-gray-100 rounded w-36 animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 bg-gray-100 rounded-xl animate-pulse"></div>
                      <div className="h-8 w-20 bg-gray-100 rounded-xl animate-pulse"></div>
                      <div className="h-8 w-8 bg-gray-100 rounded-xl animate-pulse"></div>
                    </div>
                  </div>
                </div>
              ))}
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
          {/* Page header + actions */}
          <div className="mb-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Clients</h1>
                <p className="text-sm text-gray-500 mt-1">Manage your clients and their protocols</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl h-9 px-3 border-gray-200 text-gray-700 hover:bg-gray-50"
                  onClick={() => { resetCsvImport(); setShowImportModal(true); }}
                  disabled={isImporting}
                  title="Import clients from CSV"
                >
                  <span className="hidden sm:inline">{isImporting ? 'Importing...' : 'Import CSV'}</span>
                  <ArrowUpTrayIcon className="h-4 w-4 sm:ml-2" />
                </Button>
                <Button
                  className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white shadow-sm rounded-xl h-9 px-4 font-medium"
                  onClick={() => {
                    resetForm();
                    setShowAddPatient(true);
                  }}
                >
                  <UserPlusIcon className="h-4 w-4 mr-2" />
                  Add Client
                </Button>
              </div>
            </div>

            {/* Top pill tabs */}
            <div className="mt-3 flex items-center gap-2">
              {['All', 'Active', 'Inactive'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={cn(
                    'h-8 px-3 text-xs rounded-full border transition shadow-sm',
                    'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#5154e7] border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
              <p className="mt-4 text-gray-600">Loading clients...</p>
            </div>
          ) : patients.length === 0 ? (
            <div className="text-center py-12">
              <div className="mb-4">
                <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
              </div>
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No clients registered</h3>
              <p className="mt-1 text-sm text-gray-500">Start by adding your first client</p>
              <div className="mt-6">
                <Button
                  asChild
                  className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white shadow-sm rounded-xl font-medium"
                >
                  <Link href="/doctor/patients/smart-add">
                    <UserPlusIcon className="h-4 w-4 mr-2" />
                    Add First Client
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search clients..."
                      className="block w-full h-10 rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-[14px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5154e7]"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="h-9 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50">
                    <span className="text-sm">Filters</span>
                  </Button>
                  <Button variant="outline" className="h-9 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50">
                    <span className="text-sm">Sort</span>
                  </Button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full">
                  <thead className="bg-gray-50/80">
                    <tr className="text-left text-xs text-gray-600">
                      <th className="py-3.5 pl-4 pr-3 font-medium sm:pl-6">Name</th>
                      <th className="px-3 py-3.5 font-medium">Email</th>
                      <th className="px-3 py-3.5 font-medium">Phone</th>
                      <th className="px-3 py-3.5 font-medium">Points</th>
                      <th className="px-3 py-3.5 font-medium">Status</th>
                      <th className="py-3.5 pl-3 pr-4 sm:pr-6 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {currentPatients.map((patient) => {
                      const activeProtocol = getActiveProtocol(patient);
                      return (
                        <tr key={patient.id} className="hover:bg-gray-50/60">
                          <td className="whitespace-nowrap py-3.5 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                            {patient.name || 'Name not provided'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-600">
                            {patient.email || '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-600">
                            {patient.phone || '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-900">
                            {typeof balances[patient.id] === 'number' ? Math.round(balances[patient.id]) : 0}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm">
                            {activeProtocol ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">
                                Inactive
                              </span>
                            )}
                          </td>
                          <td className="relative whitespace-nowrap py-3.5 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg h-8 w-8 p-0"
                              >
                                <Link href={`/doctor/patients/${patient.id}`}>
                                  <EyeIcon className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditModal(patient)}
                                className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg h-8 w-8 p-0"
                              >
                                <PencilIcon className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setPatientToDelete({ id: patient.id, name: patient.name || 'Unnamed Patient' });
                                  setShowDeleteConfirm(true);
                                }}
                                disabled={deletingPatientId === patient.id}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg h-8 w-8 p-0"
                                title="Delete patient"
                              >
                                {deletingPatientId === patient.id ? (
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-600 border-t-transparent"></span>
                                ) : (
                                  <TrashIcon className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => sendPasswordResetEmail(patient.id, patient.email || '')}
                                disabled={sendingEmailId === patient.id}
                                className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50 hover:border-blue-300 rounded-lg font-medium h-8 px-2"
                                title="Send password setup email"
                              >
                                {sendingEmailId === patient.id ? (
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></span>
                                ) : (
                                  <PaperAirplaneIcon className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add Patient Modal */}
      {showAddPatient && (
        <Dialog open={showAddPatient} onOpenChange={setShowAddPatient}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add Client</DialogTitle>
              <DialogDescription>
                Create a new client. Required fields are marked with *.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label htmlFor="add_name">Name *</Label>
                  <Input
                    id="add_name"
                    value={newPatient.name}
                    onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                    placeholder="Full name"
                  />
                </div>
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label htmlFor="add_email">Email *</Label>
                  <Input
                    id="add_email"
                    type="email"
                    value={newPatient.email}
                    onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                    placeholder="Email address"
                  />
                </div>
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label htmlFor="add_phone">Phone</Label>
                  <Input
                    id="add_phone"
                    type="tel"
                    value={newPatient.phone}
                    onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                    placeholder="Phone number"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddPatient(false);
                  resetForm();
                }}
                disabled={isAddingPatient}
                className="mt-3 sm:mt-0"
              >
                Cancel
              </Button>
              <Button
                onClick={addPatient}
                disabled={isAddingPatient}
                className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white"
              >
                {isAddingPatient ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"></span>
                    Adding...
                  </>
                ) : (
                  'Add Client'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <Dialog open={showImportModal} onOpenChange={(open) => { setShowImportModal(open); if (!open) resetCsvImport(); }}>
          <DialogContent className="sm:max-w-[720px]">
            <DialogHeader>
              <DialogTitle>Import clients via CSV</DialogTitle>
              <DialogDescription>
                The CSV file must include the columns: <b>name</b>, <b>email</b>, <b>phone</b>. Required fields: <b>name</b> and <b>email</b>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                <p className="mb-2 font-medium">How to prepare your CSV</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>The first line must be the header: name,email,phone</li>
                  <li><b>name</b> and <b>email</b> are required</li>
                  <li><b>phone</b> is optional</li>
                  <li>Download an example: <a className="text-blue-600 hover:underline" href="/exemple-clients.csv" download>exemple-clients.csv</a></li>
                </ul>
              </div>

              <div className="flex items-center gap-3">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileChange}
                  className=""
                  disabled={isValidatingCsv || isImporting}
                />
                <Button variant="outline" onClick={resetCsvImport} className="rounded-xl" disabled={isValidatingCsv || isImporting}>Clear</Button>
              </div>

              {isValidatingCsv && (
                <div className="text-sm text-gray-600">Validating CSV...</div>
              )}

              {csvErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-red-700 font-medium mb-1">Errors found ({csvErrors.length}):</p>
                  <ul className="list-disc pl-5 text-sm text-red-700 space-y-1 max-h-40 overflow-auto">
                    {csvErrors.map((e, i) => (<li key={i}>{e}</li>))}
                  </ul>
                </div>
              )}

              {selectedFile && csvErrors.length === 0 && (
                <div className="rounded-lg border border-gray-200">
                  <div className="px-3 py-2 text-sm text-gray-600 bg-gray-50">Preview (first {csvPreviewRows.length} rows)</div>
                  <div className="overflow-auto max-h-64">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white">
                        <tr>
                          {csvHeaders.map((h) => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-gray-700 border-b">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreviewRows.map((row, idx) => (
                          <tr key={idx} className="odd:bg-gray-50">
                            {csvHeaders.map((h) => (
                              <td key={h} className="px-3 py-2 border-b text-gray-800">{row[h] ?? ''}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" className="rounded-xl" onClick={() => { setShowImportModal(false); }}>Cancel</Button>
                <Button
                  className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] text-white rounded-xl"
                  onClick={confirmCsvUpload}
                  disabled={!selectedFile || csvErrors.length > 0 || isImporting}
                >
                  {isImporting ? 'Importing...' : 'Confirm import'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Patient Modal */}
      {showEditPatient && (
        <Dialog open={showEditPatient} onOpenChange={setShowEditPatient}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>
              Update client information. Required fields are marked with *.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={newPatient.name}
                  onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                  placeholder="Full name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birth_date">Birth Date</Label>
                <Input
                  id="birth_date"
                  type="date"
                  value={newPatient.birth_date}
                  onChange={(e) => setNewPatient({ ...newPatient, birth_date: e.target.value })}
                  placeholder="Birth date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={newPatient.email}
                  onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                  placeholder="Email address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={newPatient.phone}
                  onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={newPatient.notes}
                  onChange={(e) => setNewPatient({ ...newPatient, notes: e.target.value })}
                  placeholder="Additional notes"
                />
              </div>
            </div>
          </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditPatient(false);
                  resetForm();
                }}
                disabled={isEditingPatient}
                className="mt-3 sm:mt-0"
              >
                Cancel
              </Button>
              <Button
                onClick={updatePatient}
                disabled={isEditingPatient}
                className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white"
              >
                {isEditingPatient ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"></span>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && patientToDelete && (
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-red-600">
                <ExclamationTriangleIcon className="h-6 w-6" />
                Confirm Deletion
              </DialogTitle>
              <DialogDescription className="text-gray-600 pt-2">
                Are you sure you want to delete the patient <strong>"{patientToDelete.name}"</strong>?
                <br />
                <br />
                This action cannot be undone and will permanently remove:
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>Patient profile and personal information</li>
                  <li>All assigned protocols and progress</li>
                  <li>All medical history and notes</li>
                  <li>All associated data</li>
                </ul>
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={handleDeleteCancel}
                disabled={deletingPatientId !== null}
                className="mt-3 sm:mt-0 sm:w-auto border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteConfirm}
                disabled={deletingPatientId !== null}
                className="bg-red-600 hover:bg-red-700 text-white sm:w-auto"
              >
                {deletingPatientId === patientToDelete.id ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"></span>
                    Deleting...
                  </>
                ) : (
                  <>
                    <TrashIcon className="h-4 w-4 mr-2" />
                    Delete Patient
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
} 