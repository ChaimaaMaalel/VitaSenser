import { useEffect, useState, ChangeEvent, FormEvent } from 'react';
import { Building2, Bed, Activity, Plus, Trash2, Pencil, X, Search } from 'lucide-react';
import StatsCard from '../components/dashboard/StatsCard';
import api from '../lib/api';
import toast from 'react-hot-toast';

interface BedStats {
  total: number;
  occupied: number;
  available: number;
  occupancyRate: number;
}

interface Floor {
  _id: string;
  floorNumber: number;
  name: string;
  description?: string;
  rooms: Room[];
  createdBy: any;
}

interface Room {
  _id: string;
  roomNumber: string;
  name?: string;
  type: 'ICU' | 'GENERAL' | 'EMERGENCY' | 'SURGERY' | 'ISOLATION';
  capacity: number;
  floor: any;
  beds: Bed[];
}

interface Bed {
  _id: string;
  bedNumber: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED';
  room: any;
  patient?: any;
}

type ModalType = 'floor' | 'room' | 'bed' | null;

const ITEMS_PER_PAGE = 5;

export default function HospitalPage() {
  const [bedStats, setBedStats] = useState<BedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  
  // Floor pagination and search
  const [floorCurrentPage, setFloorCurrentPage] = useState(1);
  const [floorSearch, setFloorSearch] = useState('');
  const [floorTypeFilter, setFloorTypeFilter] = useState<'ALL' | 'EMPTY' | 'FULL'>('ALL');
  
  // Room pagination and search
  const [roomCurrentPage, setRoomCurrentPage] = useState(1);
  const [roomSearch, setRoomSearch] = useState('');
  const [roomTypeFilter, setRoomTypeFilter] = useState<'ALL' | 'ICU' | 'GENERAL' | 'EMERGENCY' | 'SURGERY' | 'ISOLATION'>('ALL');
  
  // Bed pagination and search
  const [bedCurrentPage, setBedCurrentPage] = useState(1);
  const [bedSearch, setBedSearch] = useState('');
  const [bedStatusFilter, setBedStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED'>('ALL');
  
  const [modalType, setModalType] = useState<ModalType>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [floorForm, setFloorForm] = useState({ floorNumber: '', name: '', description: '' });
  const [roomForm, setRoomForm] = useState({ roomNumber: '', name: '', type: 'GENERAL', capacity: '', floor: '' });
  const [bedForm, setBedForm] = useState({ bedNumber: '', status: 'AVAILABLE', room: '' });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [statsRes, floorsRes, roomsRes, bedsRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/hospital/floors'),
        api.get('/hospital/rooms'),
        api.get('/hospital/beds'),
      ]);
      setBedStats(statsRes.data.data.beds);
      setFloors(floorsRes.data.data.floors || []);
      setRooms(roomsRes.data.data.rooms || []);
      setBeds(bedsRes.data.data.beds || []);
    } catch (error) {
      console.error('Failed to load data');
      toast.error('Failed to load hospital data');
    } finally {
      setLoading(false);
    }
  };

  // Floor handlers
  const handleOpenFloorModal = (floor?: Floor) => {
    if (floor) {
      setEditingItem(floor);
      setFloorForm({ floorNumber: String(floor.floorNumber), name: floor.name, description: floor.description || '' });
    } else {
      setEditingItem(null);
      setFloorForm({ floorNumber: '', name: '', description: '' });
    }
    setModalType('floor');
  };

  const handleSubmitFloor = async (e: FormEvent) => {
    e.preventDefault();
    if (!floorForm.floorNumber || !floorForm.name) {
      toast.error('Floor number and name are required');
      return;
    }

    try {
      setSubmitting(true);
      if (editingItem) {
        await api.put(`/hospital/floors/${editingItem._id}`, { name: floorForm.name, description: floorForm.description });
        toast.success('Floor updated');
      } else {
        await api.post('/hospital/floors', floorForm);
        toast.success('Floor created');
      }
      await fetchAllData();
      setModalType(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to save floor');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFloor = async (id: string) => {
    if (!confirm('Delete this floor?')) return;
    try {
      await api.delete(`/hospital/floors/${id}`);
      toast.success('Floor deleted');
      await fetchAllData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete floor');
    }
  };

  // Room handlers
  const handleOpenRoomModal = (room?: Room) => {
    if (room) {
      setEditingItem(room);
      setRoomForm({ roomNumber: room.roomNumber, name: room.name || '', type: room.type, capacity: String(room.capacity), floor: room.floor?._id || '' });
    } else {
      setEditingItem(null);
      setRoomForm({ roomNumber: '', name: '', type: 'GENERAL', capacity: '', floor: '' });
    }
    setModalType('room');
  };

  const handleSubmitRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!roomForm.roomNumber || !roomForm.type || !roomForm.capacity || !roomForm.floor) {
      toast.error('All fields are required');
      return;
    }

    try {
      setSubmitting(true);
      if (editingItem) {
        await api.put(`/hospital/rooms/${editingItem._id}`, { ...roomForm, capacity: Number(roomForm.capacity) });
        toast.success('Room updated');
      } else {
        await api.post('/hospital/rooms', { ...roomForm, capacity: Number(roomForm.capacity) });
        toast.success('Room created');
      }
      await fetchAllData();
      setModalType(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to save room');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!confirm('Delete this room?')) return;
    try {
      await api.delete(`/hospital/rooms/${id}`);
      toast.success('Room deleted');
      await fetchAllData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete room');
    }
  };

  // Bed handlers
  const handleOpenBedModal = (bed?: Bed) => {
    if (bed) {
      setEditingItem(bed);
      setBedForm({ bedNumber: bed.bedNumber, status: bed.status, room: bed.room?._id || '' });
    } else {
      setEditingItem(null);
      setBedForm({ bedNumber: '', status: 'AVAILABLE', room: '' });
    }
    setModalType('bed');
  };

  const handleSubmitBed = async (e: FormEvent) => {
    e.preventDefault();
    if (!bedForm.bedNumber || !bedForm.room) {
      toast.error('Bed number and room are required');
      return;
    }

    try {
      setSubmitting(true);
      if (editingItem) {
        await api.put(`/hospital/beds/${editingItem._id}`, { status: bedForm.status });
        toast.success('Bed updated');
      } else {
        await api.post('/hospital/beds', bedForm);
        toast.success('Bed created');
      }
      await fetchAllData();
      setModalType(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to save bed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBed = async (id: string) => {
    if (!confirm('Delete this bed?')) return;
    try {
      await api.delete(`/hospital/beds/${id}`);
      toast.success('Bed deleted');
      await fetchAllData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete bed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const totalBeds = bedStats?.total ?? 0;
  const occupiedBeds = bedStats?.occupied ?? 0;
  const availableBeds = bedStats?.available ?? Math.max(totalBeds - occupiedBeds, 0);
  const occupancyRate = bedStats?.occupancyRate ?? 0;

  // Floor filtering and pagination
  const filteredFloors = floors.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(floorSearch.toLowerCase()) || String(f.floorNumber).includes(floorSearch);
    const matchesFilter = 
      floorTypeFilter === 'ALL' ? true :
      floorTypeFilter === 'EMPTY' ? (f.rooms?.length ?? 0) === 0 :
      floorTypeFilter === 'FULL' ? (f.rooms?.length ?? 0) > 0 :
      true;
    return matchesSearch && matchesFilter;
  });
  const floorPages = Math.ceil(filteredFloors.length / ITEMS_PER_PAGE);
  const paginatedFloors = filteredFloors.slice(
    (floorCurrentPage - 1) * ITEMS_PER_PAGE,
    floorCurrentPage * ITEMS_PER_PAGE
  );

  // Room filtering and pagination
  const filteredRooms = rooms.filter(r => {
    const matchesSearch = r.roomNumber.toLowerCase().includes(roomSearch.toLowerCase()) || 
                         r.name?.toLowerCase().includes(roomSearch.toLowerCase());
    const matchesFilter = roomTypeFilter === 'ALL' ? true : r.type === roomTypeFilter;
    return matchesSearch && matchesFilter;
  });
  const roomPages = Math.ceil(filteredRooms.length / ITEMS_PER_PAGE);
  const paginatedRooms = filteredRooms.slice(
    (roomCurrentPage - 1) * ITEMS_PER_PAGE,
    roomCurrentPage * ITEMS_PER_PAGE
  );

  // Bed filtering and pagination
  const filteredBeds = beds.filter(b => {
    const matchesSearch = b.bedNumber.toLowerCase().includes(bedSearch.toLowerCase());
    const matchesFilter = bedStatusFilter === 'ALL' ? true : b.status === bedStatusFilter;
    return matchesSearch && matchesFilter;
  });
  const bedPages = Math.ceil(filteredBeds.length / ITEMS_PER_PAGE);
  const paginatedBeds = filteredBeds.slice(
    (bedCurrentPage - 1) * ITEMS_PER_PAGE,
    bedCurrentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Hospital Management</h1>
            <p className="text-gray-600 mt-1">Manage floors, rooms, and beds</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Beds"
          value={totalBeds}
          subtitle="Facility capacity"
          icon={Bed}
          color="blue"
        />
        <StatsCard
          title="Occupied Beds"
          value={occupiedBeds}
          subtitle="Currently in use"
          icon={Activity}
          color="red"
        />
        <StatsCard
          title="Available Beds"
          value={availableBeds}
          subtitle="Ready for admission"
          icon={Plus}
          color="green"
        />
        <StatsCard
          title="Occupancy Rate"
          value={`${occupancyRate}%`}
          subtitle={`${occupiedBeds} of ${totalBeds}`}
          icon={Building2}
          color="orange"
        />
      </div>

      {/* Floors Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Floors ({filteredFloors.length})</h3>
          <button
            onClick={() => handleOpenFloorModal()}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-3 py-2 rounded-lg text-sm"
          >
            <Plus className="w-4 h-4" /> Add Floor
          </button>
        </div>

        {/* Search and Filter */}
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search floors..."
                value={floorSearch}
                onChange={(e) => {
                  setFloorSearch(e.target.value);
                  setFloorCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <select
              value={floorTypeFilter}
              onChange={(e) => {
                setFloorTypeFilter(e.target.value as any);
                setFloorCurrentPage(1);
              }}
              className="px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
            >
              <option value="ALL">All Floors</option>
              <option value="EMPTY">Empty</option>
              <option value="FULL">With Rooms</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Floor #</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Rooms</th>
                <th className="px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedFloors.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-500">No floors found</td></tr>
              ) : (
                paginatedFloors.map(floor => (
                  <tr key={floor._id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3">{floor.floorNumber}</td>
                    <td className="px-4 py-3">{floor.name}</td>
                    <td className="px-4 py-3">{floor.rooms?.length || 0}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleOpenFloorModal(floor)} className="text-blue-600 hover:text-blue-800 mr-2"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteFloor(floor._id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {floorPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">Page {floorCurrentPage} of {floorPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setFloorCurrentPage(p => Math.max(1, p - 1))}
                disabled={floorCurrentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setFloorCurrentPage(p => Math.min(floorPages, p + 1))}
                disabled={floorCurrentPage === floorPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Rooms Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Rooms ({filteredRooms.length})</h3>
          <button
            onClick={() => handleOpenRoomModal()}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-3 py-2 rounded-lg text-sm"
          >
            <Plus className="w-4 h-4" /> Add Room
          </button>
        </div>

        {/* Search and Filter */}
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search rooms..."
                value={roomSearch}
                onChange={(e) => {
                  setRoomSearch(e.target.value);
                  setRoomCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <select
              value={roomTypeFilter}
              onChange={(e) => {
                setRoomTypeFilter(e.target.value as any);
                setRoomCurrentPage(1);
              }}
              className="px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 whitespace-nowrap"
            >
              <option value="ALL">All Types</option>
              <option value="ICU">ICU</option>
              <option value="GENERAL">General</option>
              <option value="EMERGENCY">Emergency</option>
              <option value="SURGERY">Surgery</option>
              <option value="ISOLATION">Isolation</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Room #</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Capacity</th>
                <th className="px-4 py-2 text-left">Floor</th>
                <th className="px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRooms.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-4 text-center text-gray-500">No rooms found</td></tr>
              ) : (
                paginatedRooms.map(room => (
                  <tr key={room._id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3">{room.roomNumber}</td>
                    <td className="px-4 py-3">{room.name || '-'}</td>
                    <td className="px-4 py-3"><span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">{room.type}</span></td>
                    <td className="px-4 py-3">{room.capacity}</td>
                    <td className="px-4 py-3">Floor {room.floor?.floorNumber}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleOpenRoomModal(room)} className="text-blue-600 hover:text-blue-800 mr-2"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteRoom(room._id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {roomPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">Page {roomCurrentPage} of {roomPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setRoomCurrentPage(p => Math.max(1, p - 1))}
                disabled={roomCurrentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setRoomCurrentPage(p => Math.min(roomPages, p + 1))}
                disabled={roomCurrentPage === roomPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Beds Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Beds ({filteredBeds.length})</h3>
          <button
            onClick={() => handleOpenBedModal()}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-3 py-2 rounded-lg text-sm"
          >
            <Plus className="w-4 h-4" /> Add Bed
          </button>
        </div>

        {/* Search and Filter */}
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search beds..."
                value={bedSearch}
                onChange={(e) => {
                  setBedSearch(e.target.value);
                  setBedCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <select
              value={bedStatusFilter}
              onChange={(e) => {
                setBedStatusFilter(e.target.value as any);
                setBedCurrentPage(1);
              }}
              className="px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 whitespace-nowrap"
            >
              <option value="ALL">All Status</option>
              <option value="AVAILABLE">Available</option>
              <option value="OCCUPIED">Occupied</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="RESERVED">Reserved</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Bed #</th>
                <th className="px-4 py-2 text-left">Room</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Patient</th>
                <th className="px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedBeds.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-500">No beds found</td></tr>
              ) : (
                paginatedBeds.map(bed => (
                  <tr key={bed._id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3">{bed.bedNumber}</td>
                    <td className="px-4 py-3">{bed.room?.roomNumber}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        bed.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                        bed.status === 'OCCUPIED' ? 'bg-red-100 text-red-800' :
                        bed.status === 'MAINTENANCE' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {bed.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{bed.patient ? `${bed.patient.firstName} ${bed.patient.lastName}` : '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleOpenBedModal(bed)} className="text-blue-600 hover:text-blue-800 mr-2"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteBed(bed._id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {bedPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">Page {bedCurrentPage} of {bedPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setBedCurrentPage(p => Math.max(1, p - 1))}
                disabled={bedCurrentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setBedCurrentPage(p => Math.min(bedPages, p + 1))}
                disabled={bedCurrentPage === bedPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floor Modal */}
      {modalType === 'floor' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">{editingItem ? 'Edit Floor' : 'Add Floor'}</h2>
              <button onClick={() => setModalType(null)} className="text-gray-500 hover:text-gray-700"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSubmitFloor} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Floor Number *</label>
                <input type="number" value={floorForm.floorNumber} onChange={(e) => setFloorForm({...floorForm, floorNumber: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" disabled={!!editingItem} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Name *</label>
                <input type="text" value={floorForm.name} onChange={(e) => setFloorForm({...floorForm, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Description</label>
                <input type="text" value={floorForm.description} onChange={(e) => setFloorForm({...floorForm, description: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setModalType(null)} className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg">{submitting ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Room Modal */}
      {modalType === 'room' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">{editingItem ? 'Edit Room' : 'Add Room'}</h2>
              <button onClick={() => setModalType(null)} className="text-gray-500 hover:text-gray-700"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSubmitRoom} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Room Number *</label>
                <input type="text" value={roomForm.roomNumber} onChange={(e) => setRoomForm({...roomForm, roomNumber: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Name</label>
                <input type="text" value={roomForm.name} onChange={(e) => setRoomForm({...roomForm, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Type *</label>
                <select value={roomForm.type} onChange={(e) => setRoomForm({...roomForm, type: e.target.value as any})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
                  <option value="GENERAL">General</option>
                  <option value="ICU">ICU</option>
                  <option value="EMERGENCY">Emergency</option>
                  <option value="SURGERY">Surgery</option>
                  <option value="ISOLATION">Isolation</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Capacity *</label>
                <input type="number" value={roomForm.capacity} onChange={(e) => setRoomForm({...roomForm, capacity: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Floor *</label>
                <select value={roomForm.floor} onChange={(e) => setRoomForm({...roomForm, floor: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
                  <option value="">Select Floor</option>
                  {floors.map(f => <option key={f._id} value={f._id}>Floor {f.floorNumber} - {f.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setModalType(null)} className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg">{submitting ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bed Modal */}
      {modalType === 'bed' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">{editingItem ? 'Edit Bed' : 'Add Bed'}</h2>
              <button onClick={() => setModalType(null)} className="text-gray-500 hover:text-gray-700"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSubmitBed} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Bed Number *</label>
                <input type="text" value={bedForm.bedNumber} onChange={(e) => setBedForm({...bedForm, bedNumber: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Status *</label>
                <select value={bedForm.status} onChange={(e) => setBedForm({...bedForm, status: e.target.value as any})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
                  <option value="AVAILABLE">Available</option>
                  <option value="OCCUPIED">Occupied</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="RESERVED">Reserved</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Room *</label>
                <select value={bedForm.room} onChange={(e) => setBedForm({...bedForm, room: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
                  <option value="">Select Room</option>
                  {rooms.map(r => <option key={r._id} value={r._id}>{r.roomNumber} - {r.type}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setModalType(null)} className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg">{submitting ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
