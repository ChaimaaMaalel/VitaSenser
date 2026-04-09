import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { StatCard } from '../components/StatCard';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { feedback } from '../services/feedback';
import { colors } from '../theme/colors';
import { useLanguageStore } from '../store/languageStore';

type BedStats = {
  total: number;
  occupied: number;
  available: number;
  occupancyRate: number;
};

type Floor = {
  _id: string;
  floorNumber: number;
  name: string;
  description?: string;
  rooms?: unknown[];
};

type RoomType = 'ICU' | 'GENERAL' | 'EMERGENCY' | 'SURGERY' | 'ISOLATION';

type Room = {
  _id: string;
  roomNumber: string;
  name?: string;
  type: RoomType;
  capacity: number;
  floor?: {
    _id?: string;
    floorNumber?: number;
    name?: string;
  };
};

type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED';

type Bed = {
  _id: string;
  bedNumber: string;
  status: BedStatus;
  room?: {
    _id?: string;
    roomNumber?: string;
  };
  patient?: {
    _id?: string;
    firstName?: string;
    lastName?: string;
  };
};

type ModalType = 'floor' | 'room' | 'bed' | null;

const ITEMS_PER_PAGE = 5;

export function HospitalScreen() {
  const user = useAuthStore((state) => state.user);
  const language = useLanguageStore((state) => state.language);
  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);
  const canManage = user?.role === 'ADMIN';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bedStats, setBedStats] = useState<BedStats | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);

  const [floorCurrentPage, setFloorCurrentPage] = useState(1);
  const [roomCurrentPage, setRoomCurrentPage] = useState(1);
  const [bedCurrentPage, setBedCurrentPage] = useState(1);

  const [floorSearch, setFloorSearch] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [bedSearch, setBedSearch] = useState('');

  const [floorFilter, setFloorFilter] = useState<'ALL' | 'EMPTY' | 'FULL'>('ALL');
  const [roomFilter, setRoomFilter] = useState<'ALL' | RoomType>('ALL');
  const [bedFilter, setBedFilter] = useState<'ALL' | BedStatus>('ALL');

  const [modalType, setModalType] = useState<ModalType>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [floorForm, setFloorForm] = useState({ floorNumber: '', name: '', description: '' });
  const [roomForm, setRoomForm] = useState({ roomNumber: '', name: '', type: 'GENERAL' as RoomType, capacity: '', floor: '' });
  const [bedForm, setBedForm] = useState({ bedNumber: '', status: 'AVAILABLE' as BedStatus, room: '' });

  const fetchAllData = async (isPull = false) => {
    try {
      if (isPull) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [statsRes, floorsRes, roomsRes, bedsRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/hospital/floors'),
        api.get('/hospital/rooms'),
        api.get('/hospital/beds'),
      ]);

      setBedStats(statsRes.data?.data?.beds || null);
      setFloors(floorsRes.data?.data?.floors || []);
      setRooms(roomsRes.data?.data?.rooms || []);
      setBeds(bedsRes.data?.data?.beds || []);
    } catch (err: any) {
      feedback.error(err?.response?.data?.error?.message || tr('Failed to load hospital data', 'Echec du chargement des donnees hopital'));
    } finally {
      if (isPull) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void fetchAllData(false);
  }, []);

  const filteredFloors = useMemo(() => {
    return floors.filter((floor) => {
      const needle = floorSearch.trim().toLowerCase();
      const roomCount = floor.rooms?.length || 0;
      const matchesSearch =
        !needle ||
        floor.name.toLowerCase().includes(needle) ||
        String(floor.floorNumber).includes(needle);

      const matchesFilter =
        floorFilter === 'ALL' ||
        (floorFilter === 'EMPTY' && roomCount === 0) ||
        (floorFilter === 'FULL' && roomCount > 0);

      return matchesSearch && matchesFilter;
    });
  }, [floors, floorSearch, floorFilter]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const needle = roomSearch.trim().toLowerCase();
      const matchesSearch =
        !needle ||
        room.roomNumber.toLowerCase().includes(needle) ||
        (room.name || '').toLowerCase().includes(needle);
      const matchesFilter = roomFilter === 'ALL' || room.type === roomFilter;
      return matchesSearch && matchesFilter;
    });
  }, [rooms, roomSearch, roomFilter]);

  const filteredBeds = useMemo(() => {
    return beds.filter((bed) => {
      const needle = bedSearch.trim().toLowerCase();
      const patientName = `${bed.patient?.firstName || ''} ${bed.patient?.lastName || ''}`.trim().toLowerCase();
      const matchesSearch =
        !needle ||
        bed.bedNumber.toLowerCase().includes(needle) ||
        String(bed.room?.roomNumber || '').toLowerCase().includes(needle) ||
        patientName.includes(needle);
      const matchesFilter = bedFilter === 'ALL' || bed.status === bedFilter;
      return matchesSearch && matchesFilter;
    });
  }, [beds, bedSearch, bedFilter]);

  const floorPages = Math.max(1, Math.ceil(filteredFloors.length / ITEMS_PER_PAGE));
  const roomPages = Math.max(1, Math.ceil(filteredRooms.length / ITEMS_PER_PAGE));
  const bedPages = Math.max(1, Math.ceil(filteredBeds.length / ITEMS_PER_PAGE));

  const paginatedFloors = filteredFloors.slice((floorCurrentPage - 1) * ITEMS_PER_PAGE, floorCurrentPage * ITEMS_PER_PAGE);
  const paginatedRooms = filteredRooms.slice((roomCurrentPage - 1) * ITEMS_PER_PAGE, roomCurrentPage * ITEMS_PER_PAGE);
  const paginatedBeds = filteredBeds.slice((bedCurrentPage - 1) * ITEMS_PER_PAGE, bedCurrentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    setFloorCurrentPage(1);
  }, [floorSearch, floorFilter]);

  useEffect(() => {
    setRoomCurrentPage(1);
  }, [roomSearch, roomFilter]);

  useEffect(() => {
    setBedCurrentPage(1);
  }, [bedSearch, bedFilter]);

  useEffect(() => {
    if (floorCurrentPage > floorPages) setFloorCurrentPage(floorPages);
  }, [floorCurrentPage, floorPages]);

  useEffect(() => {
    if (roomCurrentPage > roomPages) setRoomCurrentPage(roomPages);
  }, [roomCurrentPage, roomPages]);

  useEffect(() => {
    if (bedCurrentPage > bedPages) setBedCurrentPage(bedPages);
  }, [bedCurrentPage, bedPages]);

  const resetModal = () => {
    setModalType(null);
    setEditingId(null);
    setFloorForm({ floorNumber: '', name: '', description: '' });
    setRoomForm({ roomNumber: '', name: '', type: 'GENERAL', capacity: '', floor: '' });
    setBedForm({ bedNumber: '', status: 'AVAILABLE', room: '' });
  };

  const openFloorModal = (floor?: Floor) => {
    if (floor) {
      setEditingId(floor._id);
      setFloorForm({
        floorNumber: String(floor.floorNumber),
        name: floor.name,
        description: floor.description || '',
      });
    } else {
      setEditingId(null);
      setFloorForm({ floorNumber: '', name: '', description: '' });
    }
    setModalType('floor');
  };

  const openRoomModal = (room?: Room) => {
    if (room) {
      setEditingId(room._id);
      setRoomForm({
        roomNumber: room.roomNumber,
        name: room.name || '',
        type: room.type,
        capacity: String(room.capacity),
        floor: room.floor?._id || '',
      });
    } else {
      setEditingId(null);
      setRoomForm({ roomNumber: '', name: '', type: 'GENERAL', capacity: '', floor: floors[0]?._id || '' });
    }
    setModalType('room');
  };

  const openBedModal = (bed?: Bed) => {
    if (bed) {
      setEditingId(bed._id);
      setBedForm({
        bedNumber: bed.bedNumber,
        status: bed.status,
        room: bed.room?._id || '',
      });
    } else {
      setEditingId(null);
      setBedForm({ bedNumber: '', status: 'AVAILABLE', room: rooms[0]?._id || '' });
    }
    setModalType('bed');
  };

  const submitFloor = async () => {
    if (!floorForm.floorNumber.trim() || !floorForm.name.trim()) {
      feedback.info(tr('Floor number and name are required.', 'Numero et nom de etage requis.'));
      return;
    }

    try {
      setSubmitting(true);
      if (editingId) {
        await api.put(`/hospital/floors/${editingId}`, {
          name: floorForm.name.trim(),
          description: floorForm.description.trim(),
        });
      } else {
        await api.post('/hospital/floors', {
          floorNumber: Number(floorForm.floorNumber),
          name: floorForm.name.trim(),
          description: floorForm.description.trim(),
        });
      }
      feedback.success(editingId ? tr('Floor updated', 'Etage mis a jour') : tr('Floor created', 'Etage cree'));
      resetModal();
      await fetchAllData(false);
    } catch (err: any) {
      feedback.error(err?.response?.data?.error?.message || tr('Failed to save floor', 'Echec sauvegarde etage'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitRoom = async () => {
    if (!roomForm.roomNumber.trim() || !roomForm.capacity.trim() || !roomForm.floor) {
      feedback.info(tr('Room number, capacity and floor are required.', 'Numero salle, capacite et etage requis.'));
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        roomNumber: roomForm.roomNumber.trim(),
        name: roomForm.name.trim(),
        type: roomForm.type,
        capacity: Number(roomForm.capacity),
        floor: roomForm.floor,
      };

      if (editingId) {
        await api.put(`/hospital/rooms/${editingId}`, payload);
      } else {
        await api.post('/hospital/rooms', payload);
      }
      feedback.success(editingId ? tr('Room updated', 'Salle mise a jour') : tr('Room created', 'Salle creee'));
      resetModal();
      await fetchAllData(false);
    } catch (err: any) {
      feedback.error(err?.response?.data?.error?.message || tr('Failed to save room', 'Echec sauvegarde salle'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitBed = async () => {
    if (!bedForm.bedNumber.trim() || !bedForm.room) {
      feedback.info(tr('Bed number and room are required.', 'Numero lit et salle requis.'));
      return;
    }

    try {
      setSubmitting(true);
      if (editingId) {
        await api.put(`/hospital/beds/${editingId}`, { status: bedForm.status });
      } else {
        await api.post('/hospital/beds', {
          bedNumber: bedForm.bedNumber.trim(),
          status: bedForm.status,
          room: bedForm.room,
        });
      }
      feedback.success(editingId ? tr('Bed updated', 'Lit mis a jour') : tr('Bed created', 'Lit cree'));
      resetModal();
      await fetchAllData(false);
    } catch (err: any) {
      feedback.error(err?.response?.data?.error?.message || tr('Failed to save bed', 'Echec sauvegarde lit'));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (label: string, onDelete: () => Promise<void>) => {
    Alert.alert(tr('Delete', 'Supprimer'), `${tr('Delete this', 'Supprimer ce')} ${label}?`, [
      { text: tr('Cancel', 'Annuler'), style: 'cancel' },
      {
        text: tr('Delete', 'Supprimer'),
        style: 'destructive',
        onPress: () => {
          void onDelete();
        },
      },
    ]);
  };

  const renderPagination = (page: number, pages: number, setPage: (next: number) => void) => {
    if (pages <= 1) return null;
    return (
      <View style={styles.paginationRow}>
        <Text style={styles.meta}>{tr('Page', 'Page')} {page}/{pages}</Text>
        <View style={styles.paginationBtns}>
          <Pressable
            style={styles.pageBtn}
            disabled={page <= 1}
            onPress={() => setPage(Math.max(1, page - 1))}
          >
            <Text style={styles.pageBtnText}>{tr('Prev', 'Prec')}</Text>
          </Pressable>
          <Pressable
            style={styles.pageBtn}
            disabled={page >= pages}
            onPress={() => setPage(Math.min(pages, page + 1))}
          >
            <Text style={styles.pageBtnText}>{tr('Next', 'Suiv')}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  const totalBeds = bedStats?.total ?? 0;
  const occupiedBeds = bedStats?.occupied ?? 0;
  const availableBeds = bedStats?.available ?? Math.max(totalBeds - occupiedBeds, 0);
  const occupancyRate = bedStats?.occupancyRate ?? 0;

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{tr('Hospital', 'Hopital')}</Text>
          <Text style={styles.subtitle}>{tr('Floors, rooms and beds management', 'Gestion des etages, salles et lits')}</Text>
        </View>
        <Pressable style={styles.secondaryBtn} onPress={() => void fetchAllData(true)}>
          {refreshing ? <ActivityIndicator color={colors.primaryDark} /> : <Text style={styles.secondaryBtnText}>{tr('Refresh', 'Actualiser')}</Text>}
        </Pressable>
      </View>

      <View style={styles.statsGrid}>
        <StatCard title={tr('Total Beds', 'Total lits')} value={totalBeds} subtitle={tr('Facility capacity', 'Capacite etablissement')} />
        <StatCard title={tr('Occupied', 'Occupes')} value={occupiedBeds} subtitle={tr('Currently in use', 'Actuellement utilises')} />
        <StatCard title={tr('Available', 'Disponibles')} value={availableBeds} subtitle={tr('Ready for admission', 'Prets pour admission')} />
        <StatCard title={tr('Occupancy', 'Occupation')} value={`${occupancyRate}%`} subtitle={`${occupiedBeds} / ${totalBeds}`} />
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{tr('Floors', 'Etages')} ({filteredFloors.length})</Text>
          {canManage ? (
            <Pressable style={styles.primaryBtn} onPress={() => openFloorModal()}>
              <Text style={styles.primaryBtnText}>{tr('Add Floor', 'Ajouter etage')}</Text>
            </Pressable>
          ) : null}
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder={tr('Search floors', 'Rechercher etages')}
          placeholderTextColor={colors.textMuted}
          value={floorSearch}
          onChangeText={setFloorSearch}
        />
        <View style={styles.chipsRow}>
          {(['ALL', 'EMPTY', 'FULL'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setFloorFilter(value)}
              style={[styles.chip, floorFilter === value ? styles.chipActive : null]}
            >
              <Text style={floorFilter === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
            </Pressable>
          ))}
        </View>

        {paginatedFloors.length === 0 ? (
          <Text style={styles.meta}>{tr('No floors found.', 'Aucun etage trouve.')}</Text>
        ) : (
          paginatedFloors.map((floor) => (
            <View key={floor._id} style={styles.listCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{tr('Floor', 'Etage')} {floor.floorNumber} - {floor.name}</Text>
                <Text style={styles.meta}>{floor.rooms?.length || 0} {tr('rooms', 'salles')}</Text>
              </View>
              {canManage ? (
                <View style={styles.itemActions}>
                  <Pressable style={styles.iconBtn} onPress={() => openFloorModal(floor)}>
                    <Text style={styles.iconBtnText}>{tr('Edit', 'Modifier')}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.iconDangerBtn}
                    onPress={() =>
                      confirmDelete('floor', async () => {
                        try {
                          await api.delete(`/hospital/floors/${floor._id}`);
                          feedback.success('Floor deleted');
                          await fetchAllData(false);
                        } catch (err: any) {
                          feedback.error(err?.response?.data?.error?.message || 'Failed to delete floor');
                        }
                      })
                    }
                  >
                    <Text style={styles.iconDangerBtnText}>{tr('Delete', 'Supprimer')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        )}

        {renderPagination(floorCurrentPage, floorPages, setFloorCurrentPage)}
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{tr('Rooms', 'Salles')} ({filteredRooms.length})</Text>
          {canManage ? (
            <Pressable style={styles.primaryBtn} onPress={() => openRoomModal()}>
              <Text style={styles.primaryBtnText}>{tr('Add Room', 'Ajouter salle')}</Text>
            </Pressable>
          ) : null}
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder={tr('Search rooms', 'Rechercher salles')}
          placeholderTextColor={colors.textMuted}
          value={roomSearch}
          onChangeText={setRoomSearch}
        />
        <View style={styles.chipsRow}>
          {(['ALL', 'ICU', 'GENERAL', 'EMERGENCY', 'SURGERY', 'ISOLATION'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setRoomFilter(value)}
              style={[styles.chip, roomFilter === value ? styles.chipActive : null]}
            >
              <Text style={roomFilter === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
            </Pressable>
          ))}
        </View>

        {paginatedRooms.length === 0 ? (
          <Text style={styles.meta}>{tr('No rooms found.', 'Aucune salle trouvee.')}</Text>
        ) : (
          paginatedRooms.map((room) => (
            <View key={room._id} style={styles.listCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{tr('Room', 'Salle')} {room.roomNumber} ({room.type})</Text>
                <Text style={styles.meta}>{tr('Capacity', 'Capacite')}: {room.capacity} • {tr('Floor', 'Etage')} {room.floor?.floorNumber || '--'}</Text>
              </View>
              {canManage ? (
                <View style={styles.itemActions}>
                  <Pressable style={styles.iconBtn} onPress={() => openRoomModal(room)}>
                    <Text style={styles.iconBtnText}>{tr('Edit', 'Modifier')}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.iconDangerBtn}
                    onPress={() =>
                      confirmDelete('room', async () => {
                        try {
                          await api.delete(`/hospital/rooms/${room._id}`);
                          feedback.success('Room deleted');
                          await fetchAllData(false);
                        } catch (err: any) {
                          feedback.error(err?.response?.data?.error?.message || 'Failed to delete room');
                        }
                      })
                    }
                  >
                    <Text style={styles.iconDangerBtnText}>{tr('Delete', 'Supprimer')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        )}

        {renderPagination(roomCurrentPage, roomPages, setRoomCurrentPage)}
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{tr('Beds', 'Lits')} ({filteredBeds.length})</Text>
          {canManage ? (
            <Pressable style={styles.primaryBtn} onPress={() => openBedModal()}>
              <Text style={styles.primaryBtnText}>{tr('Add Bed', 'Ajouter lit')}</Text>
            </Pressable>
          ) : null}
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder={tr('Search beds', 'Rechercher lits')}
          placeholderTextColor={colors.textMuted}
          value={bedSearch}
          onChangeText={setBedSearch}
        />
        <View style={styles.chipsRow}>
          {(['ALL', 'AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'RESERVED'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setBedFilter(value)}
              style={[styles.chip, bedFilter === value ? styles.chipActive : null]}
            >
              <Text style={bedFilter === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
            </Pressable>
          ))}
        </View>

        {paginatedBeds.length === 0 ? (
          <Text style={styles.meta}>{tr('No beds found.', 'Aucun lit trouve.')}</Text>
        ) : (
          paginatedBeds.map((bed) => (
            <View key={bed._id} style={styles.listCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{tr('Bed', 'Lit')} {bed.bedNumber}</Text>
                <Text style={styles.meta}>
                  {bed.status} • {tr('Room', 'Salle')} {bed.room?.roomNumber || '--'}
                  {bed.patient ? ` • ${bed.patient.firstName || ''} ${bed.patient.lastName || ''}` : ''}
                </Text>
              </View>
              {canManage ? (
                <View style={styles.itemActions}>
                  <Pressable style={styles.iconBtn} onPress={() => openBedModal(bed)}>
                    <Text style={styles.iconBtnText}>{tr('Edit', 'Modifier')}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.iconDangerBtn}
                    onPress={() =>
                      confirmDelete('bed', async () => {
                        try {
                          await api.delete(`/hospital/beds/${bed._id}`);
                          feedback.success('Bed deleted');
                          await fetchAllData(false);
                        } catch (err: any) {
                          feedback.error(err?.response?.data?.error?.message || 'Failed to delete bed');
                        }
                      })
                    }
                  >
                    <Text style={styles.iconDangerBtnText}>{tr('Delete', 'Supprimer')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        )}

        {renderPagination(bedCurrentPage, bedPages, setBedCurrentPage)}
      </View>

      <Modal visible={modalType !== null} animationType="slide" onRequestClose={resetModal}>
        <ScreenContainer>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {modalType === 'floor'
                ? editingId
                  ? tr('Edit Floor', 'Modifier etage')
                  : tr('Create Floor', 'Creer etage')
                : modalType === 'room'
                  ? editingId
                    ? tr('Edit Room', 'Modifier salle')
                    : tr('Create Room', 'Creer salle')
                  : editingId
                    ? tr('Edit Bed', 'Modifier lit')
                    : tr('Create Bed', 'Creer lit')}
            </Text>
            <Pressable style={styles.secondaryBtn} onPress={resetModal}>
              <Text style={styles.secondaryBtnText}>{tr('Close', 'Fermer')}</Text>
            </Pressable>
          </View>

          {modalType === 'floor' ? (
            <View style={styles.modalForm}>
              <TextInput
                style={styles.input}
                placeholder={tr('Floor number', 'Numero etage')}
                placeholderTextColor={colors.textMuted}
                value={floorForm.floorNumber}
                onChangeText={(value) => setFloorForm((prev) => ({ ...prev, floorNumber: value }))}
                keyboardType="numeric"
                editable={!Boolean(editingId)}
              />
              <TextInput
                style={styles.input}
                placeholder={tr('Name', 'Nom')}
                placeholderTextColor={colors.textMuted}
                value={floorForm.name}
                onChangeText={(value) => setFloorForm((prev) => ({ ...prev, name: value }))}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={tr('Description', 'Description')}
                placeholderTextColor={colors.textMuted}
                value={floorForm.description}
                onChangeText={(value) => setFloorForm((prev) => ({ ...prev, description: value }))}
                multiline
              />
            </View>
          ) : null}

          {modalType === 'room' ? (
            <View style={styles.modalForm}>
              <TextInput
                style={styles.input}
                placeholder={tr('Room number', 'Numero salle')}
                placeholderTextColor={colors.textMuted}
                value={roomForm.roomNumber}
                onChangeText={(value) => setRoomForm((prev) => ({ ...prev, roomNumber: value }))}
                editable={!Boolean(editingId)}
              />
              <TextInput
                style={styles.input}
                placeholder={tr('Name', 'Nom')}
                placeholderTextColor={colors.textMuted}
                value={roomForm.name}
                onChangeText={(value) => setRoomForm((prev) => ({ ...prev, name: value }))}
              />
              <TextInput
                style={styles.input}
                placeholder={tr('Capacity', 'Capacite')}
                placeholderTextColor={colors.textMuted}
                value={roomForm.capacity}
                onChangeText={(value) => setRoomForm((prev) => ({ ...prev, capacity: value }))}
                keyboardType="numeric"
              />

              <Text style={styles.fieldLabel}>{tr('Type', 'Type')}</Text>
              <View style={styles.chipsRow}>
                {(['ICU', 'GENERAL', 'EMERGENCY', 'SURGERY', 'ISOLATION'] as const).map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setRoomForm((prev) => ({ ...prev, type: value }))}
                    style={[styles.chip, roomForm.type === value ? styles.chipActive : null]}
                  >
                    <Text style={roomForm.type === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>{tr('Floor', 'Etage')}</Text>
              <View style={styles.segmentWrap}>
                {floors.map((floor) => (
                  <Pressable
                    key={floor._id}
                    onPress={() => setRoomForm((prev) => ({ ...prev, floor: floor._id }))}
                    style={[styles.segmentBtn, roomForm.floor === floor._id ? styles.segmentBtnActive : null]}
                  >
                    <Text style={roomForm.floor === floor._id ? styles.segmentTextActive : styles.segmentText}>
                      F{floor.floorNumber} - {floor.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {modalType === 'bed' ? (
            <View style={styles.modalForm}>
              <TextInput
                style={styles.input}
                placeholder={tr('Bed number', 'Numero lit')}
                placeholderTextColor={colors.textMuted}
                value={bedForm.bedNumber}
                onChangeText={(value) => setBedForm((prev) => ({ ...prev, bedNumber: value }))}
                editable={!Boolean(editingId)}
              />

              <Text style={styles.fieldLabel}>{tr('Status', 'Statut')}</Text>
              <View style={styles.chipsRow}>
                {(['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'RESERVED'] as const).map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setBedForm((prev) => ({ ...prev, status: value }))}
                    style={[styles.chip, bedForm.status === value ? styles.chipActive : null]}
                  >
                    <Text style={bedForm.status === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
                  </Pressable>
                ))}
              </View>

              {!editingId ? (
                <>
                  <Text style={styles.fieldLabel}>{tr('Room', 'Salle')}</Text>
                  <View style={styles.segmentWrap}>
                    {rooms.map((room) => (
                      <Pressable
                        key={room._id}
                        onPress={() => setBedForm((prev) => ({ ...prev, room: room._id }))}
                        style={[styles.segmentBtn, bedForm.room === room._id ? styles.segmentBtnActive : null]}
                      >
                        <Text style={bedForm.room === room._id ? styles.segmentTextActive : styles.segmentText}>
                          {room.roomNumber} ({room.type})
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          ) : null}

          <Pressable
            style={[styles.primaryBtn, submitting ? styles.primaryBtnDisabled : null]}
            disabled={submitting}
            onPress={() => {
              if (modalType === 'floor') {
                void submitFloor();
              } else if (modalType === 'room') {
                void submitRoom();
              } else if (modalType === 'bed') {
                void submitBed();
              }
            }}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{tr('Save', 'Enregistrer')}</Text>}
          </Pressable>
        </ScreenContainer>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
  },
  statsGrid: {
    gap: 8,
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    backgroundColor: colors.surface,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 17,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: '#fff',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: '#e0f2fe',
  },
  chipText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
    fontSize: 12,
  },
  listCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  itemTitle: {
    color: colors.text,
    fontWeight: '600',
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
  },
  iconBtnText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 12,
  },
  iconDangerBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fef2f2',
  },
  iconDangerBtnText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  secondaryBtn: {
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  primaryBtn: {
    borderRadius: 10,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  paginationBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  pageBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  pageBtnText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 12,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalTitle: {
    fontSize: 22,
    color: colors.text,
    fontWeight: '700',
  },
  modalForm: {
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  fieldLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
  },
  segmentWrap: {
    gap: 8,
  },
  segmentBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  segmentBtnActive: {
    borderColor: colors.primary,
    backgroundColor: '#e0f2fe',
  },
  segmentText: {
    color: colors.text,
    fontSize: 13,
  },
  segmentTextActive: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '700',
  },
});
