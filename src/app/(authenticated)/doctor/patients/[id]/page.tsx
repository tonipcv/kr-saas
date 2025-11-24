'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import styles from './bw-theme.module.css';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { 
  ArrowLeftIcon,
  UserIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  CalendarDaysIcon,
  ClockIcon,
  CheckCircleIcon,
  PlusIcon,
  EyeIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  BellIcon,
  HeartIcon,
  PhotoIcon,
  MicrophoneIcon,
  PencilIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from 'date-fns';
import AudioRecorder from '@/components/audio-recorder/audio-recorder';
import VoiceNoteModal from '@/components/voice-note/voice-note-modal';
import VoiceNoteList from '@/components/voice-note/voice-note-list';
import PatientDocuments from '@/components/patient/patient-documents';
import SmartChargeModal from '@/components/payments/SmartChargeModal';
import { toast } from 'react-hot-toast';
import { useClinic } from '@/contexts/clinic-context';

enum PrescriptionStatus {
  PRESCRIBED = 'PRESCRIBED',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED'
}

interface ProtocolAssignment {
  id: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'UNAVAILABLE';
  protocol: {
    id: string;
    name: string;
    duration: number;
    description?: string;
  };
}

interface CourseAssignment {
  id: string;
  startDate: Date;
  status: 'active' | 'inactive' | 'unavailable' | 'completed' | 'paused';
  course: {
    id: string;
    name: string;
    description?: string;
    _count: {
      modules: number;
      lessons: number;
    };
  };
}

interface Course {
  id: string;
  name: string;
  description?: string;
  _count: {
    modules: number;
    lessons: number;
  };
}

interface OnboardingResponse {
  id: string;
  status: string;
  completedAt: string;
  template: {
    id: string;
    name: string;
    steps: {
      id: string;
      question: string;
      type: string;
      required: boolean;
    }[];
  };
  answers: {
    id: string;
    stepId: string;
    answer: string;
  }[];
}

interface Patient {
  id: string;
  name?: string;
  email?: string;
  emailVerified?: Date;
  image?: string;
  referralCode?: string;
  patientPrescriptions?: Array<{
    id: string;
    protocolId: string;
    protocol: {
      id: string;
      name: string;
      duration: number;
      description?: string;
    };
    plannedStartDate: Date;
    plannedEndDate: Date;
    status: PrescriptionStatus;
  }>;
  assignedCourses?: CourseAssignment[];
  onboardingResponses: OnboardingResponse[];
  birthDate?: string;
  gender?: string;
  phone?: string;
  address?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  medicalHistory?: string;
  allergies?: string;
  medications?: string;
  notes?: string;
}

interface SymptomReport {
  id: string;
  title: string;
  symptoms: string;
  severity: number;
  reportTime: string;
  status: 'PENDING' | 'REVIEWED' | 'REQUIRES_ATTENTION' | 'RESOLVED';
  doctorNotes?: string;
  reviewedAt?: string;
  reviewer?: {
    name?: string;
  };
  attachments: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
  }>;
}

interface DailyCheckin {
  id: string;
  date: string;
  responses: Array<{
    questionId: string;
    answer: string;
  }>;
}

interface Protocol {
  id: string;
  name: string;
  description: string;
  duration: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

interface VoiceNote {
  id: string;
  status: 'PROCESSING' | 'TRANSCRIBED' | 'ANALYZED' | 'ERROR';
  audioUrl: string;
  duration: number;
  transcription: string | null;
  summary: string | null;
  createdAt: string;
  checklist: {
    items: Array<{
      title: string;
      description: string;
      type: 'exam' | 'medication' | 'referral' | 'followup';
      status: 'pending' | 'completed';
      dueDate?: string;
    }>;
  } | null;
}

interface ProtocolPrescription {
  id: string;
  protocolId: string;
  plannedStartDate: Date;
  plannedEndDate: Date;
  status: 'PRESCRIBED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED';
  protocol: {
    id: string;
    name: string;
    duration: number;
    description?: string;
  };
}

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const { currentClinic } = useClinic();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [isAssigningCourse, setIsAssigningCourse] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [symptomReports, setSymptomReports] = useState<SymptomReport[]>([]);
  const [dailyCheckins, setDailyCheckins] = useState<DailyCheckin[]>([]);
  const [availableProtocols, setAvailableProtocols] = useState<Protocol[]>([]);
  const [selectedProtocolId, setSelectedProtocolId] = useState<string>('');
  const [showProtocolModal, setShowProtocolModal] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isLoadingProtocols, setIsLoadingProtocols] = useState(false);
  const [selectedReport, setSelectedReport] = useState<SymptomReport | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isUpdatingReport, setIsUpdatingReport] = useState(false);
  const [showVoiceNoteModal, setShowVoiceNoteModal] = useState(false);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [isProcessingVoiceNote, setIsProcessingVoiceNote] = useState(false);
  const [isLoadingVoiceNotes, setIsLoadingVoiceNotes] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    birthDate: '',
    gender: '',
    address: '',
    emergencyContact: '',
    emergencyPhone: '',
    medicalHistory: '',
    allergies: '',
    medications: '',
    notes: ''
  });
  const [prescriptions, setPrescriptions] = useState<ProtocolPrescription[]>([]);
  const [isLoadingPrescriptions, setIsLoadingPrescriptions] = useState(true);
  const [selectedPrescription, setSelectedPrescription] = useState<any>(null);
  const [showEditPrescriptionModal, setShowEditPrescriptionModal] = useState(false);

  useEffect(() => {
    if (params.id && session) {
      loadPatientData();
      loadAvailableCourses();
      loadSymptomReports(params.id as string);
      loadDailyCheckins(params.id as string);
      loadVoiceNotes(params.id as string);
      loadPatientPrescriptions(params.id as string);
    }
  }, [params.id, session]);

  const loadPatientPrescriptions = async (patientId: string) => {
    try {
      setIsLoadingPrescriptions(true);
      console.log('🔄 Loading prescriptions for patient:', patientId);
      
      const response = await fetch(`/api/v2/doctor/prescriptions?patientId=${patientId}`, {
        method: 'GET',
        credentials: 'include', // Important for NextAuth cookies
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      console.log('📥 Prescriptions API response status:', response.status);
      const data = await response.json();
      console.log('📦 Prescriptions API response data:', data);

      if (!response.ok) {
        if (response.status === 401) {
          console.error('❌ Unauthorized access to prescriptions API');
          toast.error('Não autorizado. Faça login novamente.');
          return;
        }
        throw new Error(data.message || 'Failed to fetch prescriptions');
      }

      if (data.success) {
        const prescriptionsData = data.data.map((p: any) => ({
          id: p.id,
          protocolId: p.protocol_id,
          protocol: {
            id: p.protocol_id,
            name: p.protocol_name,
            description: p.protocol_description,
            duration: 30 // Default duration, could be from protocol data
          },
          plannedStartDate: new Date(p.planned_start_date),
          plannedEndDate: p.planned_end_date ? new Date(p.planned_end_date) : undefined,
          status: p.status
        }));
        
        console.log('✅ Prescriptions loaded:', prescriptionsData.length);
        setPrescriptions(prescriptionsData);
      } else {
        throw new Error(data.message || 'Failed to fetch prescriptions');
      }
    } catch (error) {
      console.error('❌ Error loading prescriptions:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar prescrições');
    } finally {
      setIsLoadingPrescriptions(false);
    }
  };

  const loadPatientData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/v2/doctor/patients/${params.id}`);
      const data = await response.json();

      if (response.ok && data.success) {
        const patientData = data.data;
        setPatient({
          ...patientData,
          patientPrescriptions: patientData.patient_prescriptions?.map((p: any) => ({
            id: p.id,
            protocolId: p.protocol_id,
            protocol: p.protocol,
            plannedStartDate: new Date(p.planned_start_date),
            plannedEndDate: new Date(p.planned_end_date),
            status: p.status
          })) || []
        });
      } else {
        console.error('Error loading patient:', data.error);
        toast.error(data.error || 'Error loading patient data');
      }
    } catch (error) {
      console.error('Error loading patient:', error);
      toast.error('Error loading patient');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAvailableCourses = async () => {
    try {
      const response = await fetch('/api/courses');
      if (response.ok) {
        const courses = await response.json();
        setAvailableCourses(courses);
      }
    } catch (error) {
      console.error('Error loading available courses:', error);
    }
  };

  const loadPatientCourses = async (patientId: string) => {
    try {
      const response = await fetch(`/api/courses/assign?patientId=${patientId}`);
      if (response.ok) {
        const assignments = await response.json();
        setPatient(prev => prev ? { ...prev, assignedCourses: assignments } : null);
      }
    } catch (error) {
      console.error('Error loading patient courses:', error);
    }
  };

  const assignCourse = async () => {
    if (!selectedCourseId || !patient) return;

    try {
      setIsAssigningCourse(true);
      const response = await fetch('/api/courses/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: selectedCourseId,
          patientId: patient.id,
          status: 'active'
        })
      });

      if (response.ok) {
        // Reload patient courses
        await loadPatientCourses(patient.id);
        setShowCourseModal(false);
        setSelectedCourseId('');
      } else {
        const error = await response.json();
        alert(`Error assigning course: ${error.error}`);
      }
    } catch (error) {
      console.error('Error assigning course:', error);
      alert('Error assigning course');
    } finally {
      setIsAssigningCourse(false);
    }
  };

  const loadSymptomReports = async (patientId: string) => {
    try {
      const response = await fetch(`/api/symptom-reports?userId=${patientId}&limit=5`);
      if (response.ok) {
        const data = await response.json();
        setSymptomReports(data);
      }
    } catch (error) {
      console.error('Error loading symptom reports:', error);
    }
  };

  const loadDailyCheckins = async (patientId: string) => {
    try {
      const response = await fetch(`/api/daily-checkin?userId=${patientId}&limit=5`);
      if (response.ok) {
        const data = await response.json();
        setDailyCheckins(data);
      }
    } catch (error) {
      console.error('Error loading daily check-ins:', error);
    }
  };

  const loadAvailableProtocols = async () => {
    setIsLoadingProtocols(true);
    try {
      console.log('Iniciando carregamento de protocolos...');
      const response = await fetch('/api/protocols');
      
      console.log('Resposta da API:', response.status, response.statusText);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Protocolos recebidos:', data);
        console.log('Quantidade de protocolos:', Array.isArray(data) ? data.length : 'Não é um array');
        
        // Exibir todos os protocolos sem filtrar por status
        setAvailableProtocols(data);
      } else {
        const errorText = await response.text();
        console.error('Erro na resposta da API:', errorText);
      }
    } catch (error) {
      console.error('Erro ao carregar protocolos:', error);
    } finally {
      setIsLoadingProtocols(false);
    }
  };

  const loadVoiceNotes = async (patientId: string) => {
    try {
      setIsLoadingVoiceNotes(true);
      const response = await fetch(`/api/voice-notes?patientId=${patientId}`);
      if (!response.ok) throw new Error('Failed to load voice notes');
      const data = await response.json();
      setVoiceNotes(data);
    } catch (error) {
      console.error('Error loading voice notes:', error);
    } finally {
      setIsLoadingVoiceNotes(false);
    }
  };

  const assignProtocol = async (formData: FormData) => {
    try {
      setIsAssigning(true);

      const protocolId = formData.get('protocol_id') as string;
      const startDate = formData.get('planned_start_date') as string;
      const consultationDate = formData.get('consultation_date') as string;

      if (!protocolId || !startDate) {
        toast.error('Protocol and start date are required');
        return;
      }

      // Get protocol duration
      const protocol = availableProtocols.find(p => p.id === protocolId);
      if (!protocol) {
        toast.error('Selected protocol not found');
        return;
      }

      // Calculate end date based on protocol duration
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + protocol.duration);

      const response = await fetch(`/api/v2/doctor/prescriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          protocol_id: protocolId,
          user_id: params.id,
          planned_start_date: new Date(startDate).toISOString(),
          planned_end_date: endDate.toISOString(),
          consultation_date: consultationDate ? new Date(consultationDate).toISOString() : null
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Protocol prescribed successfully');
        loadPatientData();
        setShowProtocolModal(false);
      } else {
        console.error('Error prescribing protocol:', data.error);
        toast.error(data.error || 'Error prescribing protocol');
      }
    } catch (error) {
      console.error('Error prescribing protocol:', error);
      toast.error('Failed to prescribe protocol');
    } finally {
      setIsAssigning(false);
    }
  };

  const updateReportStatus = async (reportId: string, status: string, notes?: string) => {
    try {
      setIsUpdatingReport(true);
      const response = await fetch(`/api/symptom-reports/${reportId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status, doctorNotes: notes }),
      });

      if (response.ok) {
        // Refresh reports
        await loadSymptomReports(params.id as string);
        setShowReportModal(false);
        setSelectedReport(null);
      }
    } catch (error) {
      console.error('Error updating report status:', error);
    } finally {
      setIsUpdatingReport(false);
    }
  };

  const handleVoiceNoteTranscription = async (text: string) => {
    const patientId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : null;
    if (!patientId) return;
    
    try {
      setIsProcessingVoiceNote(true);
      
      // Create voice note
      const response = await fetch('/api/voice-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId,
          transcription: text
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create voice note');
      }

      // Get the created voice note
      const voiceNote = await response.json();

      // Start transcription
      const transcribeResponse = await fetch('/api/voice-notes/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          voiceNoteId: voiceNote.id
        })
      });

      if (!transcribeResponse.ok) {
        throw new Error('Failed to transcribe voice note');
      }

      // Get the transcribed voice note
      const transcribedNote = await transcribeResponse.json();

      // Start analysis
      const analyzeResponse = await fetch('/api/voice-notes/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          voiceNoteId: transcribedNote.id
        })
      });

      if (!analyzeResponse.ok) {
        throw new Error('Failed to analyze voice note');
      }

      // Reload voice notes
      await loadVoiceNotes(patientId);
      setShowVoiceNoteModal(false);

    } catch (error) {
      console.error('Error processing voice note:', error);
      alert('Error processing voice note. Please try again.');
    } finally {
      setIsProcessingVoiceNote(false);
    }
  };

  const getPatientInitials = (name?: string) => {
    if (!name) return 'P';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getActiveProtocols = () => {
    return patient?.patientPrescriptions?.filter(p => p.status === 'ACTIVE') || [];
  };

  const getCompletedProtocols = () => {
    return prescriptions.filter(p => p.status === 'COMPLETED');
  };
  
  const handleEditPrescription = (prescription: ProtocolPrescription) => {
    // Convert the ProtocolPrescription to the format expected by EditPrescriptionDialog
    const formattedPrescription = {
      id: prescription.id,
      protocol_id: prescription.protocolId,
      protocol_name: prescription.protocol.name,
      user_id: patient?.id || '',
      user_name: patient?.name || '',
      user_email: patient?.email || '',
      prescribed_by: '',
      prescribed_at: '',
      planned_start_date: prescription.plannedStartDate.toISOString(),
      planned_end_date: prescription.plannedEndDate.toISOString(),
      status: prescription.status,
      current_day: 0,
      adherence_rate: 0
    };
    
    setSelectedPrescription(formattedPrescription);
    setShowEditPrescriptionModal(true);
  };

  const getUnavailableProtocols = () => {
    return prescriptions.filter(p => p.status === 'PRESCRIBED');
  };

  const getActiveCourses = () => {
    return patient?.assignedCourses?.filter(c => c.status === 'active') || [];
  };

  const getCompletedCourses = () => {
    return patient?.assignedCourses?.filter(c => c.status === 'completed') || [];
  };

  const getCourseStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">Active</Badge>;
      case 'completed':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">Completed</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs">Paused</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-50 text-gray-700 border-gray-200 text-xs">Inactive</Badge>;
      default:
        return <Badge className="bg-gray-50 text-gray-700 border-gray-200 text-xs">{status}</Badge>;
    }
  };

  const getAvailableCoursesForAssignment = () => {
    if (!patient) return [];
    return availableCourses.filter(course => 
      !patient.assignedCourses?.some(assignment => assignment.course.id === course.id)
    );
  };

  const safeFormatDate = (dateValue: any, fallback: string = 'Invalid date') => {
    if (!dateValue) return fallback;
    
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return fallback;
      }
      return format(date, 'MMM dd, yyyy', { locale: enUS });
    } catch (error) {
      console.error('Error formatting date:', error, 'Value:', dateValue);
      return fallback;
    }
  };

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return '';
    // Use UTC to ensure consistent formatting between server and client
    const d = new Date(date);
    return format(d, 'MMM d, yyyy', { locale: enUS });
  };

  const getProtocolProgress = (prescription: ProtocolPrescription) => {
    if (!prescription.plannedStartDate || !prescription.plannedEndDate) return 0;
    
    const startDate = new Date(prescription.plannedStartDate);
    const endDate = new Date(prescription.plannedEndDate);
    const currentDate = new Date();
    
    // Ensure all dates are in UTC
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    currentDate.setHours(0, 0, 0, 0);
    
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysElapsed = Math.ceil((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return Math.min(Math.max(Math.round((daysElapsed / totalDays) * 100), 0), 100);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">Active</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">Completed</Badge>;
      case 'PRESCRIBED':
        return <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs">Prescribed</Badge>;
      case 'PAUSED':
        return <Badge className="bg-orange-50 text-orange-700 border-orange-200 text-xs">Paused</Badge>;
      case 'ABANDONED':
        return <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">Abandoned</Badge>;
      default:
        return <Badge className="bg-gray-50 text-gray-700 border-gray-200 text-xs">{status}</Badge>;
    }
  };

  const copyReferralCode = () => {
    if (patient?.referralCode) {
      navigator.clipboard.writeText(patient.referralCode);
      alert('Referral code copied to clipboard!');
    }
  };

  const openEditModal = () => {
    setEditForm({
      name: patient?.name || '',
      email: patient?.email || '',
      phone: patient?.phone || '',
      birthDate: patient?.birthDate ? format(new Date(patient.birthDate), 'yyyy-MM-dd') : '',
      gender: patient?.gender || '',
      address: patient?.address || '',
      emergencyContact: patient?.emergencyContact || '',
      emergencyPhone: patient?.emergencyPhone || '',
      medicalHistory: patient?.medicalHistory || '',
      allergies: patient?.allergies || '',
      medications: patient?.medications || '',
      notes: patient?.notes || ''
    });
    setShowEditModal(true);
  };

  const handleUpdatePatient = async () => {
    if (!editForm.name?.trim() || !editForm.email?.trim()) {
      toast.error('Nome e email são obrigatórios');
      return;
    }

    try {
      setIsEditing(true);
      
      const response = await fetch(`/api/v2/doctor/patients/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone,
          birth_date: editForm.birthDate,
          gender: editForm.gender,
          address: editForm.address,
          emergency_contact: editForm.emergencyContact,
          emergency_phone: editForm.emergencyPhone,
          medical_history: editForm.medicalHistory,
          allergies: editForm.allergies,
          medications: editForm.medications
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Erro ao atualizar paciente');
      }

      // Reload patient data to get updated info
      await loadPatientData();
      setShowEditModal(false);
      toast.success(result.message || 'Paciente atualizado com sucesso');
    } catch (error) {
      console.error('Error updating patient:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar paciente');
    } finally {
      setIsEditing(false);
    }
  };

  const getAvailableProtocolsForPatient = (allProtocols: Protocol[], patient: Patient | null) => {
    if (!allProtocols || !patient) return [];
    
    const prescribedProtocolIds = new Set(
      patient.patientPrescriptions?.map(p => p.protocolId) || []
    );
    
    return allProtocols.filter(p => !prescribedProtocolIds.has(p.id));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
              <div className="space-y-6">
                <div className="h-32 bg-gray-100 rounded-2xl"></div>
                <div className="grid lg:grid-cols-2 gap-6">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-64 bg-gray-100 rounded-2xl"></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            <div className="text-center py-12">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Client not found</h2>
              <Button asChild variant="default">
                <Link href="/doctor/patients">Back to Clients</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeProtocols = prescriptions.filter(p => p.status === 'ACTIVE');
  const completedProtocols = getCompletedProtocols();
  const totalProtocols = prescriptions.length;

  return (
    <div className={`min-h-screen bg-gray-50/30 ${styles.blackAndWhiteContainer}`}>
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          {/* Top Navigation */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Button variant="outline" asChild size="sm">
                <Link href="/doctor/patients">
                  <ArrowLeftIcon className="h-4 w-4 mr-2" />
                  Back
                </Link>
              </Button>
              <div>
                <h1 className="text-large font-bold text-gray-900">Client Details</h1>
                <p className="text-sm text-gray-500 mt-1">View and manage patient prescriptions</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowChargeModal(true)}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Cobrar
              </Button>
              <Dialog open={showVoiceNoteModal} onOpenChange={setShowVoiceNoteModal}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MicrophoneIcon className="h-4 w-4 mr-2" />
                    Record Note
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Record Voice Note</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <AudioRecorder
                      onTranscriptionComplete={handleVoiceNoteTranscription}
                      onError={(error) => alert(error)}
                      disabled={isProcessingVoiceNote}
                    />
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={showProtocolModal} onOpenChange={(open) => {
                setShowProtocolModal(open);
                if (open) {
                  loadAvailableProtocols();
                }
              }}>
                <DialogTrigger asChild>
                  <Button variant="default" size="sm">
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Prescribe Protocol
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Prescribe Protocol</DialogTitle>
                    <DialogDescription>
                      Select a protocol to prescribe to this patient
                    </DialogDescription>
                  </DialogHeader>
                  <form className="space-y-6 py-4" onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const formData = new FormData(form);
                    assignProtocol(formData);
                  }}>
                    <div className="space-y-2">
                      <Label htmlFor="protocol_id">Select Protocol</Label>
                      <select
                        id="protocol_id"
                        name="protocol_id"
                        className="w-full p-2 border border-gray-300 rounded-md"
                        required
                        disabled={isLoadingProtocols}
                      >
                        <option value="">{isLoadingProtocols ? 'Loading protocols...' : 'Choose a protocol...'}</option>
                        {!isLoadingProtocols && availableProtocols && availableProtocols.length > 0 ? (
                          availableProtocols.map((protocol: any) => (
                            <option key={protocol.id} value={protocol.id}>
                              {protocol.name} ({protocol.duration || '?'} days) {protocol.status && `[${protocol.status}]`}
                            </option>
                          ))
                        ) : (
                          <option value="" disabled>No protocols available</option>
                        )}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="planned_start_date">Start Date</Label>
                      <input
                        type="date"
                        id="planned_start_date"
                        name="planned_start_date"
                        className="w-full p-2 border border-gray-300 rounded-md"
                        required
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="consultation_date">Consultation Date</Label>
                      <input
                        type="date"
                        id="consultation_date"
                        name="consultation_date"
                        className="w-full p-2 border border-gray-300 rounded-md"
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>

                    <div className="pt-4">
                      <Button 
                        type="submit"
                        disabled={isAssigning}
                        className="w-full"
                      >
                        {isAssigning ? 'Prescribing...' : 'Prescribe Protocol'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Patient Information Card */}
            <Card className="lg:col-span-2 bg-white border-gray-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-large font-bold">Patient Information</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditModal()}
                >
                  <PencilIcon className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center text-center mb-4">
                    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-xl font-bold text-white mb-2">
                      {getPatientInitials(patient.name)}
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">{patient.name || 'Name not provided'}</h2>
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-600">
                      <EnvelopeIcon className="h-3 w-3" />
                      {patient.email}
                    </div>
                    {patient.emailVerified ? (
                      <Badge variant="default" className="mt-1 bg-green-100 text-green-700 hover:bg-green-200 text-xs">
                        <ShieldCheckIcon className="h-3 w-3 mr-1" />
                        Verified Account
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="mt-1 bg-orange-50 text-orange-700 hover:bg-orange-100 text-xs">
                        <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
                        Pending Verification
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-gray-50 p-3 rounded-lg text-center">
                      <p className="text-xs font-medium text-gray-600">Active Prescriptions</p>
                      <p className="text-lg font-bold text-violet-600 mt-0.5">{activeProtocols.length}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg text-center">
                      <p className="text-xs font-medium text-gray-600">Total Prescriptions</p>
                      <p className="text-lg font-bold text-violet-600 mt-0.5">{totalProtocols}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Protocolos */}
              <Card className="col-span-12">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-large font-bold">
                    Protocolos Prescritos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingPrescriptions ? (
                    <div className="flex justify-center items-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : prescriptions.length > 0 ? (
                    <div className="relative w-full overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Protocolo</TableHead>
                            <TableHead>Início Planejado</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Duração</TableHead>
                            <TableHead>Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {prescriptions.map((prescription) => (
                            <TableRow key={prescription.id}>
                              <TableCell className="font-medium">
                                {prescription.protocol.name}
                              </TableCell>
                              <TableCell>
                                {format(prescription.plannedStartDate, 'dd/MM/yyyy')}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    prescription.status === 'ACTIVE' ? 'default' :
                                    prescription.status === 'PRESCRIBED' ? 'secondary' :
                                    prescription.status === 'COMPLETED' ? 'default' :
                                    prescription.status === 'PAUSED' ? 'outline' : 'destructive'
                                  }
                                >
                                  {prescription.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {prescription.protocol.duration} dias
                              </TableCell>
                              <TableCell>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleEditPrescription(prescription)}
                                >
                                  <PencilIcon className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      Nenhum protocolo prescrito ainda.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle>Prescription Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DocumentTextIcon className="h-5 w-5 text-gray-500" />
                        <span className="text-sm font-medium">Active Prescriptions</span>
                      </div>
                      <span className="text-sm font-semibold">{activeProtocols.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircleIcon className="h-5 w-5 text-gray-500" />
                        <span className="text-sm font-medium">Completed</span>
                      </div>
                      <span className="text-sm font-semibold">{completedProtocols.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ChartBarIcon className="h-5 w-5 text-gray-500" />
                        <span className="text-sm font-medium">Overall Progress</span>
                      </div>
                      <span className="text-sm font-semibold">
                      {totalProtocols > 0 ? Math.round((completedProtocols.length / totalProtocols) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Voice Notes Card */}
              <VoiceNoteList 
                voiceNotes={voiceNotes.map(note => ({
                  ...note,
                  createdAt: new Date(note.createdAt)
                }))} 
                onRefresh={() => {
                  const patientId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : null;
                  if (patientId) {
                    loadVoiceNotes(patientId);
                  }
                }}
              />

              {/* Add Documents Section */}
              <PatientDocuments patientId={params.id as string} />
              
              {/* Edit Prescription Modal */}
              <EditPrescriptionDialog
                open={showEditPrescriptionModal}
                onOpenChange={setShowEditPrescriptionModal}
                prescription={selectedPrescription}
                onSuccess={() => loadPatientPrescriptions(params.id as string)}
              />

            </div>

              {/* Right Column - Prescription Details */}
            <div className="col-span-12 lg:col-span-8 space-y-6">
              {/* Recent Symptom Reports */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Symptom Reports</CardTitle>
                  <CardDescription>Latest patient symptoms and observations</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-4">
                      {symptomReports.map((report) => (
                        <Card key={report.id} className="bg-white">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <HeartIcon className="h-4 w-4 text-red-600" />
                                <span className="font-medium text-gray-900">{report.title}</span>
                              </div>
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "bg-yellow-50 text-yellow-700",
                                  report.severity <= 3 && "bg-green-50 text-green-700",
                                  report.severity >= 7 && "bg-red-50 text-red-700"
                                )}
                              >
                                Severity: {report.severity}/10
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 mb-3">
                              {report.symptoms.length > 100 
                                ? `${report.symptoms.substring(0, 100)}...` 
                                : report.symptoms
                              }
                            </p>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-500">
                                <ClockIcon className="h-4 w-4 inline mr-1" />
                                {formatDistanceToNow(new Date(report.reportTime), { addSuffix: true })}
                              </span>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => {
                                  setSelectedReport(report);
                                  setShowReportModal(true);
                                }}
                              >
                                View Details
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {symptomReports.length === 0 && (
                        <div className="text-center py-6">
                          <HeartIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-600">No symptom reports yet</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
          </div>
        </div>
      </div>
      <Dialog open={showReportModal} onOpenChange={setShowReportModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Symptom Report Details</DialogTitle>
          </DialogHeader>
          {selectedReport && (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">{selectedReport.title}</h3>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "bg-yellow-50 text-yellow-700",
                      selectedReport.severity <= 3 && "bg-green-50 text-green-700",
                      selectedReport.severity >= 7 && "bg-red-50 text-red-700"
                    )}
                  >
                    Severity: {selectedReport.severity}/10
                  </Badge>
                </div>
                <p className="text-sm text-gray-500">
                  Reported {formatDistanceToNow(new Date(selectedReport.reportTime), { addSuffix: true })}
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Symptoms Description</h4>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedReport.symptoms}</p>
              </div>

              {selectedReport.attachments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700">Attachments</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedReport.attachments.map(attachment => (
                      <a 
                        key={attachment.id}
                        href={attachment.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <PhotoIcon className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600 truncate">{attachment.fileName}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {selectedReport.reviewedAt && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700">Review Notes</h4>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedReport.doctorNotes}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      Reviewed by {selectedReport.reviewer?.name} on{' '}
                      {format(new Date(selectedReport.reviewedAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-4 space-x-2 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowReportModal(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => updateReportStatus(
                    selectedReport.id,
                    'REVIEWED',
                    'Thank you for reporting your symptoms. I will review this in detail during our next session.'
                  )}
                  disabled={isUpdatingReport}
                >
                  {isUpdatingReport ? 'Updating...' : 'Mark as Reviewed'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <VoiceNoteModal
        isOpen={showVoiceNoteModal}
        onClose={() => setShowVoiceNoteModal(false)}
        patientId={typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''}
        onVoiceNoteCreated={() => {
          const patientId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : null;
          if (patientId) {
            loadVoiceNotes(patientId);
          }
        }}
      />
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Patient Information</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Patient name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="patient@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">Birth Date</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={editForm.birthDate}
                  onChange={(e) => setEditForm({ ...editForm, birthDate: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select
                  value={editForm.gender}
                  onValueChange={(value) => setEditForm({ ...editForm, gender: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  placeholder="Address"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emergencyContact">Emergency Contact</Label>
                <Input
                  id="emergencyContact"
                  value={editForm.emergencyContact}
                  onChange={(e) => setEditForm({ ...editForm, emergencyContact: e.target.value })}
                  placeholder="Emergency contact name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergencyPhone">Emergency Phone</Label>
                <Input
                  id="emergencyPhone"
                  value={editForm.emergencyPhone}
                  onChange={(e) => setEditForm({ ...editForm, emergencyPhone: e.target.value })}
                  placeholder="Emergency phone number"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="medicalHistory">Medical History</Label>
              <Textarea
                id="medicalHistory"
                value={editForm.medicalHistory}
                onChange={(e) => setEditForm({ ...editForm, medicalHistory: e.target.value })}
                placeholder="Medical history"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="allergies">Allergies</Label>
              <Textarea
                id="allergies"
                value={editForm.allergies}
                onChange={(e) => setEditForm({ ...editForm, allergies: e.target.value })}
                placeholder="Allergies"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="medications">Medications</Label>
              <Textarea
                id="medications"
                value={editForm.medications}
                onChange={(e) => setEditForm({ ...editForm, medications: e.target.value })}
                placeholder="Current medications"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Additional notes"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowEditModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdatePatient}
              disabled={isEditing}
            >
              {isEditing ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Cobrança Inteligente (filtra por país/provider e cartões compatíveis) */}
      <SmartChargeModal
        open={showChargeModal}
        onOpenChange={setShowChargeModal}
        client={{
          id: String(patient?.id || params.id),
          name: patient?.name || null,
          email: patient?.email || null,
          phone: patient?.phone || null,
        }}
        clinicId={currentClinic?.id || undefined}
        clinicSlug={currentClinic?.slug || undefined}
      />
    </div>
  );
} 