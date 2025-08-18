'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeftIcon,
  UserIcon,
  DocumentTextIcon,
  CalendarDaysIcon,
  ClockIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  XMarkIcon,
  PlayIcon,
  PauseIcon,
  StopIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { format, addDays, isBefore } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { ConsultationDatePicker } from '@/components/ConsultationDatePicker';

interface Protocol {
  id: string;
  name: string;
  duration: number;
  description?: string;
  isTemplate: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createdAt: Date;
  coverImage?: string;
  assignments: Array<{
    id: string;
    user: {
      id: string;
      name?: string;
      email?: string;
    };
    isActive: boolean;
  }>;
  isRecurring: boolean;
}

interface Assignment {
  id: string;
  protocolId: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'UNAVAILABLE' | 'SOON';
  consultation_date?: string | null;
  protocol: {
    id: string;
    name: string;
    duration: number;
    description?: string;
  };
}

interface Patient {
  id: string;
  name?: string;
  email?: string;
  prescriptions: any[];
}

interface ProtocolWithAssignment extends Protocol {
  assignment?: Assignment;
  assignmentStatus: 'UNASSIGNED' | 'ACTIVE' | 'INACTIVE' | 'UNAVAILABLE' | 'SOON';
}

interface AssignmentForm {
  protocolId: string;
  startDate: Date;
  consultationDate: Date | null;
}

interface PendingChange {
  status?: string;
  consultationDate?: Date | null;
  startDate?: Date;
  endDate?: Date;
}

// Status utilities with clean, minimalist design
const getStatusInfo = (status: string) => {
  switch (status) {
    case 'ACTIVE':
      return {
        color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
        icon: <PlayIcon className="h-4 w-4" />,
        text: 'Active'
      };
    case 'INACTIVE':
      return {
        color: 'text-amber-700 bg-amber-50 border-amber-200',
        icon: <PauseIcon className="h-4 w-4" />,
        text: 'Paused'
      };
    case 'UNAVAILABLE':
      return {
        color: 'text-red-700 bg-red-50 border-red-200',
        icon: <StopIcon className="h-4 w-4" />,
        text: 'Stopped'
      };
    case 'SOON':
      return {
        color: 'text-yellow-700 bg-yellow-50 border-yellow-200',
        icon: <CalendarDaysIcon className="h-4 w-4" />,
        text: 'Coming Soon'
      };
    default:
      return {
        color: 'text-gray-700 bg-gray-50 border-gray-200',
        icon: <EyeIcon className="h-4 w-4" />,
        text: 'Unknown'
      };
  }
};

// Clean Protocol Card with minimalist design
const ProtocolCard = ({
  protocol,
  onStatusChange,
  onRemove,
  onAssign,
  isUpdating,
  isRemoving,
  isAssigning,
  startDate,
  onStartDateChange,
  pendingStatus,
  pendingConsultationDate,
  pendingStartDate,
  pendingEndDate,
  hasPendingChanges,
  onConsultationDateChange,
  onTreatmentDatesChange,
}: {
  protocol: ProtocolWithAssignment;
  onStatusChange?: (assignmentId: string, status: string) => void;
  onRemove?: (assignmentId: string) => void;
  onAssign?: (protocolId: string) => void;
  isUpdating?: boolean;
  isRemoving?: boolean;
  isAssigning?: boolean;
  startDate?: string;
  onStartDateChange?: (date: string) => void;
  pendingStatus?: string;
  pendingConsultationDate?: Date | null;
  pendingStartDate?: Date;
  pendingEndDate?: Date;
  hasPendingChanges?: boolean;
  onConsultationDateChange?: (assignmentId: string, protocolId: string, date: Date | null) => void;
  onTreatmentDatesChange?: (assignmentId: string, startDate: Date, endDate: Date) => void;
}) => {
  const assignment = protocol.assignment;

  const isAssigned = protocol.assignmentStatus !== 'UNASSIGNED';
  const currentStatus = pendingStatus || assignment?.status || 'UNASSIGNED';
  const statusInfo = getStatusInfo(currentStatus);
  const isReactivation = protocol.assignmentStatus === 'INACTIVE';

  // Use pending dates if available, otherwise use assignment dates
  const currentStartDate = pendingStartDate || (assignment ? new Date(assignment.startDate) : new Date());
  const currentEndDate = pendingEndDate || (assignment ? new Date(assignment.endDate) : addDays(new Date(), protocol.duration - 1));

  const handleStartDateChange = (date: Date) => {
    if (!onTreatmentDatesChange || !assignment) return;
    const newEndDate = addDays(date, protocol.duration - 1);
    onTreatmentDatesChange(assignment.id, date, newEndDate);
  };

  // Show loading state during operations
  const isLoading = isUpdating || isRemoving || isAssigning;

  return (
    <Card className={`transition-all duration-200 hover:shadow-md ${
      isLoading ? 'opacity-75 pointer-events-none' : ''
    } ${hasPendingChanges ? 'ring-2 ring-blue-200 bg-blue-50/30' : 'bg-white'} border border-gray-200 rounded-lg`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <h4 className="text-lg font-semibold text-gray-900 truncate">{protocol.name}</h4>
              
              {protocol.isTemplate && (
                <Badge className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-md text-xs font-medium">
                  Template
                </Badge>
              )}
              
              {isAssigned && (
                <Badge className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border ${statusInfo.color}`}>
                  {statusInfo.icon}
                  <span>{statusInfo.text}</span>
                </Badge>
              )}
              
              {isReactivation && !isAssigned && (
                <Badge className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-1 rounded-md text-xs font-medium">
                  Can Reactivate
                </Badge>
              )}

              {hasPendingChanges && (
                <Badge className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-md text-xs font-medium">
                  Unsaved
                </Badge>
              )}
            </div>
            
            {/* Description */}
            {protocol.description && (
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">{protocol.description}</p>
            )}
            
            {/* Stats */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4">
              <span className="flex items-center gap-1.5">
                <ClockIcon className="h-4 w-4" />
                {protocol.duration} days
              </span>

              {assignment && (
                <span className="flex items-center gap-1.5">
                  <CalendarDaysIcon className="h-4 w-4" />
                  {format(new Date(assignment.startDate), 'MMM dd', { locale: enUS })} - {format(new Date(assignment.endDate), 'MMM dd', { locale: enUS })}
                </span>
              )}
              {currentEndDate && !assignment && (
                <span className="flex items-center gap-1.5">
                  <CalendarDaysIcon className="h-4 w-4" />
                  Until {format(currentEndDate, 'MMM dd, yyyy', { locale: enUS })}
                </span>
              )}
            </div>

            {/* Treatment Period */}
            {isAssigned && (
              <div className="mt-4">
                <Label className="text-sm font-medium text-gray-700">Treatment Period</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate" className="text-xs text-gray-500">Start Date</Label>
                    <Input
                      type="date"
                      id="startDate"
                      value={format(currentStartDate, 'yyyy-MM-dd')}
                      onChange={(e) => handleStartDateChange(new Date(e.target.value))}
                      className="mt-1"
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate" className="text-xs text-gray-500">End Date</Label>
                    <Input
                      type="date"
                      id="endDate"
                      value={format(currentEndDate, 'yyyy-MM-dd')}
                      disabled
                      className="mt-1 bg-gray-50"
                    />
                  </div>
                </div>
                {hasPendingChanges && (
                  <p className="text-xs text-[#5154e7]">* Pending changes</p>
                )}
              </div>
            )}

            {/* Consultation Date Picker */}
            {isAssigned && assignment && (
              <div className="mt-4">
                <ConsultationDatePicker
                  consultationDate={pendingConsultationDate !== undefined ? pendingConsultationDate : (assignment?.consultation_date ? new Date(assignment.consultation_date) : null)}
                  onDateChange={(date) => onConsultationDateChange?.(assignment.id, protocol.id, date)}
                  disabled={isLoading}
                />
                {hasPendingChanges && (
                  <p className="text-xs text-[#5154e7] mt-1">* Pending changes</p>
                )}
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-teal-600"></div>
                <span>
                  {isAssigning ? 'Assigning...' : 
                   isUpdating ? 'Updating...' : 
                   isRemoving ? 'Removing...' : 'Processing...'}
                </span>
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-3">
            {isAssigned && assignment && onStatusChange ? (
              // Status controls for assigned protocols
              <div className="flex items-center gap-2">
                <select
                  value={currentStatus}
                  onChange={(e) => onStatusChange(assignment.id, e.target.value)}
                  disabled={isLoading}
                  className="form-select border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] rounded-lg text-sm"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Paused</option>
                  <option value="UNAVAILABLE">Stopped</option>
                  <option value="SOON">Coming Soon</option>
                </select>
                
                {onRemove && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(assignment.id)}
                    disabled={isLoading}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 h-9 w-9 p-0 rounded-lg"
                    title="Remove protocol"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : onAssign && startDate && onStartDateChange ? (
              // Assignment controls for available protocols
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  disabled={isLoading}
                  className="text-sm bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 disabled:opacity-50 min-w-[130px]"
                />
                
                <Button
                  onClick={() => onAssign(protocol.id)}
                  disabled={isLoading}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span className="hidden sm:inline">
                        {isReactivation ? 'Reactivating...' : 'Assigning...'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <PlusIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">
                        {isReactivation ? 'Reactivate' : 'Assign'}
                      </span>
                    </div>
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default function AssignProtocolPage() {
  const params = useParams();
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigning, setIsAssigning] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [removingAssignment, setRemovingAssignment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [assignStartDate, setAssignStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [pendingChanges, setPendingChanges] = useState<Record<string, PendingChange>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [form, setForm] = useState<AssignmentForm>({
    protocolId: '',
    startDate: new Date(),
    consultationDate: null
  });

  useEffect(() => {
    if (params.id) {
      loadData(params.id as string);
    }
  }, [params.id]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadData = async (patientId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [patientResponse, protocolsResponse] = await Promise.all([
        fetch(`/api/v2/doctor/patients/${patientId}`),
        fetch('/api/protocols')
      ]);

      if (!patientResponse.ok) {
        if (patientResponse.status === 404) {
          setError('Client not found or you do not have permission to access it');
        } else if (patientResponse.status === 401) {
          setError('Session expired. Please log in again');
          setTimeout(() => router.push('/auth/signin'), 2000);
          return;
        } else {
          setError('Error loading client data');
        }
        return;
      }

      const patientData = await patientResponse.json();
      setPatient(patientData.data);

      if (protocolsResponse.ok) {
        const protocolsData = await protocolsResponse.json();
        const allProtocols = Array.isArray(protocolsData) ? protocolsData : [];
        setProtocols(allProtocols);
      } else {
        setError('Error loading available protocols');
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Connection error. Please check your internet and try again');
    } finally {
      setIsLoading(false);
    }
  };

  const assignProtocol = async (protocolId: string) => {
    try {
      setIsAssigning(protocolId);
      setError(null);
      
      const response = await fetch('/api/v2/doctor/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol_id: protocolId,
          user_id: params.id,
          planned_start_date: new Date(assignStartDate).toISOString()
        })
      });

      if (response.ok) {
        const existingAssignment = patient?.prescriptions && patient.prescriptions.find((p: any) => p.protocol_id === protocolId);
        const isReactivation = existingAssignment && existingAssignment.status === 'INACTIVE';
        
        setSuccessMessage(isReactivation ? 'Protocol reactivated successfully!' : 'Protocol assigned successfully!');
        setAssignStartDate(format(new Date(), 'yyyy-MM-dd'));
        await loadData(params.id as string);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Error assigning protocol');
      }
    } catch (error) {
      console.error('Error assigning protocol:', error);
      setError('Connection error. Please try again');
    } finally {
      setIsAssigning(null);
    }
  };

  const handleConsultationDateChange = (assignmentId: string, protocolId: string, date: Date | null) => {
    setPendingChanges(prev => ({
      ...prev,
      [assignmentId]: {
        ...prev[assignmentId],
        consultationDate: date
      }
    }));
  };

  const handleStatusChange = (assignmentId: string, status: string) => {
    setPendingChanges(prev => ({
      ...prev,
      [assignmentId]: {
        ...prev[assignmentId],
        status
      }
    }));
  };

  const handleTreatmentDatesChange = (assignmentId: string, startDate: Date, endDate: Date) => {
    setPendingChanges(prev => ({
      ...prev,
      [assignmentId]: {
        ...prev[assignmentId],
        startDate,
        endDate
      }
    }));
  };

  const saveChanges = async () => {
    setIsSaving(true);
    try {
      // Salvar todas as mudanças pendentes
      for (const [assignmentId, changes] of Object.entries(pendingChanges)) {
        const assignment = processedProtocols
          .find(p => p.assignment?.id === assignmentId)?.assignment;

        if (!assignment) continue;

        // Atualizar status se houver mudança
        if (changes.status) {
          await fetch(`/api/protocols/assignments/${assignmentId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: changes.status })
          });
        }

        // Atualizar data de consulta se houver mudança
        if ('consultationDate' in changes) {
          await fetch(`/api/protocols/${assignment.protocolId}/consultation-date`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              consultationDate: changes.consultationDate,
              userId: params.id
            })
          });
        }

        // Atualizar datas do tratamento se houver mudança
        if (changes.startDate && changes.endDate) {
          await fetch(`/api/protocols/assignments/${assignmentId}/dates`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              startDate: changes.startDate,
              endDate: changes.endDate
            })
          });
        }
      }

      // Recarregar dados após salvar
      await loadData(params.id as string);
      setPendingChanges({});
      setSuccessMessage('Changes saved successfully');
    } catch (error) {
      console.error('Error saving changes:', error);
      setError('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const removeAssignment = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to remove this protocol from the client?')) return;
    
    try {
      setRemovingAssignment(assignmentId);
      setError(null);
      
      const response = await fetch(`/api/protocols/assignments/${assignmentId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setSuccessMessage('Protocol removed successfully');
        await loadData(params.id as string);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Error removing protocol');
      }
    } catch (error) {
      console.error('Error removing assignment:', error);
      setError('Error removing protocol');
    } finally {
      setRemovingAssignment(null);
    }
  };

  const processedProtocols: ProtocolWithAssignment[] = React.useMemo(() => {
    if (!patient || !protocols) {
      return [];
    }

    return protocols.map(protocol => {
      const assignment = patient.prescriptions?.find((p: any) => p.protocol_id === protocol.id);
      
      let assignmentStatus: 'UNASSIGNED' | 'ACTIVE' | 'INACTIVE' | 'UNAVAILABLE' | 'SOON' = 'UNASSIGNED';
      
      if (assignment) {
        assignmentStatus = assignment.status;
      } else if (protocol.isTemplate) {
        assignmentStatus = 'UNAVAILABLE';
      }

      return {
        ...protocol,
        assignment,
        assignmentStatus
      };
    });
  }, [patient, protocols]);

  // Filter protocols
  const filteredProtocols = processedProtocols.filter(protocol => 
    protocol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    protocol.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Separate protocols by status
  const assignedProtocols = filteredProtocols.filter(p => 
    p.assignmentStatus === 'ACTIVE' || p.assignmentStatus === 'INACTIVE' || p.assignmentStatus === 'UNAVAILABLE' || p.assignmentStatus === 'SOON'
  );
  const availableProtocols = filteredProtocols.filter(p => 
    p.assignmentStatus === 'UNASSIGNED' && p.status === 'PUBLISHED' && !p.isTemplate
  );

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  const handleSubmit = async () => {
    try {
      const response = await fetch(`/api/patients/${patient?.id}/protocols`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocolId: form.protocolId,
          startDate: form.startDate.toISOString(),
          consultationDate: form.consultationDate?.toISOString() || null
        })
      });

      if (response.ok) {
        router.push(`/doctor/patients/${patient?.id}`);
      } else {
        console.error('Failed to assign protocol');
      }
    } catch (error) {
      console.error('Error assigning protocol:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            
            {/* Header Skeleton */}
            <div className="flex items-center gap-6 mb-8">
              <div className="h-10 bg-gray-200 rounded-xl w-24 animate-pulse"></div>
              <div className="flex-1">
                <div className="h-8 bg-gray-200 rounded-lg w-64 mb-2 animate-pulse"></div>
                <div className="h-5 bg-gray-100 rounded-lg w-96 animate-pulse"></div>
              </div>
            </div>

            {/* Search Skeleton */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 mb-8">
              <div className="h-12 bg-gray-100 rounded-xl animate-pulse"></div>
            </div>

            {/* Content Skeleton */}
            <div className="grid lg:grid-cols-2 gap-8">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white border border-gray-200 shadow-sm rounded-xl">
                  <div className="p-6 border-b border-gray-200">
                    <div className="h-6 bg-gray-200 rounded w-48 mb-2 animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded w-64 animate-pulse"></div>
                  </div>
                  <div className="p-6 space-y-4">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="h-32 bg-gray-50 rounded-xl animate-pulse"></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    );
  }

  if (error && !patient) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="lg:ml-64">
          <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center">
                <XMarkIcon className="h-16 w-16 text-red-500 mx-auto mb-6" />
                <h2 className="text-2xl font-semibold mb-4 text-gray-900">{error}</h2>
                <div className="flex gap-4 justify-center">
                  <Button 
                    onClick={() => loadData(params.id as string)} 
                    className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-3 rounded-xl shadow-lg"
                  >
                    Try Again
                  </Button>
                  <Button 
                    variant="outline" 
                    asChild 
                    className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-semibold px-6 py-3 rounded-xl"
                  >
                    <Link href="/doctor/patients">Back to Clients</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeCount = assignedProtocols.filter(p => p.assignmentStatus === 'ACTIVE').length;
  const inactiveCount = assignedProtocols.filter(p => p.assignmentStatus === 'INACTIVE').length;
  const unavailableCount = assignedProtocols.filter(p => p.assignmentStatus === 'UNAVAILABLE').length;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-6">
              <Button 
                variant="outline" 
                asChild 
                className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium px-4 py-2 rounded-xl shadow-sm"
              >
                <Link href={`/doctor/patients/${patient?.id}`}>
                  <ArrowLeftIcon className="h-4 w-4 mr-2" />
                  Back
                </Link>
              </Button>
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Protocol Management
                </h1>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    {patient?.name || patient?.email}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-2 text-emerald-600 font-medium">
                    <PlayIcon className="h-4 w-4" />
                    {activeCount} active
                  </span>
                  {inactiveCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-2 text-amber-600 font-medium">
                        <PauseIcon className="h-4 w-4" />
                        {inactiveCount} paused
                      </span>
                    </>
                  )}
                  {unavailableCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-2 text-red-600 font-medium">
                        <StopIcon className="h-4 w-4" />
                        {unavailableCount} stopped
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Save Button */}
            {hasPendingChanges && (
              <div className="fixed bottom-6 right-6 z-50">
                <Button
                  onClick={saveChanges}
                  disabled={isSaving}
                  className="bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl px-6 py-3 font-semibold shadow-lg flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckIcon className="h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Messages */}
          {error && (
            <Card className="bg-red-50 border-red-200 shadow-sm rounded-xl mb-6">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <XMarkIcon className="h-5 w-5 text-red-600" />
                  <span className="text-sm text-red-700 font-medium">{error}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setError(null)} 
                    className="ml-auto text-red-600 hover:text-red-700 hover:bg-red-100 h-8 w-8 p-0 rounded-lg"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {successMessage && (
            <Card className="bg-emerald-50 border-emerald-200 shadow-sm rounded-xl mb-6">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckIcon className="h-5 w-5 text-emerald-600" />
                  <span className="text-sm text-emerald-700 font-medium">{successMessage}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSuccessMessage(null)} 
                    className="ml-auto text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 h-8 w-8 p-0 rounded-lg"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {hasPendingChanges && (
            <Card className="bg-blue-50 border-blue-200 shadow-sm rounded-xl mb-6">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <ExclamationTriangleIcon className="h-5 w-5 text-blue-600" />
                  <span className="text-sm text-blue-700 font-medium">
                    You have unsaved changes. Click "Save Changes" to apply them.
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Search */}
          <Card className="bg-white border border-gray-200 shadow-sm rounded-xl mb-8">
            <CardContent className="p-6">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="Search protocols by name or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-12 h-12 bg-white border-gray-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 text-gray-700 placeholder:text-gray-500 text-base rounded-xl"
                />
                {searchTerm && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSearchTerm('')} 
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 text-gray-400 hover:text-gray-600 rounded-lg"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Side by side layout */}
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Assigned Protocols */}
            <Card className="bg-white border border-gray-200 shadow-sm rounded-xl">
              <CardHeader className="p-6 border-b border-gray-200">
                <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-3">
                  <CheckIcon className="h-6 w-6 text-emerald-600" />
                  Assigned Protocols
                  <Badge className="bg-gray-50 text-gray-700 border border-gray-200 px-3 py-1 rounded-full text-sm font-semibold">
                    {assignedProtocols.length}
                  </Badge>
                </CardTitle>
                <p className="text-sm text-gray-600 mt-2">Protocols currently assigned to this client</p>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {assignedProtocols.length === 0 ? (
                  <div className="text-center py-12">
                    <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-600 mb-2">No protocols assigned</p>
                    <p className="text-sm text-gray-500">
                      Assign protocols so the client can follow the treatment
                    </p>
                  </div>
                ) : (
                  assignedProtocols.map((protocol) => (
                    <ProtocolCard
                      key={protocol.id}
                      protocol={protocol}
                      onStatusChange={handleStatusChange}
                      onRemove={removeAssignment}
                      isUpdating={updatingStatus === protocol.assignment!.id}
                      isRemoving={removingAssignment === protocol.assignment!.id}
                      pendingStatus={pendingChanges[protocol.assignment!.id]?.status}
                      pendingConsultationDate={pendingChanges[protocol.assignment!.id]?.consultationDate}
                      pendingStartDate={pendingChanges[protocol.assignment!.id]?.startDate}
                      pendingEndDate={pendingChanges[protocol.assignment!.id]?.endDate}
                      hasPendingChanges={!!pendingChanges[protocol.assignment!.id]}
                      onConsultationDateChange={handleConsultationDateChange}
                      onTreatmentDatesChange={handleTreatmentDatesChange}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            {/* Available Protocols */}
            <Card className="bg-white border border-gray-200 shadow-sm rounded-xl">
              <CardHeader className="p-6 border-b border-gray-200">
                <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-3">
                  <PlusIcon className="h-6 w-6 text-teal-600" />
                  Available Protocols
                  <Badge className="bg-gray-50 text-gray-700 border border-gray-200 px-3 py-1 rounded-full text-sm font-semibold">
                    {availableProtocols.length}
                  </Badge>
                </CardTitle>
                <p className="text-sm text-gray-600 mt-2">Protocols ready to be assigned to this client</p>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {availableProtocols.length === 0 ? (
                  <div className="text-center py-12">
                    <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-600 mb-2">
                      {searchTerm 
                        ? `No available protocols found for "${searchTerm}"` 
                        : protocols.length === 0
                          ? 'No protocols created yet'
                          : 'All protocols have been assigned'}
                    </p>
                    {protocols.length === 0 ? (
                      <Button 
                        asChild 
                        className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-3 rounded-xl shadow-lg"
                      >
                        <Link href="/doctor/protocols">Create Protocols</Link>
                      </Button>
                    ) : searchTerm ? (
                      <Button 
                        variant="outline" 
                        onClick={() => setSearchTerm('')} 
                        className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-semibold px-6 py-3 rounded-xl"
                      >
                        Clear search
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  availableProtocols.map((protocol) => (
                    <ProtocolCard
                      key={protocol.id} 
                      protocol={protocol}
                      onAssign={assignProtocol}
                      isAssigning={isAssigning === protocol.id}
                      startDate={assignStartDate}
                      onStartDateChange={setAssignStartDate}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Empty state when no protocols match search */}
          {filteredProtocols.length === 0 && searchTerm && (
            <Card className="bg-white border border-gray-200 shadow-sm rounded-xl mt-8">
              <CardContent className="p-12 text-center">
                <MagnifyingGlassIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">
                  No protocols found for "{searchTerm}"
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  Try adjusting your search terms or browse all available protocols
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => setSearchTerm('')} 
                  className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium px-6 py-2 rounded-xl"
                >
                  Clear search
                </Button>
              </CardContent>
            </Card>
          )}

          {selectedProtocol && (
            <Card className="bg-white border-gray-200 shadow-lg rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold text-gray-900">Assignment Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-gray-900 font-semibold">Start Date</Label>
                  <Input
                    type="date"
                    value={format(form.startDate, 'yyyy-MM-dd')}
                    onChange={(e) => setForm(prev => ({ ...prev, startDate: new Date(e.target.value) }))}
                    className="border-gray-300 focus:border-[#5154e7] focus:ring-[#5154e7] bg-white text-gray-900 rounded-xl h-12"
                  />
                </div>

                <ConsultationDatePicker
                  consultationDate={form.consultationDate}
                  onDateChange={(date) => setForm(prev => ({ ...prev, consultationDate: date }))}
                />

                <Button
                  onClick={handleSubmit}
                  className="w-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white rounded-xl h-12 font-semibold"
                >
                  <CheckIcon className="h-4 w-4 mr-2" />
                  Assign Protocol
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
} 