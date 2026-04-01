import { useEffect, useState, ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Users, Activity, Bed, UserMinus, X, Eye, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { resolveMediaUrl } from '../lib/media';
import { useAuthStore } from '../store/authStore';
import StatsCard from '../components/dashboard/StatsCard';

interface FloorRef {
  _id?: string;
  floorNumber?: number;
}

interface RoomRef {
  _id?: string;
  roomNumber?: string;
  floor?: FloorRef;
}

interface PatientRecord {
  _id?: string;
  id?: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  dateOfBirth?: string;
  gender?: string;
  bloodType?: string;
  medicalHistory?: string;
  allergies?: string[];
  status?: string;
  bed?: {
    _id?: string;
    bedNumber?: string;
    room?: RoomRef;
  };
  assignedDoctor?: {
    _id?: string;
    user?: { firstName?: string; lastName?: string };
  };
  assignedNurses?: Array<{
    _id?: string;
    user?: { firstName?: string; lastName?: string };
  }>;
}

interface PatientFormData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  bloodType: string;
  medicalHistory: string;
  allergies: string;
  assignedDoctorId: string;
  assignedNurseId: string;
  bedId: string;
}

interface DoctorOption {
  _id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
}

interface NurseOption {
  _id: string;
  firstName: string;
  lastName: string;
  shift?: string;
}

interface BedOption {
  _id: string;
  bedNumber?: string;
  room?: RoomRef;
}

const initialFormState: PatientFormData = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: 'MALE',
  bloodType: '',
  medicalHistory: '',
  allergies: '',
  assignedDoctorId: '',
  assignedNurseId: '',
  bedId: '',
};

export default function PatientsPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const isNurse = user?.role === 'NURSE';
  const isDoctor = user?.role === 'DOCTOR';
  const canManagePatients = isAdmin || isNurse;
  const userId = user?.id || '';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<PatientFormData>(initialFormState);
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState('');
  const [removeProfilePicture, setRemoveProfilePicture] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [doctorOptions, setDoctorOptions] = useState<DoctorOption[]>([]);
  const [nurseOptions, setNurseOptions] = useState<NurseOption[]>([]);
  const [bedOptions, setBedOptions] = useState<BedOption[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterDoctorId, setFilterDoctorId] = useState('');
  const [filterNurseId, setFilterNurseId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const PAGE_SIZE = 10;

  const getPatientId = (patient: PatientRecord | null) =>
    patient?._id || patient?.id || '';

  const formatDateForInput = (value?: string) =>
    value ? new Date(value).toISOString().split('T')[0] : '';

  const formatBedLabel = (
    bed?: {
      bedNumber?: string;
      room?: RoomRef;
    }
  ) => {
    if (!bed) return 'Unassigned';
    const parts = [`Bed ${bed.bedNumber ?? ''}`.trim()];
    if (bed.room?.roomNumber) parts.push(`Room ${bed.room.roomNumber}`);
    if (bed.room?.floor?.floorNumber !== undefined) {
      parts.push(`Floor ${bed.room.floor.floorNumber}`);
    }
    return parts.filter(Boolean).join(' • ');
  };

  const formatFloorLabel = (floor?: FloorRef) =>
    floor?.floorNumber !== undefined ? `Floor ${floor.floorNumber}` : 'Floor';

  const formatRoomLabel = (room?: RoomRef) =>
    room?.roomNumber ? `Room ${room.roomNumber}` : 'Room';

  const formatNurseNames = (nurses?: PatientRecord['assignedNurses']) => {
    if (!nurses || nurses.length === 0) return 'Not assigned';
    const names = nurses
      .map((nurse) => {
        if (!nurse) return '';
        const firstName = nurse.user?.firstName || (nurse as any).firstName || '';
        const lastName = nurse.user?.lastName || (nurse as any).lastName || '';
        return [firstName, lastName].filter(Boolean).join(' ');
      })
      .filter(Boolean);
    return names.length > 0 ? names.join(', ') : 'Not assigned';
  };

  const getPatientInitials = (firstName?: string, lastName?: string) =>
    `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.toUpperCase() || 'P';

  const getStatusBadgeClasses = (status?: string) => {
    const value = (status || '').toUpperCase();
    switch (value) {
      case 'CRITICAL':
        return 'badge badge-danger';
      case 'STABLE':
        return 'badge badge-success';
      case 'MODERATE':
        return 'badge badge-warning';
      case 'RECOVERING':
        return 'badge badge-info';
      case 'DISCHARGED':
        return 'badge bg-gray-200 text-gray-700';
      default:
        return 'badge bg-gray-100 text-gray-700';
    }
  };

  const currentBedOption: BedOption | null =
    modalMode === 'edit' && selectedPatient?.bed
      ? (selectedPatient.bed as BedOption)
      : null;

  const fetchPatients = async () => {
    setLoading(true);
    try {
      const response = await api.get('/patients');
      setPatients(response.data.data.patients);
    } catch (error) {
      console.error('Failed to fetch patients');
      toast.error('Failed to load patients');
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientMetadata = async () => {
    if (!canManagePatients) return;
    setMetadataLoading(true);
    try {
      const response = await api.get('/patients/metadata');
      const { doctors = [], nurses = [], beds = [] } = response.data.data || {};
      setDoctorOptions(doctors);
      setNurseOptions(nurses);
      setBedOptions(beds);
    } catch (error) {
      console.error('Failed to fetch patient metadata');
      toast.error('Failed to load patient helpers');
    } finally {
      setMetadataLoading(false);
    }
  };

  const refreshPatientsData = async () => {
    await fetchPatients();
    if (canManagePatients) {
      await fetchPatientMetadata();
    }
  };

  const resetForm = () => {
    setFormData({ ...initialFormState });
    setSelectedPatient(null);
    setSelectedFloorId('');
    setSelectedRoomId('');
  };

  const openCreateModal = () => {
    setModalMode('create');
    resetForm();
    setProfilePictureFile(null);
    setProfilePicturePreview('');
    setRemoveProfilePicture(false);
    if (canManagePatients && doctorOptions.length === 0) {
      fetchPatientMetadata();
    }
    setIsModalOpen(true);
  };

  const openEditModal = (patient: PatientRecord) => {
    setModalMode('edit');
    setSelectedPatient(patient);
    setFormData({
      firstName: patient.firstName || '',
      lastName: patient.lastName || '',
      dateOfBirth: formatDateForInput(patient.dateOfBirth),
      gender: (patient.gender as string) || 'MALE',
      bloodType: patient.bloodType || '',
      medicalHistory: patient.medicalHistory || '',
      allergies: (patient.allergies || []).join(', '),
      assignedDoctorId: patient.assignedDoctor?._id || '',
      assignedNurseId:
        ((patient.assignedNurses || [])
          .map((nurse) => nurse._id)
          .filter(Boolean) as string[])[0] || '',
      bedId: patient.bed?._id || '',
    });
    setProfilePicturePreview(resolveMediaUrl(patient.profilePicture));
    setProfilePictureFile(null);
    setRemoveProfilePicture(false);
    setSelectedFloorId(patient.bed?.room?.floor?._id || '');
    setSelectedRoomId(patient.bed?.room?._id || '');
    if (canManagePatients && doctorOptions.length === 0) {
      fetchPatientMetadata();
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    setProfilePictureFile(null);
    setProfilePicturePreview('');
    setRemoveProfilePicture(false);
    setSubmitting(false);
  };

  const handleFloorSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedFloorId(value);
    setSelectedRoomId('');
    setFormData((prev) => ({ ...prev, bedId: '' }));
  };

  const handleRoomSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedRoomId(value);
    setFormData((prev) => ({ ...prev, bedId: '' }));
  };

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === 'bedId') {
      const fallbackBeds: BedOption[] = [];
      if (currentBedOption?._id) {
        fallbackBeds.push(currentBedOption as BedOption);
      }
      const targetBed = [...bedOptions, ...fallbackBeds].find((bed) => bed._id === value);
      if (targetBed?.room?.floor?._id) {
        setSelectedFloorId(targetBed.room.floor._id);
      }
      if (targetBed?.room?._id) {
        setSelectedRoomId(targetBed.room._id);
      }
    }
  };

  const handleProfilePictureChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setProfilePictureFile(file);
    setRemoveProfilePicture(false);

    if (file) {
      setProfilePicturePreview(URL.createObjectURL(file));
      return;
    }

    if (selectedPatient?.profilePicture) {
      setProfilePicturePreview(resolveMediaUrl(selectedPatient.profilePicture));
      return;
    }

    setProfilePicturePreview('');
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  useEffect(() => {
    if (canManagePatients) {
      fetchPatientMetadata();
    }
  }, [canManagePatients]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManagePatients) return;

    setSubmitting(true);

    const payload = new FormData();
    payload.append('firstName', formData.firstName.trim());
    payload.append('lastName', formData.lastName.trim());
    payload.append('dateOfBirth', formData.dateOfBirth);
    payload.append('gender', formData.gender);
    payload.append('bloodType', formData.bloodType || '');
    payload.append('medicalHistory', formData.medicalHistory || '');
    payload.append(
      'allergies',
      JSON.stringify(
        formData.allergies
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
    payload.append('bedId', formData.bedId || '');
    payload.append('assignedDoctorId', formData.assignedDoctorId || '');

    if (isAdmin) {
      payload.append(
        'assignedNurseIds',
        JSON.stringify(formData.assignedNurseId ? [formData.assignedNurseId] : [])
      );
    }

    if (profilePictureFile) {
      payload.append('profilePicture', profilePictureFile);
    } else if (modalMode === 'edit' && removeProfilePicture) {
      payload.append('removeProfilePicture', 'true');
    }

    try {
      if (modalMode === 'create') {
        await api.post('/patients', payload);
        toast.success('Patient created successfully');
      } else {
        const patientId = getPatientId(selectedPatient);
        await api.put(`/patients/${patientId}`, payload);
        toast.success('Patient updated successfully');
      }
      closeModal();
      await refreshPatientsData();
    } catch (error) {
      console.error('Failed to save patient', error);
      toast.error('Failed to save patient');
      setSubmitting(false);
    }
  };

  const handleDeletePatient = async (patient: PatientRecord) => {
    if (!canManagePatients) return;
    const patientId = getPatientId(patient);
    if (!patientId) return;

    const confirmed = window.confirm('Are you sure you want to delete this patient?');
    if (!confirmed) return;

    setDeleteLoadingId(patientId);
    try {
      await api.delete(`/patients/${patientId}`);
      toast.success('Patient deleted successfully');
      await refreshPatientsData();
    } catch (error) {
      console.error('Failed to delete patient', error);
      toast.error('Failed to delete patient');
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const shouldShowCurrentBedOption = !!(
    currentBedOption?._id && !bedOptions.some((bed) => bed._id === currentBedOption._id)
  );
  const currentFloorId = currentBedOption?.room?.floor?._id || '';
  const currentRoomId = currentBedOption?.room?._id || '';
  const currentFloorOption = currentBedOption?.room?.floor || null;
  const currentRoomOption = currentBedOption?.room || null;

  const floorOptionsList = Array.from(
    bedOptions.reduce((map, bed) => {
      const floorId = bed.room?.floor?._id;
      if (!floorId || map.has(floorId)) return map;
      map.set(floorId, {
        id: floorId,
        label: formatFloorLabel(bed.room?.floor),
      });
      return map;
    }, new Map<string, { id: string; label: string }>() ).values()
  );

  const allRoomOptions = Array.from(
    bedOptions.reduce((map, bed) => {
      const roomId = bed.room?._id;
      if (!roomId || map.has(roomId)) return map;
      map.set(roomId, {
        id: roomId,
        label: formatRoomLabel(bed.room),
        floorId: bed.room?.floor?._id || '',
      });
      return map;
    }, new Map<string, { id: string; label: string; floorId: string }>() ).values()
  );

  const roomOptions = allRoomOptions.filter((room) =>
    selectedFloorId ? room.floorId === selectedFloorId : true
  );

  const filteredBedOptions = bedOptions.filter((bed) => {
    const roomId = bed.room?._id;
    const floorId = bed.room?.floor?._id;
    if (selectedRoomId) return roomId === selectedRoomId;
    if (selectedFloorId) return floorId === selectedFloorId;
    return true;
  });

  const shouldShowCurrentFloorOption = Boolean(
    currentFloorId && !floorOptionsList.some((floor) => floor.id === currentFloorId)
  );
  const shouldShowCurrentRoomOption = Boolean(
    currentRoomId && !allRoomOptions.some((room) => room.id === currentRoomId)
  );

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setFilterDoctorId('');
    setFilterNurseId('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterLocation('');
  };

  const roomSelectDisabled = !selectedFloorId;
  const bedSelectDisabled =
    (!selectedRoomId && !currentRoomId) ||
    (metadataLoading && bedOptions.length === 0 && !currentBedOption);

  const roleAccessiblePatients = patients.filter((patient) => {
    if (isAdmin) return true;
    if (isNurse) {
      return patient.assignedNurses?.some(
        (nurse) => nurse._id === userId || nurse._id === user?.id
      );
    }
    if (isDoctor) {
      const doctorId = patient.assignedDoctor?._id || patient.assignedDoctor;
      return doctorId === userId || doctorId === user?.id;
    }
    return false;
  });

  // Calculate stats based on role-accessible patients
  const totalPatients = roleAccessiblePatients.length;
  const criticalPatients = roleAccessiblePatients.filter(
    (patient: any) => (patient.status || '').toUpperCase() === 'CRITICAL'
  ).length;
  const assignedBeds = roleAccessiblePatients.filter((patient: any) => Boolean(patient.bed)).length;
  const unassignedPatients = Math.max(totalPatients - assignedBeds, 0);

  const commonNurseIds = new Set<string>();
  if (isNurse || isDoctor) {
    roleAccessiblePatients.forEach((patient) => {
      (patient.assignedNurses || []).forEach((nurse) => {
        if (nurse._id) {
          commonNurseIds.add(nurse._id);
        }
      });
    });
  }

  const availableNurseOptions = isAdmin
    ? nurseOptions
    : nurseOptions.filter((nurse) => commonNurseIds.has(nurse._id));

  const filteredPatients = roleAccessiblePatients.filter((patient) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      patient.firstName.toLowerCase().includes(searchLower) ||
      patient.lastName.toLowerCase().includes(searchLower) ||
      patient._id?.toLowerCase().includes(searchLower);

    const matchesStatus = !statusFilter || (patient.status || '').toUpperCase() === statusFilter.toUpperCase();

    const matchesDoctor = !filterDoctorId || patient.assignedDoctor?._id === filterDoctorId;

    const matchesNurse =
      !filterNurseId ||
      (patient.assignedNurses || []).some((nurse) => nurse._id === filterNurseId);

    let matchesDate = true;
    if (filterDateFrom || filterDateTo) {
      const patientDate = patient.dateOfBirth
        ? new Date(patient.dateOfBirth).getTime()
        : null;
      if (filterDateFrom && patientDate) {
        matchesDate = matchesDate && patientDate >= new Date(filterDateFrom).getTime();
      }
      if (filterDateTo && patientDate) {
        matchesDate = matchesDate && patientDate <= new Date(filterDateTo).getTime();
      }
    }

    const matchesLocation =
      !filterLocation ||
      !patient.bed ||
      patient.bed.room?.floor?._id === filterLocation ||
      patient.bed.room?._id === filterLocation;

    return (
      matchesSearch &&
      matchesStatus &&
      matchesDoctor &&
      matchesNurse &&
      matchesDate &&
      matchesLocation
    );
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, filterDoctorId, filterNurseId, filterDateFrom, filterDateTo, filterLocation]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredPatients.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedPatients = filteredPatients.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Patients</h1>
          <p className="text-gray-600 mt-1">Manage and monitor all patients</p>
        </div>
        {canManagePatients && (
          <button type="button" className="btn btn-primary" onClick={openCreateModal}>
            <Plus className="w-5 h-5" />
            Add Patient
          </button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Patients"
          value={totalPatients}
          subtitle={`${criticalPatients} critical`}
          icon={Users}
          color="blue"
        />
        <StatsCard
          title="Critical Cases"
          value={criticalPatients}
          subtitle="Require attention"
          icon={Activity}
          color="red"
        />
        <StatsCard
          title="Assigned Beds"
          value={assignedBeds}
          subtitle={`of ${totalPatients} patients`}
          icon={Bed}
          color="green"
        />
        <StatsCard
          title="Unassigned Patients"
          value={unassignedPatients}
          subtitle="Awaiting bed assignment"
          icon={UserMinus}
          color="orange"
        />
      </div>

      {/* Search & Filters */}
      <div className="card space-y-4">
        <div className="flex gap-4 items-end">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search patients by name or ID..."
              className="input pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="input w-48"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="CRITICAL">Critical</option>
            <option value="STABLE">Stable</option>
            <option value="MODERATE">Moderate</option>
            <option value="RECOVERING">Recovering</option>
            <option value="DISCHARGED">Discharged</option>
          </select>
          {(isAdmin || isNurse || isDoctor) && (
            <button
              type="button"
              className="btn btn-secondary whitespace-nowrap"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              {showAdvancedFilters ? 'Hide' : 'Show'} Advanced
            </button>
          )}
        </div>

        {showAdvancedFilters && (isAdmin || isNurse || isDoctor) && (
          <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {isAdmin && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Doctor</label>
                <select
                  className="input w-full"
                  value={filterDoctorId}
                  onChange={(e) => setFilterDoctorId(e.target.value)}
                >
                  <option value="">All Doctors</option>
                  {doctorOptions.map((doctor) => (
                    <option key={doctor._id} value={doctor._id}>
                      Dr. {doctor.firstName} {doctor.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {isNurse && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Doctor</label>
                <select
                  className="input w-full"
                  value={filterDoctorId}
                  onChange={(e) => setFilterDoctorId(e.target.value)}
                >
                  <option value="">All Doctors</option>
                  {doctorOptions.map((doctor) => (
                    <option key={doctor._id} value={doctor._id}>
                      Dr. {doctor.firstName} {doctor.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(isAdmin || isDoctor) && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nurse</label>
                <select
                  className="input w-full"
                  value={filterNurseId}
                  onChange={(e) => setFilterNurseId(e.target.value)}
                >
                  <option value="">All Nurses</option>
                  {availableNurseOptions.map((nurse) => (
                    <option key={nurse._id} value={nurse._id}>
                      {nurse.firstName} {nurse.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date From</label>
              <input
                type="date"
                className="input w-full"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date To</label>
              <input
                type="date"
                className="input w-full"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Location</label>
              <select
                className="input w-full"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
              >
                <option value="">All Locations</option>
                {floorOptionsList.map((floor) => (
                  <option key={floor.id} value={floor.id}>
                    {floor.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="btn btn-secondary w-full"
                onClick={resetFilters}
              >
                Reset Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Patients Table */}
      <div className="card">
        {loading ? (
          <div className="text-center py-8">Loading patients...</div>
        ) : patients.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No patients found. Add your first patient to get started.
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No patients match your filters. Try adjusting the search criteria.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Patient
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Doctor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Nurse
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedPatients.map((patient: any) => (
                    <tr key={patient._id || patient.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {patient.profilePicture ? (
                            <img
                              src={resolveMediaUrl(patient.profilePicture)}
                              alt={`${patient.firstName} ${patient.lastName}`}
                              className="h-10 w-10 rounded-full object-cover border border-gray-200"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-semibold">
                              {getPatientInitials(patient.firstName, patient.lastName)}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-900">
                              {patient.firstName} {patient.lastName}
                            </div>
                            <div className="text-sm text-gray-500">{patient._id || patient.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`${getStatusBadgeClasses(patient.status)} capitalize`}>
                          {patient.status ? patient.status.replace('_', ' ') : 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {patient.bed ? formatBedLabel(patient.bed) : 'Not assigned'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {(() => {
                          const doctorRecord = patient.assignedDoctor;
                          const doctorData = doctorRecord?.user || doctorRecord;
                          if (doctorData?.firstName || doctorData?.lastName) {
                            return `Dr. ${doctorData.firstName ?? ''} ${doctorData.lastName ?? ''}`.trim();
                          }
                          return 'Not assigned';
                        })()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatNurseNames(patient.assignedNurses)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => navigate(`/patients/${getPatientId(patient)}`)}
                            className="icon-button"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {canManagePatients && (
                            <>
                              <button
                                onClick={() => openEditModal(patient)}
                                className="icon-button"
                                title="Edit patient"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeletePatient(patient)}
                                className="icon-button text-red-600 hover:text-red-700"
                                title="Delete patient"
                                disabled={deleteLoadingId === getPatientId(patient)}
                              >
                                {deleteLoadingId === getPatientId(patient) ? (
                                  <span className="text-xs">...</span>
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            {filteredPatients.length > 0 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredPatients.length)} of {filteredPatients.length} patients
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  <div className="flex gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          currentPage === page
                            ? 'bg-primary text-white'
                            : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  
                  <button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] flex flex-col mx-4 my-10">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {modalMode === 'create' ? 'Add Patient' : 'Edit Patient'}
                </h2>
                <p className="text-sm text-gray-500">
                  {modalMode === 'create'
                    ? 'Create a new patient profile'
                    : 'Update patient information'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="label" htmlFor="firstName">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    className="input"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="lastName">
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    className="input"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="dateOfBirth">
                    Date of Birth
                  </label>
                  <input
                    id="dateOfBirth"
                    type="date"
                    name="dateOfBirth"
                    className="input"
                    value={formData.dateOfBirth}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="profilePicture">
                    Profile Picture
                  </label>
                  <input
                    id="profilePicture"
                    type="file"
                    accept="image/*"
                    className="input"
                    onChange={handleProfilePictureChange}
                  />
                  {profilePicturePreview && !removeProfilePicture && (
                    <img
                      src={profilePicturePreview}
                      alt="Profile preview"
                      className="mt-2 h-16 w-16 rounded-full object-cover border border-gray-200"
                    />
                  )}
                  {modalMode === 'edit' && (
                    <label className="mt-2 inline-flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={removeProfilePicture}
                        onChange={(event) => setRemoveProfilePicture(event.target.checked)}
                      />
                      Remove current picture
                    </label>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor="gender">
                    Gender
                  </label>
                  <select
                    id="gender"
                    name="gender"
                    className="input"
                    value={formData.gender}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="bloodType">
                    Blood Type
                  </label>
                  <input
                    id="bloodType"
                    name="bloodType"
                    className="input"
                    value={formData.bloodType}
                    onChange={handleInputChange}
                    placeholder="e.g., O+"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="allergies">
                    Allergies
                  </label>
                  <input
                    id="allergies"
                    name="allergies"
                    className="input"
                    value={formData.allergies}
                    onChange={handleInputChange}
                    placeholder="Comma separated"
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="medicalHistory">
                  Medical History
                </label>
                <textarea
                  id="medicalHistory"
                  name="medicalHistory"
                  className="input min-h-[120px]"
                  value={formData.medicalHistory}
                  onChange={handleInputChange}
                  placeholder="Relevant notes"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="label" htmlFor="assignedDoctorId">
                    Assigned Doctor
                  </label>
                  <select
                    id="assignedDoctorId"
                    name="assignedDoctorId"
                    className="input"
                    value={formData.assignedDoctorId}
                    onChange={handleInputChange}
                    disabled={metadataLoading && doctorOptions.length === 0}
                  >
                    <option value="">Unassigned</option>
                    {doctorOptions.map((doctor) => (
                      <option key={doctor._id} value={doctor._id}>
                        {`Dr. ${doctor.firstName} ${doctor.lastName}${
                          doctor.specialization ? ` • ${doctor.specialization}` : ''
                        }`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="floorId">
                    Floor
                  </label>
                  <select
                    id="floorId"
                    className="input"
                    value={selectedFloorId}
                    onChange={handleFloorSelectChange}
                    disabled={metadataLoading && floorOptionsList.length === 0 && !currentFloorOption}
                  >
                    <option value="">Select floor</option>
                    {floorOptionsList.map((floor) => (
                      <option key={floor.id} value={floor.id}>
                        {floor.label}
                      </option>
                    ))}
                    {shouldShowCurrentFloorOption && currentFloorOption?._id && (
                      <option value={currentFloorOption._id}>
                        {`${formatFloorLabel(currentFloorOption)} (current)`}
                      </option>
                    )}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Pick a floor to narrow down available rooms and beds.
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor="roomId">
                    Room
                  </label>
                  <select
                    id="roomId"
                    className="input"
                    value={selectedRoomId}
                    onChange={handleRoomSelectChange}
                    disabled={roomSelectDisabled && !shouldShowCurrentRoomOption}
                  >
                    <option value="">Select room</option>
                    {roomOptions.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.label}
                      </option>
                    ))}
                    {shouldShowCurrentRoomOption && currentRoomOption?._id && (
                      <option value={currentRoomOption._id}>
                        {`${formatRoomLabel(currentRoomOption)} (current)`}
                      </option>
                    )}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Choose a room after selecting a floor.
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor="bedId">
                    Bed
                  </label>
                  <select
                    id="bedId"
                    name="bedId"
                    className="input"
                    value={formData.bedId}
                    onChange={handleInputChange}
                    disabled={bedSelectDisabled}
                  >
                    <option value="">Not assigned</option>
                    {filteredBedOptions.map((bed) =>
                      bed._id ? (
                        <option key={bed._id} value={bed._id}>
                          {formatBedLabel(bed)}
                        </option>
                      ) : null
                    )}
                    {shouldShowCurrentBedOption && currentBedOption?._id && (
                      <option value={currentBedOption._id}>
                        {`${formatBedLabel(currentBedOption)} (current)`}
                      </option>
                    )}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Beds become available once you select a room.
                  </p>
                </div>
              </div>

              {isAdmin ? (
                <div>
                  <label className="label" htmlFor="assignedNurseId">
                    Assigned Nurse
                  </label>
                  <select
                    id="assignedNurseId"
                    name="assignedNurseId"
                    className="input"
                    value={formData.assignedNurseId}
                    onChange={handleInputChange}
                    disabled={metadataLoading && nurseOptions.length === 0}
                  >
                    <option value="">Unassigned</option>
                    {nurseOptions.map((nurse) => (
                      <option key={nurse._id} value={nurse._id}>
                        {`${nurse.firstName} ${nurse.lastName}${
                          nurse.shift ? ` • ${nurse.shift.toLowerCase()} shift` : ''
                        }`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  You are automatically assigned as the primary nurse for this patient. Admins
                  can add additional nurses if needed.
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting
                    ? 'Saving...'
                    : modalMode === 'create'
                    ? 'Create Patient'
                    : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
